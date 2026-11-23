export function getLegendGraphicUrl(wmsUrl, layer, style = '') {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetLegendGraphic',
    FORMAT: 'image/png',
    LAYER: layer,
    WIDTH: '20',
    HEIGHT: '20',
    LEGEND_OPTIONS: 'forceLabels:off;forceTitles:off',
  })
  if (style) params.set('STYLE', style)

  const [url, fragment] = wmsUrl.split('#', 2)
  const separator = url.includes('?') ? (url.endsWith('?') || url.endsWith('&') ? '' : '&') : '?'
  return `${url}${separator}${params}${fragment ? `#${fragment}` : ''}`
}
