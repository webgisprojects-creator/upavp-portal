import { describe, expect, it } from 'vitest'
import { LAYOUT_FIELDS, findSchemeField, findSectorField } from './layoutFields.js'

// The real column list of lucknow.vrindavan_layout after the table was rebuilt.
const currentColumns = [
  'gid', 'id', 'district_n', 'layout_n', 'plot_no_', 'category', 'area_sq_m', 'sector', 'sr_no_', 'property_t',
  'zone', 'emo', 'district', 'scheme', 'category_1', 'property_n', 'propertyco', 'area', 'name', 'mobileno',
  'paidamount', 'status', 'geom',
]

describe('layout field names', () => {
  it('all configured columns exist in the current table', () => {
    for (const column of Object.values(LAYOUT_FIELDS)) expect(currentColumns).toContain(column)
  })

  it('finds the scheme column whatever it is called', () => {
    expect(findSchemeField(currentColumns)).toBe('scheme')
    expect(findSchemeField(['gid', 'schemename', 'geom'])).toBe('schemename')
    expect(findSchemeField(['gid', 'scheme_na'])).toBe('scheme_na')
    expect(findSchemeField(['gid', 'geom'])).toBeUndefined()
  })

  it('finds the sector column', () => {
    expect(findSectorField(currentColumns)).toBe('sector')
    expect(findSectorField(['gid', 'sector_no'])).toBe('sector_no')
    expect(findSectorField(['gid'])).toBeUndefined()
  })
})
