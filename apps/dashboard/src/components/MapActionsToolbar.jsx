import { useEffect, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import Overlay from 'ol/Overlay.js'
import Draw from 'ol/interaction/Draw.js'
import { unByKey } from 'ol/Observable.js'
import { getArea, getLength } from 'ol/sphere.js'
import Fill from 'ol/style/Fill.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import CadastralSearch from './CadastralSearch.jsx'
import LayoutSearch from './LayoutSearch.jsx'

const geoserverWmsUrl =
  import.meta.env.VITE_GEOSERVER_WMS_URL?.trim() || '/geoserver/wms'
const geoserverWfsUrl = geoserverWmsUrl.replace(/\/wms(?=\?|$)/i, '/wfs')

const cityNames = {
  katra: 'Katra, Pratapgarh',
  majhola: 'Majhola, Moradabad',
  hardoi: 'Hardoi',
  ayodhya: 'Ayodhya',
}

function formatMeasurement(geometry, mode) {
  if (mode === 'area') {
    const area = getArea(geometry)
    const squareMeters = area.toLocaleString(undefined, { maximumFractionDigits: 1 })
    const hectares = (area / 10000).toLocaleString(undefined, { maximumFractionDigits: 4 })
    return `${squareMeters} m² · ${hectares} ha`
  }

  const length = getLength(geometry)
  return length >= 1000
    ? `${(length / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km`
    : `${length.toLocaleString(undefined, { maximumFractionDigits: 1 })} m`
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escapeCsv(value) {
  const text = value == null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

async function fetchLulcFeatures(layer, signal) {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.1.0',
    request: 'GetFeature',
    typeName: layer,
    outputFormat: 'application/json',
    propertyName: 'category,area_in_ha',
    maxFeatures: '100000',
  })
  const response = await fetch(`${geoserverWfsUrl}?${params}`, { signal })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`GeoServer returned HTTP ${response.status}.`)
  }

  const data = JSON.parse(body)
  if (!Array.isArray(data.features)) {
    throw new Error('GeoServer did not return LULC features.')
  }
  return data.features.map(({ properties = {} }) => ({
    category: String(properties.category ?? 'Unclassified').trim() || 'Unclassified',
    area: Number(properties.area_in_ha) || 0,
  }))
}

async function createMapImage(map) {
  await new Promise((resolve, reject) => {
    let renderKey
    const timeout = window.setTimeout(() => {
      if (renderKey) unByKey(renderKey)
      reject(new Error('Map rendering timed out before export.'))
    }, 15000)

    renderKey = map.once('rendercomplete', () => {
      window.clearTimeout(timeout)
      resolve()
    })

    try {
      map.renderSync()
    } catch (error) {
      window.clearTimeout(timeout)
      unByKey(renderKey)
      reject(error)
    }
  })

  const pixelRatio = window.devicePixelRatio || 1
  const [width, height] = map.getSize() ?? []
  if (!width || !height) throw new Error('The map is not ready to export.')

  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = Math.round(width * pixelRatio)
  exportCanvas.height = Math.round(height * pixelRatio)
  const context = exportCanvas.getContext('2d')
  if (!context) throw new Error('Unable to create a map image.')
  context.scale(pixelRatio, pixelRatio)

  const canvases = map.getViewport().querySelectorAll('.ol-layer canvas')
  canvases.forEach((canvas) => {
    if (!canvas.width || !canvas.height) return
    const opacity = canvas.parentNode?.style.opacity
    context.globalAlpha = opacity ? Number(opacity) : 1

    const transform = canvas.style.transform
    if (transform) {
      const matrix = new DOMMatrix(transform)
      context.setTransform(
        pixelRatio * matrix.a,
        pixelRatio * matrix.b,
        pixelRatio * matrix.c,
        pixelRatio * matrix.d,
        pixelRatio * matrix.e,
        pixelRatio * matrix.f,
      )
    } else {
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    }

    context.drawImage(canvas, 0, 0)
  })
  context.globalAlpha = 1
  context.setTransform(1, 0, 0, 1, 0, 0)

  return exportCanvas.toDataURL('image/png')
}

function MapActionsToolbar({ map, city, lulcLayer, cadastralLayer, layoutLayer }) {
  const measurementSourceRef = useRef(null)
  const measurementOverlaysRef = useRef([])
  const drawInteractionRef = useRef(null)
  const [measurementMode, setMeasurementMode] = useState(null)
  const [measurement, setMeasurement] = useState('')
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!map) return undefined

    const source = new VectorSource()
    const layer = new VectorLayer({
      source,
      style: new Style({
        fill: new Fill({ color: 'rgba(30, 99, 152, 0.18)' }),
        stroke: new Stroke({ color: '#1e6398', width: 3, lineDash: [8, 5] }),
      }),
    })
    layer.setZIndex(2000)
    map.addLayer(layer)
    measurementSourceRef.current = source

    return () => {
      if (drawInteractionRef.current) {
        map.removeInteraction(drawInteractionRef.current)
        drawInteractionRef.current = null
      }
      measurementOverlaysRef.current.forEach((overlay) => map.removeOverlay(overlay))
      measurementOverlaysRef.current = []
      map.set('measurementMode', null)
      map.removeLayer(layer)
      measurementSourceRef.current = null
    }
  }, [map])

  useEffect(() => {
    if (!map || !measurementSourceRef.current) return undefined

    const previousDraw = drawInteractionRef.current
    if (previousDraw) {
      map.removeInteraction(previousDraw)
      drawInteractionRef.current = null
    }
    map.set('measurementMode', measurementMode)
    if (!measurementMode) return undefined

    const draw = new Draw({
      source: measurementSourceRef.current,
      type: measurementMode === 'area' ? 'Polygon' : 'LineString',
    })
    drawInteractionRef.current = draw

    const drawStartKey = draw.on('drawstart', (event) => {
      setMeasurement('Drawing…')
      const geometry = event.feature.getGeometry()
      const endpointElement = document.createElement('div')
      const endpointOverlay = new Overlay({
        element: endpointElement,
        positioning: 'bottom-left',
        offset: [10, -10],
        stopEvent: false,
      })
      endpointElement.className = 'map-measurement-label'
      endpointElement.textContent = measurementMode === 'area' ? '0 m² · 0 ha' : '0 m'
      map.addOverlay(endpointOverlay)
      measurementOverlaysRef.current.push(endpointOverlay)

      const geometryKey = geometry.on('change', (changeEvent) => {
        const changedGeometry = changeEvent.target
        const value = formatMeasurement(changedGeometry, measurementMode)
        setMeasurement(value)
        endpointOverlay.setPosition(changedGeometry.getLastCoordinate())
        endpointElement.textContent = value
      })
      draw.once('drawend', (endEvent) => {
        unByKey(geometryKey)
        const finishedGeometry = endEvent.feature.getGeometry()
        let finalCoordinate = finishedGeometry.getLastCoordinate()
        if (measurementMode === 'area') {
          const ring = finishedGeometry.getCoordinates()[0]
          finalCoordinate = ring[ring.length - 2] ?? finalCoordinate
        }
        endpointOverlay.setPosition(finalCoordinate)
        endpointElement.textContent = formatMeasurement(finishedGeometry, measurementMode)
      })
    })
    map.addInteraction(draw)

    return () => {
      unByKey(drawStartKey)
      map.removeInteraction(draw)
      map.set('measurementMode', null)
      if (drawInteractionRef.current === draw) drawInteractionRef.current = null
    }
  }, [map, measurementMode])

  function startMeasurement(mode) {
    setExportError('')
    setMeasurementMode((current) => (current === mode ? null : mode))
    setMeasurement('')
  }

  function clearMeasurements() {
    measurementSourceRef.current?.clear()
    measurementOverlaysRef.current.forEach((overlay) => map?.removeOverlay(overlay))
    measurementOverlaysRef.current = []
    setMeasurement('')
    setMeasurementMode(null)
  }

  async function handleExport(format) {
    if (!map || !lulcLayer) return
    setExportError('')
    setExporting(true)
    const controller = new AbortController()

    try {
      const features = await fetchLulcFeatures(lulcLayer, controller.signal)
      const cityName = cityNames[city]
      const filename = `land-use-${city}-${new Date().toISOString().slice(0, 10)}`

      if (format === 'csv') {
        const rows = [
          ['City', 'Category', 'Area (ha)'],
          ...features.map(({ category, area }) => [cityName, category, area]),
        ]
        const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`
        downloadFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`)
        return
      }

      const mapImage = await createMapImage(map)
      if (format === 'image') {
        const imageResponse = await fetch(mapImage)
        downloadFile(await imageResponse.blob(), `${filename}.png`)
        return
      }

      const categoryTotals = new Map()
      features.forEach(({ category, area }) => {
        categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + area)
      })
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      pdf.setFontSize(18)
      pdf.text('Land Acquisition Portal', 14, 16)
      pdf.setFontSize(11)
      pdf.text(`City: ${cityName}`, 14, 23)
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 29)
      const [mapWidth, mapHeight] = map.getSize()
      const imageRatio = mapWidth / mapHeight
      const boxWidth = 269
      const boxHeight = 155
      const imageWidth = Math.min(boxWidth, boxHeight * imageRatio)
      const imageHeight = imageWidth / imageRatio
      pdf.addImage(
        mapImage,
        'PNG',
        14 + (boxWidth - imageWidth) / 2,
        35 + (boxHeight - imageHeight) / 2,
        imageWidth,
        imageHeight,
        undefined,
        'FAST',
      )

      pdf.addPage()
      pdf.setFontSize(16)
      pdf.text(`${cityName} - LULC summary`, 14, 18)
      pdf.setFontSize(10)
      pdf.text('Category', 14, 28)
      pdf.text('Area (ha)', 190, 28)
      let y = 36
      for (const [category, area] of [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])) {
        if (y > 190) {
          pdf.addPage()
          y = 18
        }
        pdf.text(category.slice(0, 85), 14, y)
        pdf.text(area.toLocaleString(undefined, { maximumFractionDigits: 2 }), 190, y)
        y += 7
      }
      pdf.save(`${filename}.pdf`)
    } catch (error) {
      setExportError(
        error instanceof Error
          ? `Export failed: ${error.message}`
          : 'Unable to export map data.',
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="map-actions">
      <div className="map-actions__group" role="group" aria-label="Map measurements">
        <span className="map-actions__label"><b>Measure</b></span>
        <button
          className="map-actions__button"
          type="button"
          aria-pressed={measurementMode === 'length'}
          disabled={!map}
          onClick={() => startMeasurement('length')}
        >
          Distance
        </button>
        <button
          className="map-actions__button"
          type="button"
          aria-pressed={measurementMode === 'area'}
          disabled={!map}
          onClick={() => startMeasurement('area')}
        >
          Area
        </button>
        <button
          className="map-actions__button map-actions__button--quiet"
          type="button"
          disabled={!measurement}
          onClick={clearMeasurements}
        >
          Clear
        </button>
      </div>
      <div className="map-actions__group" role="group" aria-label="Export map data">
        <span className="map-actions__label"><b>Export</b></span>
        <button
          className="map-actions__button"
          type="button"
          disabled={!map || !lulcLayer || exporting}
          onClick={() => handleExport('pdf')}
        >
          PDF
        </button>
        <button
          className="map-actions__button"
          type="button"
          disabled={!map || !lulcLayer || exporting}
          onClick={() => handleExport('csv')}
        >
          CSV
        </button>
        <button
          className="map-actions__button"
          type="button"
          disabled={!map || !lulcLayer || exporting}
          onClick={() => handleExport('image')}
        >
          Map image
        </button>
      </div>
      <CadastralSearch
        key={city}
        map={map}
        city={city}
        layer={cadastralLayer}
      />
      {layoutLayer && <LayoutSearch key={layoutLayer} map={map} layer={layoutLayer} />}
      {(measurement || exporting || exportError) && (
        <span className={exportError ? 'map-actions__status map-actions__status--error' : 'map-actions__status'} role="status">
          {exportError || (exporting ? 'Preparing export…' : measurement)}
        </span>
      )}
    </div>
  )
}

export default MapActionsToolbar
