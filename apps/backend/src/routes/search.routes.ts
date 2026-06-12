import { Router, type IRouter } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { searchController } from '../controllers/search.controller'

const router: IRouter = Router()

router.get('/', authenticate, searchController.search)

export default router
