import { describe, expect, it } from 'vitest'
import {
  buildCatalog, layoutFilter, schemeBoundaryFilter, schemeFilter, schemeKey, sectorBoundaryFilter, sectorFilter, sectorNumber,
} from './vrindavan.js'

// The exact scheme / sector spellings found in lucknow.vrindavan_layout (counts as of 2026-10-29)
const rows = [
  ...Array(5438).fill({ scheme: '', sector: 'Sector 1' }),
  ...Array(4262).fill({ scheme: 'VRINDAVAN YOJANA NO.-2, PART- II', sector: 'Sector-10' }),
  ...Array(3781).fill({ scheme: 'VRINDAVAN YOJANA NO.-1', sector: 'Sector 8' }),
  ...Array(2631).fill({ scheme: 'Vrindavan Yojna No.-4', sector: 'Sector-9' }),
  ...Array(1996).fill({ scheme: 'Vrindavan Yojna No.- 3', sector: 'Sector-11' }),
  ...Array(1427).fill({ scheme: 'Vrindavan Yojana No.-2, Part-I', sector: 'Sector 1' }),
  ...Array(232).fill({ scheme: 'Vrindavan Yojna No.-4 Sector-20', sector: 'Sector 20' }),
  ...Array(7).fill({ scheme: 'Vrindavan Yojana No.-2', sector: 'Sector-10' }),
]
const catalog = buildCatalog(rows)
const allKeys = catalog.schemes.map(({ key }) => key)

describe('scheme names', () => {
  it('maps every spelling in the data to one canonical scheme', () => {
    expect(schemeKey('VRINDAVAN YOJANA NO.-1')).toBe('1')
    expect(schemeKey('Vrindavan Yojana No.-2, Part-I')).toBe('2-1')
    expect(schemeKey('VRINDAVAN YOJANA NO.-2, PART- II')).toBe('2-2')
    expect(schemeKey('Vrindavan Yojana No.-2')).toBe('2')
    expect(schemeKey('Vrindavan Yojna No.- 3')).toBe('3')
    expect(schemeKey('Vrindavan Yojna No.-4')).toBe('4')
    expect(schemeKey('Vrindavan Yojna No.-4 Sector-20')).toBe('4')
  })

  it('treats blanks as unspecified and unknown names as other', () => {
    expect(schemeKey('')).toBe('unspecified')
    expect(schemeKey(null)).toBe('unspecified')
    expect(schemeKey('   ')).toBe('unspecified')
    expect(schemeKey('Some other scheme')).toBe('other')
    expect(schemeKey('Vrindavan Yojana No.-9')).toBe('other')
  })
})

describe('sectors', () => {
  it('reads the number whatever the punctuation', () => {
    expect([sectorNumber('Sector-10'), sectorNumber('Sector 8'), sectorNumber('sector 6 '), sectorNumber('Sector-9')]).toEqual([10, 8, 6, 9])
    expect(sectorNumber('')).toBeNull()
    expect(sectorNumber(null)).toBeNull()
  })
})

describe('catalogue', () => {
  it('counts plots per scheme and keeps every raw spelling', () => {
    const byKey = Object.fromEntries(catalog.schemes.map((s) => [s.key, s]))
    expect(byKey['4'].count).toBe(2631 + 232)
    expect(byKey['4'].rawValues).toEqual(['Vrindavan Yojna No.-4', 'Vrindavan Yojna No.-4 Sector-20'])
    expect(byKey.unspecified.count).toBe(5438)
    expect(catalog.schemes.reduce((sum, s) => sum + s.count, 0)).toBe(rows.length)
  })

  it('lists sectors in numeric order and merges spellings of the same sector', () => {
    expect(catalog.sectors.map((s) => s.number)).toEqual([1, 8, 9, 10, 11, 20])
    expect(catalog.sectors.find((s) => s.number === 1).count).toBe(5438 + 1427)
  })
})

describe('CQL filters', () => {
  it('adds no filter when everything is checked', () => {
    expect(schemeFilter(allKeys, catalog)).toBe('')
    expect(schemeBoundaryFilter(allKeys, catalog)).toBe('')
    expect(layoutFilter(allKeys, null, catalog)).toBe('')
  })

  it('filters the layout by the checked schemes with the exact raw spellings', () => {
    expect(schemeFilter(['4'], catalog)).toBe("(scheme IN ('Vrindavan Yojna No.-4','Vrindavan Yojna No.-4 Sector-20'))")
    expect(schemeFilter(['unspecified'], catalog)).toBe("((scheme IS NULL OR scheme = ''))")
  })

  it('shows the boundaries of the checked schemes only, by the boundary layer\'s own spelling', () => {
    expect(schemeBoundaryFilter(['2-1'], catalog)).toBe("yojana_num IN ('Vrindavan Yonjna 2 Part 1')")
    expect(schemeBoundaryFilter(['2'], catalog)).toBe('EXCLUDE') // no boundary polygon exists for "part not stated"
  })

  it('combines scheme and sector, and escapes quotes', () => {
    expect(layoutFilter(['1'], 8, catalog)).toBe("(scheme IN ('VRINDAVAN YOJANA NO.-1')) AND sector IN ('Sector 8')")
    expect(sectorFilter(10, catalog)).toBe("sector IN ('Sector-10')")
    expect(sectorBoundaryFilter(10)).toBe("sector_no_ = 'Sector 10'")
    expect(sectorBoundaryFilter(null)).toBe('')
    expect(layoutFilter([], null, catalog)).toBe('EXCLUDE')
    expect(layoutFilter(['1'], 99, catalog)).toBe('EXCLUDE')
  })
})
