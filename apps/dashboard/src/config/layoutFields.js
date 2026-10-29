// Column names of the Vrindavan layout layer (Planning:vrindavan_layout = table lucknow.vrindavan_layout).
// They live in ONE place because the table was rebuilt once with different column names
// (propertyty -> property_t, propertyst -> status) and the code, the SLD styles and the database must always agree.
// If the table changes again: change it here, then check the two SLDs in the Planning workspace
// (vrindavan_PropertyType_label_plot_cat, vrindavan_Alloted_label_plot_cat).
export const LAYOUT_FIELDS = {
  propertyType: 'property_t', // Residential / Non Residential / Vacant / empty
  propertyStatus: 'status', // Alloted / Vacant / empty
  plotNumber: 'plot_no_',
  scheme: 'scheme', // yojana name of the plot (messy spellings: see lib/vrindavan.js)
  sector: 'sector', // "Sector-10" / "Sector 8" ...
}

// Name fields of the two BOUNDARY layers (other tables than the layout, so they are not in LAYOUT_FIELDS).
export const BOUNDARY_FIELDS = {
  scheme: 'yojana_num', // Planning:vrindavan scheme boundary (lucknow."vrindavan scheme boundary")
  sector: 'sector_no_', // Planning:sector boundary ("Sector 1" ... "Sector 20")
}

// Scheme and sector columns are looked up in the layer's published schema (DescribeFeatureType) because the
// column has been called `schemename`, `scheme_na` and `scheme` at different times.
export function normalizeFieldName(name) {
  return name.toLowerCase().replaceAll('_', '')
}

export function findSchemeField(fieldNames) {
  return fieldNames.find((name) => {
    const normalized = normalizeFieldName(name)
    return (
      normalized === 'scheme' ||
      normalized === 'schemena' ||
      normalized === 'schemename' ||
      (normalized.startsWith('scheme') && (normalized.endsWith('na') || normalized.endsWith('name')))
    )
  })
}

export function findSectorField(fieldNames) {
  return fieldNames.find((name) => normalizeFieldName(name).startsWith('sector'))
}
