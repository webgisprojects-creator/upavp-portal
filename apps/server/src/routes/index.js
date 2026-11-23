import { Router } from 'express'
import cadastralRoutes from './cadastral.routes.js'
import * as layoutController from '../controllers/layout.controller.js'
import layoutRoutes from './layout.routes.js'
import { asyncRoute } from '../utils/asyncRoute.js'

const router = Router()

router.get('/health', asyncRoute(layoutController.health))
router.use('/cadastral', cadastralRoutes)
router.use('/layout', layoutRoutes)

export default router
