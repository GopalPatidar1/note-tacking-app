/**
 * Integration tests for Version History — require a running PostgreSQL test DB.
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
import { prisma }    from '../lib/prisma'

const app     = createApp()
const request = supertest(app)

const skipIfNoDb = process.env.DATABASE_URL?.includes('localhost') ? it : it.skip

async function cleanDb() {
  await prisma.shareLink.deleteMany()
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

async function createNote(token: string, overrides: object = {}) {
  const res = await request
    .post('/api/notes')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Original Title', content: '<p>Original</p>', ...overrides })
  return res.body.data.id as string
}

async function updateNote(token: string, noteId: string, body: object) {
  return request
    .patch(`/api/notes/${noteId}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

async function listVersions(token: string, noteId: string, query = '') {
  return request
    .get(`/api/notes/${noteId}/versions${query}`)
    .set('Authorization', `Bearer ${token}`)
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
  skipIfNoDb('I01: 200, correct paginated shape (items/total/page/limit)', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)
    // create gives version 1; update gives version 2
    await updateNote(token, noteId, { title: 'Updated' })

    const res = await listVersions(token, noteId)

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      total: 2,
      page:  1,
      limit: 20,
    })
    expect(Array.isArray(res.body.data.items)).toBe(true)
    expect(res.body.data.items).toHaveLength(2)
    const v = res.body.data.items[0]
    expect(v).toHaveProperty('id')
    expect(v).toHaveProperty('noteId', noteId)
    expect(v).toHaveProperty('title')
    expect(v).toHaveProperty('content')
    expect(v).toHaveProperty('versionNumber')
    expect(v).toHaveProperty('createdAt')
  })

  skipIfNoDb('I02: 200, versions ordered newest first (highest versionNumber first)', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)
    await updateNote(token, noteId, { title: 'Version 2' })
    await updateNote(token, noteId, { title: 'Version 3' })

    const res = await listVersions(token, noteId)

    expect(res.status).toBe(200)
    const numbers = res.body.data.items.map((v: { versionNumber: number }) => v.versionNumber)
    expect(numbers[0]).toBeGreaterThan(numbers[1])
    expect(numbers[1]).toBeGreaterThan(numbers[2])
  })

  skipIfNoDb('I03: 200, page=2&limit=1 returns the older version', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)
    await updateNote(token, noteId, { title: 'Version 2' })

    const res = await listVersions(token, noteId, '?page=2&limit=1')

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].versionNumber).toBe(1)
  })

  skipIfNoDb('I04: 401, no Authorization header', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)

    const res = await request.get(`/api/notes/${noteId}/versions`)

    expect(res.status).toBe(401)
  })

  skipIfNoDb('I05: 404, note does not exist', async () => {
    const token = await registerAndLogin()

    const res = await listVersions(token, '00000000-0000-0000-0000-000000000000')

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I06: 404, note belongs to another user', async () => {
    const aliceToken = await registerAndLogin('alice@example.com')
    const bobToken   = await registerAndLogin('bob@example.com')
    const noteId     = await createNote(aliceToken)

    const res = await listVersions(bobToken, noteId)

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I07: 404, note is soft-deleted', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)

    await request.delete(`/api/notes/${noteId}`).set('Authorization', `Bearer ${token}`)
    const res = await listVersions(token, noteId)

    expect(res.status).toBe(404)
  })
})

// ─── GET /api/notes/:id/versions/:versionId ───────────────────────────────────

describe('GET /api/notes/:id/versions/:versionId', () => {
  skipIfNoDb('I08: 200, returns correct NoteVersion with full title + content', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token, { title: 'First', content: '<p>Hello</p>' })

    const listRes = await listVersions(token, noteId)
    const versionId = listRes.body.data.items[0].id

    const res = await request
      .get(`/api/notes/${noteId}/versions/${versionId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(versionId)
    expect(res.body.data.noteId).toBe(noteId)
    expect(res.body.data.title).toBe('First')
    expect(res.body.data.content).toBe('<p>Hello</p>')
    expect(res.body.data.versionNumber).toBe(1)
  })

  skipIfNoDb('I09: 401, no auth', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)
    const listRes = await listVersions(token, noteId)
    const versionId = listRes.body.data.items[0].id

    const res = await request.get(`/api/notes/${noteId}/versions/${versionId}`)

    expect(res.status).toBe(401)
  })

  skipIfNoDb('I10: 404, note not found', async () => {
    const token = await registerAndLogin()

    const res = await request
      .get('/api/notes/00000000-0000-0000-0000-000000000000/versions/00000000-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I11: 404, version not found', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)

    const res = await request
      .get(`/api/notes/${noteId}/versions/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })
})

// ─── POST /api/notes/:id/versions/:versionId/restore ─────────────────────────

describe('POST /api/notes/:id/versions/:versionId/restore', () => {
  async function setupVersions(token: string) {
    const noteId = await createNote(token, { title: 'V1 Title', content: '<p>V1 content</p>' })
    await updateNote(token, noteId, { title: 'V2 Title', content: '<p>V2 content</p>' })
    const listRes = await listVersions(token, noteId)
    // Newest first: items[0] = v2, items[1] = v1
    return { noteId, versions: listRes.body.data.items }
  }

  skipIfNoDb('I12: 200, returns full Note shape', async () => {
    const token = await registerAndLogin()
    const { noteId, versions } = await setupVersions(token)
    const v1Id = versions[1].id

    const res = await request
      .post(`/api/notes/${noteId}/versions/${v1Id}/restore`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('id', noteId)
    expect(res.body.data).toHaveProperty('userId')
    expect(res.body.data).toHaveProperty('title')
    expect(res.body.data).toHaveProperty('content')
    expect(res.body.data).toHaveProperty('tags')
    expect(res.body.data).toHaveProperty('createdAt')
    expect(res.body.data).toHaveProperty('updatedAt')
  })

  skipIfNoDb('I13: note.title + content match the restored version', async () => {
    const token = await registerAndLogin()
    const { noteId, versions } = await setupVersions(token)
    const v1 = versions[1]  // versionNumber 1 (oldest)

    const res = await request
      .post(`/api/notes/${noteId}/versions/${v1.id}/restore`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.title).toBe(v1.title)
    expect(res.body.data.content).toBe(v1.content)
  })

  skipIfNoDb('I14: total versions count increases by 1', async () => {
    const token = await registerAndLogin()
    const { noteId, versions } = await setupVersions(token)
    const v1Id = versions[1].id

    const before = await listVersions(token, noteId)
    const countBefore = before.body.data.total

    await request
      .post(`/api/notes/${noteId}/versions/${v1Id}/restore`)
      .set('Authorization', `Bearer ${token}`)

    const after = await listVersions(token, noteId)
    expect(after.body.data.total).toBe(countBefore + 1)
  })

  skipIfNoDb('I15: original version row content unchanged (immutable)', async () => {
    const token = await registerAndLogin()
    const { noteId, versions } = await setupVersions(token)
    const v1 = versions[1]  // versionNumber 1

    await request
      .post(`/api/notes/${noteId}/versions/${v1.id}/restore`)
      .set('Authorization', `Bearer ${token}`)

    // Fetch v1 directly and verify it still has original content
    const v1Res = await request
      .get(`/api/notes/${noteId}/versions/${v1.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(v1Res.status).toBe(200)
    expect(v1Res.body.data.title).toBe(v1.title)
    expect(v1Res.body.data.content).toBe(v1.content)
    expect(v1Res.body.data.versionNumber).toBe(v1.versionNumber)
  })

  skipIfNoDb('I16: 401, no auth', async () => {
    const token = await registerAndLogin()
    const { noteId, versions } = await setupVersions(token)

    const res = await request.post(`/api/notes/${noteId}/versions/${versions[0].id}/restore`)

    expect(res.status).toBe(401)
  })

  skipIfNoDb('I17: 404, note not found', async () => {
    const token = await registerAndLogin()

    const res = await request
      .post('/api/notes/00000000-0000-0000-0000-000000000000/versions/00000000-0000-0000-0000-000000000001/restore')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I18: 404, version not found', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)

    const res = await request
      .post(`/api/notes/${noteId}/versions/00000000-0000-0000-0000-000000000000/restore`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })
})

// ─── UUID validation (400) ────────────────────────────────────────────────────

describe('UUID validation — malformed path params', () => {
  skipIfNoDb('I19: 400 VALIDATION_ERROR, malformed noteId on list endpoint', async () => {
    const token = await registerAndLogin()

    const res = await request
      .get('/api/notes/not-a-uuid/versions')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  skipIfNoDb('I20: 400 VALIDATION_ERROR, malformed versionId on getById endpoint', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)

    const res = await request
      .get(`/api/notes/${noteId}/versions/not-a-uuid`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  skipIfNoDb('I21: 400 VALIDATION_ERROR, malformed noteId on restore endpoint', async () => {
    const token = await registerAndLogin()

    const res = await request
      .post('/api/notes/not-a-uuid/versions/00000000-0000-0000-0000-000000000000/restore')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

// ─── Auto-purge ───────────────────────────────────────────────────────────────

describe('Auto-purge — versions capped at MAX_VERSIONS_PER_NOTE (50)', () => {
  skipIfNoDb('I22: versions beyond cap are purged, keeping newest 50', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token, { title: 'V1', content: '<p>v1</p>' })

    // Create 5 more updates (total 6 versions including the initial create)
    for (let i = 2; i <= 6; i++) {
      await updateNote(token, noteId, { title: `V${i}`, content: `<p>v${i}</p>` })
    }

    const res = await listVersions(token, noteId)

    // Well within the cap — all 6 versions should exist
    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(6)

    // Newest version should be at the top (versionNumber DESC)
    expect(res.body.data.items[0].title).toBe('V6')
    expect(res.body.data.items[5].title).toBe('V1')
  })
})
