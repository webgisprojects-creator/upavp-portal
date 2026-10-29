// Drawing order of the map layers, bottom to top. One rule for the whole dashboard, whatever order the layers were
// switched on or first created in (OpenLayers otherwise stacks by creation order).
//
// Reasoning (what each SLD actually draws):
//   villagearea     Vrindavan village polygons, FILLED dark blue -> the very bottom: the plots are drawn over them
//   lulc / layout   opaque FILLED polygons          -> the thematic base, everything else must sit above them
//   landuse         filled plot land use (Vrindavan sector 6) -> just above the layout it refines
//   railway         a line                           -> infrastructure over the areas
//   cadastral       1 px parcel lines + gata numbers -> fine detail over the areas
//   sector          green sector outlines + names    -> planning division, under the village line
//   village         3 px black line + village names  -> administrative boundary
//   dhara           Dhara 28 (yellow) / Dhara 32 (red) outlines -> statutory boundaries, kept visible over the village line
//   scheme          3 px red dashed line             -> the project outline: the most important line, never covered
// Basemap imagery is drawn first; the Esri place-name labels of the "Hybrid" basemap are drawn above the data
// (they are transparent), because under the opaque LULC they were never visible.
// Highlights and search overlays keep their own, higher z-indexes (900 and up, set where they are created).

export const BASEMAP_Z_INDEX = { imagery: 0, labels: 100 }

const DATA_Z_INDEX = { villagearea: 5, lulc: 10, layout: 10, landuse: 15, railway: 20, cadastral: 30, sector: 35, village: 40, dhara: 45, scheme: 50 }
const DEFAULT_Z_INDEX = 15

export function layerRole(id) {
  // Lucknow's "Village Boundary" is a FILLED layer (unlike the 3 px black village lines of the other cities), so it is a base layer
  if (id.includes('village-boundary')) return 'villagearea'
  if (id.includes('lulc')) return 'lulc'
  if (id.includes('layout')) return 'layout'
  if (id.includes('landuse')) return 'landuse'
  if (id.includes('railway')) return 'railway'
  if (id.includes('cadastral')) return 'cadastral'
  if (id.includes('sector')) return 'sector' // after 'landuse': the sector 6 land use layer is a filled layer, not an outline
  if (id.includes('dhara')) return 'dhara'
  if (id.includes('village')) return 'village'
  if (id.includes('scheme')) return 'scheme'
  return 'other'
}

export function drawOrder(id) {
  return DATA_Z_INDEX[layerRole(id)] ?? DEFAULT_Z_INDEX
}

// Opaque filled layers get a transparency slider in the panel (so the basemap can be seen through them).
export function hasOpacitySlider(id) {
  return ['lulc', 'layout', 'landuse', 'villagearea'].includes(layerRole(id))
}

// Same order as the map, topmost first - used for the layer panel, the legend and the click-to-identify popup.
export function topFirst(items) {
  return [...items].sort((a, b) => drawOrder(b.id) - drawOrder(a.id))
}
