/**
 * Integration tests for version history endpoints.
 *
 * Setup: same as note.integration.test.ts
 *   1. createdb note_taking_test
 *   2. Copy .env.example → .env.test, set DATABASE_URL
 *   3. dotenv -e .env.test -- npx prisma migrate deploy
 *   4. pnpm test
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

async function createNoteWithVersions(token: string) {
  // Create note (version 1)
  const created = await request
    .post('/api/notes')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'My Note', content: '<p>v1</p>' })
  const noteId = created.body.data.id as string

  // Update note (version 2)
  await request
    .patch(`/api/notes/${noteId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'My Note v2', content: '<p>v2</p>' })

  return noteId
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

// ─── GET /api/notes/:id/versions ─────────────────────────────────────────────

describe('GET /api/notes/:id/versions', () => {
  skipIfNoDb('I01: 200 with paginated version list (newest first)', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNoteWithVersions(token)

    const res = await request
      .get(`/api/notes/${noteId}/versions`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(2)
    expect(res.body.data.items).toHaveLength(2)
    expect(res.body.data.items[0].versionNumber).toBe(2)
    expect(res.body.data.items[1].versionNumber).toBe(1)
  })

  skipIfNoDb('I02: 401 without auth', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNoteWithVersions(token)

    const res = await request.get(`/api/notes/${noteId}/versions`)

    expect(res.status).toBe(401)
  })

  skipIfNoDb('I03: 404 when note does not exist', async () => {
    const token = await registerAndLogin()

    const res = await request
      .get('/api/notes/00000000-0000-0000-0000-000000000000/versions')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I09: 403 when note belongs to a different user', async () => {
    const token1 = await registerAndLogin('alice@example.com')
    const token2 = await registerAndLogin('bob@example.com')
    const noteId = await createNoteWithVersions(token1)

    const res = await request
      .get(`/api/notes/${noteId}/versions`)
      .set('Authorization', `Bearer ${token2}`)

    expect(res.status).toBe(403)
  })
})

// ─── GET /api/notes/:id/versions/:versionId ──────────────────────────────────

describe('GET /api/notes/:id/versions/:versionId', () => {
  skipIfNoDb('I04: 200 with specific version snapshot', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNoteWithVersions(token)

    const listRes = await request
      .get(`/api/notes/${noteId}/versions`)
      .set('Authorization', `Bearer ${token}`)
    const versionId = listRes.body.data.items[1].id as string // v1

    const res = await request
      .get(`/api/notes/${noteId}/versions/${versionId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.versionNumber).toBe(1)
    expect(res.body.data.content).toBe('<p>v1</p>')
  })

  skipIfNoDb('I05: 404 when version not found', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNoteWithVersions(token)

    const res = await request
      .get(`/api/notes/${noteId}/versions/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I11: 401 without auth', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNoteWithVersions(token)

    const listRes = await request
      .get(`/api/notes/${noteId}/versions`)
      .set('Authorization', `Bearer ${token}`)
    const versionId = listRes.body.data.items[0].id as string

    const res = await request.get(`/api/notes/${noteId}/versions/${versionId}`)

    expect(res.status).toBe(401)
  })

  skipIfNoDb('I10: 403 when note belongs to a different user', async () => {
    const token1 = await registerAndLogin('alice@example.com')
    const token2 = await registerAndLogin('bob@example.com')
    const noteId = await createNoteWithVersions(token1)

    const listRes = await request
      .get(`/api/notes/${noteId}/versions`)
      .set('Authorization', `Bearer ${token1}`)
    const versionId = listRes.body.data.items[0].id as string

    const res = await request
      .get(`/api/notes/${noteId}/versions/${versionId}`)
      .set('Authorization', `Bearer ${token2}`)

    expect(res.status).toBe(403)
  })
})

// ─── POST /api/notes/:id/versions/:versionId/restore ─────────────────────────

describe('POST /api/notes/:id/versions/:versionId/restore', () => {
  skipIfNoDb('I06: 200, note content updated to v1, new snapshot created', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNoteWithVersions(token)

    const listRes = await request
      .get(`/api/notes/${noteId}/versions`)
      .set('Authorization', `Bearer ${token}`)
    const v1Id = listRes.body.data.items[1].id as string // oldest = v1

    const versionsBefore = await prisma.noteVersion.count({ where: { noteId } })

    const res = await request
      .post(`/api/notes/${noteId}/versions/${v1Id}/restore`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.content).toBe('<p>v1</p>')
    expect(res.body.data.title).toBe('My Note')

    const versionsAfter = await prisma.noteVersion.count({ where: { noteId } })
    expect(versionsAfter).toBe(versionsBefore + 1)
  })

  skipIfNoDb('I07: 401 without auth', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNoteWithVersions(token)

    const listRes = await request
      .get(`/api/notes/${noteId}/versions`)
      .set('Authorization', `Bearer ${token}`)
    const v1Id = listRes.body.data.items[1].id as string

    const res = await request.post(`/api/notes/${noteId}/versions/${v1Id}/restore`)

    expect(res.status).toBe(401)
  })

  skipIfNoDb('I08: 403 when note belongs to a different user', async () => {
    const token1 = await registerAndLogin('alice@example.com')
    const token2 = await registerAndLogin('bob@example.com')
    const noteId = await createNoteWithVersions(token1)

    const listRes = await request
      .get(`/api/notes/${noteId}/versions`)
      .set('Authorization', `Bearer ${token1}`)
    const v1Id = listRes.body.data.items[1].id as string

    const res = await request
      .post(`/api/notes/${noteId}/versions/${v1Id}/restore`)
      .set('Authorization', `Bearer ${token2}`)

    expect(res.status).toBe(403)
  })
})
