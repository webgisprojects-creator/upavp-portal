import { useEffect, useRef, useState } from "react";

import { FaTimes } from "react-icons/fa";
import Map from "ol/Map";
import View from "ol/View";
import Overlay from "ol/Overlay";
import Draw from "ol/interaction/Draw";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { containsCoordinate, getCenter } from "ol/extent";
import { fromLonLat, transformExtent } from "ol/proj";
import { unByKey } from "ol/Observable";


import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";
import Text from "ol/style/Text";

import plotAreas from "../data/plot-areas.json";
import legends from "../data/legends.json";
import allotmentStats from "../data/allotment-stats.json";
import landuseClasses from "../data/landuse-classes.json";
import {
  allotmentCql as buildAllotmentCql,
  landuseCql as buildLanduseCql,
} from "../lib/cql";

import "ol/ol.css";
import "../style/MapContainer.css";

import BaseMapSwitcher from "./BaseMapSwitcher";
import MapToolbar from "./MapToolbar";
import MapToolPanel from "./MapToolPanel";
import PlotSearch from "./PlotSearch";
import LayerTool from "./tools/LayerTool";
import PlotAllotmentChart from "./tools/PlotAllotmentChart";
import LanduseFilter from "./tools/LanduseFilter";
import { MeasurementPanel } from "./tools/MeasurementTool";
import {
  fetchWfsFeatures,
  getPropertyValue,
  PLOT_LAYOUT_LAYER,
} from "../utils/geoserver";

const GEOSERVER_WMS_URL = "/geoserver/wms";

// Zoom needed before landuse labels are drawn, and the zoom used when jumping to a plotted area.
const LANDUSE_LABEL_MIN_ZOOM = 15;
const PLOT_AREA_ZOOM = 16;
const NO_SCHEME = "Unassigned";
const schemeLabel = (scheme) =>
  scheme === NO_SCHEME ? "Plots - no scheme recorded" : scheme;

// Extent of the GDA data (lon/lat -> web mercator): used to find the nearest data when the user is
// looking somewhere that has none.
const DATA_EXTENT = transformExtent(
  [77.316, 28.549, 77.62, 28.796],
  "EPSG:4326",
  "EPSG:3857"
);

// Plot "areas" (a scheme, split into spatial clusters): outline + a point inside it. They are shown
// when the plot layout is switched on but the map is still too far out for the plots themselves.
const geoJsonFormat = new GeoJSON();
const PLOT_AREAS = plotAreas.map((area) => {
  const geometry = geoJsonFormat.readGeometry(area.hull, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });
  const centre =
    geometry.getType() === "Polygon"
      ? geometry.getInteriorPoint().getCoordinates().slice(0, 2)
      : getCenter(geometry.getExtent());
  return { ...area, geometry, center: centre };
});

// One entry per scheme (its largest area is where "Go to scheme" lands); named schemes first.
const SCHEME_LIST = Object.values(
  PLOT_AREAS.reduce((byScheme, area) => {
    const entry = (byScheme[area.scheme] ??= {
      scheme: area.scheme,
      plots: 0,
      best: area,
    });
    entry.plots += area.plots;
    if (area.plots > entry.best.plots) entry.best = area;
    return byScheme;
  }, {})
).sort(
  (a, b) =>
    (a.scheme === NO_SCHEME) - (b.scheme === NO_SCHEME) || b.plots - a.plots
);

// Chart / Filter tool -> map: CQL filters. The builders are pure functions in lib/cql.js (unit-tested);
// here they are bound to the generated data snapshots.
const allotmentCql = (selection) => buildAllotmentCql(allotmentStats.lists, selection);
const landuseCql = (ids) => buildLanduseCql(landuseClasses.classes, ids);

const LEGENDS = {
  plotLayout: { items: legends.plot },
  landuse: { groups: legends.landuse },
};

const areaOutlineStyle = new Style({
  fill: new Fill({ color: "rgba(190, 24, 93, 0.10)" }),
  stroke: new Stroke({ color: "#be185d", width: 2, lineDash: [8, 6] }),
});
function areaStyle(feature) {
  return [
    areaOutlineStyle,
    new Style({
      geometry: new Point(feature.get("center")),
      text: new Text({
        text: `${schemeLabel(feature.get("scheme"))}\n${feature
          .get("plots")
          .toLocaleString()} plots`,
        font: '600 13px "Segoe UI", Arial, sans-serif',
        fill: new Fill({ color: "#7f1239" }),
        stroke: new Stroke({ color: "#ffffff", width: 4 }),
        overflow: true,
      }),
    }),
  ];
}

// Landuse labels: the real name when the polygon has one (school, river, plant ...), otherwise its
// sub-class. Small polygons are only labelled when zoomed in; named ones are kept longer.
const labelStyleCache = {};
const labelFilter = { ids: null }; // landuse leaf ids chosen in the Filter tool (null = all)
function landuseLabelStyle(feature, resolution) {
  if (labelFilter.ids && !labelFilter.ids.has(feature.get("k"))) return null;
  const named = feature.get("n") === 1;
  const base =
    resolution > 3 ? 12000 : resolution > 1.5 ? 2500 : resolution > 0.7 ? 600 : 0;
  if (feature.get("a") < (named ? base / 4 : base)) return null;
  const key = `${named ? 1 : 0}|${feature.get("t")}`;
  return (labelStyleCache[key] ??= new Style({
    text: new Text({
      text: feature.get("t"),
      font: named
        ? '600 12px "Segoe UI", Arial, sans-serif'
        : 'italic 11px "Segoe UI", Arial, sans-serif',
      fill: new Fill({ color: named ? "#111827" : "#475569" }),
      stroke: new Stroke({ color: "rgba(255, 255, 255, 0.95)", width: 3 }),
      overflow: false,
    }),
  }));
}

function flyToPlotArea(map, center) {
  map.getView().animate({ center, zoom: PLOT_AREA_ZOOM, duration: 700 });
}
// Landuse is only ~7.8k areas and is meant to be read at city level, so it is drawn from the whole-city view.
const LANDUSE_MIN_ZOOM = 11;
// 172k plots are only drawn from this zoom level (matches the scale rule in the GeoServer
// style: plots 1:20,000 ~ zoom 15).
const PLOT_LAYOUT_MIN_ZOOM = 15;

// Loads a WMS tile with fetch so a transient failure (slow GeoServer, dropped connection on a
// mobile hotspot) is retried instead of leaving a hole in the map. A non-image answer (GeoServer
// service exception) counts as a failure too.
const TILE_RETRIES = 2;
function createTileLoader(onSuccess) {
  return (tile, src) => {
    const image = tile.getImage();
    const attempt = async (n) => {
      try {
        const response = await fetch(src);
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || !type.startsWith("image/")) {
          throw new Error(`tile request failed (${response.status})`);
        }
        const url = URL.createObjectURL(await response.blob());
        image.onload = () => URL.revokeObjectURL(url);
        image.src = url;
        onSuccess();
      } catch {
        if (n < TILE_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 1500 * (n + 1)));
          return attempt(n + 1);
        }
        image.src = "data:,"; // makes OpenLayers mark this tile as failed
      }
    };
    attempt(0);
  };
}

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
const ESRI_ATTRIBUTION =
  "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics and the GIS User Community";
const BASEMAPS = [
  { id: "street", label: "Street" },
  { id: "satellite", label: "Satellite" },
  { id: "hybrid", label: "Hybrid" },
];
const OVERLAY_LAYERS = [
  // {
  //   id: "building",
  //   label: "Building Footprints",
  //   layerName: "AwasVikas:gda_building_footprint",
  //   defaultEnabled: true,
  //   zIndex: 9,
  //   queryable: true,
  // },
  {
    id: "plotLayout",
    label: "Plot Layout",
    layerName: "AwasVikas:gda_plot_layout",
    defaultEnabled: false,
    minZoom: PLOT_LAYOUT_MIN_ZOOM,
    zoomNote:
      "There are 172,000 plots, too many to draw for the whole city. They appear when you zoom in to neighbourhood level.",
    defaultOpacity: 0.6,
    preload: 1,
    zIndex: 4,
    queryable: true,
  },
  {
    id: "drainage",
    label: "Drainage System",
    layerName: "AwasVikas:gda_drainage_system",
    defaultEnabled: false,
    zIndex: 5,
  },
  {
    id: "landuse",
    label: "Landuse / Landcover",
    layerName: "AwasVikas:gda_landuse_landcover",
    defaultEnabled: false,
    minZoom: LANDUSE_MIN_ZOOM,
    zoomNote:
      "Shown for the whole city. Names appear on the map as you zoom in; use the Filter tool to pick landuse types.",
    defaultOpacity: 0.55,
    preload: 1,
    zIndex: 1,
    queryable: true,
  },
  
  {
    id: "railway",
    label: "Railway Line",
    layerName: "AwasVikas:gda_railway_line",
    defaultEnabled: false,
    zIndex: 7,
  },
  {
    id: "road",
    label: "Road Centre Line",
    layerName: "AwasVikas:gda_road_centre_line",
    defaultEnabled: false,
    zIndex: 8,
  },
  {
    id: "sewage",
    label: "Existing Sewage Line",
    layerName: "AwasVikas:gda_sewage_line_existing",
    defaultEnabled: false,
    zIndex: 6,
  },
  {
    id: "waterBodies",
    label: "Water Bodies",
    layerName: "AwasVikas:gda_water_bodies",
    defaultEnabled: false,
    defaultOpacity: 0.7,
    zIndex: 3,
  },
  // {
  //   id: "disputedAreas",
  //   label: "Disputed Areas",
  //   layerName: "ne:disputed_areas",
  //   defaultEnabled: false,
  //   zIndex: 2,
  // },
];

// Ghaziabad city centre; this is not the full GDA boundary.
const INITIAL_CENTER = [77.4538, 28.6692];
const INITIAL_ZOOM = 14;

function getFeaturePropertyLabel(layerLabel, propertyName) {
  const property = propertyName.toLowerCase();

  if (layerLabel === "Landuse / Landcover") {
    if (property === "area") {
      return "Area (km²)";
    }
    if (property === "shape_area") {
      return "Area (m²)";
    }
    if (property === "shape_leng") {
      return "Boundary Length (m)";
    }
  }

  if (property === "shape_area") {
    return layerLabel === "Building Footprints"
      ? "Building Area (m²)"
      : layerLabel === "Plot Layout"
        ? "Plot Area (m²)"
        : "Area (m²)";
  }

  if (property === "shape_leng") {
    return layerLabel === "Building Footprints"
      ? "Building Perimeter (m)"
      : layerLabel === "Plot Layout"
        ? "Plot Length (m)"
        : "Length (m)";
  }

  return propertyName.replaceAll("_", " ");
}

export default function MapContainer() {
  const mapElementRef = useRef(null);
  const popupElementRef = useRef(null);
  const mapRef = useRef(null);
  const basemapLayersRef = useRef(null);
  const overlayLayersRef = useRef(null);
  const featurePopupOverlayRef = useRef(null);
  const featureInfoRequestRef = useRef(0);
  const plotHighlightLayerRef = useRef(null);
  const plotSearchRequestRef = useRef(0);
  const extrasRef = useRef(null);
  const labelsLoadedRef = useRef(false);

  const [activeBasemap, setActiveBasemap] = useState("street");
  const [activeTool, setActiveTool] = useState(null);
  const [map, setMap] = useState(null);

  const [overlayEnabled, setOverlayEnabled] = useState(() =>
    Object.fromEntries(
      OVERLAY_LAYERS.map(({ id, defaultEnabled }) => [id, defaultEnabled])
    )
  );

  const [overlayOpacity, setOverlayOpacity] = useState(() =>
    Object.fromEntries(
      OVERLAY_LAYERS.map(({ id, defaultOpacity }) => [id, defaultOpacity ?? 1])
    )
  );
  const [loadingLayers, setLoadingLayers] = useState({});
  const [zoom, setZoom] = useState(INITIAL_ZOOM);

  const [plotFilter, setPlotFilter] = useState(null);
  const [landuseFilter, setLanduseFilter] = useState(null);

  const [layerError, setLayerError] = useState("");
  const [featurePopup, setFeaturePopup] = useState(null);

  useEffect(() => {
    const streetLayer = new TileLayer({
      visible: true,
      source: new OSM(),
    });

    const esriTiles = (path, zIndex, visible) =>
      new TileLayer({
        visible,
        zIndex,
        source: new XYZ({
          url: `${ESRI}${path}/MapServer/tile/{z}/{y}/{x}`,
          attributions: ESRI_ATTRIBUTION,
          maxZoom: 19,
        }),
      });

    // imagery is shared by "Satellite" and "Hybrid"; Hybrid adds place names + roads on top of it
    const satelliteLayer = esriTiles("World_Imagery", 0, false);
    const hybridLabelLayers = [
      esriTiles("Reference/World_Boundaries_and_Places", 0.3, false),
    ];

    const overlayLayers = {};
    const overlayErrorListeners = [];
    const pendingTiles = {};

    OVERLAY_LAYERS.forEach((config) => {
      // Always tiled: 256px tiles on the EPSG:900913 grid are served from GeoServer's tile cache.
      // hidpi is off on purpose - OpenLayers otherwise adds FORMAT_OPTIONS=dpi:.. on high-DPI
      // screens, which makes every request miss the cache.
      const source = new TileWMS({
        url: GEOSERVER_WMS_URL,
        params: {
          LAYERS: config.layerName,
          STYLES: "",
          FORMAT: "image/png",
          TRANSPARENT: true,
          VERSION: "1.1.1",
          TILED: true,
        },
        serverType: "geoserver",
        hidpi: false,
        tileLoadFunction: createTileLoader(() =>
          setLayerError((current) =>
            current.startsWith(config.label) ? "" : current
          )
        ),
      });

      const layer = new TileLayer({
        visible: config.defaultEnabled,
        preload: config.preload ?? 0,
        opacity: config.defaultOpacity ?? 1,
        source,
        zIndex: config.zIndex,
      });

      // per-layer "loading" indicator: count tiles in flight
      const tileStart = () => {
        pendingTiles[config.id] = (pendingTiles[config.id] ?? 0) + 1;
        setLoadingLayers((current) =>
          current[config.id] ? current : { ...current, [config.id]: true }
        );
      };
      const tileDone = () => {
        pendingTiles[config.id] = Math.max(0, (pendingTiles[config.id] ?? 0) - 1);
        if (pendingTiles[config.id] === 0) {
          setLoadingLayers((current) =>
            current[config.id] ? { ...current, [config.id]: false } : current
          );
        }
      };
      overlayErrorListeners.push(
        source.on("tileloadstart", tileStart),
        source.on("tileloadend", tileDone),
        source.on("tileloaderror", tileDone)
      );

      layer.set("userEnabled", config.defaultEnabled);
      overlayLayers[config.id] = layer;

      overlayErrorListeners.push(
        source.on("tileloaderror", () => {
          setLayerError(
            `${config.label} failed to load. Check the GeoServer WMS request in Network.`
          );
        })
      );
    });

    const plotHighlightLayer = new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        fill: new Fill({ color: "rgba(250, 204, 21, 0.3)" }),
        stroke: new Stroke({ color: "#dc2626", width: 4 }),
      }),
      zIndex: 20,
    });

    const plotAreasLayer = new VectorLayer({
      source: new VectorSource({
        features: PLOT_AREAS.map(
          (area) =>
            new Feature({
              geometry: area.geometry.clone(),
              scheme: area.scheme,
              plots: area.plots,
              center: area.center,
            })
        ),
      }),
      style: areaStyle,
      visible: false,
      zIndex: 15,
    });

    const landuseLabelsLayer = new VectorLayer({
      source: new VectorSource(),
      style: landuseLabelStyle,
      declutter: true,
      visible: false,
      zIndex: 16,
    });

    const featurePopupOverlay = new Overlay({
      element: popupElementRef.current,
      positioning: "bottom-center",
      offset: [0, -12],
      autoPan: {
        animation: { duration: 200 },
      },
    });

    const map = new Map({
      target: mapElementRef.current,
      overlays: [featurePopupOverlay],
      layers: [
        streetLayer,
        satelliteLayer,
        ...hybridLabelLayers,
        ...OVERLAY_LAYERS.map(({ id }) => overlayLayers[id]),
        plotAreasLayer,
        landuseLabelsLayer,
        plotHighlightLayer,
      ],
      view: new View({
        center: fromLonLat(INITIAL_CENTER),
        zoom: INITIAL_ZOOM,
        maxZoom: 19,
      }),
    });

    mapRef.current = map;
    setMap(map);
    featurePopupOverlayRef.current = featurePopupOverlay;
    plotHighlightLayerRef.current = plotHighlightLayer;

    basemapLayersRef.current = {
      street: streetLayer,
      satellite: satelliteLayer,
      hybridLabels: hybridLabelLayers,
    };

    overlayLayersRef.current = overlayLayers;

    const updateOverlayVisibility = () => {
      const zoom = map.getView().getZoom() ?? 0;
      OVERLAY_LAYERS.forEach(({ id, minZoom }) => {
        const layer = overlayLayers[id];
        const enabled = layer.get("userEnabled") === true;
        layer.setVisible(enabled && (minZoom === undefined || zoom >= minZoom));
      });

      // orientation areas while the plots are still too far away to draw, labels once landuse is close
      plotAreasLayer.setVisible(
        overlayLayers.plotLayout.get("userEnabled") === true &&
          zoom < PLOT_LAYOUT_MIN_ZOOM
      );
      landuseLabelsLayer.setVisible(
        overlayLayers.landuse.get("userEnabled") === true &&
          zoom >= LANDUSE_LABEL_MIN_ZOOM
      );
    };

    extrasRef.current = {
      sync: updateOverlayVisibility,
      plotAreas: plotAreasLayer,
      landuseLabels: landuseLabelsLayer,
    };
    updateOverlayVisibility();

    const zoomListener = map.getView().on("change:resolution", () => {
      updateOverlayVisibility();
      setZoom(Math.round((map.getView().getZoom() ?? 0) * 10) / 10);
    });

    const clickListener = map.on("singleclick", async (event) => {
      if (
        map
          .getInteractions()
          .getArray()
          .some((interaction) => interaction instanceof Draw)
      ) {
        return;
      }

      if (plotAreasLayer.getVisible()) {
        const area = map.forEachFeatureAtPixel(event.pixel, (feature) => feature, {
          layerFilter: (layer) => layer === plotAreasLayer,
        });
        if (area) {
          flyToPlotArea(map, area.get("center"));
          return;
        }
      }

      const requestId = ++featureInfoRequestRef.current;
      const queryLayers = OVERLAY_LAYERS.filter(({ id, queryable }) => {
        const layer = overlayLayers[id];
        return queryable && layer.get("userEnabled") === true && layer.getVisible();
      });

      if (queryLayers.length === 0) {
        featurePopupOverlay.setPosition(undefined);
        setFeaturePopup(null);
        return;
      }

      const view = map.getView();
      const resolution = view.getResolution();
      const projection = view.getProjection();

      if (resolution === undefined) return;

      featurePopupOverlay.setPosition(event.coordinate);
      setFeaturePopup({ status: "loading", features: [], message: "" });

      const results = await Promise.allSettled(
        queryLayers.map(async (config) => {
          const source = overlayLayers[config.id].getSource();
          const url = source.getFeatureInfoUrl(
            event.coordinate,
            resolution,
            projection,
            {
              INFO_FORMAT: "application/json",
              FEATURE_COUNT: 1,
            }
          );

          if (!url) {
            throw new Error(`${config.label}: could not create feature info request.`);
          }

          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`${config.label}: request failed (${response.status}).`);
          }

          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.includes("json")) {
            throw new Error(`${config.label}: GeoServer returned ${contentType || "an unknown response"}.`);
          }

          const data = await response.json();
          return {
            layerLabel: config.label,
            features: Array.isArray(data.features) ? data.features : [],
          };
        })
      );

      if (requestId !== featureInfoRequestRef.current) return;

      const features = [];
      const errors = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          result.value.features.forEach((feature) => {
            features.push({
              layerLabel: result.value.layerLabel,
              id: feature.id,
              properties: feature.properties ?? {},
            });
          });
        } else {
          const reason = result.reason;
          errors.push(
            reason instanceof Error
              ? reason.message
              : `${queryLayers[index].label}: feature info request failed.`
          );
        }
      });

      setFeaturePopup({
        status: "ready",
        features,
        message:
          errors.length > 0
            ? errors.join(" ")
            : features.length === 0
              ? "No features found at this location."
              : "",
      });
    });

    const pointerListener = map.on("pointermove", (event) => {
      if (event.dragging) return;
      const overArea =
        plotAreasLayer.getVisible() &&
        map.hasFeatureAtPixel(event.pixel, {
          layerFilter: (layer) => layer === plotAreasLayer,
        });
      map.getTargetElement().style.cursor = overArea ? "pointer" : "";
    });

    const resizeObserver = new ResizeObserver(() => {
      map.updateSize();
    });

    resizeObserver.observe(mapElementRef.current);

    return () => {
      unByKey([
        zoomListener,
        clickListener,
        pointerListener,
        ...overlayErrorListeners,
      ]);

      featureInfoRequestRef.current += 1;
      resizeObserver.disconnect();
      map.setTarget(undefined);
      map.dispose();

      mapRef.current = null;
      setMap(null);
      featurePopupOverlayRef.current = null;
      plotHighlightLayerRef.current = null;
      basemapLayersRef.current = null;
      overlayLayersRef.current = null;
      extrasRef.current = null;
      labelsLoadedRef.current = false;
    };
  }, []);

  // landuse labels are a separate small file, fetched the first time landuse is switched on
  const loadLandUseLabels = () => {
    if (labelsLoadedRef.current) return;
    labelsLoadedRef.current = true;
    import("../data/landuse-labels.json").then(({ default: rows }) => {
      const source = extrasRef.current?.landuseLabels.getSource();
      if (!source) return;
      source.addFeatures(
        rows.map(
          (row) =>
            new Feature({
              geometry: new Point(fromLonLat([row.x, row.y])),
              t: row.t,
              a: row.a,
              n: row.n,
              k: row.k,
            })
        )
      );
    });
  };

  useEffect(() => {
    const layers = basemapLayersRef.current;
    if (!layers) return;

    layers.street.setVisible(activeBasemap === "street");
    layers.satellite.setVisible(
      activeBasemap === "satellite" || activeBasemap === "hybrid"
    );
    layers.hybridLabels.forEach((layer) =>
      layer.setVisible(activeBasemap === "hybrid")
    );
  }, [activeBasemap]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = overlayLayersRef.current;
    if (!map || !layers) return;

    const zoom = map.getView().getZoom() ?? 0;
    OVERLAY_LAYERS.forEach(({ id, minZoom }) => {
      const layer = layers[id];
      const enabled = overlayEnabled[id] === true;
      layer.set("userEnabled", enabled);
      layer.setVisible(enabled && (minZoom === undefined || zoom >= minZoom));
    });
    extrasRef.current?.sync();
    if (overlayEnabled.landuse) loadLandUseLabels();
  }, [overlayEnabled]);

  useEffect(() => {
    const layers = overlayLayersRef.current;
    if (!layers) return;
    OVERLAY_LAYERS.forEach(({ id }) => layers[id].setOpacity(overlayOpacity[id]));
  }, [overlayOpacity]);

  const handleZoomToLayer = (id) => {
    const map = mapRef.current;
    const view = map?.getView();
    const config = OVERLAY_LAYERS.find((layer) => layer.id === id);
    if (!view || !config?.minZoom) return;

    const centre = view.getCenter();
    if (id === "plotLayout") {
      // jump to the nearest sizeable plotted area instead of zooming in on a spot that may have none
      const nearest = PLOT_AREAS.filter((area) => area.plots >= 200).reduce(
        (best, area) => {
          const distance = Math.hypot(area.center[0] - centre[0], area.center[1] - centre[1]);
          return distance < best.distance ? { distance, area } : best;
        },
        { distance: Infinity }
      ).area;
      if (nearest) {
        flyToPlotArea(map, nearest.center);
        return;
      }
    }

    view.animate({
      center: containsCoordinate(DATA_EXTENT, centre) ? centre : getCenter(DATA_EXTENT),
      zoom: Math.max(view.getZoom() ?? 0, config.minZoom + 1),
      duration: 500,
    });
  };

  // chart -> map: show only the plots of the clicked slice (and take the user to them)
  const handlePlotFilter = ({ statuses, scope, label }) => {
    setPlotFilter({ cql: allotmentCql({ statuses, scope }), label });
    setOverlayEnabled((current) => ({ ...current, plotLayout: true }));
    setActiveTool(null);

    const map = mapRef.current;
    if (!map) return;
    const entry = scope !== "All" ? SCHEME_LIST.find((item) => item.scheme === scope) : null;
    if (entry) {
      flyToPlotArea(map, entry.best.center);
    } else if ((map.getView().getZoom() ?? 0) < PLOT_LAYOUT_MIN_ZOOM) {
      handleZoomToLayer("plotLayout");
    }
  };

  useEffect(() => {
    const source = overlayLayersRef.current?.plotLayout.getSource();
    if (!source || (!plotFilter && !source.getParams().CQL_FILTER)) return;
    source.updateParams({ CQL_FILTER: plotFilter?.cql });
  }, [plotFilter]);

  // Filter tool -> map: show only the chosen landuse types (polygons + their labels)
  const handleLanduseFilter = (ids) => {
    setActiveTool(null);
    if (!ids) {
      setLanduseFilter(null);
      return;
    }
    const typeCount = landuseClasses.classes.filter((cls) =>
      cls.subs.some((sub) => ids.has(sub.id))
    ).length;
    setLanduseFilter({
      ids,
      cql: landuseCql(ids),
      label: `${typeCount} of ${landuseClasses.classes.length} landuse types`,
    });
    setOverlayEnabled((current) => ({ ...current, landuse: true }));
  };

  useEffect(() => {
    const source = overlayLayersRef.current?.landuse.getSource();
    if (source && (landuseFilter || source.getParams().CQL_FILTER)) {
      source.updateParams({ CQL_FILTER: landuseFilter?.cql });
    }
    labelFilter.ids = landuseFilter?.ids ?? null;
    extrasRef.current?.landuseLabels.changed();
  }, [landuseFilter]);

  const handleGoToScheme = (scheme) => {
    const entry = SCHEME_LIST.find((item) => item.scheme === scheme);
    if (entry && mapRef.current) flyToPlotArea(mapRef.current, entry.best.center);
  };

  const handleRefresh = () => {
    setActiveTool(null);
    setPlotFilter(null);
    setLanduseFilter(null);
    setLayerError("");
    featureInfoRequestRef.current += 1;
    plotSearchRequestRef.current += 1;
    featurePopupOverlayRef.current?.setPosition(undefined);
    setFeaturePopup(null);
    plotHighlightLayerRef.current?.getSource().clear();

    const map = mapRef.current;
    if (!map) return;

    map.getLayers().forEach((layer) => {
      layer.getSource()?.refresh();
    });

    map.getView().animate({
      center: fromLonLat(INITIAL_CENTER),
      zoom: INITIAL_ZOOM,
      duration: 500,
    });
  };

  const handleSearchPlotNumber = async (scheme, selectedPlot) => {
    const requestId = ++plotSearchRequestRef.current;
    featureInfoRequestRef.current += 1;
    plotHighlightLayerRef.current?.getSource().clear();
    featurePopupOverlayRef.current?.setPosition(undefined);
    setFeaturePopup(null);

    try {
      const features = await fetchWfsFeatures({
        service: "WFS",
        version: "1.1.0",
        request: "GetFeature",
        typeName: PLOT_LAYOUT_LAYER,
        outputFormat: "application/json",
        featureID: selectedPlot.featureIds.join(","),
        srsName: "EPSG:3857",
      });

      if (requestId !== plotSearchRequestRef.current) return;
      if (features.length === 0) {
        return (
          `Property "${selectedPlot.propertyNumber}" was not found in "${scheme}".`
        );
      }

      const map = mapRef.current;
      const highlightLayer = plotHighlightLayerRef.current;
      if (!map || !highlightLayer) {
        throw new Error("The map is not ready to display the selected property.");
      }

      const format = new GeoJSON();
      const mapFeatures = format.readFeatures(
        { type: "FeatureCollection", features },
        {
          dataProjection: "EPSG:3857",
          featureProjection: map.getView().getProjection(),
        }
      );
      if (mapFeatures.length === 0) {
        return "The matching property has no mappable geometry.";
      }

      const highlightSource = highlightLayer.getSource();
      highlightSource.clear();
      highlightSource.addFeatures(mapFeatures);
      const extent = highlightSource.getExtent();
      if (!extent.every(Number.isFinite)) {
        throw new Error("The selected property has invalid map coordinates.");
      }

      const plotLayer = overlayLayersRef.current?.plotLayout;
      plotLayer?.set("userEnabled", true);
      plotLayer?.setVisible(true);
      setOverlayEnabled((current) => ({ ...current, plotLayout: true }));

      setFeaturePopup({
        status: "ready",
        features: mapFeatures.map((feature) => {
          const properties = { ...feature.getProperties() };
          feature.getKeys().forEach((key) => {
            if (key === feature.getGeometryName()) delete properties[key];
          });

          return {
            layerLabel: "Plot Layout",
            id: feature.getId(),
            properties,
          };
        }),
        message: "",
      });
      featurePopupOverlayRef.current?.setPosition([
        (extent[0] + extent[2]) / 2,
        (extent[1] + extent[3]) / 2,
      ]);
      map.getView().fit(extent, {
        duration: 700,
        maxZoom: 19,
        padding: [80, 80, 80, 80],
      });

      const schemes = Array.from(
        new Set(
          mapFeatures
            .map((feature) => getPropertyValue(feature.getProperties(), "Scheme"))
            .filter((scheme) => scheme != null)
            .map(String)
        )
      );
      return (
        `${mapFeatures.length} matching plot${mapFeatures.length === 1 ? "" : "s"} highlighted${
          schemes.length > 0 ? ` in ${schemes.join(", ")}` : ""
        }${features.length >= 500 ? ". Showing the first 500 matches." : "."}`
      );
    } catch (error) {
      if (requestId !== plotSearchRequestRef.current) return "";
      throw error;
    }
  };

  const handleCancelPlotSearch = () => {
    plotSearchRequestRef.current += 1;
    setActiveTool(null);
  };

  // tell the user where to go whenever a switched-on layer is still too far out to be drawn
  const hints = OVERLAY_LAYERS.filter(
    ({ id, minZoom }) =>
      minZoom !== undefined && overlayEnabled[id] && zoom < minZoom
  ).map(({ id, label }) =>
    id === "plotLayout"
      ? {
          id,
          text: `${label} has too many plots to draw at this scale. Click a highlighted area, pick a scheme in the Layers panel, or`,
          action: "go to the nearest plots",
        }
      : {
          id,
          text: `${label} appears once you zoom in a little more.`,
          action: "Zoom in",
        }
  );

  return (
    <main className="map-wrapper" aria-label="GIS map">
      <div ref={mapElementRef} className="gis-map" />
      <div ref={popupElementRef} className="feature-info-popup">
        {featurePopup && (
          <>
            <div className="feature-info-popup-header">
              <strong>Feature information</strong>
              <button
                type="button"
                onClick={() => {
                  featureInfoRequestRef.current += 1;
                  featurePopupOverlayRef.current?.setPosition(undefined);
                  setFeaturePopup(null);
                }}
                aria-label="Close feature information"
              >
                <FaTimes />
              </button>
            </div>

            <div className="feature-info-popup-body">
              {featurePopup.status === "loading" ? (
                <p>Loading feature information...</p>
              ) : (
                <>
                  {featurePopup.message && (
                    <p role={featurePopup.features.length === 0 ? "status" : undefined}>
                      {featurePopup.message}
                    </p>
                  )}
                  {featurePopup.features.map((feature, index) => {
                    const properties = Object.entries(feature.properties).filter(
                      ([key, value]) => key.toLowerCase() !== "geom" && value != null
                    );

                    return (
                      <section
                        className="feature-info-section"
                        key={`${feature.layerLabel}-${feature.id ?? index}`}
                      >
                        <h3>{feature.layerLabel}</h3>
                        {properties.length > 0 ? (
                          <dl>
                            {properties.map(([key, value]) => (
                              <div key={key}>
                                <dt>{getFeaturePropertyLabel(feature.layerLabel, key)}</dt>
                                <dd>
                                  {typeof value === "object"
                                    ? JSON.stringify(value)
                                    : String(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p>No attributes returned for this feature.</p>
                        )}
                      </section>
                    );
                  })}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <MapToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onRefresh={handleRefresh}
      />

      <MapToolPanel
        activeTool={activeTool}
        onClose={() => setActiveTool(null)}
      >
        {activeTool === "layers" ? (
          <LayerTool
            panel
            basemaps={BASEMAPS}
            activeBasemap={activeBasemap}
            onBasemapChange={setActiveBasemap}
            layers={OVERLAY_LAYERS.map(({ id, label, minZoom, zoomNote }) => ({
              id,
              label,
              minZoom,
              note: zoomNote,
              enabled: overlayEnabled[id],
              opacity: overlayOpacity[id],
              loading: loadingLayers[id] === true,
              belowMinZoom: minZoom !== undefined && zoom < minZoom,
              legend: LEGENDS[id],
              schemes:
                id === "plotLayout"
                  ? SCHEME_LIST.map(({ scheme, plots }) => ({
                      value: scheme,
                      label: `${schemeLabel(scheme)} (${plots.toLocaleString()})`,
                    }))
                  : undefined,
            }))}
            onGoToScheme={handleGoToScheme}
            onOpacityChange={(id, value) =>
              setOverlayOpacity((current) => ({ ...current, [id]: value }))
            }
            onZoomToLayer={handleZoomToLayer}
            onLayerChange={(id, enabled) =>
              setOverlayEnabled((current) => ({ ...current, [id]: enabled }))
            }
          />
        ) : activeTool === "filter" ? (
          <LanduseFilter
            key={landuseFilter ? "filtered" : "all"}
            selectedIds={landuseFilter?.ids ?? null}
            onApply={handleLanduseFilter}
            onClear={() => setLanduseFilter(null)}
          />
        ) : activeTool === "search" ? (
          <PlotSearch
            onSearch={handleSearchPlotNumber}
            onCancel={handleCancelPlotSearch}
          />
        ) : activeTool === "measurement" ? (
          <MeasurementPanel map={map} />
        ) : activeTool === "chart" ? (
          <PlotAllotmentChart
            onShowOnMap={handlePlotFilter}
            activeFilter={plotFilter?.label}
            onClearFilter={() => setPlotFilter(null)}
          />
        ) : (
          <p>This tool is not available yet.</p>
        )}
      </MapToolPanel>

      <BaseMapSwitcher
        basemaps={BASEMAPS}
        activeBasemap={activeBasemap}
        onBasemapChange={setActiveBasemap}
      />

      {(hints.length > 0 || plotFilter || landuseFilter) && (
        <div className="map-hints" role="status">
          {plotFilter && (
            <div className="map-hint map-filter">
              <span>
                <strong>Showing only:</strong> {plotFilter.label}. Plot colours show the scheme.
              </span>
              <button type="button" onClick={() => setPlotFilter(null)}>
                Clear filter
              </button>
            </div>
          )}
          {landuseFilter && (
            <div className="map-hint map-filter">
              <span>
                <strong>Landuse filter:</strong> {landuseFilter.label} shown.
              </span>
              <button type="button" onClick={() => setLanduseFilter(null)}>
                Clear filter
              </button>
            </div>
          )}
          {hints.map(({ id, text, action }) => (
            <div className="map-hint" key={id}>
              <span>{text}</span>
              <button type="button" onClick={() => handleZoomToLayer(id)}>
                {action}
              </button>
            </div>
          ))}
        </div>
      )}

      {layerError && (
        <div
          role="alert"
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            right: 16,
            zIndex: 1200,
            padding: "10px 14px",
            background: "#fff",
            color: "#a31515",
            borderRadius: 6,
          }}
        >
          {layerError}
        </div>
      )}

    </main>
  );
}