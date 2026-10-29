// Loads the scheme and sector catalogue of a layout layer (what the panel lists as sub-checkboxes and the sector drop-down).
// One WFS request for two short columns (no geometry), kept for the session: the layer has ~19,800 plots.
import { LAYOUT_FIELDS } from '../config/layoutFields.js'
import { buildCatalog } from './vrindavan.js'

const wmsUrl = import.meta.env.VITE_GEOSERVER_WMS_URL?.trim() || '/geoserver/wms'
const wfsUrl = wmsUrl.replace(/\/wms(?=\?|$)/i, '/wfs')

const cache = new Map()

export async function loadLayoutCatalog(layer, signal) {
  if (cache.has(layer)) return cache.get(layer)
  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.1.0',
    request: 'GetFeature',
    typeName: layer,
    outputFormat: 'application/json',
    propertyName: `${LAYOUT_FIELDS.scheme},${LAYOUT_FIELDS.sector}`,
    maxFeatures: '100000',
  })
  const response = await fetch(`${wfsUrl}?${params}`, { signal })
  if (!response.ok) throw new Error(`GeoServer returned HTTP ${response.status}.`)
  const data = JSON.parse(await response.text())
  if (!Array.isArray(data.features)) throw new Error('GeoServer did not return the layout plots.')
  const catalog = buildCatalog(
    data.features.map(({ properties }) => ({
      scheme: properties?.[LAYOUT_FIELDS.scheme],
      sector: properties?.[LAYOUT_FIELDS.sector],
    })),
  )
  cache.set(layer, catalog)
  return catalog
}
