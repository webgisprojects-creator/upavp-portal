import { createError } from '../utils/error.js'

const geoserverWfsUrl =
  process.env.GEOSERVER_WFS_URL || 'http://127.0.0.1:8081/geoserver/wfs'

export async function fetchCadastralFeatures(layer, extra = {}) {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.1.0',
    request: 'GetFeature',
    typeName: layer,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    ...extra,
  })

  let response
  try {
    response = await fetch(`${geoserverWfsUrl}?${params}`)
  } catch {
    throw createError(
      'Unable to connect to GeoServer. Check GEOSERVER_WFS_URL and network access.',
      502,
    )
  }

  const body = await response.text()
  if (!response.ok) {
    throw createError(`GeoServer returned HTTP ${response.status}.`, 502)
  }

  let data
  try {
    data = JSON.parse(body)
  } catch {
    const message = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    throw createError(message || 'GeoServer returned an invalid cadastral response.', 502)
  }

  if (!Array.isArray(data.features)) {
    throw createError('GeoServer did not return cadastral features.', 502)
  }

  return data.features
}
