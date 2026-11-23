import {
  checkDatabaseConnection,
  findLayoutFeatures,
  getLayoutChartData,
  getDistinctLayoutValues,
  layoutColumns,
} from '../repositories/layout.repository.js'

export { checkDatabaseConnection, getLayoutChartData }

export function getLayoutSchemes() {
  return getDistinctLayoutValues(layoutColumns.scheme)
}

export function getLayoutSectors(scheme) {
  return getDistinctLayoutValues(layoutColumns.sector, [scheme])
}

export function getLayoutPlots(scheme, sector) {
  return getDistinctLayoutValues(layoutColumns.plot, [scheme, sector])
}

export async function searchLayout(scheme, sector, plot) {
  const rows = await findLayoutFeatures(scheme, sector, plot)
  return {
    type: 'FeatureCollection',
    features: rows.map((row) => ({
      type: 'Feature',
      geometry: row.geometry ? JSON.parse(row.geometry) : null,
      properties: {
        scheme: row.scheme,
        sector: row.sector,
        plot_no_: row.plot,
      },
    })),
  }
}
