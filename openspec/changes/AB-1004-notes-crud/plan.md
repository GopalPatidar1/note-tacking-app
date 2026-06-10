# Technical Plan — AB-1004: Notes CRUD

**Date:** 2026-06-10
**Ticket:** AB-1004
**Branch:** `feat/AB-1004-notes-crud`
**Status:** AWAITING APPROVAL

---

## 0. Codebase Baseline

| Location | Current State |
|----------|--------------|
| `apps/backend/prisma/schema.prisma` | Only `users` + `refresh_tokens` — no notes, tags, or versions |
| `apps/backend/src/routes/` | Only `auth.routes.ts` — no notes router |
| `apps/backend/src/app.ts` | Only `/api/auth` mounted |
| `packages/shared/src/schemas/` | Only `auth.ts` — no note schemas |
| `packages/shared/src/constants/` | Only `auth.ts` — no pagination defaults |
| `apps/backend/src/errors/domain-errors.ts` | Has `NotFoundError`, `ForbiddenError` already — **reuse** |

---

## 1. Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Version snapshot atomicity | `prisma.$transaction` in service | Note + version must be atomic; a failed version write must roll back the note save |
| Transaction client threading | Repositories accept optional `tx?: Prisma.TransactionClient` | Keeps Prisma calls in repositories; service only orchestrates the transaction boundary |
| Tag ownership enforcement | Service verifies all `tagIds` belong to `userId` before write | Prevents IDOR; user A must not be able to attach user B's tag |
| Soft delete idempotency | Return `200` if note already has `deletedAt` set | Desired post-condition (note is deleted) is already satisfied; consistent with logout idempotency pattern |
| Sort + filter scope | Include in AB-1004 (not deferred to AB-1005) | OpenAPI spec already defines these params; splitting would leave a broken API surface |
| tagId filter IDOR guard | Repository `where` clause includes `tags: { some: { id: tagId, userId } }` | Prevents returning notes via another user's tagId |
| Pagination constants | `packages/shared/src/constants/notes.ts` | Frontend (AB-1011+) will reuse these defaults |
| Note response — tag shape | `{ id, userId, name, color }` — no `noteCount` in note response | `noteCount` is a tag-list concern (AB-1006); including it here requires an extra count query per tag |

---

## 2. DB Changes (Prisma Schema)

**Backward compatible:** adding new models only — no changes to `users` or `refresh_tokens`.

### New models to add to `prisma/schema.prisma`

```prisma
model Note {
  id        String    @id @default(uuid())
  userId    String
  title     String
  content   String
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  user     User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  tags     Tag[]        @relation("NoteTags")
  versions NoteVersion[]

  @@index([userId])
  @@map("notes")
}

model Tag {
  id     String @id @default(uuid())
  userId String
  name   String
  color  String

  user  User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  notes Note[]     @relation("NoteTags")

  @@unique([userId, name])
  @@index([userId])
  @@map("tags")
}

model NoteVersion {
  id            String   @id @default(uuid())
  noteId        String
  title         String
  content       String
  versionNumber Int
  createdAt     DateTime @default(now())

  note Note @relation(fields: [noteId], references: [id], onDelete: Cascade)

  @@index([noteId])
  @@map("note_versions")
}
```

**Note–Tag join table:** Use Prisma implicit M2M (`@relation("NoteTags")`) with explicit `@@map` via `_NoteTags`. This generates a `_NoteTags` join table. If the SDS naming `note_tags` is required, switch to an explicit join model — noted as a decision point.

> **Decision point:** The SDS says the join table is `note_tags`. Prisma implicit M2M names it `_NoteTags`. To match exactly, use an explicit `NoteTag` model. The plan uses implicit M2M for simplicity but documents the name difference. The DB table name can be controlled by adding `@relation(name: "NoteTags", map: "note_tags")` to both sides — this is the approach taken.

### Migration command

```bash
pnpm --filter backend exec prisma migrate dev --name add-notes-tags-versions
```

---

## 3. Shared Package Changes

### 3a. New file: `packages/shared/src/schemas/notes.ts`

```typescript
import { z } from 'zod'

export const CreateNoteSchema = z.object({
  title:   z.string().min(1),
  content: z.string(),
  tagIds:  z.array(z.string().uuid()).default([]),
})

export const UpdateNoteSchema = z.object({
  title:   z.string().min(1).optional(),
  content: z.string().optional(),
  tagIds:  z.array(z.string().uuid()).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' })

export const ListNotesQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort:  z.enum([
    'createdAt_asc', 'createdAt_desc',
    'updatedAt_asc', 'updatedAt_desc',
    'title_asc',     'title_desc',
  ]).default('updatedAt_desc'),
  tagId: z.string().uuid().optional(),
})

export type CreateNoteDTO       = z.infer<typeof CreateNoteSchema>
export type UpdateNoteDTO       = z.infer<typeof UpdateNoteSchema>
export type ListNotesQueryDTO   = z.infer<typeof ListNotesQuerySchema>
```

### 3b. New file: `packages/shared/src/constants/notes.ts`

```typescript
export const DEFAULT_PAGE  = 1
export const DEFAULT_LIMIT = 20
export const MAX_LIMIT     = 100
export const NOTE_SORT_VALUES = [
  'createdAt_asc', 'createdAt_desc',
  'updatedAt_asc', 'updatedAt_desc',
  'title_asc',     'title_desc',
] as const
export type NoteSortValue = typeof NOTE_SORT_VALUES[number]
```

### 3c. Update `packages/shared/src/index.ts`

```typescript
export * from './schemas/auth'
export * from './schemas/notes'      // ADD
export * from './constants/auth'
export * from './constants/notes'    // ADD
export * from './types/user'
export { ZodError } from 'zod'
```

---

## 4. All Files to Create / Modify

### Prisma

| File | Action |
|------|--------|
| `apps/backend/prisma/schema.prisma` | **MODIFY** — add Note, Tag, NoteVersion models |

### Shared package

| File | Action |
|------|--------|
| `packages/shared/src/schemas/notes.ts` | **CREATE** |
| `packages/shared/src/constants/notes.ts` | **CREATE** |
| `packages/shared/src/index.ts` | **MODIFY** — add note exports |

### Backend feature files

| File | Action |
|------|--------|
| `apps/backend/src/repositories/note.repository.ts` | **CREATE** |
| `apps/backend/src/repositories/note-version.repository.ts` | **CREATE** |
| `apps/backend/src/services/note.service.ts` | **CREATE** |
| `apps/backend/src/controllers/note.controller.ts` | **CREATE** |
| `apps/backend/src/routes/note.routes.ts` | **CREATE** |
| `apps/backend/src/app.ts` | **MODIFY** — mount `/api/notes` |

### Tests

| File | Action |
|------|--------|
| `apps/backend/src/__tests__/note.service.test.ts` | **CREATE** — unit tests |
| `apps/backend/src/__tests__/note.integration.test.ts` | **CREATE** — integration tests |

---

## 5. TypeScript Interface Shapes

### `NoteWithTags` (internal repository return type)

```typescript
// Internal — not exported from shared
import type { Note, Tag } from '@prisma/client'
type NoteWithTags = Note & { tags: Tag[] }
```

### `NoteDTO` (service return / API response `data` field)

```typescript
interface NoteDTO {
  id:        string
  userId:    string
  title:     string
  content:   string
  tags:      TagDTO[]
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

interface TagDTO {
  id:     string
  userId: string
  name:   string
  color:  string
}
```

### `PaginatedNotesDTO`

```typescript
interface PaginatedNotesDTO {
  items: NoteDTO[]
  total: number
  page:  number
  limit: number
}
```

---

## 6. Layer Breakdown

### `note.repository.ts`

```typescript
type Tx = Prisma.TransactionClient

{
  create(data: { userId: string; title: string; content: string; tagIds: string[] }, tx?: Tx): Promise<NoteWithTags>
  findById(id: string, userId: string): Promise<NoteWithTags | null>
  findAll(userId: string, opts: { page: number; limit: number; orderBy: Prisma.NoteOrderByWithRelationInput; tagId?: string }): Promise<{ items: NoteWithTags[]; total: number }>
  update(id: string, data: { title?: string; content?: string; tagIds?: string[] }, tx?: Tx): Promise<NoteWithTags>
  softDelete(id: string, userId: string): Promise<void>
}
```

Key Prisma patterns:
- `include: { tags: true }` on every query that returns a note
- `connect` / `set` for tag relations:
  - CREATE: `tags: { connect: tagIds.map(id => ({ id })) }`
  - UPDATE (when tagIds provided): `tags: { set: tagIds.map(id => ({ id })) }` — replaces the entire tag list

### `note-version.repository.ts`

```typescript
{
  create(data: { noteId: string; title: string; content: string; versionNumber: number }, tx?: Tx): Promise<NoteVersion>
  getNextVersionNumber(noteId: string, tx?: Tx): Promise<number>
  // getNextVersionNumber: COUNT(*) + 1 for the given noteId
}
```

### `note.service.ts`

```typescript
{
  async create(userId: string, dto: CreateNoteDTO): Promise<NoteDTO>
  // 1. If dto.tagIds.length > 0: fetch tags by ids WHERE userId = userId; throw ForbiddenError if count mismatch
  // 2. prisma.$transaction(async (tx) => {
  //      note = await noteRepository.create({ userId, ...dto }, tx)
  //      versionNumber = await noteVersionRepository.getNextVersionNumber(note.id, tx) // → 1
  //      await noteVersionRepository.create({ noteId: note.id, title: note.title, content: note.content, versionNumber }, tx)
  //      return note
  //    })
  // 3. return toNoteDTO(note)

  async list(userId: string, query: ListNotesQueryDTO): Promise<PaginatedNotesDTO>
  // noteRepository.findAll(userId, { page, limit, orderBy: parseSortParam(query.sort), tagId: query.tagId })

  async getById(userId: string, noteId: string): Promise<NoteDTO>
  // note = noteRepository.findById(noteId, userId)
  // if !note → throw NotFoundError
  // return toNoteDTO(note)

  async update(userId: string, noteId: string, dto: UpdateNoteDTO): Promise<NoteDTO>
  // 1. note = noteRepository.findById(noteId, userId) → NotFoundError if null
  // 2. If dto.tagIds provided: validate ownership (same as create)
  // 3. prisma.$transaction(async (tx) => {
  //      updated = await noteRepository.update(noteId, dto, tx)
  //      versionNumber = await noteVersionRepository.getNextVersionNumber(noteId, tx)
  //      await noteVersionRepository.create({ noteId, title: updated.title, content: updated.content, versionNumber }, tx)
  //      return updated
  //    })
  // 4. return toNoteDTO(updated)

  async delete(userId: string, noteId: string): Promise<void>
  // note = noteRepository.findById(noteId, userId) → NotFoundError if null
  // if note.deletedAt → return (idempotent)
  // noteRepository.softDelete(noteId, userId)
}
```

### `note.controller.ts`

```typescript
// Pattern mirrors auth.controller.ts
{
  list(req, res):   parse ListNotesQuerySchema → noteService.list → res.json({ data: result })
  create(req, res): parse CreateNoteSchema     → noteService.create → res.status(201).json({ data: note })
  getById(req, res):                             noteService.getById → res.json({ data: note })
  update(req, res): parse UpdateNoteSchema     → noteService.update → res.json({ data: note })
  delete(req, res):                             noteService.delete → res.json({ data: { message: 'Note deleted' } })
}
```

### `note.routes.ts`

```typescript
const router = Router()
router.use(authenticate)   // all note routes require auth

router.get('/',       noteController.list)
router.post('/',      noteController.create)
router.get('/:id',    noteController.getById)
router.patch('/:id',  noteController.update)
router.delete('/:id', noteController.delete)

export default router
```

### `app.ts` addition

```typescript
import noteRouter from './routes/note.routes'
app.use('/api/notes', noteRouter)
```

---

## 7. Error Codes (Notes Domain)

All errors are already in `domain-errors.ts` — **no new error classes needed**.

| Scenario | Error class | HTTP | code |
|----------|-------------|------|------|
| Note not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Note belongs to another user | `ForbiddenError` | 403 | `FORBIDDEN` |
| Tag does not belong to user | `ForbiddenError` | 403 | `FORBIDDEN` |
| Request body invalid | Zod → `VALIDATION_ERROR` | 400 | `VALIDATION_ERROR` |

---

## 8. Sort Param Mapping

```typescript
const SORT_MAP: Record<string, Prisma.NoteOrderByWithRelationInput> = {
  createdAt_asc:  { createdAt: 'asc' },
  createdAt_desc: { createdAt: 'desc' },
  updatedAt_asc:  { updatedAt: 'asc' },
  updatedAt_desc: { updatedAt: 'desc' },
  title_asc:      { title: 'asc' },
  title_desc:     { title: 'desc' },
}
```

Defined in `note.repository.ts` (private to the file).

---

## 9. Test Coverage Plan

### Unit tests: `note.service.test.ts`

Mock `noteRepository`, `noteVersionRepository`, `prisma.$transaction`.

| # | Scenario |
|---|----------|
| U01 | `create`: success — calls `noteRepository.create` + `noteVersionRepository.create` in a transaction |
| U02 | `create`: invalid tagId ownership — throws `ForbiddenError` |
| U03 | `create`: no tagIds — skips ownership check, still creates version |
| U04 | `list`: returns paginated result from repository |
| U05 | `getById`: returns note when found and userId matches |
| U06 | `getById`: throws `NotFoundError` when note is null |
| U07 | `update`: success — updates note + creates new version snapshot |
| U08 | `update`: note not found — throws `NotFoundError` |
| U09 | `update`: tagId ownership violation — throws `ForbiddenError` |
| U10 | `delete`: success — calls `noteRepository.softDelete` |
| U11 | `delete`: already soft-deleted — returns without error (idempotent) |
| U12 | `delete`: note not found — throws `NotFoundError` |

### Integration tests: `note.integration.test.ts`

Real test DB (same pattern as `auth.integration.test.ts`).

| # | Scenario |
|---|----------|
| I01 | `POST /api/notes` — 201, note + version created |
| I02 | `POST /api/notes` — 400, missing title |
| I03 | `POST /api/notes` — 401, no auth token |
| I04 | `GET /api/notes` — 200, returns only notes belonging to requesting user |
| I05 | `GET /api/notes` — pagination: page=1&limit=2 returns 2 items |
| I06 | `GET /api/notes?tagId=<uuid>` — filters correctly |
| I07 | `GET /api/notes/:id` — 200, returns correct note |
| I08 | `GET /api/notes/:id` — 404, note not found |
| I09 | `GET /api/notes/:id` — 403, note belongs to another user |
| I10 | `PATCH /api/notes/:id` — 200, updates title + creates version |
| I11 | `PATCH /api/notes/:id` — 404, not found |
| I12 | `PATCH /api/notes/:id` — 403, wrong user |
| I13 | `DELETE /api/notes/:id` — 200, sets deletedAt |
| I14 | `DELETE /api/notes/:id` — 200 again (idempotent) |
| I15 | `DELETE /api/notes/:id` — 404, not found |
| I16 | Isolation: `GET /api/notes` does not return soft-deleted notes |

---

## 10. Quality Gates

Run in this exact order after implementation:

```bash
# 1. Type-check entire monorepo
pnpm tsc --noEmit

# 2. Lint backend
pnpm --filter backend lint

# 3. Backend unit + integration tests
pnpm --filter backend test

# 4. Backend build
pnpm --filter backend build
```

Shared package type-checks via step 1. No frontend gates needed (AB-1004 is backend-only).

---

## 11. Open Questions Resolved (for this plan)

| # | Question | Decision |
|---|----------|----------|
| Q1 | Transaction for note+version? | **Yes** — `prisma.$transaction` in service layer |
| Q2 | Tag ownership check? | **Yes** — service verifies tags before write |
| Q3 | Sort + filter in AB-1004 or AB-1005? | **In AB-1004** — OpenAPI already specifies these; splitting is a breaking API change |
| Q4 | `noteCount` in note response tags? | **No** — requires extra count query per tag; belongs in tag-list endpoint (AB-1006) |
| Q5 | Already-deleted note on `DELETE`? | **200 idempotent** — consistent with logout pattern |
| Q6 | Pagination constants in shared? | **Yes** — `packages/shared/src/constants/notes.ts` |
