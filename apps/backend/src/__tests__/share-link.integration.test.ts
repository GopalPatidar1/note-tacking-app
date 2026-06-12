/**
 * Integration tests for Sharing — require a running PostgreSQL test DB.
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

async function createNote(token: string) {
  const res = await request
    .post('/api/notes')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Test Note', content: '<p>Hello</p>' })
  return res.body.data.id as string
}

async function createShareLink(token: string, noteId: string, body: object = {}) {
  return request
    .post(`/api/notes/${noteId}/share`)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
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

// ─── POST /api/notes/:id/share ───────────────────────────────────────────────

describe('POST /api/notes/:id/share', () => {
  skipIfNoDb('I01: 201, correct ShareLink shape returned', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)
    const res    = await createShareLink(token, noteId)

    expect(res.status).toBe(201)
    expect(res.body.data.token).toBeDefined()
    expect(res.body.data.token).toHaveLength(64)
    expect(res.body.data.viewCount).toBe(0)
    expect(res.body.data.revokedAt).toBeNull()
    expect(res.body.data.noteId).toBe(noteId)
  })

  skipIfNoDb('I02: 201, expiresAt stored when provided', async () => {
    const token   = await registerAndLogin()
    const noteId  = await createNote(token)
    const expires = new Date(Date.now() + 86_400_000).toISOString()
    const res     = await createShareLink(token, noteId, { expiresAt: expires })

    expect(res.status).toBe(201)
    expect(res.body.data.expiresAt).toBe(expires)
  })

  skipIfNoDb('I03: 201, expiresAt null when body omitted', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)
    const res    = await createShareLink(token, noteId)

    expect(res.status).toBe(201)
    expect(res.body.data.expiresAt).toBeNull()
  })

  skipIfNoDb('I04: 201, multiple active links allowed for same note', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)

    const res1 = await createShareLink(token, noteId)
    const res2 = await createShareLink(token, noteId)

    expect(res1.status).toBe(201)
    expect(res2.status).toBe(201)
    expect(res1.body.data.token).not.toBe(res2.body.data.token)
  })

  skipIfNoDb('I05: 400, invalid expiresAt format', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)
    const res    = await createShareLink(token, noteId, { expiresAt: 'not-a-date' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  skipIfNoDb('I06: 401, no auth', async () => {
    const token  = await registerAndLogin()
    const noteId = await createNote(token)
    const res    = await request.post(`/api/notes/${noteId}/share`).send({})

    expect(res.status).toBe(401)
  })

  skipIfNoDb('I07: 404, note not found', async () => {
    const token = await registerAndLogin()
    const res   = await createShareLink(token, '00000000-0000-0000-0000-000000000000')

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I08: 404, note belongs to another user', async () => {
    const aliceToken = await registerAndLogin('alice@example.com')
    const bobToken   = await registerAndLogin('bob@example.com')
    const noteId     = await createNote(aliceToken)

    const res = await createShareLink(bobToken, noteId)

    expect(res.status).toBe(404)
  })
})

// ─── GET /api/public/:token ───────────────────────────────────────────────────

describe('GET /api/public/:token', () => {
  skipIfNoDb('I09: 200, returns PublicNote with title, content, tags', async () => {
    const token  = await registerAndLogin()
    const tagRes = await request
      .post('/api/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Work', color: '#3B82F6' })
    const noteId = (await request
      .post('/api/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Public Note', content: '<p>Hi</p>', tagIds: [tagRes.body.data.id] })
    ).body.data.id

    const shareRes = await createShareLink(token, noteId)
    const shareToken = shareRes.body.data.token

    const res = await request.get(`/api/public/${shareToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.title).toBe('Public Note')
    expect(res.body.data.content).toBe('<p>Hi</p>')
    expect(res.body.data.tags).toHaveLength(1)
    expect(res.body.data.tags[0]).toEqual({ name: 'Work', color: '#3B82F6' })
  })

  skipIfNoDb('I10: 200, viewCount increments on each call', async () => {
    const token      = await registerAndLogin()
    const noteId     = await createNote(token)
    const shareRes   = await createShareLink(token, noteId)
    const shareToken = shareRes.body.data.token

    await request.get(`/api/public/${shareToken}`)
    await request.get(`/api/public/${shareToken}`)
    const res3 = await request.get(`/api/public/${shareToken}`)

    const link = await prisma.shareLink.findUnique({ where: { token: shareToken } })
    expect(link?.viewCount).toBe(3)
    expect(res3.status).toBe(200)
  })

  skipIfNoDb('I11: 200, succeeds with no Authorization header', async () => {
    const token      = await registerAndLogin()
    const noteId     = await createNote(token)
    const shareRes   = await createShareLink(token, noteId)
    const shareToken = shareRes.body.data.token

    const res = await request.get(`/api/public/${shareToken}`)

    expect(res.status).toBe(200)
  })

  skipIfNoDb('I12: 404 SHARE_LINK_INVALID, token not found', async () => {
    const res = await request.get('/api/public/nonexistenttoken')

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('SHARE_LINK_INVALID')
  })

  skipIfNoDb('I13: 404 SHARE_LINK_INVALID, token revoked', async () => {
    const token      = await registerAndLogin()
    const noteId     = await createNote(token)
    const shareRes   = await createShareLink(token, noteId)
    const shareLinkId = shareRes.body.data.id
    const shareToken  = shareRes.body.data.token

    await request
      .delete(`/api/share/${shareLinkId}`)
      .set('Authorization', `Bearer ${token}`)

    const res = await request.get(`/api/public/${shareToken}`)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('SHARE_LINK_INVALID')
  })

  skipIfNoDb('I14: 404 SHARE_LINK_INVALID, expiresAt in the past', async () => {
    const token      = await registerAndLogin()
    const noteId     = await createNote(token)
    const pastDate   = new Date(Date.now() - 86_400_000).toISOString()
    const shareRes   = await createShareLink(token, noteId, { expiresAt: pastDate })
    const shareToken = shareRes.body.data.token

    const res = await request.get(`/api/public/${shareToken}`)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('SHARE_LINK_INVALID')
  })

  skipIfNoDb('I15: 404 SHARE_LINK_INVALID, note soft-deleted', async () => {
    const token      = await registerAndLogin()
    const noteId     = await createNote(token)
    const shareRes   = await createShareLink(token, noteId)
    const shareToken = shareRes.body.data.token

    await request.delete(`/api/notes/${noteId}`).set('Authorization', `Bearer ${token}`)

    const res = await request.get(`/api/public/${shareToken}`)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('SHARE_LINK_INVALID')
  })
})

// ─── DELETE /api/share/:id ────────────────────────────────────────────────────

describe('DELETE /api/share/:id', () => {
  skipIfNoDb('I16: 200, share link revoked', async () => {
    const token       = await registerAndLogin()
    const noteId      = await createNote(token)
    const shareRes    = await createShareLink(token, noteId)
    const shareLinkId = shareRes.body.data.id

    const res = await request
      .delete(`/api/share/${shareLinkId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.message).toBe('Share link revoked')

    const link = await prisma.shareLink.findUnique({ where: { id: shareLinkId } })
    expect(link?.revokedAt).not.toBeNull()
  })

  skipIfNoDb('I17: 200, subsequent GET /public/:token returns 404', async () => {
    const token       = await registerAndLogin()
    const noteId      = await createNote(token)
    const shareRes    = await createShareLink(token, noteId)
    const shareLinkId = shareRes.body.data.id
    const shareToken  = shareRes.body.data.token

    await request
      .delete(`/api/share/${shareLinkId}`)
      .set('Authorization', `Bearer ${token}`)

    const res = await request.get(`/api/public/${shareToken}`)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('SHARE_LINK_INVALID')
  })

  skipIfNoDb('I18: 401, no auth', async () => {
    const res = await request.delete('/api/share/00000000-0000-0000-0000-000000000000')

    expect(res.status).toBe(401)
  })

  skipIfNoDb('I19: 404, share link not found', async () => {
    const token = await registerAndLogin()
    const res   = await request
      .delete('/api/share/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  skipIfNoDb('I20: 403, share link belongs to another user\'s note', async () => {
    const aliceToken  = await registerAndLogin('alice@example.com')
    const bobToken    = await registerAndLogin('bob@example.com')
    const noteId      = await createNote(aliceToken)
    const shareRes    = await createShareLink(aliceToken, noteId)
    const shareLinkId = shareRes.body.data.id

    const res = await request
      .delete(`/api/share/${shareLinkId}`)
      .set('Authorization', `Bearer ${bobToken}`)

    expect(res.status).toBe(403)
  })
})
