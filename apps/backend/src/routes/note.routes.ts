import { Router, type IRouter } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { noteController } from '../controllers/note.controller'

const router: IRouter = Router()

router.use(authenticate)

router.get('/',       noteController.list)
router.post('/',      noteController.create)
router.get('/:id',    noteController.getById)
router.patch('/:id',  noteController.update)
router.delete('/:id', noteController.delete)

router.get('/:id/versions',                      noteController.listVersions)
router.get('/:id/versions/:versionId',           noteController.getVersion)
router.post('/:id/versions/:versionId/restore',  noteController.restoreVersion)

export default router
