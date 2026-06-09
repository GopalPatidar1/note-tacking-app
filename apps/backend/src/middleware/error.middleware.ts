import { Request, Response, NextFunction } from 'express'
import { ZodError } from '@note-app/shared'
import { AppError } from '../errors/domain-errors'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const message = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
    return res.status(400).json({ error: { message, code: 'VALIDATION_ERROR' } })
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { message: err.message, code: err.code } })
  }

  console.error('Unhandled error:', err)
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } })
}
