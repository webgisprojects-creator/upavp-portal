// Scope uses exact raw values, matching the existing map's scheme/sector filters.
export function buildLayoutChartClasses(rows, categoryProperty, scope = null) {
  const totals = new Map()
  for (const row of rows) {
    if (scope?.schemeValues != null) {
      const unspecified = row.scheme == null || row.scheme === ''
      if (!scope.schemeValues.includes(row.scheme) && !(scope.includeUnspecified && unspecified)) continue
    }
    if (scope?.sectorValues != null && !scope.sectorValues.includes(row.sector)) continue
    const raw = String(row[categoryProperty] ?? '').trim()
    let name = raw || (categoryProperty === 'property_t' ? 'Null' : categoryProperty === 'status' ? 'Other or unspecified' : 'Unspecified')
    if (categoryProperty === 'status') {
      name = raw.toLowerCase() === 'alloted' ? 'Alloted' : raw.toLowerCase() === 'vacant' ? 'Vacant' : 'Other or unspecified'
    }
    const area = Number(row.area_ha)
    if (!Number.isFinite(area) || area < 0) throw new Error('Backend returned an invalid chart area.')
    totals.set(name, (totals.get(name) || 0) + area)
  }
  return [...totals].map(([name, area]) => ({ name, area, subclasses: [] }))
    .sort((a, b) => b.area - a.area)
}
