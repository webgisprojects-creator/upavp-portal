import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg
const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 10000,
  max: 10,
  idleTimeoutMillis: 30000,
  statement_timeout: 10000, // a slow or runaway query is cancelled after 10 s instead of piling up
}

for (const key of ['host', 'database', 'user', 'password']) {
  if (!config[key]) {
    throw new Error(`Set DB_${key.toUpperCase()} in apps/server/.env.`)
  }
}

export const pool = new Pool(config)
pool.on('error', (error) => console.error('Idle database connection error:', error.message))

