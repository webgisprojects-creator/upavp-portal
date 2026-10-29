import { useEffect, useRef, useState } from 'react'
import GeoJSON from 'ol/format/GeoJSON.js'
import VectorLayer from 'ol/layer/Vector.js'
import Fill from 'ol/style/Fill.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import VectorSource from 'ol/source/Vector.js'
import { LAYOUT_FIELDS, findSchemeField, findSectorField } from '../config/layoutFields.js'
import '../style/CadastralSearch.css'

const geoserverWmsUrl =
  import.meta.env.VITE_GEOSERVER_WMS_URL?.trim() || '/geoserver/wms'
const geoserverWfsUrl = geoserverWmsUrl.replace(/\/wms(?=\?|$)/i, '/wfs')

function createSearchParams(layer, extra = {}) {
  return new URLSearchParams({
    service: 'WFS',
    version: '1.1.0',
    request: 'GetFeature',
    typeName: layer,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    ...extra,
  })
}

async function fetchFeatures(params, signal) {
  const response = await fetch(`${geoserverWfsUrl}?${params}`, { signal })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`GeoServer returned HTTP ${response.status}.`)
  }
  if (!response.headers.get('content-type')?.includes('json')) {
    const document = new DOMParser().parseFromString(text, 'text/xml')
    const message = document
      .querySelector('ServiceException, ExceptionText')
      ?.textContent?.trim()
    throw new Error(message || 'GeoServer returned an invalid layout response.')
  }

  const data = JSON.parse(text)
  if (!Array.isArray(data.features)) {
    throw new Error('GeoServer did not return layout features.')
  }
  return data.features
}

function quoteCqlValue(value) {
  return value.replaceAll("'", "''")
}

function LayoutSearch({ map, layer }) {
  const highlightSourceRef = useRef(null)
  const requestRef = useRef(null)
  const [schemes, setSchemes] = useState([])
  const [selectedScheme, setSelectedScheme] = useState('')
  const [schemeProperty, setSchemeProperty] = useState('')
  const [sectorProperty, setSectorProperty] = useState('')
  const [sectors, setSectors] = useState([])
  const [selectedSector, setSelectedSector] = useState('')
  const [plots, setPlots] = useState([])
  const [selectedPlot, setSelectedPlot] = useState('')
  const [status, setStatus] = useState({ loading: false, error: '', message: '' })

  useEffect(() => {
    if (!map) return undefined

    const source = new VectorSource()
    const highlightLayer = new VectorLayer({
      source,
      style: new Style({
        fill: new Fill({ color: 'rgba(255, 193, 7, 0.3)' }),
        stroke: new Stroke({ color: '#ff6d00', width: 4 }),
      }),
    })
    highlightLayer.setZIndex(1600)
    map.addLayer(highlightLayer)
    highlightSourceRef.current = source

    return () => {
      requestRef.current?.abort()
      map.removeLayer(highlightLayer)
      highlightSourceRef.current = null
    }
  }, [map])

  useEffect(() => {
    highlightSourceRef.current?.clear()
    if (!layer) return undefined

    const controller = new AbortController()
    async function loadSchemes() {
      try {
        setStatus({ loading: true, error: '', message: '' })
        const schemaParams = new URLSearchParams({
          service: 'WFS',
          version: '1.1.0',
          request: 'DescribeFeatureType',
          typeName: layer,
        })
        const schemaResponse = await fetch(`${geoserverWfsUrl}?${schemaParams}`, {
          signal: controller.signal,
        })
        const schemaText = await schemaResponse.text()
        if (!schemaResponse.ok) {
          throw new Error(`GeoServer returned HTTP ${schemaResponse.status}.`)
        }
        const schemaDocument = new DOMParser().parseFromString(schemaText, 'text/xml')
        const schemaError = schemaDocument.querySelector('parsererror, ServiceException')
        if (schemaError) {
          throw new Error(
            schemaError.textContent?.trim() || 'GeoServer returned an invalid layout schema.',
          )
        }
        const schemaProperties = Array.from(schemaDocument.getElementsByTagName('*'))
          .filter((element) => element.localName === 'element')
          .map((element) => element.getAttribute('name'))
          .filter(Boolean)
        const resolvedSectorProperty = findSectorField(schemaProperties)
        if (!resolvedSectorProperty) {
          throw new Error('The layout layer has no sector field in its published schema.')
        }
        const resolvedSchemeProperty = findSchemeField(schemaProperties)
        if (!resolvedSchemeProperty) {
          throw new Error('The layout layer has no scheme name field in its published schema.')
        }
        const params = createSearchParams(layer, {
          propertyName: resolvedSchemeProperty,
          maxFeatures: '100000',
        })
        const features = await fetchFeatures(params, controller.signal)
        const schemeNames = [
          ...new Set(
            features
              .map(({ properties }) => String(properties?.[resolvedSchemeProperty] ?? '').trim())
              .filter(Boolean),
          ),
        ].sort((a, b) => a.localeCompare(b))
        setSchemeProperty(resolvedSchemeProperty)
        setSectorProperty(resolvedSectorProperty)
        setSchemes(schemeNames)
        setStatus({
          loading: false,
          error: schemeNames.length ? '' : 'No scheme names found in the layout layer.',
          message: '',
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setStatus({
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to load scheme names.',
          message: '',
        })
      }
    }

    loadSchemes()
    return () => controller.abort()
  }, [layer])

  useEffect(() => {
    setSectors([])
    setSelectedSector('')
    setPlots([])
    setSelectedPlot('')
    highlightSourceRef.current?.clear()
    if (!layer || !selectedScheme || !sectorProperty || !schemeProperty) return undefined

    const controller = new AbortController()
    async function loadSectors() {
      try {
        setStatus({ loading: true, error: '', message: '' })
        const params = createSearchParams(layer, {
          propertyName: sectorProperty,
          CQL_FILTER: `${schemeProperty}='${quoteCqlValue(selectedScheme)}'`,
          maxFeatures: '100000',
        })
        const features = await fetchFeatures(params, controller.signal)
        const sectorNames = [
          ...new Set(
            features
              .map(({ properties }) =>
                String(properties?.[sectorProperty] ?? '').trim(),
              )
              .filter(Boolean),
          ),
        ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        setSectors(sectorNames)
        setStatus({
          loading: false,
          error: sectorNames.length ? '' : 'No sectors found for this scheme.',
          message: '',
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setStatus({
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to load sectors.',
          message: '',
        })
      }
    }

    loadSectors()
    return () => controller.abort()
  }, [layer, schemeProperty, sectorProperty, selectedScheme])

  useEffect(() => {
    setPlots([])
    setSelectedPlot('')
    highlightSourceRef.current?.clear()
    if (!layer || !selectedScheme || !selectedSector || !sectorProperty || !schemeProperty) return undefined

    const controller = new AbortController()
    async function loadPlots() {
      try {
        setStatus({ loading: true, error: '', message: '' })
        const params = createSearchParams(layer, {
          propertyName: LAYOUT_FIELDS.plotNumber,
          CQL_FILTER:
            `${schemeProperty}='${quoteCqlValue(selectedScheme)}' AND ` +
            `${sectorProperty}='${quoteCqlValue(selectedSector)}'`,
          maxFeatures: '100000',
        })
        const features = await fetchFeatures(params, controller.signal)
        const plotNumbers = [
          ...new Set(
            features
              .map(({ properties }) => String(properties?.[LAYOUT_FIELDS.plotNumber] ?? '').trim())
              .filter(Boolean),
          ),
        ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        setPlots(plotNumbers)
        setStatus({
          loading: false,
          error: plotNumbers.length ? '' : 'No plot numbers found for this sector.',
          message: '',
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setStatus({
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to load plot numbers.',
          message: '',
        })
      }
    }

    loadPlots()
    return () => controller.abort()
  }, [layer, schemeProperty, sectorProperty, selectedScheme, selectedSector])

  async function handleSearch(event) {
    event.preventDefault()
    if (!map || !layer || !selectedScheme || !selectedSector || !selectedPlot) return

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setStatus({ loading: true, error: '', message: '' })

    try {
      const params = createSearchParams(layer, {
        propertyName: `${schemeProperty},${sectorProperty},${LAYOUT_FIELDS.plotNumber},geom`,
        CQL_FILTER:
          `${schemeProperty}='${quoteCqlValue(selectedScheme)}' AND ` +
          `${sectorProperty}='${quoteCqlValue(selectedSector)}' AND ` +
          `${LAYOUT_FIELDS.plotNumber}='${quoteCqlValue(selectedPlot)}'`,
        maxFeatures: '100',
      })
      const features = await fetchFeatures(params, controller.signal)
      const projection = map.getView().getProjection()
      const selectedFeatures = new GeoJSON().readFeatures(
        { type: 'FeatureCollection', features },
        { dataProjection: 'EPSG:4326', featureProjection: projection },
      )
      if (controller.signal.aborted) return

      const source = highlightSourceRef.current
      source?.clear()
      if (!selectedFeatures.length) {
        setStatus({ loading: false, error: 'No matching layout plot was found.', message: '' })
        return
      }

      source?.addFeatures(selectedFeatures)
      const extent = source?.getExtent()
      if (extent) {
        map.getView().fit(extent, {
          padding: [80, 80, 80, 80],
          maxZoom: 19,
          duration: 500,
        })
      }
      setStatus({
        loading: false,
        error: '',
        message: `Located plot ${selectedPlot} in sector ${selectedSector}.`,
      })
    } catch (error) {
      if (controller.signal.aborted) return
      setStatus({
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to locate the selected plot.',
        message: '',
      })
    }
  }

  return (
    <form className="cadastral-search" onSubmit={handleSearch}>
      <div className="cadastral-search__field">
        <label htmlFor="layout-scheme-select">Scheme Name</label>
        <select
          id="layout-scheme-select"
          value={selectedScheme}
          disabled={!layer || status.loading || !schemes.length}
          onChange={(event) => {
            setSelectedScheme(event.target.value)
            setSelectedSector('')
            setSectors([])
            setPlots([])
            setSelectedPlot('')
            setStatus({ loading: false, error: '', message: '' })
          }}
        >
          <option value="">{status.loading && !schemes.length ? 'Loading…' : 'Select scheme'}</option>
          {schemes.map((scheme) => (
            <option key={scheme} value={scheme}>{scheme}</option>
          ))}
        </select>
      </div>
      <div className="cadastral-search__field cadastral-search__gata">
        <label htmlFor="layout-sector-select">Sector</label>
        <select
          id="layout-sector-select"
          value={selectedSector}
          disabled={!selectedScheme || status.loading || !sectors.length}
          onChange={(event) => {
            setSelectedSector(event.target.value)
            setPlots([])
            setSelectedPlot('')
          }}
        >
          <option value="">
            {status.loading && selectedScheme && !sectors.length ? 'Loading…' : 'Select sector'}
          </option>
          {sectors.map((sector) => (
            <option key={sector} value={sector}>{sector}</option>
          ))}
        </select>
      </div>
      <div className="cadastral-search__field cadastral-search__gata">
        <label htmlFor="layout-plot-select">Plot No.</label>
        <select
          id="layout-plot-select"
          value={selectedPlot}
          disabled={!selectedSector || status.loading || !plots.length}
          onChange={(event) => setSelectedPlot(event.target.value)}
        >
          <option value="">
            {status.loading && selectedSector && !plots.length ? 'Loading…' : 'Select plot'}
          </option>
          {plots.map((plot) => (
            <option key={plot} value={plot}>{plot}</option>
          ))}
        </select>
      </div>
      <button
        className="cadastral-search__submit"
        type="submit"
        disabled={!map || !selectedScheme || !selectedSector || !selectedPlot || status.loading}
      >
        Search
      </button>
      {status.error && (
        <span className="cadastral-search__status cadastral-search__status--error" role="alert">
          {status.error}
        </span>
      )}
      {status.message && (
        <span className="cadastral-search__status" role="status">{status.message}</span>
      )}
    </form>
  )
}

export default LayoutSearch
