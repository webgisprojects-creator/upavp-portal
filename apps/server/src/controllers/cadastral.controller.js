import {
  getGataNumbers,
  getVillageSuggestions,
  searchCadastralFeatures,
} from '../services/cadastral.service.js'
import { requiredQuery } from '../utils/request.js'

export async function villages(req, res) {
  const layer = requiredQuery(req, 'layer')
  const query = req.query.q === undefined ? '' : requiredQuery(req, 'q')
  res.json({ items: await getVillageSuggestions(layer, query) })
}

export async function gataNumbers(req, res) {
  const layer = requiredQuery(req, 'layer')
  const village = requiredQuery(req, 'village')
  res.json({ items: await getGataNumbers(layer, village) })
}

export async function search(req, res) {
  const layer = requiredQuery(req, 'layer')
  const village = requiredQuery(req, 'village')
  const gata = requiredQuery(req, 'gata')
  res.json({
    type: 'FeatureCollection',
    features: await searchCadastralFeatures(layer, village, gata),
  })
}
