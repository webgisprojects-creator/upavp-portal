import { useEffect, useRef, useState } from 'react'
import GeoJSON from 'ol/format/GeoJSON.js'
import VectorLayer from 'ol/layer/Vector.js'
import Fill from 'ol/style/Fill.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import VectorSource from 'ol/source/Vector.js'
import '../style/CadastralSearch.css'

const apiBaseUrl = (import.meta.env.VITE_API_URL?.trim() || '/api').replace(/\/$/, '')

async function fetchLayout(path, parameters, signal) {
  const response = await fetch(`${apiBaseUrl}/layout/${path}?${new URLSearchParams(parameters)}`, { signal })
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error('Backend returned an invalid layout response. Check that the API server is running.')
  }
  if (!response.ok) throw new Error(data.error || `Backend returned HTTP ${response.status}.`)
  return data
}

function LayoutSearch({ map, layer }) {
  const highlightSourceRef = useRef(null)
  const requestRef = useRef(null)
  const [schemes, setSchemes] = useState([])
  const [selectedScheme, setSelectedScheme] = useState('')
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
    requestRef.current?.abort()
    highlightSourceRef.current?.clear()
  }, [layer, selectedScheme, selectedSector, selectedPlot])

  useEffect(() => {
    setSchemes([])
    setSelectedScheme('')
    setSectors([])
    setSelectedSector('')
    setPlots([])
    setSelectedPlot('')
    if (!layer) return undefined
    const controller = new AbortController()
    loadOptions('schemes', {}, setSchemes, 'No schemes found.', controller)
    return () => controller.abort()
  }, [layer])

  useEffect(() => {
    setSectors([])
    setSelectedSector('')
    setPlots([])
    setSelectedPlot('')
    if (!layer || !selectedScheme) return undefined
    const controller = new AbortController()
    loadOptions('sectors', { scheme: selectedScheme }, setSectors, 'No sectors found for this scheme.', controller)
    return () => controller.abort()
  }, [layer, selectedScheme])

  useEffect(() => {
    setPlots([])
    setSelectedPlot('')
    if (!layer || !selectedScheme || !selectedSector) return undefined
    const controller = new AbortController()
    loadOptions('plots', { scheme: selectedScheme, sector: selectedSector }, setPlots, 'No plots found for this sector.', controller)
    return () => controller.abort()
  }, [layer, selectedScheme, selectedSector])

  async function loadOptions(path, parameters, setItems, emptyMessage, controller) {
    setStatus({ loading: true, error: '', message: '' })
    try {
      const data = await fetchLayout(path, parameters, controller.signal)
      if (controller.signal.aborted) return
      if (!Array.isArray(data.items)) throw new Error('Backend did not return layout options.')
      setItems(data.items)
      setStatus({ loading: false, error: data.items.length ? '' : emptyMessage, message: '' })
    } catch (error) {
      if (controller.signal.aborted) return
      setStatus({ loading: false, error: error.message || 'Unable to load layout options.', message: '' })
    }
  }

  async function handleSearch(event) {
    event.preventDefault()
    if (!map || !layer || !selectedScheme || !selectedSector || !selectedPlot) return
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setStatus({ loading: true, error: '', message: '' })
    try {
      const data = await fetchLayout('search', {
        scheme: selectedScheme, sector: selectedSector, plot: selectedPlot,
      }, controller.signal)
      if (controller.signal.aborted) return
      if (!Array.isArray(data.features)) throw new Error('Backend did not return layout features.')
      const selectedFeatures = new GeoJSON().readFeatures(data, {
        dataProjection: 'EPSG:4326',
        featureProjection: map.getView().getProjection(),
      }).filter((feature) => feature.getGeometry())
      const source = highlightSourceRef.current
      source?.clear()
      if (!selectedFeatures.length) {
        setStatus({ loading: false, error: 'No matching layout plot with geometry was found.', message: '' })
        return
      }
      source?.addFeatures(selectedFeatures)
      const extent = source?.getExtent()
      if (extent && extent.every(Number.isFinite)) {
        map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 19, duration: 500 })
      }
      setStatus({ loading: false, error: '', message: `Located plot ${selectedPlot} in sector ${selectedSector}.` })
    } catch (error) {
      if (controller.signal.aborted) return
      setStatus({ loading: false, error: error.message || 'Unable to locate the selected plot.', message: '' })
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
