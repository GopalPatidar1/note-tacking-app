/**
 * Integration tests for Notes CRUD — require a running PostgreSQL test DB.
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

// ─── I01–I03: POST /api/notes ────────────────────────────────────────────────
describe('POST /api/notes', () => {
  skipIfNoDb('I01: 201, note + version created', async () => {
    const token = await registerAndLogin()

    const res = await request
      .post('/api/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My Note', content: 'Hello world' })

    expect(res.status).toBe(201)
    expect(res.body.data.id).toBeDefined()
    expect(res.body.data.title).toBe('My Note')
    expect(res.body.data.tags).toEqual([])

    const versionCount = await prisma.noteVersion.count({ where: { noteId: res.body.data.id } })
    expect(versionCount).toBe(1)
  })

  skipIfNoDb('I02: 400, missing title', async () => {
    const token = await registerAndLogin()

    const res = await request
      .post('/api/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hello world' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  skipIfNoDb('I03: 401, no auth token', async () => {
    const res = await request.post('/api/notes').send({ title: 'T', content: 'C' })
    expect(res.status).toBe(401)
  })
})

// ─── I04–I06: GET /api/notes ─────────────────────────────────────────────────
describe('GET /api/notes', () => {
  skipIfNoDb('I04: 200, returns only notes belonging to requesting user', async () => {
    const tokenA = await registerAndLogin('alice@example.com')
    const tokenB = await registerAndLogin('bob@example.com')

    await request.post('/api/notes').set('Authorization', `Bearer ${tokenA}`).send({ title: 'Alice Note', content: 'A' })
    await request.post('/api/notes').set('Authorization', `Bearer ${tokenB}`).send({ title: 'Bob Note',   content: 'B' })

    const res = await request.get('/api/notes').set('Authorization', `Bearer ${tokenA}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].title).toBe('Alice Note')
  })

  skipIfNoDb('I05: pagination — page=1&limit=2 returns 2 items', async () => {
    const token = await registerAndLogin()

    for (let i = 1; i <= 3; i++) {
      await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: `Note ${i}`, content: 'C' })
    }

    const res = await request.get('/api/notes?page=1&limit=2').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(2)
    expect(res.body.data.total).toBe(3)
    expect(res.body.data.page).toBe(1)
    expect(res.body.data.limit).toBe(2)
  })

  skipIfNoDb('I05b: page=2&limit=2 returns correct second page', async () => {
    const token = await registerAndLogin()
    for (let i = 1; i <= 3; i++) {
      await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: `Note ${i}`, content: 'C' })
    }

    const res = await request.get('/api/notes?page=2&limit=2').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.page).toBe(2)
  })

  skipIfNoDb('I05c: limit=200 — 400 validation error', async () => {
    const token = await registerAndLogin()

    const res = await request.get('/api/notes?limit=200').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  skipIfNoDb('I05d: tagId from another user — returns empty (IDOR guard)', async () => {
    const tokenA = await registerAndLogin('alice@example.com')
    await registerAndLogin('bob@example.com')
    const userB  = await prisma.user.findUnique({ where: { email: 'bob@example.com' } })
    const bobTag = await prisma.tag.create({ data: { userId: userB!.id, name: 'BobTag', color: '#000000' } })

    await request.post('/api/notes').set('Authorization', `Bearer ${tokenA}`).send({ title: 'Alice Note', content: 'C' })

    const res = await request.get(`/api/notes?tagId=${bobTag.id}`).set('Authorization', `Bearer ${tokenA}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(0)
  })

  skipIfNoDb('I06: tagId filter returns only tagged notes', async () => {
    const token = await registerAndLogin()
    const user  = await prisma.user.findUnique({ where: { email: 'alice@example.com' } })
    const tag   = await prisma.tag.create({ data: { userId: user!.id, name: 'Work', color: '#ff0000' } })

    await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Tagged Note',   content: 'C', tagIds: [tag.id] })
    await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Untagged Note', content: 'C' })

    const res = await request.get(`/api/notes?tagId=${tag.id}`).set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].title).toBe('Tagged Note')
  })
})

// ─── I07–I09: GET /api/notes/:id ─────────────────────────────────────────────
describe('GET /api/notes/:id', () => {
  skipIfNoDb('I07: 200, returns correct note', async () => {
    const token = await registerAndLogin()
    const created = await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Solo', content: 'C' })
    const noteId  = created.body.data.id

    const res = await request.get(`/api/notes/${noteId}`).set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(noteId)
  })

  skipIfNoDb('I08: 404, note not found', async () => {
    const token = await registerAndLogin()

    const res = await request.get('/api/notes/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I09: 403, note belongs to another user', async () => {
    const tokenA = await registerAndLogin('alice@example.com')
    const tokenB = await registerAndLogin('bob@example.com')

    const created = await request.post('/api/notes').set('Authorization', `Bearer ${tokenA}`).send({ title: 'Private', content: 'C' })
    const noteId  = created.body.data.id

    const res = await request.get(`/api/notes/${noteId}`).set('Authorization', `Bearer ${tokenB}`)

    expect(res.status).toBe(404)
  })
})

// ─── I10–I12: PATCH /api/notes/:id ───────────────────────────────────────────
describe('PATCH /api/notes/:id', () => {
  skipIfNoDb('I10: 200, updates title and creates new version', async () => {
    const token   = await registerAndLogin()
    const created = await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Old', content: 'C' })
    const noteId  = created.body.data.id

    const res = await request.patch(`/api/notes/${noteId}`).set('Authorization', `Bearer ${token}`).send({ title: 'New' })

    expect(res.status).toBe(200)
    expect(res.body.data.title).toBe('New')

    const versionCount = await prisma.noteVersion.count({ where: { noteId } })
    expect(versionCount).toBe(2)
  })

  skipIfNoDb('I11: 404, note not found', async () => {
    const token = await registerAndLogin()

    const res = await request.patch('/api/notes/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${token}`).send({ title: 'X' })

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I12: 404, wrong user (repository hides note)', async () => {
    const tokenA = await registerAndLogin('alice@example.com')
    const tokenB = await registerAndLogin('bob@example.com')

    const created = await request.post('/api/notes').set('Authorization', `Bearer ${tokenA}`).send({ title: 'Alice', content: 'C' })
    const noteId  = created.body.data.id

    const res = await request.patch(`/api/notes/${noteId}`).set('Authorization', `Bearer ${tokenB}`).send({ title: 'Hacked' })

    expect(res.status).toBe(404)
  })
})

// ─── I13–I16: DELETE /api/notes/:id ──────────────────────────────────────────
describe('DELETE /api/notes/:id', () => {
  skipIfNoDb('I13: 200, sets deletedAt', async () => {
    const token   = await registerAndLogin()
    const created = await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Gone', content: 'C' })
    const noteId  = created.body.data.id

    const res = await request.delete(`/api/notes/${noteId}`).set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.message).toBe('Note deleted')

    const note = await prisma.note.findUnique({ where: { id: noteId } })
    expect(note?.deletedAt).not.toBeNull()
  })

  skipIfNoDb('I14: 200 again — idempotent soft delete', async () => {
    const token   = await registerAndLogin()
    const created = await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Gone', content: 'C' })
    const noteId  = created.body.data.id

    await request.delete(`/api/notes/${noteId}`).set('Authorization', `Bearer ${token}`)
    const res = await request.delete(`/api/notes/${noteId}`).set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
  })

  skipIfNoDb('I15: 404, note not found', async () => {
    const token = await registerAndLogin()

    const res = await request.delete('/api/notes/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I16: GET /api/notes does not return soft-deleted notes', async () => {
    const token   = await registerAndLogin()
    const created = await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Soon Deleted', content: 'C' })
    const noteId  = created.body.data.id

    await request.delete(`/api/notes/${noteId}`).set('Authorization', `Bearer ${token}`)

    const res = await request.get('/api/notes').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(0)
  })
})

// ─── I17–I23: GET /api/notes — date range filters ────────────────────────────
describe('GET /api/notes — date filters', () => {
  skipIfNoDb('I17: createdFrom — only notes created on or after the timestamp', async () => {
    const token = await registerAndLogin()
    const user  = await prisma.user.findUnique({ where: { email: 'alice@example.com' } })

    await prisma.note.create({ data: { userId: user!.id, title: 'Old', content: 'C', createdAt: new Date('2020-01-01') } })
    await prisma.note.create({ data: { userId: user!.id, title: 'New', content: 'C', createdAt: new Date('2024-01-01') } })

    const res = await request
      .get('/api/notes?createdFrom=2022-01-01T00:00:00Z')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].title).toBe('New')
  })

  skipIfNoDb('I18: createdTo — only notes created on or before the timestamp', async () => {
    const token = await registerAndLogin()
    const user  = await prisma.user.findUnique({ where: { email: 'alice@example.com' } })

    await prisma.note.create({ data: { userId: user!.id, title: 'Early', content: 'C', createdAt: new Date('2020-01-01') } })
    await prisma.note.create({ data: { userId: user!.id, title: 'Late',  content: 'C', createdAt: new Date('2024-01-01') } })

    const res = await request
      .get('/api/notes?createdTo=2022-01-01T00:00:00Z')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].title).toBe('Early')
  })

  skipIfNoDb('I19: createdFrom + createdTo range — notes within the window are returned', async () => {
    const token = await registerAndLogin()

    await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'InRange', content: 'C' })

    const from = new Date(Date.now() - 60_000).toISOString()
    const to   = new Date(Date.now() + 60_000).toISOString()

    const res = await request
      .get(`/api/notes?createdFrom=${from}&createdTo=${to}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBeGreaterThan(0)
  })

  skipIfNoDb('I20: updatedFrom + updatedTo range — notes updated within the window are returned', async () => {
    const token   = await registerAndLogin()
    const created = await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Upd', content: 'C' })
    const noteId  = created.body.data.id
    await request.patch(`/api/notes/${noteId}`).set('Authorization', `Bearer ${token}`).send({ title: 'Upd2' })

    const from = new Date(Date.now() - 60_000).toISOString()
    const to   = new Date(Date.now() + 60_000).toISOString()

    const res = await request
      .get(`/api/notes?updatedFrom=${from}&updatedTo=${to}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBeGreaterThan(0)
  })

  skipIfNoDb('I21: createdFrom in the far future — items=[], total=0', async () => {
    const token = await registerAndLogin()
    await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'T', content: 'C' })

    const future = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()

    const res = await request
      .get(`/api/notes?createdFrom=${future}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(0)
    expect(res.body.data.total).toBe(0)
  })

  skipIfNoDb('I22: inverted range (createdFrom > createdTo) — 200 with empty items, not 400', async () => {
    const token = await registerAndLogin()
    await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'T', content: 'C' })

    const res = await request
      .get('/api/notes?createdFrom=2024-12-31T00:00:00Z&createdTo=2024-01-01T00:00:00Z')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(0)
  })

  skipIfNoDb('I23: invalid date string — 400 validation error', async () => {
    const token = await registerAndLogin()

    const res = await request
      .get('/api/notes?createdFrom=not-a-date')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
