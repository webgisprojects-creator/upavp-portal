import { useEffect, useRef, useState } from 'react'
import GeoJSON from 'ol/format/GeoJSON.js'
import VectorLayer from 'ol/layer/Vector.js'
import Fill from 'ol/style/Fill.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import VectorSource from 'ol/source/Vector.js'
import '../style/CadastralSearch.css'

const geoserverWmsUrl =
  import.meta.env.VITE_GEOSERVER_WMS_URL?.trim() || '/geoserver/wms'
const geoserverWfsUrl = geoserverWmsUrl.replace(/\/wms(?=\?|$)/i, '/wfs')

function quoteCqlValue(value) {
  return value.replaceAll("'", "''")
}

async function fetchFeatures(params, signal) {
  const response = await fetch(`${geoserverWfsUrl}?${params}`, { signal })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`GeoServer returned HTTP ${response.status}.`)
  }
  if (!response.headers.get('content-type')?.includes('json')) {
    const document = new DOMParser().parseFromString(text, 'text/xml')
    const message =
      document.querySelector('ServiceException, ExceptionText')?.textContent?.trim()
    throw new Error(message || 'GeoServer returned an invalid cadastral response.')
  }

  const data = JSON.parse(text)
  if (!Array.isArray(data.features)) {
    throw new Error('GeoServer did not return cadastral features.')
  }
  return data.features
}

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

function CadastralSearch({ map, city, layer }) {
  const highlightSourceRef = useRef(null)
  const requestRef = useRef(null)
  const [villageInput, setVillageInput] = useState('')
  const [selectedVillage, setSelectedVillage] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [villageListOpen, setVillageListOpen] = useState(false)
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
    const query = villageInput.trim()
    if (!layer || query.length < 2 || query === selectedVillage) {
      return undefined
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      try {
        const params = createSearchParams(layer, {
          propertyName: 'vill_name',
          CQL_FILTER: `vill_name ILIKE '${quoteCqlValue(query)}%'`,
          maxFeatures: '10000',
        })
        const features = await fetchFeatures(params, controller.signal)
        const villages = [
          ...new Set(
            features
              .map(({ properties }) => String(properties?.vill_name ?? '').trim())
              .filter(Boolean),
          ),
        ].sort((a, b) => a.localeCompare(b))
        setSuggestions(villages)
        setVillageListOpen(true)
      } catch (error) {
        if (controller.signal.aborted) return
        setSuggestions([])
        setStatus({
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to search village names.',
        })
      }
    }, 250)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [city, layer, selectedVillage, villageInput])

  useEffect(() => {
    if (!layer || !selectedVillage) return undefined

    const controller = new AbortController()
    async function loadGataNumbers() {
      try {
        const params = createSearchParams(layer, {
          propertyName: 'gata_no',
          CQL_FILTER: `vill_name='${quoteCqlValue(selectedVillage)}'`,
          maxFeatures: '100000',
        })
        const features = await fetchFeatures(params, controller.signal)
        const numbers = [
          ...new Set(
            features
              .map(({ properties }) => String(properties?.gata_no ?? '').trim())
              .filter(Boolean),
          ),
        ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
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

  function handleVillageInput(value) {
    setVillageInput(value)
    setSelectedVillage('')
    setSuggestions([])
    setGataNumbers([])
    setSelectedGata('')
    setStatus({ loading: false, error: '' })
    setVillageListOpen(true)
  }

  function selectVillage(village) {
    setVillageInput(village)
    setSelectedVillage(village)
    setSuggestions([])
    setVillageListOpen(false)
    setStatus({ loading: true, error: '' })
  }

  async function handleSearch(event) {
    event.preventDefault()
    if (!map || !layer || !selectedVillage || !selectedGata) return

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setStatus({ loading: true, error: '' })

    try {
      const params = createSearchParams(layer, {
        propertyName: 'vill_name,gata_no,geom',
        CQL_FILTER:
          `vill_name='${quoteCqlValue(selectedVillage)}' AND ` +
          `gata_no='${quoteCqlValue(selectedGata)}'`,
        maxFeatures: '100',
      })
      const features = await fetchFeatures(params, controller.signal)
      const projection = map.getView().getProjection()
      const parcels = new GeoJSON().readFeatures(
        { type: 'FeatureCollection', features },
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
        <label htmlFor={`village-search-${city}`}>Village</label>
        <input
          id={`village-search-${city}`}
          type="text"
          value={villageInput}
          autoComplete="off"
          placeholder="Type village name"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={villageListOpen && suggestions.length > 0}
          aria-controls={`village-options-${city}`}
          onFocus={() => setVillageListOpen(true)}
          onBlur={() => window.setTimeout(() => setVillageListOpen(false), 120)}
          onChange={(event) => handleVillageInput(event.target.value)}
        />
        {villageListOpen && suggestions.length > 0 && (
          <ul className="cadastral-search__suggestions" id={`village-options-${city}`} role="listbox">
            {suggestions.map((village) => (
              <li key={village} role="option" aria-selected={village === selectedVillage}>
                <button type="button" onClick={() => selectVillage(village)}>
                  {village}
                </button>
              </li>
            ))}
          </ul>
        )}
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
