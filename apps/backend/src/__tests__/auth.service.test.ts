import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../repositories/user.repository', () => ({
  userRepository: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('../repositories/refresh-token.repository', () => ({
  refreshTokenRepository: {
    create: vi.fn(),
    findByToken: vi.fn(),
    deleteByToken: vi.fn(),
  },
}))

import { authService } from '../services/auth.service'
import { userRepository } from '../repositories/user.repository'
import { refreshTokenRepository } from '../repositories/refresh-token.repository'
import { EmailConflictError, InvalidCredentialsError, InvalidRefreshTokenError } from '../errors/domain-errors'
import bcrypt from 'bcrypt'

const mockUser = {
  id: 'user-uuid-1',
  name: 'Alice',
  email: 'alice@example.com',
  passwordHash: '',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('authService.register', () => {
  it('creates user and returns access + refresh tokens', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null)
    vi.mocked(userRepository.create).mockResolvedValue(mockUser)
    vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as never)

    const result = await authService.register({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'P@ssword1',
    })

    expect(result.accessToken).toBeDefined()
    expect(result.refreshToken).toBeDefined()
    expect(result.user.email).toBe('alice@example.com')
    expect(result.user).not.toHaveProperty('passwordHash')
    expect(userRepository.create).toHaveBeenCalledOnce()
    expect(refreshTokenRepository.create).toHaveBeenCalledOnce()
  })

  it('throws EmailConflictError when email already exists', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser)

    await expect(
      authService.register({ name: 'Alice', email: 'alice@example.com', password: 'P@ssword1' })
    ).rejects.toThrow(EmailConflictError)

    expect(userRepository.create).not.toHaveBeenCalled()
  })
})

describe('authService.login', () => {
  it('returns tokens for valid credentials', async () => {
    const hash = await bcrypt.hash('P@ssword1', 10)
    vi.mocked(userRepository.findByEmail).mockResolvedValue({ ...mockUser, passwordHash: hash })
    vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as never)

    const result = await authService.login({ email: 'alice@example.com', password: 'P@ssword1' })

    expect(result.accessToken).toBeDefined()
    expect(result.refreshToken).toBeDefined()
    expect(result.user.email).toBe('alice@example.com')
  })

  it('throws InvalidCredentialsError for unknown email', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null)

    await expect(
      authService.login({ email: 'nobody@example.com', password: 'P@ssword1' })
    ).rejects.toThrow(InvalidCredentialsError)
  })

  it('throws InvalidCredentialsError for wrong password', async () => {
    const hash = await bcrypt.hash('CorrectP@ss1', 10)
    vi.mocked(userRepository.findByEmail).mockResolvedValue({ ...mockUser, passwordHash: hash })

    await expect(
      authService.login({ email: 'alice@example.com', password: 'WrongP@ss1' })
    ).rejects.toThrow(InvalidCredentialsError)
  })
})

describe('authService.logout', () => {
  it('deletes the refresh token', async () => {
    vi.mocked(refreshTokenRepository.deleteByToken).mockResolvedValue({ count: 1 } as never)

    await authService.logout({ refreshToken: 'some-token' })

    expect(refreshTokenRepository.deleteByToken).toHaveBeenCalledWith('some-token')
  })

  it('does not throw if token does not exist (idempotent)', async () => {
    vi.mocked(refreshTokenRepository.deleteByToken).mockResolvedValue({ count: 0 } as never)

    await expect(authService.logout({ refreshToken: 'nonexistent' })).resolves.toBeUndefined()
  })
})

describe('authService.refresh', () => {
  const validRecord = {
    id: 'rt-uuid-1',
    userId: 'user-uuid-1',
    token: 'old-token',
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
  }

  it('rotates the token and returns a new pair', async () => {
    vi.mocked(refreshTokenRepository.findByToken).mockResolvedValue(validRecord)
    vi.mocked(refreshTokenRepository.deleteByToken).mockResolvedValue({ count: 1 } as never)
    vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as never)

    const result = await authService.refresh({ refreshToken: 'old-token' })

    expect(result.accessToken).toBeDefined()
    expect(result.refreshToken).toBeDefined()
    expect(result.refreshToken).not.toBe('old-token')
    expect(refreshTokenRepository.deleteByToken).toHaveBeenCalledWith('old-token')
    expect(refreshTokenRepository.create).toHaveBeenCalledOnce()
  })

  it('throws InvalidRefreshTokenError for unknown token', async () => {
    vi.mocked(refreshTokenRepository.findByToken).mockResolvedValue(null)

    await expect(authService.refresh({ refreshToken: 'bad-token' })).rejects.toThrow(
      InvalidRefreshTokenError
    )
  })

  it('throws InvalidRefreshTokenError for expired token', async () => {
    vi.mocked(refreshTokenRepository.findByToken).mockResolvedValue({
      ...validRecord,
      expiresAt: new Date(Date.now() - 1000),
    })

    await expect(authService.refresh({ refreshToken: 'expired-token' })).rejects.toThrow(
      InvalidRefreshTokenError
    )
  })
})
