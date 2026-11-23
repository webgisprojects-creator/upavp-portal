const pemsFields = new Set([
  'gid',
  'id',
  'district_n',
  'layout_n',
  'plot_no_',
  'category',
  'area_sq_m',
  'sector',
  'sr_no_',
  'property_t',
  'zone',
  'emo',
  'district',
  'scheme',
  'category_1',
  'property_n',
  'propertyco',
  'area',
  'name',
  'floorno',
  'enclavena',
  'paidamount',
  'status',
])

const hiddenLayoutFields = new Set(['geometry', 'geom', 'gid', 'id'])

export function filterLayoutPopupProperties(properties, informationType) {
  return Object.entries(properties).filter(([key]) => {
    const field = key.toLowerCase()
    if (hiddenLayoutFields.has(field)) return false
    return informationType === 'PEMS' ? pemsFields.has(field) : !pemsFields.has(field)
  })
}
