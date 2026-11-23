import { describe, expect, it } from 'vitest'
import { buildLayoutChartClasses } from './layoutChart.js'
const rows = [
  { scheme: 'A', sector: 'Sector-5', property_t: 'Residential', status: 'Alloted', area_ha: 1 },
  { scheme: 'A', sector: 'Sector-6', property_t: 'Commercial', status: 'Vacant', area_ha: 2 },
  { scheme: 'B', sector: 'Sector-5', property_t: 'Residential', status: 'Other', area_ha: 3 },
  { scheme: null, sector: null, property_t: null, status: null, area_ha: 4 },
]
describe('layout chart totals', () => {
  it('aggregates all schemes including missing names', () => {
    expect(buildLayoutChartClasses(rows, 'scheme').map(({ name, area }) => [name, area]))
      .toEqual([['Unspecified', 4], ['A', 3], ['B', 3]])
  })
  it('retains property type totals without geometry', () => {
    expect(buildLayoutChartClasses(rows, 'property_t').map(({ name, area }) => [name, area]))
      .toEqual([['Residential', 4], ['Null', 4], ['Commercial', 2]])
  })
  it('matches checked schemes and exact sector values', () => {
    expect(buildLayoutChartClasses(rows, 'property_t', {
      schemeValues: ['A'], sectorValues: ['Sector-6'], includeUnspecified: false,
    })).toEqual([{ name: 'Commercial', area: 2, subclasses: [] }])
  })
  it('handles unchecked schemes and unspecified selection', () => {
    expect(buildLayoutChartClasses(rows, 'scheme', { schemeValues: [], includeUnspecified: false })).toEqual([])
    expect(buildLayoutChartClasses(rows, 'scheme', { schemeValues: [], includeUnspecified: true }))
      .toEqual([{ name: 'Unspecified', area: 4, subclasses: [] }])
  })
  it('groups other status values together', () => {
    expect(buildLayoutChartClasses(rows, 'status').map(({ name, area }) => [name, area]))
      .toEqual([['Other or unspecified', 7], ['Vacant', 2], ['Alloted', 1]])
  })
  it('rejects invalid areas', () => {
    expect(() => buildLayoutChartClasses([{ area_ha: 'invalid' }], 'scheme')).toThrow(/invalid chart area/)
  })
})
