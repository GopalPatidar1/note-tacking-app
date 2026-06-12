# Technical Plan — AB-1008: Sharing

**Date:** 2026-06-12
**Ticket:** AB-1008
**Branch:** `feat/AB-1008-sharing`
**Status:** AWAITING APPROVAL

---

## 0. Codebase Baseline

| Location | Current State |
|----------|--------------|
| `apps/backend/prisma/schema.prisma` | `User`, `RefreshToken`, `Note`, `Tag`, `NoteVersion` — **no `ShareLink` model** |
| `apps/backend/src/routes/` | `auth`, `note`, `tag`, `search` — **no sharing routes** |
| `apps/backend/src/services/` | `auth`, `note`, `tag`, `search` — **no sharing service** |
| `apps/backend/src/repositories/` | `note`, `note-version`, `refresh-token`, `search`, `tag`, `user` — **no sharing repository** |
| `apps/backend/src/errors/domain-errors.ts` | `AppError`, `NotFoundError`, `ForbiddenError`, `UnauthorizedError` + 3 auth errors — **no `ShareLinkInvalidError`** |
| `packages/shared/src/schemas/` | `auth.ts`, `notes.ts`, `tags.ts` — **no sharing schemas** |
| `packages/shared/src/index.ts` | Exports auth + notes + tags schemas, no sharing |
| `openspec/openapi.yaml` | Sharing section **fully specified** — all schemas and endpoints defined — **zero spec changes needed** |

**Reusable from existing code:**
- `noteRepository.findById(id, userId)` — scope-checks note ownership (used in service)
- `authenticate` middleware — injects `req.user.id`
- `NotFoundError`, `ForbiddenError` — reused without changes
- Integration test harness: `skipIfNoDb`, `cleanDb`, `registerAndLogin`, `supertest(createApp())`

---

## 1. Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Token format | `randomBytes(32).toString('hex')` (64-char hex) | 256-bit entropy; no extra dependency; `crypto` is Node built-in |
| Multiple active links per note | **Allowed** | `POST /notes/:id/share` always creates a new row; no auto-revocation on create |
| Soft-deleted note + active link | **404 `SHARE_LINK_INVALID`** | The `note.deletedAt` check is free — `findByToken` eagerly includes the note |
| Revoke auth check | **Join via `noteId → notes.userId`** | `share_links` has no `userId`; `findByIdWithNote` loads the relation; no migration |
| `viewCount` increment | **Prisma `{ increment: 1 }`** | Atomic at DB level; idiomatic ORM pattern; no raw SQL |
| Public response shape | **`PublicNote` only** (no share metadata) | Matches openapi.yaml as-is |
| Route file strategy | **One `share-link.routes.ts`**, three named exports | `noteShareRouter`, `shareRouter`, `publicRouter` — clean, one file, mirrors feature structure |
| Note existence check on create | **Reuse `noteRepository.findById`** | Already scope-checks `userId` + `deletedAt: null`; no duplication |
| `getPublic` DB round-trips | **Two queries** | (1) `findByToken` with `include: { note: true }` — validates link + note in one; (2) `findNoteWithTags` for the full tags join. Keeps repository methods simple. |

---

## 2. DB Changes (Prisma Schema)

Add `ShareLink` model and a back-relation on `Note`.

```prisma
// apps/backend/prisma/schema.prisma

model Note {
  // ... existing fields unchanged ...
  shareLinks ShareLink[]   // ADD
}

model ShareLink {
  id        String    @id @default(uuid())
  noteId    String
  token     String    @unique
  expiresAt DateTime?
  revokedAt DateTime?
  viewCount Int       @default(0)
  createdAt DateTime  @default(now())

  note Note @relation(fields: [noteId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([noteId])
  @@map("share_links")
}
```

### Migration command

```bash
pnpm --filter backend exec prisma migrate dev --name add-share-links
```

> **Backward-compatible:** adds a new table and one nullable back-relation field on `Note`. No existing column is modified.

---

## 3. OpenAPI Spec Delta

**None.** All schemas and paths already exist in `openspec/openapi.yaml`.

---

## 4. Shared Package Changes

### 4a. New file: `packages/shared/src/schemas/sharing.ts`

```typescript
import { z } from 'zod'

export const CreateShareLinkSchema = z.object({
  expiresAt: z.string().datetime().nullable().optional(),
})

export type CreateShareLinkDTO = z.infer<typeof CreateShareLinkSchema>

export interface ShareLinkResponseDTO {
  id:        string
  noteId:    string
  token:     string
  expiresAt: string | null
  revokedAt: string | null
  viewCount: number
  createdAt: string
}

export interface PublicNoteDTO {
  id:        string
  title:     string
  content:   string
  tags:      { name: string; color: string }[]
  createdAt: string
  updatedAt: string
}
```

### 4b. Modify `packages/shared/src/index.ts`

```typescript
export * from './schemas/auth'
export * from './schemas/notes'
export * from './schemas/tags'
export * from './schemas/sharing'    // ADD
export * from './constants/auth'
export * from './constants/notes'
export * from './types/user'
export { ZodError } from 'zod'
```

---

## 5. All Files to Create / Modify

| File | Action |
|------|--------|
| `apps/backend/prisma/schema.prisma` | **MODIFY** — add `ShareLink` model; `shareLinks` relation on `Note` |
| `packages/shared/src/schemas/sharing.ts` | **CREATE** |
| `packages/shared/src/index.ts` | **MODIFY** — add sharing export |
| `apps/backend/src/errors/domain-errors.ts` | **MODIFY** — add `ShareLinkInvalidError` |
| `apps/backend/src/repositories/share-link.repository.ts` | **CREATE** |
| `apps/backend/src/services/share-link.service.ts` | **CREATE** |
| `apps/backend/src/controllers/share-link.controller.ts` | **CREATE** |
| `apps/backend/src/routes/share-link.routes.ts` | **CREATE** |
| `apps/backend/src/app.ts` | **MODIFY** — mount three sharing routers |
| `apps/backend/src/__tests__/share-link.service.test.ts` | **CREATE** — unit tests |
| `apps/backend/src/__tests__/share-link.integration.test.ts` | **CREATE** — integration tests |

**Total: 7 new files, 4 modified.**

---

## 6. New Error Class

```typescript
// apps/backend/src/errors/domain-errors.ts — append:

export class ShareLinkInvalidError extends AppError {
  constructor(message = 'Share link not found or has expired') {
    super(message, 404, 'SHARE_LINK_INVALID')
  }
}
```

---

## 7. TypeScript Interface Shapes

### Internal repository types (not exported to shared)

```typescript
// Prisma auto-generates ShareLink type after migration + prisma generate
import type { ShareLink, Note, Tag } from '@prisma/client'

type ShareLinkWithNote = ShareLink & { note: Note }
type NoteWithTags      = Note & { tags: Tag[] }
```

---

## 8. Layer Breakdown — Exact Code

### `apps/backend/src/repositories/share-link.repository.ts`

```typescript
import type { ShareLink, Note, Tag } from '@prisma/client'
import { prisma } from '../lib/prisma'

type ShareLinkWithNote = ShareLink & { note: Note }
type NoteWithTags      = Note & { tags: Tag[] }

export const shareLinkRepository = {
  create(data: { noteId: string; token: string; expiresAt: Date | null }): Promise<ShareLink> {
    return prisma.shareLink.create({ data })
  },

  findByToken(token: string): Promise<ShareLinkWithNote | null> {
    return prisma.shareLink.findUnique({
      where:   { token },
      include: { note: true },
    })
  },

  findByIdWithNote(id: string): Promise<ShareLinkWithNote | null> {
    return prisma.shareLink.findUnique({
      where:   { id },
      include: { note: true },
    })
  },

  findNoteWithTags(noteId: string): Promise<NoteWithTags | null> {
    return prisma.note.findFirst({
      where:   { id: noteId, deletedAt: null },
      include: { tags: true },
    })
  },

  incrementViewCount(id: string): Promise<void> {
    return prisma.shareLink
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .then(() => undefined)
  },

  revoke(id: string): Promise<void> {
    return prisma.shareLink
      .update({ where: { id }, data: { revokedAt: new Date() } })
      .then(() => undefined)
  },
}
```

---

### `apps/backend/src/services/share-link.service.ts`

```typescript
import { randomBytes } from 'crypto'
import type { CreateShareLinkDTO, ShareLinkResponseDTO, PublicNoteDTO } from '@note-app/shared'
import { shareLinkRepository } from '../repositories/share-link.repository'
import { noteRepository }      from '../repositories/note.repository'
import { NotFoundError, ForbiddenError, ShareLinkInvalidError } from '../errors/domain-errors'
import type { ShareLink } from '@prisma/client'

function toShareLinkDTO(link: ShareLink): ShareLinkResponseDTO {
  return {
    id:        link.id,
    noteId:    link.noteId,
    token:     link.token,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    viewCount: link.viewCount,
    createdAt: link.createdAt.toISOString(),
  }
}

export const shareLinkService = {
  async create(userId: string, noteId: string, dto: CreateShareLinkDTO): Promise<ShareLinkResponseDTO> {
    const note = await noteRepository.findById(noteId, userId)
    if (!note) throw new NotFoundError('Note not found')

    const token     = randomBytes(32).toString('hex')
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null
    const link      = await shareLinkRepository.create({ noteId, token, expiresAt })

    return toShareLinkDTO(link)
  },

  async getPublic(token: string): Promise<PublicNoteDTO> {
    const linkWithNote = await shareLinkRepository.findByToken(token)
    if (!linkWithNote)              throw new ShareLinkInvalidError()
    if (linkWithNote.revokedAt)     throw new ShareLinkInvalidError()
    if (linkWithNote.expiresAt && linkWithNote.expiresAt < new Date()) throw new ShareLinkInvalidError()
    if (linkWithNote.note.deletedAt) throw new ShareLinkInvalidError()

    await shareLinkRepository.incrementViewCount(linkWithNote.id)

    const note = await shareLinkRepository.findNoteWithTags(linkWithNote.noteId)
    if (!note) throw new ShareLinkInvalidError()

    return {
      id:        note.id,
      title:     note.title,
      content:   note.content,
      tags:      note.tags.map(t => ({ name: t.name, color: t.color })),
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    }
  },

  async revoke(userId: string, shareLinkId: string): Promise<void> {
    const linkWithNote = await shareLinkRepository.findByIdWithNote(shareLinkId)
    if (!linkWithNote)                         throw new NotFoundError('Share link not found')
    if (linkWithNote.note.userId !== userId)   throw new ForbiddenError()
    await shareLinkRepository.revoke(shareLinkId)
  },
}
```

---

### `apps/backend/src/controllers/share-link.controller.ts`

```typescript
import { Request, Response } from 'express'
import { CreateShareLinkSchema } from '@note-app/shared'
import { shareLinkService } from '../services/share-link.service'

export const shareLinkController = {
  async create(req: Request, res: Response) {
    const body = CreateShareLinkSchema.parse(req.body ?? {})
    const link = await shareLinkService.create(req.user.id, req.params.id as string, body)
    res.status(201).json({ data: link })
  },

  async getPublic(req: Request, res: Response) {
    const note = await shareLinkService.getPublic(req.params.token as string)
    res.status(200).json({ data: note })
  },

  async revoke(req: Request, res: Response) {
    await shareLinkService.revoke(req.user.id, req.params.id as string)
    res.status(200).json({ data: { message: 'Share link revoked' } })
  },
}
```

> **`req.body ?? {}`** — `POST /notes/:id/share` body is optional (no `expiresAt` needed); Zod receives `{}` when body is absent, which is valid since all fields are optional.

---

### `apps/backend/src/routes/share-link.routes.ts`

```typescript
import { Router, type IRouter } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { shareLinkController } from '../controllers/share-link.controller'

// POST /api/notes/:id/share — mounted at /api/notes
export const noteShareRouter: IRouter = Router({ mergeParams: true })
noteShareRouter.post('/:id/share', authenticate, shareLinkController.create)

// DELETE /api/share/:id — mounted at /api/share
export const shareRouter: IRouter = Router()
shareRouter.delete('/:id', authenticate, shareLinkController.revoke)

// GET /api/public/:token — mounted at /api/public (no auth)
export const publicRouter: IRouter = Router()
publicRouter.get('/:token', shareLinkController.getPublic)
```

---

### `apps/backend/src/app.ts` — additions

```typescript
// ADD imports (after searchRouter):
import { noteShareRouter, shareRouter, publicRouter } from './routes/share-link.routes'

// ADD mounts (after /api/search, before errorHandler):
app.use('/api/notes',  noteShareRouter)   // POST /api/notes/:id/share
app.use('/api/share',  shareRouter)       // DELETE /api/share/:id
app.use('/api/public', publicRouter)      // GET /api/public/:token
```

Final mount order:
```
/api/auth   → authRouter
/api/notes  → noteRouter
/api/notes  → noteShareRouter   ← new (Express chains both)
/api/tags   → tagRouter
/api/search → searchRouter
/api/share  → shareRouter       ← new
/api/public → publicRouter      ← new
errorHandler
```

---

## 9. Error Codes (Sharing Domain)

| Scenario | Error class | HTTP | code |
|----------|-------------|------|------|
| Note not found / not owned (create) | `NotFoundError` | 404 | `NOT_FOUND` |
| Token not found | `ShareLinkInvalidError` | 404 | `SHARE_LINK_INVALID` |
| Token revoked | `ShareLinkInvalidError` | 404 | `SHARE_LINK_INVALID` |
| Token expired | `ShareLinkInvalidError` | 404 | `SHARE_LINK_INVALID` |
| Note soft-deleted | `ShareLinkInvalidError` | 404 | `SHARE_LINK_INVALID` |
| Share link not found (revoke) | `NotFoundError` | 404 | `NOT_FOUND` |
| Share link belongs to another user | `ForbiddenError` | 403 | `FORBIDDEN` |
| Invalid `expiresAt` format | Zod `ZodError` | 400 | `VALIDATION_ERROR` |

---

## 10. Test Coverage Plan

### Unit tests: `share-link.service.test.ts`

Pattern: mock both `shareLinkRepository` and `noteRepository`; use `vi.fn()` on each method.

```typescript
vi.mock('../repositories/share-link.repository', () => ({
  shareLinkRepository: {
    create:            vi.fn(),
    findByToken:       vi.fn(),
    findByIdWithNote:  vi.fn(),
    findNoteWithTags:  vi.fn(),
    incrementViewCount: vi.fn(),
    revoke:            vi.fn(),
  },
}))

vi.mock('../repositories/note.repository', () => ({
  noteRepository: { findById: vi.fn() },
}))
```

| # | Method | Scenario |
|---|--------|----------|
| U01 | `create` | Returns `ShareLinkResponseDTO` for valid note owned by user |
| U02 | `create` | `expiresAt: null` when DTO omits the field |
| U03 | `create` | `expiresAt` stored as `Date` when DTO provides ISO string |
| U04 | `create` | Throws `NotFoundError` when `noteRepository.findById` returns null |
| U05 | `getPublic` | Returns `PublicNoteDTO` for valid, unexpired, unrevoked token |
| U06 | `getPublic` | Throws `ShareLinkInvalidError` when token not found |
| U07 | `getPublic` | Throws `ShareLinkInvalidError` when `revokedAt` is set |
| U08 | `getPublic` | Throws `ShareLinkInvalidError` when `expiresAt` is in the past |
| U09 | `getPublic` | Throws `ShareLinkInvalidError` when `note.deletedAt` is set |
| U10 | `getPublic` | Calls `incrementViewCount` before returning note |
| U11 | `getPublic` | Does NOT call `incrementViewCount` when token is invalid |
| U12 | `revoke` | Calls `shareLinkRepository.revoke` for valid owned link |
| U13 | `revoke` | Throws `NotFoundError` when share link doesn't exist |
| U14 | `revoke` | Throws `ForbiddenError` when link's `note.userId !== userId` |

### Integration tests: `share-link.integration.test.ts`

Same boilerplate as `tag.integration.test.ts`. `cleanDb` must include `prisma.shareLink.deleteMany()`.

```typescript
async function cleanDb() {
  await prisma.shareLink.deleteMany()
  await prisma.noteVersion.deleteMany()
  await prisma.note.deleteMany()
  await prisma.tag.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.user.deleteMany()
}
```

| # | Endpoint | Scenario |
|---|----------|----------|
| I01 | `POST /api/notes/:id/share` | 201, returns `ShareLink` with `token`, `viewCount: 0`, `revokedAt: null` |
| I02 | `POST /api/notes/:id/share` | 201, `expiresAt` stored when provided as ISO string |
| I03 | `POST /api/notes/:id/share` | 201, `expiresAt: null` when body is empty |
| I04 | `POST /api/notes/:id/share` | 201, multiple active links allowed for same note |
| I05 | `POST /api/notes/:id/share` | 400, invalid `expiresAt` format |
| I06 | `POST /api/notes/:id/share` | 401, no auth |
| I07 | `POST /api/notes/:id/share` | 404, note not found |
| I08 | `POST /api/notes/:id/share` | 404, note belongs to another user |
| I09 | `GET /api/public/:token` | 200, returns `PublicNote` with `title`, `content`, `tags` |
| I10 | `GET /api/public/:token` | 200, `viewCount` increments on each call |
| I11 | `GET /api/public/:token` | 200, no `Authorization` header needed (unauthenticated) |
| I12 | `GET /api/public/:token` | 404 `SHARE_LINK_INVALID`, token not found |
| I13 | `GET /api/public/:token` | 404 `SHARE_LINK_INVALID`, token revoked |
| I14 | `GET /api/public/:token` | 404 `SHARE_LINK_INVALID`, `expiresAt` is in the past |
| I15 | `GET /api/public/:token` | 404 `SHARE_LINK_INVALID`, note soft-deleted |
| I16 | `DELETE /api/share/:id` | 200, `message: 'Share link revoked'` |
| I17 | `DELETE /api/share/:id` | 200, subsequent `GET /api/public/:token` returns 404 |
| I18 | `DELETE /api/share/:id` | 401, no auth |
| I19 | `DELETE /api/share/:id` | 404, share link not found |
| I20 | `DELETE /api/share/:id` | 403, share link belongs to another user's note |

---

## 11. Quality Gates

Run in this order before committing:

```bash
pnpm tsc --noEmit               # 1. type-check monorepo — fix all errors first
pnpm --filter backend lint      # 2. lint backend
pnpm --filter backend test      # 3. unit + integration tests
pnpm --filter backend build     # 4. build check
```

---

## 12. Open Questions Resolved

| # | Question | Decision |
|---|----------|----------|
| Q1 | Token format? | `randomBytes(32).toString('hex')` — 64-char hex, 256-bit entropy |
| Q2 | Multiple active links per note? | **Allowed** — POST always creates a new row |
| Q3 | Soft-deleted note via public link? | **404 `SHARE_LINK_INVALID`** — checked via eagerly loaded `note.deletedAt` |
| Q4 | Revoke auth without `userId` on `share_links`? | **Join via `noteId → notes.userId`** — no schema change |
| Q5 | Public response include share metadata? | **No** — `PublicNote` only, matches spec |
| Q6 | viewCount increment strategy? | **Prisma `{ increment: 1 }`** — atomic, no raw SQL |
