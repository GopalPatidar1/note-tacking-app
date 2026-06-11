import { Router, type IRouter } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { tagController } from '../controllers/tag.controller'

const router: IRouter = Router()

router.use(authenticate)

router.get('/',       tagController.list)
router.post('/',      tagController.create)
router.patch('/:id',  tagController.update)
router.delete('/:id', tagController.delete)

export default router
