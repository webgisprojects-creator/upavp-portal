import { useEffect, useRef, useState } from "react";
import { FaDrawPolygon, FaRulerHorizontal, FaTrash } from "react-icons/fa";
import Draw from "ol/interaction/Draw";
import Overlay from "ol/Overlay";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import CircleStyle from "ol/style/Circle";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";
import { getArea, getLength } from "ol/sphere";
import { unByKey } from "ol/Observable";
import ToolButton from "./ToolButton";
import "../../style/MeasurementTools.css";

const EMPTY_AREA = {
  squareMeter: 0,
  hectare: 0,
  acre: 0,
  squareKilometer: 0,
};

export default function MeasurementTool(props) {
  return (
    <ToolButton label="Measurement" {...props}>
      <FaRulerHorizontal />
    </ToolButton>
  );
}

export function MeasurementPanel({ map }) {
  const [activeTool, setActiveTool] = useState("");
  const [measurementValue, setMeasurementValue] = useState("");
  const [areaValues, setAreaValues] = useState(EMPTY_AREA);
  const sourceRef = useRef(null);
  const layerRef = useRef(null);
  const drawRef = useRef(null);
  const geometryListenerRef = useRef(null);
  const measurementOverlaysRef = useRef([]);

  const stopDrawing = () => {
    const draw = drawRef.current;
    if (draw && map) {
      draw.abortDrawing();
      map.removeInteraction(draw);
    }
    drawRef.current = null;

    if (geometryListenerRef.current) {
      unByKey(geometryListenerRef.current);
      geometryListenerRef.current = null;
    }
  };

  useEffect(() => {
    if (!map) return undefined;

    const source = new VectorSource();
    const layer = new VectorLayer({
      source,
      style: new Style({
        fill: new Fill({ color: "rgba(250, 204, 21, 0.08)" }),
        stroke: new Stroke({
          color: "#facc15",
          width: 3,
          lineDash: [10, 7],
        }),
        image: new CircleStyle({
          radius: 5,
          fill: new Fill({ color: "#facc15" }),
          stroke: new Stroke({ color: "#ffffff", width: 2 }),
        }),
      }),
      zIndex: 30,
    });

    sourceRef.current = source;
    layerRef.current = layer;
    map.addLayer(layer);

    return () => {
      stopDrawing();
      measurementOverlaysRef.current.forEach((overlay) => map.removeOverlay(overlay));
      measurementOverlaysRef.current = [];
      map.removeLayer(layer);
      sourceRef.current = null;
      layerRef.current = null;
    };
  }, [map]);

  const updateMeasurement = (type, geometry) => {
    let label;
    let coordinate;

    if (type === "Polygon") {
      const area = getArea(geometry);
      const interiorPoint = geometry.getInteriorPoint();
      coordinate = interiorPoint.getCoordinates();
      label = `${(area / 10000).toFixed(2)} ha`;
      setAreaValues({
        squareMeter: area,
        hectare: area / 10000,
        acre: area / 4046.8564224,
        squareKilometer: area / 1000000,
      });
    } else {
      const length = getLength(geometry);
      label =
        length >= 1000
          ? `${(length / 1000).toFixed(2)} km`
          : `${length.toFixed(2)} m`;
      coordinate = geometry.getCoordinateAt(0.5);
      setMeasurementValue(label);
    }

    const overlay = drawRef.current?.measurementOverlay;
    if (overlay && coordinate?.every(Number.isFinite)) {
      overlay.getElement().textContent = label;
      overlay.setPosition(coordinate);
    }
  };

  const startMeasurement = (type) => {
    if (!map || !sourceRef.current) return;

    stopDrawing();
    setMeasurementValue("");
    setAreaValues(EMPTY_AREA);
    setActiveTool(type);

    const draw = new Draw({
      source: sourceRef.current,
      type,
      stopClick: true,
    });

    draw.on("drawstart", (event) => {
      if (geometryListenerRef.current) {
        unByKey(geometryListenerRef.current);
      }

      const labelElement = document.createElement("div");
      labelElement.className = "measurement-map-label";
      const measurementOverlay = new Overlay({
        element: labelElement,
        positioning: "bottom-center",
        offset: [0, -12],
        stopEvent: false,
      });
      map.addOverlay(measurementOverlay);
      measurementOverlaysRef.current.push(measurementOverlay);
      draw.measurementOverlay = measurementOverlay;

      const geometry = event.feature.getGeometry();
      geometryListenerRef.current = geometry.on("change", () => {
        updateMeasurement(type, geometry);
      });
    });

    draw.on("drawend", () => {
      if (geometryListenerRef.current) {
        unByKey(geometryListenerRef.current);
        geometryListenerRef.current = null;
      }
    });

    drawRef.current = draw;
    map.addInteraction(draw);
  };

  const clearMeasurements = () => {
    stopDrawing();
    sourceRef.current?.clear();
    measurementOverlaysRef.current.forEach((overlay) => map.removeOverlay(overlay));
    measurementOverlaysRef.current = [];
    setActiveTool("");
    setMeasurementValue("");
    setAreaValues(EMPTY_AREA);
  };

  return (
    <div className="measurement-tools">
      <p className="measurement-tools-subtitle">
        Select a measurement type, then draw on the map. Double-click to finish.
      </p>

      <button
        type="button"
        className={`measurement-action-button ${
          activeTool === "LineString" ? "active" : ""
        }`}
        onClick={() => startMeasurement("LineString")}
        disabled={!map}
        aria-pressed={activeTool === "LineString"}
      >
        <FaRulerHorizontal />
        <span>
          <strong>Measure Distance</strong>
          <small>Draw a line on the map</small>
        </span>
      </button>

      <button
        type="button"
        className={`measurement-action-button ${
          activeTool === "Polygon" ? "active" : ""
        }`}
        onClick={() => startMeasurement("Polygon")}
        disabled={!map}
        aria-pressed={activeTool === "Polygon"}
      >
        <FaDrawPolygon />
        <span>
          <strong>Measure Area</strong>
          <small>Draw a polygon on the map</small>
        </span>
      </button>

      <button
        type="button"
        className="measurement-action-button measurement-clear-button"
        onClick={clearMeasurements}
      >
        <FaTrash />
        <span>
          <strong>Clear Measurements</strong>
          <small>Remove drawings and results</small>
        </span>
      </button>

      {activeTool && (
        <div className="measurement-result">
          <div className="measurement-result-title">
            {activeTool === "LineString" ? "Distance Result" : "Area Result"}
          </div>

          {activeTool === "LineString" ? (
            <div className="measurement-result-row">
              <span>Distance</span>
              <strong>{measurementValue || "0.00 m"}</strong>
            </div>
          ) : (
            <>
              <div className="measurement-result-row">
                <span>Square Meter</span>
                <strong>{areaValues.squareMeter.toFixed(2)} m²</strong>
              </div>
              <div className="measurement-result-row">
                <span>Hectare</span>
                <strong>{areaValues.hectare.toFixed(4)} ha</strong>
              </div>
              <div className="measurement-result-row">
                <span>Acre</span>
                <strong>{areaValues.acre.toFixed(4)} acre</strong>
              </div>
              <div className="measurement-result-row">
                <span>Square Kilometer</span>
                <strong>{areaValues.squareKilometer.toFixed(6)} km²</strong>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
