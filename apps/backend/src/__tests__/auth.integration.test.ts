/**
 * Integration tests — require a running PostgreSQL instance.
 *
 * Setup:
 *   1. Create a test DB: createdb note_taking_test
 *   2. Copy .env.example → .env.test and set DATABASE_URL to the test DB
 *   3. Run: dotenv -e .env.test -- npx prisma migrate deploy
 *   4. Run: pnpm test (vitest picks up .env.test via dotenv in setup)
 *
 * These tests run against a real DB and clean up before each test.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load test env before anything else
config({ path: resolve(__dirname, '../../.env.test') })

import { createApp } from '../app'
import { prisma } from '../lib/prisma'

const app = createApp()
const request = supertest(app)

const skipIfNoDb = process.env.DATABASE_URL?.includes('localhost') ? it : it.skip

async function cleanDb() {
  await prisma.refreshToken.deleteMany()
  await prisma.user.deleteMany()
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) return
  await cleanDb()
})

beforeEach(async () => {
  if (!process.env.DATABASE_URL) return
  await cleanDb()
})

afterAll(async () => {
  if (!process.env.DATABASE_URL) return
  await cleanDb()
  await prisma.$disconnect()
})

describe('POST /api/auth/register', () => {
  skipIfNoDb('returns 201 with tokens and user (no passwordHash exposed)', async () => {
    const res = await request.post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'P@ssword1',
    })

    expect(res.status).toBe(201)
    expect(res.body.data.accessToken).toBeDefined()
    expect(res.body.data.refreshToken).toBeDefined()
    expect(res.body.data.user.email).toBe('alice@example.com')
    expect(res.body.data.user.passwordHash).toBeUndefined()
  })

  skipIfNoDb('returns 409 on duplicate email', async () => {
    await request.post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'P@ssword1',
    })

    const res = await request.post('/api/auth/register').send({
      name: 'Alice 2',
      email: 'alice@example.com',
      password: 'P@ssword2',
    })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_CONFLICT')
  })

  it('returns 400 on weak password (no uppercase)', async () => {
    const res = await request.post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password1!',
    })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 on missing required fields', async () => {
    const res = await request.post('/api/auth/register').send({ email: 'alice@example.com' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  skipIfNoDb('returns 200 with tokens on valid credentials', async () => {
    await request.post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'P@ssword1',
    })

    const res = await request.post('/api/auth/login').send({
      email: 'alice@example.com',
      password: 'P@ssword1',
    })

    expect(res.status).toBe(200)
    expect(res.body.data.accessToken).toBeDefined()
    expect(res.body.data.refreshToken).toBeDefined()
  })

  skipIfNoDb('returns 401 on wrong password', async () => {
    await request.post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'P@ssword1',
    })

    const res = await request.post('/api/auth/login').send({
      email: 'alice@example.com',
      password: 'WrongP@ss1',
    })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  skipIfNoDb('returns 401 on unknown email', async () => {
    const res = await request.post('/api/auth/login').send({
      email: 'nobody@example.com',
      password: 'P@ssword1',
    })

    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  skipIfNoDb('returns 200 and invalidates the refresh token', async () => {
    const reg = await request.post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'P@ssword1',
    })
    const { refreshToken } = reg.body.data

    const res = await request.post('/api/auth/logout').send({ refreshToken })
    expect(res.status).toBe(200)

    // Token should now be rejected
    const refresh = await request.post('/api/auth/refresh').send({ refreshToken })
    expect(refresh.status).toBe(401)
  })

  it('returns 200 even for nonexistent token (idempotent)', async () => {
    const res = await request.post('/api/auth/logout').send({ refreshToken: 'does-not-exist' })
    expect(res.status).toBe(200)
  })
})

describe('POST /api/auth/refresh', () => {
  skipIfNoDb('returns new token pair and invalidates old token', async () => {
    const reg = await request.post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'P@ssword1',
    })
    const { refreshToken: oldToken } = reg.body.data

    const res = await request.post('/api/auth/refresh').send({ refreshToken: oldToken })

    expect(res.status).toBe(200)
    expect(res.body.data.accessToken).toBeDefined()
    expect(res.body.data.refreshToken).not.toBe(oldToken)

    // Replaying the old token must fail
    const replay = await request.post('/api/auth/refresh').send({ refreshToken: oldToken })
    expect(replay.status).toBe(401)
    expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN')
  })

  it('returns 401 for unknown token', async () => {
    const res = await request.post('/api/auth/refresh').send({ refreshToken: 'bad-token' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN')
  })
})
