import { Router } from 'express'
import * as layoutController from '../controllers/layout.controller.js'
import { asyncRoute } from '../utils/asyncRoute.js'

const router = Router()

router.get('/chart-data', asyncRoute(layoutController.chartData))
router.get('/schemes', asyncRoute(layoutController.schemes))
router.get('/sectors', asyncRoute(layoutController.sectors))
router.get('/plots', asyncRoute(layoutController.plots))
router.get('/search', asyncRoute(layoutController.search))

export default router
