import 'dotenv/config'
import express from 'express'
import apiRoutes from './routes/index.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

app.disable('x-powered-by')
app.use(express.json())
app.use('/api', apiRoutes)
app.use(errorHandler)

export default app
