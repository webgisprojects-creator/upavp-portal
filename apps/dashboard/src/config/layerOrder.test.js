import { describe, expect, it } from 'vitest'
import { BASEMAP_Z_INDEX, drawOrder, hasOpacitySlider, layerRole, topFirst } from './layerOrder.js'

// ids exactly as App.jsx defines them
const katra = ['katra-lulc', 'katra-cadastral', 'katra-scheme', 'katra-village']
const sikandra = ['sikandra-lulc', 'sikandra-cadastral', 'sikandra-railway', 'sikandra-scheme', 'sikandra-village']
const lucknow = [
  'vrindavan-village-boundary',
  'vrindavan-layout',
  'vrindavan-sector6-landuse',
  'vrindavan-village-cadastral',
  'vrindavan-sector-boundary',
  'dhara-28',
  'dhara-32',
  'vrindavan-scheme-boundary',
]

describe('layer drawing order', () => {
  it('maps every id used by the dashboard to a role', () => {
    for (const id of [...katra, ...sikandra, ...lucknow]) expect(layerRole(id)).not.toBe('other')
  })

  it('draws the scheme outline above the village boundary, above cadastral, above LULC', () => {
    expect(drawOrder('katra-scheme')).toBeGreaterThan(drawOrder('katra-village'))
    expect(drawOrder('katra-village')).toBeGreaterThan(drawOrder('katra-cadastral'))
    expect(drawOrder('katra-cadastral')).toBeGreaterThan(drawOrder('katra-lulc'))
  })

  it('keeps the railway between the filled areas and the parcel lines', () => {
    expect(drawOrder('sikandra-railway')).toBeGreaterThan(drawOrder('sikandra-lulc'))
    expect(drawOrder('sikandra-railway')).toBeLessThan(drawOrder('sikandra-cadastral'))
  })

  it('puts the Vrindavan scheme outline above the Vrindavan layout', () => {
    expect(drawOrder('vrindavan-scheme-boundary')).toBeGreaterThan(drawOrder('vrindavan-layout'))
  })

  it('orders the whole Vrindavan stack: village area < layout < sector 6 land use < cadastral < sector boundary < Dhara < scheme', () => {
    const order = [
      'vrindavan-village-boundary',
      'vrindavan-layout',
      'vrindavan-sector6-landuse',
      'vrindavan-village-cadastral',
      'vrindavan-sector-boundary',
      'dhara-28',
      'vrindavan-scheme-boundary',
    ]
    expect(topFirst(order.map((id) => ({ id }))).map(({ id }) => id)).toEqual([...order].reverse())
    expect(drawOrder('dhara-28')).toBe(drawOrder('dhara-32'))
  })

  it('draws the filled Lucknow village polygons UNDER the plots, but the other cities\' village lines on top', () => {
    expect(layerRole('vrindavan-village-boundary')).toBe('villagearea')
    expect(drawOrder('vrindavan-village-boundary')).toBeLessThan(drawOrder('vrindavan-layout'))
    expect(layerRole('katra-village')).toBe('village')
    expect(drawOrder('katra-village')).toBeGreaterThan(drawOrder('katra-cadastral'))
  })

  it('treats the sector 6 land use as a filled layer and the sector boundary as an outline', () => {
    expect(layerRole('vrindavan-sector6-landuse')).toBe('landuse')
    expect(layerRole('vrindavan-sector-boundary')).toBe('sector')
    expect(hasOpacitySlider('vrindavan-sector-boundary')).toBe(false)
  })

  it('offers a transparency slider only for the opaque filled layers', () => {
    expect(['katra-lulc', 'vrindavan-layout', 'vrindavan-sector6-landuse', 'vrindavan-village-boundary'].every(hasOpacitySlider)).toBe(true)
    expect(['katra-cadastral', 'katra-village', 'katra-scheme', 'dhara-28', 'dhara-32', 'vrindavan-village-cadastral'].some(hasOpacitySlider)).toBe(false)
  })

  it('keeps all data above the basemap imagery but below the hybrid labels and the highlights', () => {
    for (const id of [...katra, ...sikandra, ...lucknow]) {
      expect(drawOrder(id)).toBeGreaterThan(BASEMAP_Z_INDEX.imagery)
      expect(drawOrder(id)).toBeLessThan(BASEMAP_Z_INDEX.labels)
    }
    expect(BASEMAP_Z_INDEX.labels).toBeLessThan(900)
  })

  it('lists layers topmost first without changing the input', () => {
    const items = katra.map((id) => ({ id }))
    expect(topFirst(items).map(({ id }) => id)).toEqual(['katra-scheme', 'katra-village', 'katra-cadastral', 'katra-lulc'])
    expect(items.map(({ id }) => id)).toEqual(katra)
  })
})
