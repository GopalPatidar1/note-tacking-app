# Technical Plan — AB-1008: Sharing

**Date:** 2026-06-12
**Ticket:** AB-1008
**Branch:** `feat/AB-1008-sharing`
**Status:** AWAITING APPROVAL

---

## 0. Codebase Baseline

| Location | Current State |
|----------|--------------|
| `apps/backend/prisma/schema.prisma` | No `ShareLink` model — must be added |
| `packages/shared/src/schemas/` | No sharing schemas — `auth.ts`, `notes.ts`, `tags.ts` only |
| `apps/backend/src/routes/` | No sharing routes |
| `apps/backend/src/services/` | No `share-link.service.ts` |
| `apps/backend/src/repositories/` | No `share-link.repository.ts` |
| `openspec/openapi.yaml` | Sharing section **fully specified** — `ShareLink`, `CreateShareLinkRequest`, `PublicNote` schemas and all 3 endpoints defined — **no spec changes needed** |

---

## 1. Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Token format | `crypto.randomBytes(32).toString('hex')` (64-char hex) | 256-bit entropy; cryptographically secure; no extra dependency |
| Multiple active links per note | **Allowed** | `POST /notes/:id/share` always creates a new link; no auto-revocation |
| Soft-deleted note + active link | **404 `SHARE_LINK_INVALID`** | Share link effectively dies with the note; consistent UX |
| Revoke auth check | **Join via `noteId → notes.userId`** | `share_links` has no `userId`; no schema change needed |
| `viewCount` increment | **Prisma `increment` operator** | Atomic at DB level; no raw SQL; `prisma.shareLink.update({ data: { viewCount: { increment: 1 } } })` |
| Public response shape | **Note content only** (`PublicNote`) | Matches spec; minimal unauthenticated surface — no `expiresAt`/`viewCount` exposed |
| Route file strategy | **One `share-link.routes.ts`**, three named router exports | `noteShareRouter` (POST), `shareRouter` (DELETE), `publicRouter` (GET) — clean separation, one file |
| Error for invalid/expired/revoked token | **New `ShareLinkInvalidError`** | Code `SHARE_LINK_INVALID` differs from `NOT_FOUND`; thin subclass of `AppError` |

---

## 2. DB Changes (Prisma Schema)

**Add new `ShareLink` model and relation to `Note`:**

```prisma
model Note {
  // ... existing fields ...
  shareLinks ShareLink[]   // ADD this relation
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

---

## 3. OpenAPI Spec Delta

**None.** All three sharing endpoints and all related schemas (`ShareLink`, `CreateShareLinkRequest`, `PublicNote`) are fully specified in `openspec/openapi.yaml`. No changes needed.

---

## 4. Shared Package Changes

### New file: `packages/shared/src/schemas/sharing.ts`

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

### Update `packages/shared/src/index.ts`

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

### Prisma

| File | Action |
|------|--------|
| `apps/backend/prisma/schema.prisma` | **MODIFY** — add `ShareLink` model; add `shareLinks` relation on `Note` |

### Shared package

| File | Action |
|------|--------|
| `packages/shared/src/schemas/sharing.ts` | **CREATE** |
| `packages/shared/src/index.ts` | **MODIFY** — add sharing exports |

### Backend feature files

| File | Action |
|------|--------|
| `apps/backend/src/errors/domain-errors.ts` | **MODIFY** — add `ShareLinkInvalidError` |
| `apps/backend/src/repositories/share-link.repository.ts` | **CREATE** |
| `apps/backend/src/services/share-link.service.ts` | **CREATE** |
| `apps/backend/src/controllers/share-link.controller.ts` | **CREATE** |
| `apps/backend/src/routes/share-link.routes.ts` | **CREATE** |
| `apps/backend/src/app.ts` | **MODIFY** — mount three sharing routers |

### Tests

| File | Action |
|------|--------|
| `apps/backend/src/__tests__/share-link.service.test.ts` | **CREATE** — unit tests |
| `apps/backend/src/__tests__/share-link.integration.test.ts` | **CREATE** — integration tests |

**Total: 7 new files, 4 modified.**

---

## 6. New Error Class

```typescript
// apps/backend/src/errors/domain-errors.ts — add:
export class ShareLinkInvalidError extends AppError {
  constructor(message = 'Share link not found or has expired') {
    super(message, 404, 'SHARE_LINK_INVALID')
  }
}
```

---

## 7. TypeScript Interface Shapes

### Internal repository types

```typescript
import type { ShareLink, Note, Tag } from '@prisma/client'

type ShareLinkWithNote = ShareLink & { note: Note }
type NoteWithTags      = Note & { tags: Tag[] }
```

---

## 8. Layer Breakdown

### `share-link.repository.ts`

```typescript
export const shareLinkRepository = {
  create(data: {
    noteId: string
    token: string
    expiresAt: Date | null
  }): Promise<ShareLink>
  // prisma.shareLink.create({ data })

  findByToken(token: string): Promise<ShareLinkWithNote | null>
  // prisma.shareLink.findUnique({
  //   where: { token },
  //   include: { note: true },
  // })

  findByIdWithNote(id: string): Promise<ShareLinkWithNote | null>
  // prisma.shareLink.findUnique({
  //   where: { id },
  //   include: { note: true },
  // })

  incrementViewCount(id: string): Promise<void>
  // prisma.shareLink.update({
  //   where: { id },
  //   data: { viewCount: { increment: 1 } },
  // })

  revoke(id: string): Promise<void>
  // prisma.shareLink.update({
  //   where: { id },
  //   data: { revokedAt: new Date() },
  // })

  findNoteWithTags(noteId: string): Promise<NoteWithTags | null>
  // prisma.note.findFirst({
  //   where: { id: noteId, deletedAt: null },
  //   include: { tags: true },
  // })
}
```

### `share-link.service.ts`

```typescript
export const shareLinkService = {
  async create(userId: string, noteId: string, dto: CreateShareLinkDTO): Promise<ShareLinkResponseDTO>
  // 1. Verify note exists and belongs to userId — use noteRepository.findById(noteId, userId)
  //    throw NotFoundError if not found
  // 2. Generate token: crypto.randomBytes(32).toString('hex')
  // 3. shareLinkRepository.create({ noteId, token, expiresAt: dto.expiresAt ?? null })
  // 4. Return toShareLinkDTO(shareLink)

  async getPublic(token: string): Promise<PublicNoteDTO>
  // 1. shareLinkRepository.findByToken(token)
  //    throw ShareLinkInvalidError if not found
  // 2. Check revokedAt — throw ShareLinkInvalidError if revoked
  // 3. Check expiresAt — throw ShareLinkInvalidError if past
  // 4. Check note.deletedAt — throw ShareLinkInvalidError if deleted
  // 5. shareLinkRepository.incrementViewCount(shareLink.id)  ← atomic
  // 6. Fetch note with tags: shareLinkRepository.findNoteWithTags(shareLink.noteId)
  // 7. Return toPublicNoteDTO(note)

  async revoke(userId: string, shareLinkId: string): Promise<void>
  // 1. shareLinkRepository.findByIdWithNote(shareLinkId)
  //    throw NotFoundError if not found
  // 2. Check shareLink.note.userId === userId — throw ForbiddenError if not
  // 3. shareLinkRepository.revoke(shareLinkId)
}
```

> **Why check `note.deletedAt` in `getPublic`?** The `note` is eagerly loaded in `findByToken` (include: { note: true }), so this is a free in-memory check — no extra DB round-trip.
>
> **Why `incrementViewCount` before fetching tags?** View count should be incremented on every genuine read attempt that passes all validity checks, regardless of subsequent tag-fetch success.

### `share-link.controller.ts`

```typescript
export const shareLinkController = {
  async create(req: Request, res: Response)
  // body = CreateShareLinkSchema.parse(req.body)
  // link = await shareLinkService.create(req.user.id, req.params.id, body)
  // res.status(201).json({ data: link })

  async getPublic(req: Request, res: Response)
  // note = await shareLinkService.getPublic(req.params.token)
  // res.status(200).json({ data: note })

  async revoke(req: Request, res: Response)
  // await shareLinkService.revoke(req.user.id, req.params.id)
  // res.status(200).json({ data: { message: 'Share link revoked' } })
}
```

### `share-link.routes.ts`

```typescript
import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { shareLinkController } from '../controllers/share-link.controller'

// Mounted at /api/notes
export const noteShareRouter = Router()
noteShareRouter.post('/:id/share', authenticate, shareLinkController.create)

// Mounted at /api/share
export const shareRouter = Router()
shareRouter.delete('/:id', authenticate, shareLinkController.revoke)

// Mounted at /api/public
export const publicRouter = Router()
publicRouter.get('/:token', shareLinkController.getPublic)
```

### `app.ts` additions

```typescript
import { noteShareRouter, shareRouter, publicRouter } from './routes/share-link.routes'

app.use('/api/notes',  noteShareRouter)   // POST /api/notes/:id/share
app.use('/api/share',  shareRouter)       // DELETE /api/share/:id
app.use('/api/public', publicRouter)      // GET /api/public/:token
```

> Mount `noteShareRouter` **before** `noteRouter` is irrelevant — both mount at `/api/notes` and Express chains them. Either order works; keep them adjacent in app.ts for readability.

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
| Invalid `expiresAt` format | Zod → `VALIDATION_ERROR` | 400 | `VALIDATION_ERROR` |

---

## 10. Test Coverage Plan

### Unit tests: `share-link.service.test.ts`

Mock `shareLinkRepository` and `noteRepository`.

| # | Scenario |
|---|----------|
| U01 | `create`: returns `ShareLinkResponseDTO` for valid note owned by user |
| U02 | `create`: throws `NotFoundError` when note doesn't exist |
| U03 | `create`: throws `NotFoundError` when note belongs to another user |
| U04 | `create`: sets `expiresAt: null` when omitted from DTO |
| U05 | `getPublic`: returns `PublicNoteDTO` for valid, unexpired, unrevoked token |
| U06 | `getPublic`: throws `ShareLinkInvalidError` when token not found |
| U07 | `getPublic`: throws `ShareLinkInvalidError` when `revokedAt` is set |
| U08 | `getPublic`: throws `ShareLinkInvalidError` when `expiresAt` is in the past |
| U09 | `getPublic`: throws `ShareLinkInvalidError` when `note.deletedAt` is set |
| U10 | `getPublic`: calls `incrementViewCount` before returning note |
| U11 | `revoke`: calls `shareLinkRepository.revoke` for valid owned link |
| U12 | `revoke`: throws `NotFoundError` when share link doesn't exist |
| U13 | `revoke`: throws `ForbiddenError` when link's note belongs to another user |

### Integration tests: `share-link.integration.test.ts`

Real test DB — same `skipIfNoDb`, `cleanDb()`, `registerAndLogin()`, `supertest(createApp())` pattern.

| # | Scenario |
|---|----------|
| I01 | `POST /api/notes/:id/share` — 201, returns `ShareLink` with correct fields |
| I02 | `POST /api/notes/:id/share` — 201, `expiresAt` stored when provided |
| I03 | `POST /api/notes/:id/share` — 201, `expiresAt: null` when omitted |
| I04 | `POST /api/notes/:id/share` — 201, multiple active links allowed for same note |
| I05 | `POST /api/notes/:id/share` — 400, invalid `expiresAt` format |
| I06 | `POST /api/notes/:id/share` — 401, no auth |
| I07 | `POST /api/notes/:id/share` — 404, note not found |
| I08 | `POST /api/notes/:id/share` — 403, note belongs to another user |
| I09 | `GET /api/public/:token` — 200, returns `PublicNote` with title, content, tags |
| I10 | `GET /api/public/:token` — 200, `viewCount` incremented on each call |
| I11 | `GET /api/public/:token` — 404 `SHARE_LINK_INVALID`, token not found |
| I12 | `GET /api/public/:token` — 404 `SHARE_LINK_INVALID`, token revoked |
| I13 | `GET /api/public/:token` — 404 `SHARE_LINK_INVALID`, token expired (past `expiresAt`) |
| I14 | `GET /api/public/:token` — 404 `SHARE_LINK_INVALID`, note soft-deleted |
| I15 | `GET /api/public/:token` — no auth required (unauthenticated request succeeds) |
| I16 | `DELETE /api/share/:id` — 200, share link revoked (`revokedAt` set) |
| I17 | `DELETE /api/share/:id` — 200, subsequent `GET /api/public/:token` returns 404 |
| I18 | `DELETE /api/share/:id` — 401, no auth |
| I19 | `DELETE /api/share/:id` — 404, share link not found |
| I20 | `DELETE /api/share/:id` — 403, share link belongs to another user's note |

---

## 11. Quality Gates

```bash
pnpm tsc --noEmit               # 1. type-check monorepo
pnpm --filter backend lint      # 2. lint backend
pnpm --filter backend test      # 3. unit + integration tests
pnpm --filter backend build     # 4. build check
```

---

## 12. Open Questions Resolved

| # | Question | Decision |
|---|----------|----------|
| Q1 | Token format? | `crypto.randomBytes(32).toString('hex')` — 64-char hex, 256-bit entropy |
| Q2 | Multiple active links per note? | **Allowed** — POST always creates a new link |
| Q3 | Soft-deleted note via public link? | **404 `SHARE_LINK_INVALID`** |
| Q4 | Revoke auth without `userId` on `share_links`? | **Join via `noteId → notes.userId`** — no schema change |
| Q5 | Public response include share metadata? | **No** — note content only (`PublicNote` as specced) |
| Q6 | viewCount increment strategy? | **Prisma `increment` operator** — atomic, no raw SQL |
