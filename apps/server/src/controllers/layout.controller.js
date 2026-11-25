import {
  checkDatabaseConnection,
  getLayoutChartData,
  getLayoutPlots,
  getLayoutSchemes,
  getLayoutSectors,
  searchLayout,
} from '../services/layout.service.js'
import { requiredQuery } from '../utils/request.js'

export async function health(_req, res) {
  await checkDatabaseConnection()
  res.json({ status: 'ok', database: 'connected' })
}

export async function schemes(_req, res) {
  res.json({ items: await getLayoutSchemes() })
}

export async function sectors(req, res) {
  const scheme = requiredQuery(req, 'scheme')
  res.json({ items: await getLayoutSectors(scheme) })
}

export async function plots(req, res) {
  const scheme = requiredQuery(req, 'scheme')
  const sector = requiredQuery(req, 'sector')
  res.json({ items: await getLayoutPlots(scheme, sector) })
}

export async function search(req, res) {
  const scheme = requiredQuery(req, 'scheme')
  const sector = requiredQuery(req, 'sector')
  const plot = requiredQuery(req, 'plot')
  res.json(await searchLayout(scheme, sector, plot))
}
export async function chartData(_req, res) {
  res.json({ items: await getLayoutChartData() })
}
