import { Router, type IRouter } from 'express'
import rateLimit from 'express-rate-limit'
import { authenticate } from '../middleware/auth.middleware'
import { shareLinkController } from '../controllers/share-link.controller'

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
})

// POST /api/notes/:id/share — mounted at /api/notes
export const noteShareRouter: IRouter = Router()
noteShareRouter.post('/:id/share', authenticate, shareLinkController.create)

// DELETE /api/share/:id — mounted at /api/share
export const shareRouter: IRouter = Router()
shareRouter.delete('/:id', authenticate, shareLinkController.revoke)

// GET /api/public/:token — mounted at /api/public (no auth required)
export const publicRouter: IRouter = Router()
publicRouter.get('/:token', publicLimiter, shareLinkController.getPublic)
