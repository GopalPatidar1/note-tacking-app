import { Router, type IRouter }   from 'express'
import { authenticate }            from '../middleware/auth.middleware'
import { noteVersionController }   from '../controllers/note-version.controller'

export const noteVersionRouter: IRouter = Router()

noteVersionRouter.use(authenticate)
noteVersionRouter.get('/:id/versions',                     noteVersionController.list)
noteVersionRouter.get('/:id/versions/:versionId',          noteVersionController.getById)
noteVersionRouter.post('/:id/versions/:versionId/restore', noteVersionController.restore)
