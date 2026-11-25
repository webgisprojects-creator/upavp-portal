export function quoteCqlValue(value) {
  return value.replaceAll("'", "''")
}

export function sortedUniquePropertyValues(features, property) {
  const properties = Array.isArray(property) ? property : [property]
  return [...new Set(
    features
      .flatMap((feature) =>
        properties.map((name) => String(feature.properties?.[name] ?? '').trim()),
      )
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}
