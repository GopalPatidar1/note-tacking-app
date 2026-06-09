import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { authController } from '../controllers/auth.controller'

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

const router = Router()

router.post('/register', authLimiter, authController.register)
router.post('/login', authLimiter, authController.login)
router.post('/logout', authController.logout)
router.post('/refresh', authLimiter, authController.refresh)

export default router
