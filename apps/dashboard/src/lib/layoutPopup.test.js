import { describe, expect, it } from 'vitest'
import { filterLayoutPopupProperties } from './layoutPopup.js'

describe('layout popup information groups', () => {
  const properties = {
    gid: 1,
    id: 2,
    district_n: 'Lucknow',
    property_t: 'Residential',
    srno: '22835',
    plot_area: 120,
    remarks: 'Example',
    geometry: {},
  }

  it('shows PEMS fields while excluding internal identifiers', () => {
    expect(filterLayoutPopupProperties(properties, 'PEMS')).toEqual([
      ['district_n', 'Lucknow'],
      ['property_t', 'Residential'],
    ])
  })

  it('shows the remaining PEPO fields, including remarks', () => {
    expect(filterLayoutPopupProperties(properties, 'PEPO')).toEqual([
      ['srno', '22835'],
      ['plot_area', 120],
      ['remarks', 'Example'],
    ])
  })
})
