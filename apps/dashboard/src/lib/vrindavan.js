// Scheme (yojana) and sector selection for the Vrindavan layout.
//
// The data is inconsistent, so this file is the one place that knows how to match things up:
//   * layout `scheme` has 8 spellings ("VRINDAVAN YOJANA NO.-2, PART- II", "Vrindavan Yojna No.- 3", ...) and 5,438 plots with none
//   * the scheme BOUNDARY layer names the same schemes differently ("Vrindavan Yonjna 2 Part 1")
//   * layout `sector` is "Sector-10" / "Sector 8" / "Sector-9"; the sector boundary layer has clean "Sector 1" ... "Sector 20"
// Pure functions only (no network, no React), so they are unit-tested against the real values.
import { BOUNDARY_FIELDS, LAYOUT_FIELDS } from '../config/layoutFields.js'

// Canonical schemes. `boundary` = the exact name in the scheme boundary layer (field yojana_num); null = no boundary polygon exists.
export const SCHEMES = [
  { key: '1', label: 'Vrindavan Yojana No.-1', boundary: 'Vrindavan Yojana 1' },
  { key: '2-1', label: 'Vrindavan Yojana No.-2, Part-I', boundary: 'Vrindavan Yonjna 2 Part 1' },
  { key: '2-2', label: 'Vrindavan Yojana No.-2, Part-II', boundary: 'Vrindavan Yojana 2 Part 2' },
  { key: '2', label: 'Vrindavan Yojana No.-2 (part not stated)', boundary: null },
  { key: '3', label: 'Vrindavan Yojana No.-3', boundary: 'Vrindavan Yojana 3' },
  { key: '4', label: 'Vrindavan Yojana No.-4', boundary: 'Vrindavan Yojana 4' },
]
export const UNSPECIFIED_KEY = 'unspecified'
export const OTHER_KEY = 'other'

/** Map any spelling of a scheme name to a canonical key ('1', '2-1', '2-2', '2', '3', '4'), 'unspecified' or 'other'. */
export function schemeKey(raw) {
  const text = String(raw ?? '').trim().toLowerCase()
  if (!text) return UNSPECIFIED_KEY
  const number = text.match(/(?:no\.?|yoj\w*)\W*(\d)/)?.[1]
  if (!number) return OTHER_KEY
  const part = text.match(/part\W*(ii|i|2|1)\b/)?.[1]
  const key = part ? `${number}-${part === 'ii' || part === '2' ? 2 : 1}` : number
  return SCHEMES.some((scheme) => scheme.key === key) ? key : OTHER_KEY
}

/** "Sector-10", "Sector 8", "sector 6 " -> 10, 8, 6 (null when there is no number). */
export function sectorNumber(raw) {
  const digits = String(raw ?? '').match(/\d+/)?.[0]
  return digits === undefined ? null : Number(digits)
}

const sqlQuote = (value) => `'${String(value).replaceAll("'", "''")}'`

/**
 * Build the catalogue the panel shows from the layout rows ({ scheme, sector } per plot).
 * Every raw spelling is kept so the CQL filter can list them exactly (no fragile string functions on the server).
 */
export function buildCatalog(rows) {
  const schemes = new Map()
  const sectors = new Map()
  for (const row of rows) {
    const key = schemeKey(row.scheme)
    const entry = schemes.get(key) ?? { key, count: 0, rawValues: new Set() }
    entry.count += 1
    if (String(row.scheme ?? '').trim()) entry.rawValues.add(row.scheme)
    schemes.set(key, entry)

    const number = sectorNumber(row.sector)
    if (number !== null) {
      const sector = sectors.get(number) ?? { number, count: 0, rawValues: new Set() }
      sector.count += 1
      sector.rawValues.add(row.sector)
      sectors.set(number, sector)
    }
  }
  const labelOf = (key) =>
    SCHEMES.find((scheme) => scheme.key === key)?.label ??
    (key === UNSPECIFIED_KEY ? 'No scheme recorded' : 'Other / unrecognised scheme name')
  const order = [...SCHEMES.map((scheme) => scheme.key), OTHER_KEY, UNSPECIFIED_KEY]
  return {
    schemes: order
      .filter((key) => schemes.has(key))
      .map((key) => ({
        key,
        label: labelOf(key),
        count: schemes.get(key).count,
        rawValues: [...schemes.get(key).rawValues],
        boundary: SCHEMES.find((scheme) => scheme.key === key)?.boundary ?? null,
      })),
    sectors: [...sectors.values()]
      .sort((a, b) => a.number - b.number)
      .map(({ number, count, rawValues }) => ({
        number,
        label: `Sector ${number}`,
        count,
        rawValues: [...rawValues],
      })),
  }
}

/** CQL for the layout layer: only plots of the checked schemes. '' = no filter (everything is checked). */
export function schemeFilter(selectedKeys, catalog) {
  const selected = new Set(selectedKeys)
  if (catalog.schemes.every(({ key }) => selected.has(key))) return ''
  const parts = []
  for (const { key, rawValues } of catalog.schemes) {
    if (!selected.has(key)) continue
    if (key === UNSPECIFIED_KEY) parts.push(`(${LAYOUT_FIELDS.scheme} IS NULL OR ${LAYOUT_FIELDS.scheme} = '')`)
    if (rawValues.length) parts.push(`${LAYOUT_FIELDS.scheme} IN (${rawValues.map(sqlQuote).join(',')})`)
  }
  return parts.length ? `(${parts.join(' OR ')})` : 'EXCLUDE'
}

/** CQL for the layout layer: only plots of one sector ('' when none is chosen). */
export function sectorFilter(sectorNo, catalog) {
  if (sectorNo === null || sectorNo === undefined) return ''
  const sector = catalog.sectors.find(({ number }) => number === sectorNo)
  return sector ? `${LAYOUT_FIELDS.sector} IN (${sector.rawValues.map(sqlQuote).join(',')})` : 'EXCLUDE'
}

/** Both filters for the layout layer, joined. */
export function layoutFilter(selectedKeys, sectorNo, catalog) {
  const parts = [schemeFilter(selectedKeys, catalog), sectorFilter(sectorNo, catalog)].filter(Boolean)
  if (parts.includes('EXCLUDE')) return 'EXCLUDE'
  return parts.join(' AND ')
}

/** CQL for the scheme BOUNDARY layer: the boundaries of the checked schemes only ('' = show all). */
export function schemeBoundaryFilter(selectedKeys, catalog) {
  const selected = new Set(selectedKeys)
  if (catalog.schemes.every(({ key }) => selected.has(key))) return ''
  const names = catalog.schemes.filter(({ key, boundary }) => selected.has(key) && boundary).map(({ boundary }) => boundary)
  return names.length ? `${BOUNDARY_FIELDS.scheme} IN (${names.map(sqlQuote).join(',')})` : 'EXCLUDE'
}

/** CQL for the SECTOR boundary layer: the chosen sector only ('' = all sectors). */
export function sectorBoundaryFilter(sectorNo) {
  return sectorNo === null || sectorNo === undefined
    ? ''
    : `${BOUNDARY_FIELDS.sector} = ${sqlQuote(`Sector ${sectorNo}`)}`
}
