import bcrypt from 'bcrypt'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import {
  BCRYPT_ROUNDS,
  REFRESH_TOKEN_TTL_MS,
  TOKEN_EXPIRY_ACCESS,
  type LoginRequestDTO,
  type LogoutRequestDTO,
  type RefreshRequestDTO,
  type RegisterRequestDTO,
} from '@note-app/shared'
import { refreshTokenRepository } from '../repositories/refresh-token.repository'
import { userRepository } from '../repositories/user.repository'
import {
  EmailConflictError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from '../errors/domain-errors'

function generateAccessToken(userId: string): string {
  const secret = process.env.ACCESS_TOKEN_SECRET
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET is not configured')
  return jwt.sign({ sub: userId }, secret, { expiresIn: TOKEN_EXPIRY_ACCESS })
}

function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export const authService = {
  async register(dto: RegisterRequestDTO) {
    const existing = await userRepository.findByEmail(dto.email)
    if (existing) throw new EmailConflictError()

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
    const user = await userRepository.create({ name: dto.name, email: dto.email, passwordHash })

    const accessToken = generateAccessToken(user.id)
    const refreshToken = generateRefreshToken()
    await refreshTokenRepository.create(user.id, refreshToken, new Date(Date.now() + REFRESH_TOKEN_TTL_MS))

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt },
    }
  },

  async login(dto: LoginRequestDTO) {
    const user = await userRepository.findByEmail(dto.email)
    if (!user) throw new InvalidCredentialsError()

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) throw new InvalidCredentialsError()

    const accessToken = generateAccessToken(user.id)
    const refreshToken = generateRefreshToken()
    await refreshTokenRepository.create(user.id, refreshToken, new Date(Date.now() + REFRESH_TOKEN_TTL_MS))

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt },
    }
  },

  async logout(dto: LogoutRequestDTO) {
    await refreshTokenRepository.deleteByToken(dto.refreshToken)
    // Idempotent: no error if token was already gone
  },

  async refresh(dto: RefreshRequestDTO) {
    const record = await refreshTokenRepository.findByToken(dto.refreshToken)
    if (!record || record.expiresAt < new Date()) throw new InvalidRefreshTokenError()

    await refreshTokenRepository.deleteByToken(dto.refreshToken)

    const accessToken = generateAccessToken(record.userId)
    const newRefreshToken = generateRefreshToken()
    await refreshTokenRepository.create(record.userId, newRefreshToken, new Date(Date.now() + REFRESH_TOKEN_TTL_MS))

    return { accessToken, refreshToken: newRefreshToken }
  },
}
