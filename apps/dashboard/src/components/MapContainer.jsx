import { useEffect, useRef, useState } from 'react'
import Map from 'ol/Map.js'
import View from 'ol/View.js'
import TileLayer from 'ol/layer/Tile.js'
import ImageLayer from 'ol/layer/Image.js'
import XYZ from 'ol/source/XYZ.js'
import ImageWMS from 'ol/source/ImageWMS.js'
import VectorSource from 'ol/source/Vector.js'
import Overlay from 'ol/Overlay.js'
import { unByKey } from 'ol/Observable.js'
import { fromLonLat } from 'ol/proj.js'
import { createEmpty, extend, isEmpty } from 'ol/extent.js'
import GeoJSON from 'ol/format/GeoJSON.js'
import VectorLayer from 'ol/layer/Vector.js'
import Fill from 'ol/style/Fill.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import { LAYOUT_FIELDS } from '../config/layoutFields.js'
import { BASEMAP_Z_INDEX, drawOrder, hasOpacitySlider, topFirst } from '../config/layerOrder.js'
import MapInfoControl from './MapInfoControl.jsx'
import 'ol/ol.css'

const geoserverUrl =
  import.meta.env.VITE_GEOSERVER_WMS_URL?.trim() ||
  '/geoserver/wms'
const geoserverWfsUrl = geoserverUrl.replace(/\/wms(?=\?|$)/i, '/wfs')

const cityCenters = {
  katra: { center: [81.9624, 25.8882], zoom: 14.5 },
  majhola: { center: [78.7215, 28.8425], zoom: 14.5 },
  hardoi: { center: [80.1447, 27.386779], zoom: 15.5 },
  ayodhya: { center: [82.2149, 26.7644], zoom: 14.5 },
  barabanki: { center: [81.1810, 26.9227], zoom: 15.5 },
  sikandra: { center: [77.9695, 27.1980], zoom: 14.5 },
  unnao: { center: [80.4734, 26.5195], zoom: 14.5 },
  lucknow: { center: [80.9626, 26.7677], zoom: 14 },
}

const imageryUrl =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const referenceUrl =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

const propertyLabels = {
  shape_area: 'Area',
  village_na: 'Village Name',
  scheme_na: 'Scheme Name',
  area_in_ac: 'Area (acre)',
  area_in_ha: 'Area (hectare)',
  area_in_hec: 'Area (hectare)',
   vill_name: 'Village Name',
    yojana_num: 'Yojana Number',
}

function getPropertyLabel(key) {
  return (
    propertyLabels[key.toLowerCase()] ??
    key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  )
}

function createBaseLayers() {
  return {
    osm: new TileLayer({
      source: new XYZ({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attributions: '&copy; OpenStreetMap contributors',
        crossOrigin: 'anonymous',
      }),
      zIndex: BASEMAP_Z_INDEX.imagery,
      visible: false,
    }),
    satellite: new TileLayer({
      source: new XYZ({
        url: imageryUrl,
        attributions: 'Tiles &copy; Esri',
        crossOrigin: 'anonymous',
      }),
      zIndex: BASEMAP_Z_INDEX.imagery,
      visible: false,
    }),
    hybridImagery: new TileLayer({
      source: new XYZ({
        url: imageryUrl,
        attributions: 'Tiles &copy; Esri',
        crossOrigin: 'anonymous',
      }),
      zIndex: BASEMAP_Z_INDEX.imagery,
      visible: true,
    }),
    hybridLabels: new TileLayer({
      source: new XYZ({
        url: referenceUrl,
        attributions: 'Labels &copy; Esri',
        crossOrigin: 'anonymous',
      }),
      zIndex: BASEMAP_Z_INDEX.labels, // above the (opaque) data layers, otherwise the place names are never visible
      visible: false,
    }),
  }
}

// Geometry of one chart category, for the yellow highlight. Only the geometry column is requested (the highlight needs no
// attributes) and in EPSG:4326 so GeoServer does not have to reproject; the browser reprojects.
async function fetchCategoryGeometry(layer, cqlFilter, signal) {
  const base = {
    service: 'WFS',
    version: '1.1.0',
    request: 'GetFeature',
    typeName: layer,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    CQL_FILTER: cqlFilter,
    maxFeatures: '100000',
  }
  let status = 0
  for (const extra of [{ propertyName: 'geom' }, {}]) {
    const response = await fetch(`${geoserverWfsUrl}?${new URLSearchParams({ ...base, ...extra })}`, { signal })
    status = response.status
    if (response.ok) {
      const data = JSON.parse(await response.text())
      if (Array.isArray(data.features)) return data
    }
  }
  throw new Error(`GeoServer returned HTTP ${status}.`)
}

function MapContainer({
  basemap,
  city,
  layers,
  visibleLayers,
  layerTransparency,
  selectedLulcCategory,
  propertyStatusEnabled,
  onMapReady,
  onZoomChange,
  onSelectionLoadingChange,
  layerFilters,
  focusRequest,
}) {
  const targetRef = useRef(null)
  const popupRef = useRef(null)
  const mapRef = useRef(null)
  const baseLayersRef = useRef(null)
  const wmsLayersRef = useRef({})
  const highlightSourceRef = useRef(null)
  const categoryHighlightSourceRef = useRef(null)
  const layerConfigRef = useRef({ layers, visibleLayers })
  const identifyRequestRef = useRef(0)
  const overlayRef = useRef(null)
  const [mapInstance, setMapInstance] = useState(null)
  const [failedLayers, setFailedLayers] = useState({})
  const [selectionError, setSelectionError] = useState('')
  const [selectionLoading, setSelectionLoading] = useState(false)
  const initialCityRef = useRef(city) // the map opens on the remembered city (no flash of another city after a refresh)
  const highlightCacheRef = useRef(new Map()) // category geometry already downloaded: selecting it again is instant
  const [popup, setPopup] = useState(null)

  useEffect(() => {
    layerConfigRef.current = { layers, visibleLayers }
  }, [layers, visibleLayers])

  useEffect(() => {
    onSelectionLoadingChange?.(selectionLoading)
  }, [onSelectionLoadingChange, selectionLoading])

  useEffect(() => {
    highlightSourceRef.current?.clear()
    categoryHighlightSourceRef.current?.clear()
  }, [city, layers, visibleLayers])

  useEffect(() => {
    const mapTarget = targetRef.current
    const popupElement = popupRef.current
    if (!mapTarget || !popupElement) return undefined

    const baseLayers = createBaseLayers()
    const map = new Map({
      target: mapTarget,
      layers: [
        baseLayers.osm,
        baseLayers.satellite,
        baseLayers.hybridImagery,
        baseLayers.hybridLabels,
      ],
      view: new View({
        center: fromLonLat((cityCenters[initialCityRef.current] ?? cityCenters.katra).center),
        zoom: (cityCenters[initialCityRef.current] ?? cityCenters.katra).zoom,
      }),
    })
    const highlightSource = new VectorSource()
    const highlightLayer = new VectorLayer({
      source: highlightSource,
      style: new Style({
        fill: new Fill({ color: 'rgba(255, 193, 7, 0.35)' }),
        stroke: new Stroke({ color: '#ff8f00', width: 3 }),
      }),
    })
    highlightLayer.setZIndex(1000)
    map.addLayer(highlightLayer)

    const categoryHighlightSource = new VectorSource()
    const categoryHighlightLayer = new VectorLayer({
      source: categoryHighlightSource,
      className: 'lulc-selected-category-layer',
      style: new Style({
        fill: new Fill({ color: 'rgba(255, 193, 7, 0.22)' }),
        stroke: new Stroke({ color: '#ff6d00', width: 3 }),
      }),
    })
    categoryHighlightLayer.setZIndex(900)
    map.addLayer(categoryHighlightLayer)

    const popupOverlay = new Overlay({
      element: popupElement,
      positioning: 'bottom-center',
      offset: [0, -14],
      stopEvent: true,
      autoPan: { animation: { duration: 200 } },
    })
    map.addOverlay(popupOverlay)

    mapRef.current = map
    setMapInstance(map)
    onMapReady(map)
    baseLayersRef.current = baseLayers
    highlightSourceRef.current = highlightSource
    categoryHighlightSourceRef.current = categoryHighlightSource
    overlayRef.current = popupOverlay

    const clickKey = map.on('singleclick', async (event) => {
      if (map.get('measurementMode')) return

      const requestId = identifyRequestRef.current + 1
      identifyRequestRef.current = requestId
      highlightSource.clear()
      popupOverlay.setPosition(event.coordinate)
      setPopup({ loading: true, features: [], error: '' })

      const { layers: currentLayers, visibleLayers: currentVisibility } = layerConfigRef.current
      const activeLayers = topFirst(currentLayers)
        .filter(({ id }) => currentVisibility[id])
        .map((item) => ({ ...item, mapLayer: wmsLayersRef.current[item.id] }))
        .filter(({ mapLayer }) => mapLayer?.getVisible())

      if (!activeLayers.length) {
        setPopup({ loading: false, features: [], error: '' })
        return
      }

      try {
        const responses = await Promise.all(
          activeLayers.map(async (item) => {
            const source = item.mapLayer.getSource()
            const url = source.getFeatureInfoUrl(
              event.coordinate,
              map.getView().getResolution(),
              map.getView().getProjection(),
              { INFO_FORMAT: 'application/json', FEATURE_COUNT: 10 },
            )
            if (!url) return []

            const response = await fetch(url)
            const responseText = await response.text()
            if (!response.ok) {
              throw new Error(`GeoServer returned HTTP ${response.status}: ${responseText}`)
            }
            if (!response.headers.get('content-type')?.includes('json')) {
              const errorDocument = new DOMParser().parseFromString(responseText, 'text/xml')
              const serviceException = errorDocument.querySelector('ServiceException')
              const message =
                serviceException?.textContent?.trim() ||
                'GeoServer returned a non-JSON response for feature information.'
              throw new Error(message)
            }

            const data = JSON.parse(responseText)
            return {
              popupFeatures: (data.features ?? []).map((feature) => ({
                layerName: item.name,
                properties: feature.properties ?? {},
              })),
              highlightFeatures: new GeoJSON().readFeatures(data, {
                featureProjection: map.getView().getProjection(),
              }),
            }
          }),
        )

        if (identifyRequestRef.current === requestId) {
          highlightSource.addFeatures(responses.flatMap(({ highlightFeatures }) => highlightFeatures))
          setPopup({
            loading: false,
            features: responses.flatMap(({ popupFeatures }) => popupFeatures),
            error: '',
          })
        }
      } catch (error) {
        if (identifyRequestRef.current === requestId) {
          setPopup({
            loading: false,
            features: [],
            error: error instanceof Error ? error.message : 'Unable to query GeoServer.',
          })
        }
      }
    })

    return () => {
      unByKey(clickKey)
      identifyRequestRef.current += 1
      map.setTarget(undefined)
      mapRef.current = null
      setMapInstance(null)
      onMapReady(null)
      baseLayersRef.current = null
      highlightSourceRef.current = null
      categoryHighlightSourceRef.current = null
      overlayRef.current = null
      wmsLayersRef.current = {}
    }
  }, [onMapReady])

  useEffect(() => {
    const map = mapRef.current
    const baseLayers = baseLayersRef.current
    if (!map || !baseLayers) return

    baseLayers.osm.setVisible(basemap === 'osm')
    baseLayers.satellite.setVisible(basemap === 'satellite')
    baseLayers.hybridImagery.setVisible(basemap === 'hybrid')
    baseLayers.hybridLabels.setVisible(basemap === 'hybrid')
  }, [basemap])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    map.getView().animate({
      center: fromLonLat(cityCenters[city].center),
      zoom: cityCenters[city].zoom,
      duration: 400,
    })
  }, [city])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const activeIds = new Set(layers.map(({ id }) => id))
    Object.entries(wmsLayersRef.current).forEach(([id, layer]) => {
      layer.setVisible(activeIds.has(id) && Boolean(visibleLayers[id]))
    })

    if (!geoserverUrl) {
      return
    }

    layers.forEach((item) => {
      let layer = wmsLayersRef.current[item.id]
      if (!layer) {
        const source = new ImageWMS({
          url: geoserverUrl,
          params: { LAYERS: item.layer, VERSION: '1.1.1' },
          ratio: 1,
          serverType: 'geoserver',
          crossOrigin: 'anonymous',
        })
        layer = new ImageLayer({
          source,
          zIndex: drawOrder(item.id), // fixed stacking (see config/layerOrder.js), not "order of first creation"
          visible: Boolean(visibleLayers[item.id]),
          className: item.id.includes('lulc')
            ? 'lulc-background-layer'
            : item.id === 'vrindavan-layout'
              ? 'planning-layout-background-layer'
              : undefined,
        })
        layer.set('layerId', item.id)
        wmsLayersRef.current[item.id] = layer
        map.addLayer(layer)
        source.on('imageloaderror', () => {
          setFailedLayers((current) => ({ ...current, [item.id]: item.name }))
        })
        source.on('imageloadend', () => {
          setFailedLayers((current) => {
            if (!current[item.id]) return current
            const next = { ...current }
            delete next[item.id]
            return next
          })
        })
      }
      layer.setVisible(Boolean(visibleLayers[item.id]))
      // STYLES is owned by the zoom effect below. Clearing it here used to reset the Vrindavan colours and
      // labels whenever the opacity slider moved. updateParams() reloads the image, so only call it for a real change.
      const source = layer.getSource()
      const current = source.getParams()
      const wantedFilter = layerFilters?.[item.id] ?? '' // scheme / sector selection (see App.jsx); '' = no filter
      if ((current.CQL_FILTER ?? '') !== wantedFilter || current.SLD_BODY !== undefined) {
        const params = { ...current }
        if (wantedFilter) params.CQL_FILTER = wantedFilter
        else delete params.CQL_FILTER
        delete params.SLD_BODY
        source.updateParams(params)
      }
      const supportsTransparency = hasOpacitySlider(item.id)
      const transparency = supportsTransparency ? layerTransparency[item.id] ?? 0 : 0
      layer.setOpacity(1 - transparency / 100)
    })
  }, [layers, visibleLayers, layerTransparency, layerFilters])

  useEffect(() => {
    if (!mapInstance) return undefined

    const updateZoomStyles = () => {
      const zoom = mapInstance.getView().getZoom() ?? 0
      onZoomChange(zoom)
      layers.forEach((item) => {
        if (!item.zoomStyle) return
        const layer = wmsLayersRef.current[item.id]
        if (!layer) return

        const style = propertyStatusEnabled
          ? item.zoomStyle.statusStyle
          : zoom >= item.zoomStyle.threshold
            ? item.zoomStyle.style
            : ''
        const source = layer.getSource()
        // Fired for every animation frame of a zoom: reload the image only when the style really changes.
        if ((source.getParams().STYLES ?? '') !== style) source.updateParams({ STYLES: style })
      })
    }

    updateZoomStyles()
    const resolutionKey = mapInstance.getView().on('change:resolution', updateZoomStyles)
    return () => unByKey(resolutionKey)
  }, [layers, mapInstance, onZoomChange, propertyStatusEnabled])

  useEffect(() => {
    const source = categoryHighlightSourceRef.current
    source?.clear()
    setSelectionError('')
    setSelectionLoading(false)
    if (!source || !mapInstance || !selectedLulcCategory) return undefined

    const selectedLayer =
      layers.find(({ layer }) => layer === selectedLulcCategory.layer) ??
      layers.find(({ id }) => id.includes('lulc'))
    if (!selectedLayer || !visibleLayers[selectedLayer.id]) return undefined

    const categoryProperty = selectedLulcCategory.categoryProperty ?? 'class'
    const categoryClause =
      categoryProperty === LAYOUT_FIELDS.propertyType && selectedLulcCategory.className === 'Null'
        ? `(${categoryProperty} IS NULL OR ${categoryProperty}='')`
        : categoryProperty === LAYOUT_FIELDS.propertyStatus &&
            selectedLulcCategory.className === 'Other or unspecified'
          ? `(${categoryProperty} IS NULL OR ${categoryProperty}='' OR ${categoryProperty} NOT IN ('Alloted','Vacant'))`
          : `${categoryProperty}='${selectedLulcCategory.className.replaceAll("'", "''")}'`
    const clauses = [categoryClause]
    const scopeFilter = layerFilters?.[selectedLayer.id] // the chart only counts the checked schemes / chosen sector
    if (scopeFilter) clauses.push(`(${scopeFilter})`)
    if (selectedLulcCategory.subClassName && selectedLulcCategory.subClassProperty) {
      const property = selectedLulcCategory.subClassProperty
      if (selectedLulcCategory.subClassName === 'Unspecified') {
        clauses.push(`(${property} IS NULL OR ${property}='')`)
      } else {
        clauses.push(
          `${property}='${selectedLulcCategory.subClassName.replaceAll("'", "''")}'`,
        )
      }
    }

    const controller = new AbortController()
    async function loadCategoryFeatures() {
      try {
        const cqlFilter = clauses.join(' AND ')
        const cacheKey = `${selectedLayer.layer}|${cqlFilter}`
        let data = highlightCacheRef.current.get(cacheKey)
        if (!data) {
          setSelectionLoading(true)
          data = await fetchCategoryGeometry(selectedLayer.layer, cqlFilter, controller.signal)
          highlightCacheRef.current.set(cacheKey, data)
        }
        const features = new GeoJSON().readFeatures(data, {
          dataProjection: 'EPSG:4326',
          featureProjection: mapInstance.getView().getProjection(),
        })
        source.addFeatures(features)
        if (features.length) {
          // The Vrindavan chart changes its categories at zoom 16: do not let the zoom-to-selection cross that level and
          // clear the selection it has just made.
          const zoomStyled = layers.some((item) => item.zoomStyle && item.layer === selectedLayer.layer)
          const zoomNow = mapInstance.getView().getZoom() ?? 0
          const maxZoom = zoomStyled ? (zoomNow >= 16 ? 19 : 15.9) : 17
          mapInstance.getView().fit(source.getExtent(), {
            padding: [70, 70, 70, 70],
            maxZoom,
            duration: 600,
          })
        }
      } catch (error) {
        if (controller.signal.aborted) return
        setSelectionError(
          error instanceof Error ? error.message : 'Unable to highlight selected LULC features.',
        )
      } finally {
        if (!controller.signal.aborted) setSelectionLoading(false)
      }
    }

    loadCategoryFeatures()
    return () => {
      controller.abort()
      source.clear()
    }
  }, [city, layers, layerFilters, mapInstance, selectedLulcCategory, visibleLayers])

  // Zoom to a scheme / sector selection: try each target in turn (e.g. the sector boundary, then the plots) until one has a shape.
  useEffect(() => {
    if (!mapInstance || !focusRequest) return undefined
    const controller = new AbortController()
    async function zoomToSelection() {
      try {
        for (const { layer, cql } of focusRequest.targets) {
          const cacheKey = `${layer}|${cql}`
          let data = highlightCacheRef.current.get(cacheKey)
          if (!data) {
            data = await fetchCategoryGeometry(layer, cql, controller.signal)
            highlightCacheRef.current.set(cacheKey, data)
          }
          const extent = createEmpty()
          new GeoJSON()
            .readFeatures(data, { dataProjection: 'EPSG:4326', featureProjection: mapInstance.getView().getProjection() })
            .forEach((feature) => {
              const geometry = feature.getGeometry()
              if (geometry) extend(extent, geometry.getExtent())
            })
          if (!isEmpty(extent) && extent.every(Number.isFinite)) {
            mapInstance.getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 17, duration: 600 })
            return
          }
        }
        if (focusRequest.reset) {
          const home = cityCenters[city] ?? cityCenters.katra
          mapInstance.getView().animate({ center: fromLonLat(home.center), zoom: home.zoom, duration: 600 })
        }
      } catch (error) {
        if (!controller.signal.aborted) console.warn('Could not zoom to the selection:', error)
      }
    }
    zoomToSelection()
    return () => controller.abort()
    // city is read only when a reset is requested; the request itself is what triggers this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest, mapInstance])

  const activeFailedLayers = layers
    .filter(({ id }) => visibleLayers[id] && failedLayers[id])
    .map(({ id }) => failedLayers[id])
  const mapLegendItems = topFirst(layers)
    .filter(({ id }) => visibleLayers[id])
    .flatMap((item) => {
      // Lucknow: the cadastral layer is drawn with the black village style, the village boundary is a filled layer
      if (item.id === 'vrindavan-village-cadastral') {
        return [{ id: item.id, name: 'Village Cadastral', symbol: 'village' }]
      }
      if (item.id === 'vrindavan-village-boundary') {
        return [{ id: item.id, name: 'Village Boundary', symbol: 'villagearea' }]
      }
      if (item.id.includes('cadastral')) {
        return [{ id: item.id, name: 'Cadastral', symbol: 'cadastral' }]
      }
      if (item.id.includes('village')) {
        return [{ id: item.id, name: 'Village Boundary', symbol: 'village' }]
      }
      if (item.id.includes('scheme')) {
        return [{ id: item.id, name: 'Scheme Boundary', symbol: 'scheme' }]
      }
      if (item.id === 'dhara-28') return [{ id: item.id, name: 'Dhara 28', symbol: 'dhara28' }]
      if (item.id === 'dhara-32') return [{ id: item.id, name: 'Dhara 32', symbol: 'dhara32' }]
      if (item.id.includes('sector') && !item.id.includes('landuse')) {
        return [{ id: item.id, name: 'Sector Boundary', symbol: 'sector' }]
      }
      return []
    })
  const statusMessage = !geoserverUrl
    ? 'GeoServer is not configured. Add VITE_GEOSERVER_WMS_URL to .env.local, then restart Vite.'
    : activeFailedLayers.length
      ? `GeoServer did not return map images for: ${activeFailedLayers.join(', ')}. Check the WMS URL, published layer names, and that GeoServer is reachable.`
      : ''

  function closePopup() {
    identifyRequestRef.current += 1
    overlayRef.current?.setPosition(undefined)
    highlightSourceRef.current?.clear()
    setPopup(null)
  }

  return (
    <section
      className={`map-container${selectedLulcCategory ? ' map-container--selection-focus' : ''}`}
      aria-label="Interactive map"
    >
      <div className="map-container__canvas" ref={targetRef} />
      {mapLegendItems.length > 0 && (
        <div className="map-legend" aria-label="Map legend">
          <strong>Legend</strong>
          {mapLegendItems.map(({ id, name, symbol }) => (
            <div className="map-legend__item" key={id}>
              <span
                className={`map-legend__symbol map-legend__symbol--${symbol}`}
                aria-hidden="true"
              />
              <span>{name}</span>
            </div>
          ))}
        </div>
      )}
      <MapInfoControl map={mapInstance} />
      <div
        className="map-popup"
        ref={popupRef}
        role="dialog"
        aria-label="Map feature information"
        style={{ display: popup ? 'block' : 'none' }}
      >
        {popup && (
          <>
            <div className="map-popup__header">
              <strong>Feature information</strong>
              <button
                className="map-popup__close"
                type="button"
                aria-label="Close popup"
                onClick={closePopup}
              >
                ×
              </button>
            </div>
            <div className="map-popup__body" aria-live="polite">
              {popup.loading && <p className="map-popup__message">Loading feature details…</p>}
              {!popup.loading && popup.error && (
                <p className="map-popup__message map-popup__message--error">{popup.error}</p>
              )}
              {!popup.loading && !popup.error && popup.features.length === 0 && (
                <p className="map-popup__message">No features found at this location.</p>
              )}
              {!popup.loading &&
                !popup.error &&
                popup.features.map((feature, index) => {
                  const properties = Object.entries(feature.properties).filter(
                    ([key]) => !['geometry', 'id', 'remarks'].includes(key.toLowerCase()),
                  )

                  return (
                    <section className="map-popup__feature" key={`${feature.layerName}-${index}`}>
                      <h3>{feature.layerName}</h3>
                      {properties.length ? (
                        <dl>
                          {properties.map(([key, value]) => (
                            <div className="map-popup__property" key={key}>
                              <dt>{getPropertyLabel(key)}</dt>
                              <dd>{value == null || value === '' ? '—' : String(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="map-popup__message">No attributes are available.</p>
                      )}
                    </section>
                  )
                })}
            </div>
          </>
        )}
      </div>
      {statusMessage && (
        <div className="map-container__status" role="status">
          <strong>GeoServer connection</strong>
          <span>{statusMessage}</span>
        </div>
      )}
      {selectionLoading && (
        <div className="map-container__busy" role="status">
          <span className="map-container__spinner" aria-hidden="true" />
          Highlighting {selectedLulcCategory?.className ?? 'selection'} on the map…
        </div>
      )}
      {selectionError && (
        <div className="map-container__status" role="alert">
          <strong>Unable to highlight selection</strong>
          <span>{selectionError}</span>
        </div>
      )}
      <span className="map-container__attribution">
        {basemap === 'osm' ? '© OpenStreetMap contributors' : 'Tiles © Esri'}
      </span>
    </section>
  )
}

export default MapContainer
