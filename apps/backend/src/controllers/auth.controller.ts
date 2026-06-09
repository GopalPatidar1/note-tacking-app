import { Request, Response } from 'express'
import {
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
} from '@note-app/shared'
import { authService } from '../services/auth.service'

export const authController = {
  async register(req: Request, res: Response) {
    const body = RegisterRequestSchema.parse(req.body)
    const result = await authService.register(body)
    res.status(201).json({ data: result })
  },

  async login(req: Request, res: Response) {
    const body = LoginRequestSchema.parse(req.body)
    const result = await authService.login(body)
    res.status(200).json({ data: result })
  },

  async logout(req: Request, res: Response) {
    const body = LogoutRequestSchema.parse(req.body)
    await authService.logout(body)
    res.status(200).json({ data: { message: 'Logged out' } })
  },

  async refresh(req: Request, res: Response) {
    const body = RefreshRequestSchema.parse(req.body)
    const result = await authService.refresh(body)
    res.status(200).json({ data: result })
  },
}
