import { Router } from 'express'
import * as cadastralController from '../controllers/cadastral.controller.js'
import { asyncRoute } from '../utils/asyncRoute.js'

const router = Router()

router.get('/villages', asyncRoute(cadastralController.villages))
router.get('/gata-numbers', asyncRoute(cadastralController.gataNumbers))
router.get('/search', asyncRoute(cadastralController.search))

export default router
