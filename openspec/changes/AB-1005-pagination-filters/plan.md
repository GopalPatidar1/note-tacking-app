# Technical Plan — AB-1005: Pagination & Filters

**Date:** 2026-06-11
**Ticket:** AB-1005
**Branch:** `feat/AB-1005-pagination-filters`
**Status:** AWAITING APPROVAL

---

## 0. Codebase Baseline (verified by reading actual files)

| Location | Current State |
|----------|--------------|
| `packages/shared/src/schemas/notes.ts` | `ListNotesQuerySchema` has `page`, `limit`, `sort`, `tagId` — **no date fields** |
| `apps/backend/src/repositories/note.repository.ts` | `findAll()` opts type has `{ page, limit, orderBy, tagId? }` — **no date filters in `where`** |
| `apps/backend/src/services/note.service.ts` | `list()` passes 4 fields to repo — **no date fields passed through** |
| `apps/backend/src/controllers/note.controller.ts` | Already calls `ListNotesQuerySchema.parse(req.query)` → service — **no changes needed** |
| `apps/backend/src/__tests__/note.service.test.ts` | U01–U12 exist; only one `list` test (U04) — **no date param assertions** |
| `apps/backend/src/__tests__/note.integration.test.ts` | I01–I16 exist for CRUD — **no date filter integration tests** |
| `openspec/openapi.yaml` | `GET /notes` has `page`, `limit`, `sort`, `tagId` — **no date params** |

**No DB migration needed** — `createdAt` and `updatedAt` already exist on the `notes` table.  
**No controller changes needed** — controller already parses `req.query` with `ListNotesQuerySchema` and passes result to service.

---

## 1. Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Date coercion location | `z.coerce.date()` in Zod schema | Query params arrive as strings; coercion at the Zod boundary means the entire stack below works with `Date` objects — no repeated `new Date(str)` in service or repo |
| Inverted-range behavior | Return empty set, not `400` | Simple API surface; avoids ambiguous error message. Consistent with how SQL handles impossible ranges. |
| Controller change | None | `noteController.list` already calls `ListNotesQuerySchema.parse(req.query)` — adding fields to the schema is enough |
| Service change | Pass-through only | No business logic on date ranges; service is a thin adapter from DTO to repo opts |
| `where` clause composition | Spread conditionally into `Prisma.NoteWhereInput` | Keeps the existing where-object pattern; avoids `undefined` fields in Prisma where (Prisma ignores `undefined` but explicit check is cleaner) |
| SORT_MAP type | Keep as `Record<string, object>` | Existing code uses this type with a cast — changing the type is refactoring outside this ticket's scope |

---

## 2. Files to Modify (no new files)

| File | Change |
|------|--------|
| `openspec/openapi.yaml` | Add 4 params to `components.parameters`; reference in `GET /notes` |
| `packages/shared/src/schemas/notes.ts` | Add 4 optional fields to `ListNotesQuerySchema` |
| `apps/backend/src/repositories/note.repository.ts` | Extend `opts` type; add date conditions to `where` |
| `apps/backend/src/services/note.service.ts` | Pass 4 new fields from query DTO to repo |
| `apps/backend/src/__tests__/note.service.test.ts` | Add list-specific unit tests for date params |
| `apps/backend/src/__tests__/note.integration.test.ts` | Add date-filter integration tests |

---

## 3. Exact Changes Per File

### 3a. `packages/shared/src/schemas/notes.ts`

Add four fields to `ListNotesQuerySchema` immediately after the `tagId` line:

```typescript
export const ListNotesQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort:  z.enum([
    'createdAt_asc', 'createdAt_desc',
    'updatedAt_asc', 'updatedAt_desc',
    'title_asc',     'title_desc',
  ]).default('updatedAt_desc'),
  tagId:       z.string().uuid().optional(),
  createdFrom: z.coerce.date().optional(),   // ← new
  createdTo:   z.coerce.date().optional(),   // ← new
  updatedFrom: z.coerce.date().optional(),   // ← new
  updatedTo:   z.coerce.date().optional(),   // ← new
})
```

`ListNotesQueryDTO` is a `z.infer` — no separate type change needed.

---

### 3b. `apps/backend/src/repositories/note.repository.ts`

**Extend `findAll` opts type** (add 4 optional date fields):

```typescript
findAll(
  userId: string,
  opts: {
    page:         number
    limit:        number
    orderBy:      Prisma.NoteOrderByWithRelationInput
    tagId?:       string
    createdFrom?: Date   // ← new
    createdTo?:   Date   // ← new
    updatedFrom?: Date   // ← new
    updatedTo?:   Date   // ← new
  },
)
```

**Extend `where` clause** (add after the tagId spread):

```typescript
const where: Prisma.NoteWhereInput = {
  userId,
  deletedAt: null,
  ...(opts.tagId
    ? { tags: { some: { id: opts.tagId, userId } } }
    : {}),
  // ← new: createdAt range
  ...(opts.createdFrom || opts.createdTo
    ? {
        createdAt: {
          ...(opts.createdFrom ? { gte: opts.createdFrom } : {}),
          ...(opts.createdTo   ? { lte: opts.createdTo }   : {}),
        },
      }
    : {}),
  // ← new: updatedAt range
  ...(opts.updatedFrom || opts.updatedTo
    ? {
        updatedAt: {
          ...(opts.updatedFrom ? { gte: opts.updatedFrom } : {}),
          ...(opts.updatedTo   ? { lte: opts.updatedTo }   : {}),
        },
      }
    : {}),
}
```

Both `findMany` and `count` share the same `where` — total count is accurate for filtered results.

---

### 3c. `apps/backend/src/services/note.service.ts`

In `list()` (lines 69–78), extend the `noteRepository.findAll` call:

```typescript
async list(userId: string, query: ListNotesQueryDTO): Promise<PaginatedNotesDTO> {
  const orderBy = (SORT_MAP[query.sort] ?? { updatedAt: 'desc' }) as object
  const { items, total } = await noteRepository.findAll(userId, {
    page:        query.page,
    limit:       query.limit,
    orderBy:     orderBy as Parameters<typeof noteRepository.findAll>[1]['orderBy'],
    tagId:       query.tagId,
    createdFrom: query.createdFrom,   // ← new
    createdTo:   query.createdTo,     // ← new
    updatedFrom: query.updatedFrom,   // ← new
    updatedTo:   query.updatedTo,     // ← new
  })
  return { items: items.map(toNoteDTO), total, page: query.page, limit: query.limit }
},
```

---

### 3d. `apps/backend/src/__tests__/note.service.test.ts`

The existing `noteService.list` describe block has only one test (U04, basic return shape). **Append** these tests inside that same `describe` block:

```typescript
// ─── list: param pass-through ─────────────────────────────────────────────────
it('U04b: default query — findAll called with page=1, limit=20, updatedAt_desc orderBy', async () => {
  vi.mocked(noteRepository.findAll).mockResolvedValue({ items: [], total: 0 })

  await noteService.list('user-1', { page: 1, limit: 20, sort: 'updatedAt_desc' })

  expect(noteRepository.findAll).toHaveBeenCalledWith('user-1', expect.objectContaining({
    page:    1,
    limit:   20,
    orderBy: { updatedAt: 'desc' },
  }))
})

it('U04c: custom page=2 limit=5 — passed through to findAll', async () => {
  vi.mocked(noteRepository.findAll).mockResolvedValue({ items: [], total: 0 })

  await noteService.list('user-1', { page: 2, limit: 5, sort: 'updatedAt_desc' })

  expect(noteRepository.findAll).toHaveBeenCalledWith('user-1', expect.objectContaining({
    page: 2, limit: 5,
  }))
})

it('U04d: sort=title_asc — mapped to { title: "asc" }', async () => {
  vi.mocked(noteRepository.findAll).mockResolvedValue({ items: [], total: 0 })

  await noteService.list('user-1', { page: 1, limit: 20, sort: 'title_asc' })

  expect(noteRepository.findAll).toHaveBeenCalledWith('user-1', expect.objectContaining({
    orderBy: { title: 'asc' },
  }))
})

it('U04e: tagId — passed through to findAll', async () => {
  vi.mocked(noteRepository.findAll).mockResolvedValue({ items: [], total: 0 })

  await noteService.list('user-1', { page: 1, limit: 20, sort: 'updatedAt_desc', tagId: 'tag-uuid' })

  expect(noteRepository.findAll).toHaveBeenCalledWith('user-1', expect.objectContaining({
    tagId: 'tag-uuid',
  }))
})

it('U04f: createdFrom + createdTo — both passed through to findAll', async () => {
  vi.mocked(noteRepository.findAll).mockResolvedValue({ items: [], total: 0 })
  const from = new Date('2024-01-01')
  const to   = new Date('2024-12-31')

  await noteService.list('user-1', { page: 1, limit: 20, sort: 'updatedAt_desc', createdFrom: from, createdTo: to })

  expect(noteRepository.findAll).toHaveBeenCalledWith('user-1', expect.objectContaining({
    createdFrom: from,
    createdTo:   to,
  }))
})

it('U04g: updatedFrom only — passed through; updatedTo is undefined', async () => {
  vi.mocked(noteRepository.findAll).mockResolvedValue({ items: [], total: 0 })
  const from = new Date('2024-06-01')

  await noteService.list('user-1', { page: 1, limit: 20, sort: 'updatedAt_desc', updatedFrom: from })

  const call = vi.mocked(noteRepository.findAll).mock.calls[0][1]
  expect(call.updatedFrom).toEqual(from)
  expect(call.updatedTo).toBeUndefined()
})

it('U04h: all four date params — all passed through to findAll', async () => {
  vi.mocked(noteRepository.findAll).mockResolvedValue({ items: [], total: 0 })
  const cFrom = new Date('2024-01-01')
  const cTo   = new Date('2024-06-30')
  const uFrom = new Date('2024-03-01')
  const uTo   = new Date('2024-09-30')

  await noteService.list('user-1', {
    page: 1, limit: 20, sort: 'updatedAt_desc',
    createdFrom: cFrom, createdTo: cTo,
    updatedFrom: uFrom, updatedTo: uTo,
  })

  expect(noteRepository.findAll).toHaveBeenCalledWith('user-1', expect.objectContaining({
    createdFrom: cFrom, createdTo: cTo,
    updatedFrom: uFrom, updatedTo: uTo,
  }))
})
```

---

### 3e. `apps/backend/src/__tests__/note.integration.test.ts`

Append a new `describe` block after the existing DELETE tests (I13–I16). All tests use the same `skipIfNoDb` guard and `cleanDb` lifecycle.

```typescript
// ─── I17–I23: GET /api/notes — date range filters ────────────────────────────
describe('GET /api/notes — date filters', () => {
  skipIfNoDb('I17: createdFrom — returns only notes created on or after the timestamp', async () => {
    const token = await registerAndLogin()

    const r1 = await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Old', content: 'C' })
    const cutoff = new Date(r1.body.data.createdAt)
    cutoff.setSeconds(cutoff.getSeconds() + 1)

    await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'New', content: 'C' })

    const res = await request
      .get(`/api/notes?createdFrom=${cutoff.toISOString()}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items.every((n: { title: string }) => n.title === 'New')).toBe(true)
  })

  skipIfNoDb('I18: createdTo — returns only notes created on or before the timestamp', async () => {
    const token = await registerAndLogin()

    const r1 = await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Early', content: 'C' })
    const cutoff = new Date(r1.body.data.createdAt)
    cutoff.setSeconds(cutoff.getSeconds() + 1)

    await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'Late', content: 'C' })

    const res = await request
      .get(`/api/notes?createdTo=${cutoff.toISOString()}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items.every((n: { title: string }) => n.title === 'Early')).toBe(true)
  })

  skipIfNoDb('I19: createdFrom + createdTo range — returns notes within window', async () => {
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

  skipIfNoDb('I20: updatedFrom + updatedTo range — returns notes updated within window', async () => {
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

  skipIfNoDb('I21: createdFrom in the future — returns empty items, total=0', async () => {
    const token = await registerAndLogin()
    await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: 'T', content: 'C' })

    const futureDate = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()

    const res = await request
      .get(`/api/notes?createdFrom=${futureDate}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(0)
    expect(res.body.data.total).toBe(0)
  })

  skipIfNoDb('I22: inverted range (createdFrom > createdTo) — returns empty, not 400', async () => {
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
```

Also add two tests to the existing `GET /api/notes` describe block (after I06):

```typescript
  skipIfNoDb('I17-pre: sort=page=2&limit=2 returns correct second page', async () => {
    const token = await registerAndLogin()
    for (let i = 1; i <= 3; i++) {
      await request.post('/api/notes').set('Authorization', `Bearer ${token}`).send({ title: `Note ${i}`, content: 'C' })
    }
    const res = await request.get('/api/notes?page=2&limit=2').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.page).toBe(2)
  })

  skipIfNoDb('I17-pre2: limit=200 — 400 validation error', async () => {
    const token = await registerAndLogin()
    const res = await request.get('/api/notes?limit=200').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  skipIfNoDb('I17-pre3: tagId belongs to another user — returns empty (IDOR guard)', async () => {
    const tokenA = await registerAndLogin('alice@example.com')
    const tokenB = await registerAndLogin('bob@example.com')
    const userB  = await prisma.user.findUnique({ where: { email: 'bob@example.com' } })
    const bobTag = await prisma.tag.create({ data: { userId: userB!.id, name: 'BobTag', color: '#000' } })

    await request.post('/api/notes').set('Authorization', `Bearer ${tokenA}`).send({ title: 'Alice Note', content: 'C' })

    const res = await request.get(`/api/notes?tagId=${bobTag.id}`).set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(0)
  })
```

---

### 3f. `openspec/openapi.yaml`

**Add to `components.parameters`** (after `shareTokenParam`):

```yaml
  createdFromParam:
    in: query
    name: createdFrom
    schema:
      type: string
      format: date-time
    description: Return notes created on or after this timestamp (ISO 8601)
    example: "2024-01-01T00:00:00Z"

  createdToParam:
    in: query
    name: createdTo
    schema:
      type: string
      format: date-time
    description: Return notes created on or before this timestamp (ISO 8601)
    example: "2024-12-31T23:59:59Z"

  updatedFromParam:
    in: query
    name: updatedFrom
    schema:
      type: string
      format: date-time
    description: Return notes updated on or after this timestamp (ISO 8601)
    example: "2024-06-01T00:00:00Z"

  updatedToParam:
    in: query
    name: updatedTo
    schema:
      type: string
      format: date-time
    description: Return notes updated on or before this timestamp (ISO 8601)
    example: "2024-06-30T23:59:59Z"
```

**Add to `GET /notes` parameters** (after the `tagId` inline param):

```yaml
        - $ref: "#/components/parameters/createdFromParam"
        - $ref: "#/components/parameters/createdToParam"
        - $ref: "#/components/parameters/updatedFromParam"
        - $ref: "#/components/parameters/updatedToParam"
```

---

## 4. TypeScript Interface Changes

### `ListNotesQueryDTO` (auto-updated via `z.infer`)

Before (implicit from Zod):
```typescript
{ page: number; limit: number; sort: NoteSortValue; tagId?: string }
```

After (implicit from Zod):
```typescript
{
  page: number; limit: number; sort: NoteSortValue; tagId?: string;
  createdFrom?: Date; createdTo?: Date;
  updatedFrom?: Date; updatedTo?: Date;
}
```

No other DTO or interface changes — response shape is unchanged.

---

## 5. Quality Gates

Run in this exact order:

```bash
# 1. Type-check entire monorepo
pnpm tsc --noEmit

# 2. Lint backend
pnpm --filter backend lint

# 3. Backend unit tests
pnpm --filter backend test

# 4. Backend build
pnpm --filter backend build
```

No frontend gates — AB-1005 is backend-only. No migration gate — no schema changes.

---

## 6. Open Questions Resolved

| # | Question | Decision |
|---|----------|----------|
| Q1 | Inverted range → 400 or empty? | **Empty set, not 400** — simpler API, no ambiguous error |
| Q2 | Date coercion — Zod or manual? | **`z.coerce.date()` in Zod** — clean `Date` objects downstream |
| Q3 | Controller changes? | **None** — already calls `ListNotesQuerySchema.parse(req.query)` |
| Q4 | New test file or append? | **Append to existing files** — consistent with project pattern |
| Q5 | Multi-tag filtering? | **Out of scope** — single `tagId` from AB-1004 unchanged |
| Q6 | Response shape changes? | **None** — `{ items, total, page, limit }` unchanged |
