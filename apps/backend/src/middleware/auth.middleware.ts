import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { UnauthorizedError } from '../errors/domain-errors'

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return next(new UnauthorizedError())

  const token = authHeader.slice(7)
  const secret = process.env.ACCESS_TOKEN_SECRET
  if (!secret) return next(new UnauthorizedError())

  try {
    const payload = jwt.verify(token, secret) as { sub: string }
    req.user = { id: payload.sub }
    next()
  } catch {
    next(new UnauthorizedError())
  }
}
