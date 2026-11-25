import { describe, expect, it } from 'vitest'
import { getLegendGraphicUrl } from './legendGraphic.js'

describe('GeoServer legend graphic URL', () => {
  it('requests a legend for the published layer and selected style', () => {
    const url = new URL(
      getLegendGraphicUrl('/geoserver/wms', 'Planning:vrindavan_layout', 'vrindavan_status'),
      'http://localhost',
    )

    expect(url.pathname).toBe('/geoserver/wms')
    expect(url.searchParams.get('REQUEST')).toBe('GetLegendGraphic')
    expect(url.searchParams.get('FORMAT')).toBe('image/png')
    expect(url.searchParams.get('LAYER')).toBe('Planning:vrindavan_layout')
    expect(url.searchParams.get('STYLE')).toBe('vrindavan_status')
    expect(url.searchParams.get('LEGEND_OPTIONS')).toBe('forceLabels:off;forceTitles:off')
  })

  it('preserves existing WMS query parameters and omits an empty style', () => {
    const url = new URL(
      getLegendGraphicUrl('/geoserver/wms?map=planning', 'Planning:dhara28'),
      'http://localhost',
    )

    expect(url.searchParams.get('map')).toBe('planning')
    expect(url.searchParams.get('LAYER')).toBe('Planning:dhara28')
    expect(url.searchParams.get('WIDTH')).toBe('20')
    expect(url.searchParams.get('HEIGHT')).toBe('20')
    expect(url.searchParams.has('STYLE')).toBe(false)
  })
})
