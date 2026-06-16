/**
 * Integration tests for Search — require a running PostgreSQL test DB.
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

async function createNote(
  token: string,
  title: string,
  content: string,
  tagIds: string[] = [],
) {
  const res = await request
    .post('/api/notes')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, content, tagIds })
  return res.body.data
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

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('GET /api/search — auth', () => {
  skipIfNoDb('I10: 401 when no auth token provided', async () => {
    const res = await request.get('/api/search?q=roadmap')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe('GET /api/search — validation', () => {
  skipIfNoDb('I08: 400 VALIDATION_ERROR when q param is missing', async () => {
    const token = await registerAndLogin()
    const res = await request
      .get('/api/search')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  skipIfNoDb('I09: 400 VALIDATION_ERROR when q is whitespace only', async () => {
    const token = await registerAndLogin()
    const res = await request
      .get('/api/search?q=   ')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

// ─── Basic search (title-only ILIKE) ─────────────────────────────────────────

describe('GET /api/search — basic results', () => {
  skipIfNoDb('I01: 200 — returns note whose title contains keyword', async () => {
    const token = await registerAndLogin()
    await createNote(token, 'roadmap meeting notes', 'team sync')

    const res = await request
      .get('/api/search?q=roadmap')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].title).toBe('roadmap meeting notes')
    expect(res.body.data.total).toBe(1)
    expect(res.body.data.query).toBe('roadmap')
  })

  skipIfNoDb('I02: headline contains <b> highlight tags wrapping the keyword', async () => {
    const token = await registerAndLogin()
    await createNote(token, 'roadmap meeting notes', 'team sync')

    const res = await request
      .get('/api/search?q=roadmap')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items[0].headline).toContain('<b>roadmap</b>')
  })

  skipIfNoDb('I05: 200 with empty items array when no title match found', async () => {
    const token = await registerAndLogin()
    await createNote(token, 'roadmap note', 'team sync')

    const res = await request
      .get('/api/search?q=xyz_nomatch_12345')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(0)
    expect(res.body.data.total).toBe(0)
  })
})

// ─── Scoping ──────────────────────────────────────────────────────────────────

describe('GET /api/search — scoping', () => {
  skipIfNoDb('I03: excludes soft-deleted notes', async () => {
    const token = await registerAndLogin()
    const note = await createNote(token, 'roadmap deleted note', 'some content')

    await request
      .delete(`/api/notes/${note.id}`)
      .set('Authorization', `Bearer ${token}`)

    const res = await request
      .get('/api/search?q=roadmap')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(0)
  })

  skipIfNoDb('I04: excludes notes belonging to another user (IDOR)', async () => {
    const aliceToken = await registerAndLogin('alice@example.com')
    const bobToken   = await registerAndLogin('bob@example.com')

    await createNote(aliceToken, 'Alice roadmap note', 'Alice content')

    const res = await request
      .get('/api/search?q=roadmap')
      .set('Authorization', `Bearer ${bobToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(0)
  })
})

// ─── Pagination ───────────────────────────────────────────────────────────────

describe('GET /api/search — pagination', () => {
  skipIfNoDb('I06: returns correct page slice with limit=1 page=2', async () => {
    const token = await registerAndLogin()
    await createNote(token, 'First hello note',  'content one')
    await createNote(token, 'Second hello note', 'content two')
    await createNote(token, 'Third hello note',  'content three')

    const res = await request
      .get('/api/search?q=hello&page=2&limit=1')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.page).toBe(2)
    expect(res.body.data.limit).toBe(1)
  })

  skipIfNoDb('I07: total reflects full match count, not page size', async () => {
    const token = await registerAndLogin()
    await createNote(token, 'First hello note',  'content one')
    await createNote(token, 'Second hello note', 'content two')
    await createNote(token, 'Third hello note',  'content three')

    const res = await request
      .get('/api/search?q=hello&page=1&limit=1')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.total).toBe(3)
  })
})

// ─── Tags in results ──────────────────────────────────────────────────────────

describe('GET /api/search — tags', () => {
  skipIfNoDb('I11: results include correct tags (name + color only)', async () => {
    const token = await registerAndLogin()

    const tagRes = await request
      .post('/api/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Work', color: '#3B82F6' })
    const tagId = tagRes.body.data.id

    await createNote(token, 'Tagged roadmap note', 'planning session', [tagId])

    const res = await request
      .get('/api/search?q=roadmap')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)

    const tags = res.body.data.items[0].tags
    expect(tags).toHaveLength(1)
    expect(tags[0].name).toBe('Work')
    expect(tags[0].color).toBe('#3B82F6')
    expect(tags[0].id).toBeUndefined()
    expect(tags[0].userId).toBeUndefined()
  })
})

// ─── Ordering ─────────────────────────────────────────────────────────────────

describe('GET /api/search — ordering', () => {
  skipIfNoDb('I12: results ordered by updatedAt DESC (most recently created first)', async () => {
    const token = await registerAndLogin()

    await createNote(token, 'asad alpha note', 'content a')
    await createNote(token, 'asad beta note',  'content b')

    const res = await request
      .get('/api/search?q=asad')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(2)
    expect(res.body.data.items[0].title).toBe('asad beta note')
  })
})

// ─── Partial match (core AC) ──────────────────────────────────────────────────

describe('GET /api/search — partial match', () => {
  skipIfNoDb('I13: partial match — query "asad" matches title "asad123"', async () => {
    const token = await registerAndLogin()
    await createNote(token, 'asad123', 'some content')

    const res = await request
      .get('/api/search?q=asad')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].title).toBe('asad123')
    expect(res.body.data.items[0].headline).toBe('<b>asad</b>123')
  })

  skipIfNoDb('I14: case-insensitive — query "ASAD" matches title "hello asad world"', async () => {
    const token = await registerAndLogin()
    await createNote(token, 'hello asad world', 'some content')

    const res = await request
      .get('/api/search?q=ASAD')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].title).toBe('hello asad world')
  })
})
