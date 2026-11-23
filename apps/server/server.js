import app from './src/app.js'
import { pool } from './src/config/db.js'

const port = Number(process.env.PORT || 3001)
// Listen on localhost only: nginx is the public entrance and forwards /api to us.
const host = process.env.HOST || '127.0.0.1'

const server = app.listen(port, host, () => {
  console.log(`UPAVP API listening at http://${host}:${port}`)
})

// Stop cleanly (finish running requests, close database connections) when the process manager asks us to.
function shutdown() {
  server.close(async () => {
    await pool.end().catch(() => {})
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
