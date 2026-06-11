/**
 * Integration tests for Tags CRUD — require a running PostgreSQL test DB.
 *
 * Setup:
 *   1. Create test DB: createdb note_taking_test
 *   2. Copy .env.example → .env.test and set DATABASE_URL to the test DB
 *   3. Run: dotenv -e .env.test -- npx prisma migrate deploy
 *   4. Run: pnpm test
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../../.env.test') })

import { createApp } from '../app'
import { prisma } from '../lib/prisma'

const app     = createApp()
const request = supertest(app)

const skipIfNoDb = process.env.DATABASE_URL?.includes('localhost') ? it : it.skip

async function cleanDb() {
  await prisma.noteVersion.deleteMany()
  await prisma.note.deleteMany()
  await prisma.tag.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.user.deleteMany()
}

async function registerAndLogin(email = 'alice@example.com') {
  await request.post('/api/auth/register').send({ name: 'Alice', email, password: 'P@ssword1' })
  const res = await request.post('/api/auth/login').send({ email, password: 'P@ssword1' })
  return res.body.data.accessToken as string
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

// ─── I01–I05: POST /api/tags ─────────────────────────────────────────────────
describe('POST /api/tags', () => {
  skipIfNoDb('I01: 201, tag created with noteCount: 0', async () => {
    const token = await registerAndLogin()
    const res = await request
      .post('/api/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Work', color: '#3B82F6' })

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ name: 'Work', color: '#3B82F6', noteCount: 0 })
    expect(res.body.data.id).toBeDefined()
    expect(res.body.data.createdAt).toBeDefined()
  })

  skipIfNoDb('I02: 400, missing name', async () => {
    const token = await registerAndLogin()
    const res = await request
      .post('/api/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ color: '#3B82F6' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  skipIfNoDb('I03: 400, invalid color (non-hex string)', async () => {
    const token = await registerAndLogin()
    const res = await request
      .post('/api/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Work', color: 'red' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  skipIfNoDb('I04: 201, short hex #FFF accepted', async () => {
    const token = await registerAndLogin()
    const res = await request
      .post('/api/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Work', color: '#FFF' })

    expect(res.status).toBe(201)
    expect(res.body.data.color).toBe('#FFF')
  })

  skipIfNoDb('I05: 401, no auth token', async () => {
    const res = await request.post('/api/tags').send({ name: 'Work', color: '#3B82F6' })
    expect(res.status).toBe(401)
  })
})

// ─── I06–I09: GET /api/tags ──────────────────────────────────────────────────
describe('GET /api/tags', () => {
  skipIfNoDb('I06a: 401, no auth token', async () => {
    const res = await request.get('/api/tags')
    expect(res.status).toBe(401)
  })

  skipIfNoDb('I06: 200, returns only requesting user\'s tags', async () => {
    const aliceToken = await registerAndLogin('alice@example.com')
    const bobToken   = await registerAndLogin('bob@example.com')

    await request.post('/api/tags').set('Authorization', `Bearer ${aliceToken}`).send({ name: 'Alice Tag', color: '#111111' })
    await request.post('/api/tags').set('Authorization', `Bearer ${bobToken}`).send({ name: 'Bob Tag',   color: '#222222' })

    const res = await request.get('/api/tags').set('Authorization', `Bearer ${aliceToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].name).toBe('Alice Tag')
  })

  skipIfNoDb('I07: 200, noteCount counts only non-deleted notes', async () => {
    const token = await registerAndLogin()

    const tagRes = await request.post('/api/tags').set('Authorization', `Bearer ${token}`).send({ name: 'Work', color: '#3B82F6' })
    const tagId = tagRes.body.data.id

    await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Note 1', content: 'x', tagIds: [tagId] })
    const note2 = await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Note 2', content: 'x', tagIds: [tagId] })
    await request.delete(`/api/notes/${note2.body.data.id}`).set('Authorization', `Bearer ${token}`)

    const res = await request.get('/api/tags').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data[0].noteCount).toBe(1)
  })

  skipIfNoDb('I08: 200, ordered newest first', async () => {
    const token = await registerAndLogin()

    await request.post('/api/tags').set('Authorization', `Bearer ${token}`).send({ name: 'First',  color: '#111111' })
    await request.post('/api/tags').set('Authorization', `Bearer ${token}`).send({ name: 'Second', color: '#222222' })

    const res = await request.get('/api/tags').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data[0].name).toBe('Second')
    expect(res.body.data[1].name).toBe('First')
  })
})

// ─── I09–I15: PATCH /api/tags/:id ────────────────────────────────────────────
describe('PATCH /api/tags/:id', () => {
  skipIfNoDb('I09a: 401, no auth token', async () => {
    const res = await request.patch('/api/tags/00000000-0000-0000-0000-000000000000').send({ name: 'X' })
    expect(res.status).toBe(401)
  })

  skipIfNoDb('I09: 200, name updated', async () => {
    const token  = await registerAndLogin()
    const create = await request.post('/api/tags').set('Authorization', `Bearer ${token}`).send({ name: 'Work', color: '#3B82F6' })
    const id     = create.body.data.id

    const res = await request.patch(`/api/tags/${id}`).set('Authorization', `Bearer ${token}`).send({ name: 'Personal' })

    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Personal')
    expect(res.body.data.color).toBe('#3B82F6')
  })

  skipIfNoDb('I10: 200, color updated with valid hex', async () => {
    const token  = await registerAndLogin()
    const create = await request.post('/api/tags').set('Authorization', `Bearer ${token}`).send({ name: 'Work', color: '#3B82F6' })
    const id     = create.body.data.id

    const res = await request.patch(`/api/tags/${id}`).set('Authorization', `Bearer ${token}`).send({ color: '#10B981' })

    expect(res.status).toBe(200)
    expect(res.body.data.color).toBe('#10B981')
  })

  skipIfNoDb('I11: 400, invalid hex color', async () => {
    const token  = await registerAndLogin()
    const create = await request.post('/api/tags').set('Authorization', `Bearer ${token}`).send({ name: 'Work', color: '#3B82F6' })
    const id     = create.body.data.id

    const res = await request.patch(`/api/tags/${id}`).set('Authorization', `Bearer ${token}`).send({ color: 'not-a-hex' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  skipIfNoDb('I12: 400, empty body (no fields)', async () => {
    const token  = await registerAndLogin()
    const create = await request.post('/api/tags').set('Authorization', `Bearer ${token}`).send({ name: 'Work', color: '#3B82F6' })
    const id     = create.body.data.id

    const res = await request.patch(`/api/tags/${id}`).set('Authorization', `Bearer ${token}`).send({})

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  skipIfNoDb('I13: 404, tag not found', async () => {
    const token = await registerAndLogin()
    const res   = await request.patch('/api/tags/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${token}`).send({ name: 'X' })

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I14: 404, tag belongs to another user (IDOR safe)', async () => {
    const aliceToken = await registerAndLogin('alice@example.com')
    const bobToken   = await registerAndLogin('bob@example.com')

    const create = await request.post('/api/tags').set('Authorization', `Bearer ${aliceToken}`).send({ name: 'Alice Tag', color: '#111111' })
    const id     = create.body.data.id

    const res = await request.patch(`/api/tags/${id}`).set('Authorization', `Bearer ${bobToken}`).send({ name: 'Stolen' })

    expect(res.status).toBe(404)
  })
})

// ─── I15–I18: DELETE /api/tags/:id ───────────────────────────────────────────
describe('DELETE /api/tags/:id', () => {
  skipIfNoDb('I15: 200, tag deleted', async () => {
    const token  = await registerAndLogin()
    const create = await request.post('/api/tags').set('Authorization', `Bearer ${token}`).send({ name: 'Work', color: '#3B82F6' })
    const id     = create.body.data.id

    const res = await request.delete(`/api/tags/${id}`).set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.message).toBe('Tag deleted')

    const list = await request.get('/api/tags').set('Authorization', `Bearer ${token}`)
    expect(list.body.data).toHaveLength(0)
  })

  skipIfNoDb('I16: 200, note_tags detached — note still exists after tag delete', async () => {
    const token = await registerAndLogin()

    const tagRes  = await request.post('/api/tags').set('Authorization', `Bearer ${token}`).send({ name: 'Work', color: '#3B82F6' })
    const tagId   = tagRes.body.data.id
    const noteRes = await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'My Note', content: 'x', tagIds: [tagId] })
    const noteId  = noteRes.body.data.id

    await request.delete(`/api/tags/${tagId}`).set('Authorization', `Bearer ${token}`)

    const note = await request.get(`/api/notes/${noteId}`).set('Authorization', `Bearer ${token}`)
    expect(note.status).toBe(200)
    expect(note.body.data.tags).toHaveLength(0)
  })

  skipIfNoDb('I17: 404, tag not found', async () => {
    const token = await registerAndLogin()
    const res   = await request.delete('/api/tags/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I18: 401, no auth token', async () => {
    const res = await request.delete('/api/tags/00000000-0000-0000-0000-000000000000')
    expect(res.status).toBe(401)
  })
})
