import { fetchCadastralFeatures } from '../repositories/cadastral.repository.js'
import { createError } from '../utils/error.js'
import { quoteCqlValue, sortedUniquePropertyValues } from '../utils/cadastral.js'

const cadastralLayerPattern =
  /^(?:Landuse_LULC:cadastral_[A-Za-z0-9_]+|Planning:vrindavan_cadastral)$/

function cadastralProperties(layer) {
  return layer.startsWith('Planning:')
    ? { village: 'vill_name', gata: ['gata_no', 'gata_no_', 'gata_no_as'] }
    : { village: 'vill_name', gata: ['gata_no'] }
}

export async function getVillageSuggestions(layer, query) {
  validateCadastralLayer(layer)
  const { village } = cadastralProperties(layer)
  const features = await fetchCadastralFeatures(layer, {
    propertyName: village,
    ...(query ? { CQL_FILTER: `${village} ILIKE '${quoteCqlValue(query)}%'` } : {}),
    maxFeatures: query ? '10000' : '100000',
  })
  return sortedUniquePropertyValues(features, village)
}

export async function getGataNumbers(layer, village) {
  validateCadastralLayer(layer)
  const properties = cadastralProperties(layer)
  const features = await fetchCadastralFeatures(layer, {
    propertyName: properties.gata.join(','),
    CQL_FILTER: `strTrim(${properties.village})='${quoteCqlValue(village)}'`,
    maxFeatures: '100000',
  })
  return sortedUniquePropertyValues(features, properties.gata)
}

export async function searchCadastralFeatures(layer, village, gata) {
  validateCadastralLayer(layer)
  const properties = cadastralProperties(layer)
  return fetchCadastralFeatures(layer, {
    propertyName: `${properties.village},${properties.gata.join(',')},geom`,
    CQL_FILTER:
      `strTrim(${properties.village})='${quoteCqlValue(village)}' AND (` +
      `${properties.gata.map((property) => `${property}='${quoteCqlValue(gata)}'`).join(' OR ')})`,
    maxFeatures: '100',
  })
}

function validateCadastralLayer(layer) {
  if (!cadastralLayerPattern.test(layer)) {
    throw createError('Unsupported cadastral layer.', 400)
  }
}
