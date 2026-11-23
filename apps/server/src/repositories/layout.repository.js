import { pool } from '../config/db.js'

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL identifier: ${identifier}`)
  }
  return `"${identifier}"`
}

function qualifiedTable(schema, table) {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`
}

const layoutTable = qualifiedTable(
  process.env.LAYOUT_SCHEMA || 'lucknow',
  process.env.LAYOUT_TABLE || 'vrindavan_layout',
)
const schemeColumn = quoteIdentifier(process.env.LAYOUT_SCHEME_FIELD || 'scheme')
const sectorColumn = quoteIdentifier(process.env.LAYOUT_SECTOR_FIELD || 'sector')
const plotColumn = quoteIdentifier(process.env.LAYOUT_PLOT_FIELD || 'plot_no_')
const geometryColumn = quoteIdentifier(process.env.LAYOUT_GEOMETRY_FIELD || 'geom')

export async function checkDatabaseConnection() {
  await pool.query('SELECT 1')
}

export async function getDistinctLayoutValues(column, values = []) {
  const result = await pool.query(
    `SELECT DISTINCT BTRIM(${column}::text) AS value
     FROM ${layoutTable}
     WHERE NULLIF(BTRIM(${column}::text), '') IS NOT NULL
       AND (${values.length === 0 ? 'TRUE' : `BTRIM(${schemeColumn}::text) = $1`})
       ${values.length > 1 ? `AND BTRIM(${sectorColumn}::text) = $2` : ''}
     ORDER BY value`,
    values,
  )

  return result.rows
    .map(({ value }) => String(value).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

export async function findLayoutFeatures(scheme, sector, plot) {
  const result = await pool.query(
    `SELECT ${schemeColumn}::text AS scheme,
            ${sectorColumn}::text AS sector,
            ${plotColumn}::text AS plot,
            ST_AsGeoJSON(ST_Transform(${geometryColumn}, 4326)) AS geometry
     FROM ${layoutTable}
     WHERE BTRIM(${schemeColumn}::text) = $1
       AND BTRIM(${sectorColumn}::text) = $2
       AND BTRIM(${plotColumn}::text) = $3
     LIMIT 100`,
    [scheme, sector, plot],
  )

  return result.rows
}

export const layoutColumns = {
  scheme: schemeColumn,
  sector: sectorColumn,
  plot: plotColumn,
}

// Return totals only; plot geometry stays inside PostgreSQL.
export async function getLayoutChartData() {
  const typeColumn = quoteIdentifier(process.env.LAYOUT_PROPERTY_TYPE_FIELD || 'property_t')
  const statusColumn = quoteIdentifier(process.env.LAYOUT_STATUS_FIELD || 'status')
  const result = await pool.query(
    `SELECT ${schemeColumn}::text AS scheme,
            ${sectorColumn}::text AS sector,
            ${typeColumn}::text AS property_t,
            ${statusColumn}::text AS status,
            COUNT(*)::integer AS plot_count,
            COALESCE(SUM(ST_Area(ST_Transform(${geometryColumn}, 4326)::geography)), 0)
              / 10000.0 AS area_ha
     FROM ${layoutTable}
     GROUP BY 1, 2, 3, 4`,
  )
  return result.rows.map((row) => ({ ...row, area_ha: Number(row.area_ha) }))
}
