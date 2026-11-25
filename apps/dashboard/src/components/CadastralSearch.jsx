import { useEffect, useRef, useState } from 'react'
import GeoJSON from 'ol/format/GeoJSON.js'
import VectorLayer from 'ol/layer/Vector.js'
import Fill from 'ol/style/Fill.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import VectorSource from 'ol/source/Vector.js'
import '../style/CadastralSearch.css'

const apiBaseUrl = import.meta.env.VITE_API_URL?.trim() || '/api'

async function fetchApi(path, parameters, signal) {
  const params = new URLSearchParams(parameters)
  const response = await fetch(`${apiBaseUrl}${path}?${params}`, { signal })
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Backend returned an invalid cadastral response.')
  }

  if (!response.ok) {
    throw new Error(data.error || `Backend returned HTTP ${response.status}.`)
  }
  return data
}

function CadastralSearch({ map, city, layer }) {
  const highlightSourceRef = useRef(null)
  const requestRef = useRef(null)
  const [selectedVillage, setSelectedVillage] = useState('')
  const [villages, setVillages] = useState([])
  const [villagesLoading, setVillagesLoading] = useState(false)
  const [gataNumbers, setGataNumbers] = useState([])
  const [selectedGata, setSelectedGata] = useState('')
  const [status, setStatus] = useState({ loading: false, error: '' })

  useEffect(() => {
    if (!map) return undefined

    const source = new VectorSource()
    const layerOverlay = new VectorLayer({
      source,
      style: new Style({
        fill: new Fill({ color: 'rgba(255, 193, 7, 0.38)' }),
        stroke: new Stroke({ color: '#ff8f00', width: 4 }),
      }),
    })
    layerOverlay.setZIndex(1500)
    map.addLayer(layerOverlay)
    highlightSourceRef.current = source

    return () => {
      requestRef.current?.abort()
      map.removeLayer(layerOverlay)
      highlightSourceRef.current = null
    }
  }, [map])

  useEffect(() => {
    if (!layer) return undefined
    const controller = new AbortController()
    async function loadVillages() {
      setVillagesLoading(true)
      try {
        const data = await fetchApi(
          '/cadastral/villages',
          { layer },
          controller.signal,
        )
        if (!Array.isArray(data.items)) {
          throw new Error('Backend did not return village names.')
        }
        const names = [...new Set(data.items.map((village) => String(village).trim()).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
        setVillages(names)
      } catch (error) {
        if (controller.signal.aborted) return
        setStatus({
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to load village names.',
        })
      } finally {
        if (!controller.signal.aborted) setVillagesLoading(false)
      }
    }
    loadVillages()
    return () => controller.abort()
  }, [layer])

  useEffect(() => {
    if (!layer || !selectedVillage) return undefined

    const controller = new AbortController()
    async function loadGataNumbers() {
      try {
        const data = await fetchApi(
          '/cadastral/gata-numbers',
          { layer, village: selectedVillage },
          controller.signal,
        )
        if (!Array.isArray(data.items)) {
          throw new Error('Backend did not return plot numbers.')
        }
        const numbers = [...new Set(data.items.map((gata) => String(gata).trim()).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        setGataNumbers(numbers)
        setSelectedGata('')
        setStatus({
          loading: false,
          error: numbers.length ? '' : 'No plot numbers found for this village.',
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setGataNumbers([])
        setStatus({
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to load plot numbers.',
        })
      }
    }

    loadGataNumbers()
    return () => controller.abort()
  }, [layer, selectedVillage])

  async function handleSearch(event) {
    event.preventDefault()
    if (!map || !layer || !selectedVillage || !selectedGata) return

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setStatus({ loading: true, error: '' })

    try {
      const data = await fetchApi(
        '/cadastral/search',
        { layer, village: selectedVillage, gata: selectedGata },
        controller.signal,
      )
      if (!Array.isArray(data.features)) {
        throw new Error('Backend did not return matching cadastral features.')
      }
      const projection = map.getView().getProjection()
      const parcels = new GeoJSON().readFeatures(
        data,
        { dataProjection: 'EPSG:4326', featureProjection: projection },
      )
      if (controller.signal.aborted) return
      if (!parcels.length) {
        highlightSourceRef.current?.clear()
        setStatus({ loading: false, error: 'No matching parcel was found.' })
        return
      }

      const source = highlightSourceRef.current
      source?.clear()
      source?.addFeatures(parcels)
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
        message: `Loaded ${parcels.length} matching parcel${parcels.length === 1 ? '' : 's'}.`,
      })
    } catch (error) {
      if (controller.signal.aborted) return
      setStatus({
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to load the selected parcel.',
      })
    }
  }

  return (
    <form className="cadastral-search" onSubmit={handleSearch}>
      <div className="cadastral-search__field cadastral-search__village">
        <label htmlFor={`village-select-${city}`}>Village</label>
        <select
          id={`village-select-${city}`}
          value={selectedVillage}
          disabled={!layer || villagesLoading || villages.length === 0}
          onChange={(event) => {
            setSelectedVillage(event.target.value)
            setGataNumbers([])
            setSelectedGata('')
            setStatus({ loading: Boolean(event.target.value), error: '' })
          }}
        >
          <option value="">
            {villagesLoading ? 'Loading villages…' : 'Select village'}
          </option>
          {villages.map((village) => (
            <option key={village} value={village}>{village}</option>
          ))}
        </select>
      </div>
      <div className="cadastral-search__field cadastral-search__gata">
        <label htmlFor={`gata-select-${city}`}>Gata No.</label>
        <select
          id={`gata-select-${city}`}
          value={selectedGata}
          disabled={!selectedVillage || status.loading || gataNumbers.length === 0}
          onChange={(event) => setSelectedGata(event.target.value)}
        >
          <option value="">
            {status.loading && selectedVillage ? 'Loading…' : 'Select Gata No.'}
          </option>
          {gataNumbers.map((gata) => (
            <option key={gata} value={gata}>{gata}</option>
          ))}
        </select>
      </div>
      <button
        className="cadastral-search__submit"
        type="submit"
        disabled={!map || !selectedVillage || !selectedGata || status.loading}
      >
         Search
      </button>
      {status.error && <span className="cadastral-search__status cadastral-search__status--error" role="alert">{status.error}</span>}
      {status.message && <span className="cadastral-search__status" role="status">{status.message}</span>}
    </form>
  )
}

export default CadastralSearch
