# Task Checklist — AB-1008: Sharing

**Branch:** `feat/AB-1008-sharing`
**Plan:** `openspec/changes/AB-1008-sharing/plan.md`

---

## Phase 1 — Foundation

> DB schema, shared types, and new error class. Everything downstream depends on these.

- [ ] **T01** — Add `ShareLink` Prisma model to `apps/backend/prisma/schema.prisma`
  - Add `ShareLink` model with: `id`, `noteId`, `token` (unique), `expiresAt?`, `revokedAt?`, `viewCount` (default 0), `createdAt`
  - Add `onDelete: Cascade` relation to `Note`
  - Add `@@index([token])`, `@@index([noteId])`, `@@map("share_links")`
  - Add `shareLinks ShareLink[]` back-relation on `Note` model

- [ ] **T02** — Run Prisma migration
  ```bash
  pnpm --filter backend exec prisma migrate dev --name add-share-links
  ```
  - Confirm `share_links` table created in dev DB
  - Confirm Prisma client regenerated (`ShareLink` type available)

- [ ] **T03** — Create `packages/shared/src/schemas/sharing.ts`
  - `CreateShareLinkSchema` — `z.object({ expiresAt: z.string().datetime().nullable().optional() })`
  - `CreateShareLinkDTO` — inferred from schema
  - `ShareLinkResponseDTO` interface — `id`, `noteId`, `token`, `expiresAt: string | null`, `revokedAt: string | null`, `viewCount`, `createdAt`
  - `PublicNoteDTO` interface — `id`, `title`, `content`, `tags: { name: string; color: string }[]`, `createdAt`, `updatedAt`

- [ ] **T04** — Export sharing schemas from `packages/shared/src/index.ts`
  - Add `export * from './schemas/sharing'`

- [ ] **T05** — Add `ShareLinkInvalidError` to `apps/backend/src/errors/domain-errors.ts`
  - Extends `AppError`, message `'Share link not found or has expired'`, statusCode `404`, code `'SHARE_LINK_INVALID'`

### Phase 1 Checkpoint
```bash
pnpm tsc --noEmit           # must pass — ShareLink Prisma type + shared DTOs visible
pnpm --filter backend build # must pass
```

---

## Phase 2 — Core Implementation [PARALLEL]

> Repository, service, controller, and routes can be written independently once Phase 1 is done.

- [ ] **T06** `[PARALLEL]` — Create `apps/backend/src/repositories/share-link.repository.ts`
  - `create(data: { noteId, token, expiresAt }): Promise<ShareLink>`
  - `findByToken(token): Promise<ShareLinkWithNote | null>` — `include: { note: true }`
  - `findByIdWithNote(id): Promise<ShareLinkWithNote | null>` — `include: { note: true }`
  - `findNoteWithTags(noteId): Promise<NoteWithTags | null>` — `include: { tags: true }`, filters `deletedAt: null`
  - `incrementViewCount(id): Promise<void>` — `{ viewCount: { increment: 1 } }`
  - `revoke(id): Promise<void>` — sets `revokedAt: new Date()`

- [ ] **T07** `[PARALLEL]` — Create `apps/backend/src/services/share-link.service.ts`
  - Import `randomBytes` from `'crypto'`
  - `create(userId, noteId, dto)`:
    - Call `noteRepository.findById(noteId, userId)` → `NotFoundError` if null
    - Generate token: `randomBytes(32).toString('hex')`
    - Call `shareLinkRepository.create`
    - Return `toShareLinkDTO(link)`
  - `getPublic(token)`:
    - `findByToken` → `ShareLinkInvalidError` if null
    - Check `revokedAt` → `ShareLinkInvalidError`
    - Check `expiresAt < new Date()` → `ShareLinkInvalidError`
    - Check `note.deletedAt` → `ShareLinkInvalidError`
    - `incrementViewCount`
    - `findNoteWithTags` → return `PublicNoteDTO`
  - `revoke(userId, shareLinkId)`:
    - `findByIdWithNote` → `NotFoundError` if null
    - Check `note.userId !== userId` → `ForbiddenError`
    - `shareLinkRepository.revoke`

- [ ] **T08** `[PARALLEL]` — Create `apps/backend/src/controllers/share-link.controller.ts`
  - `create`: parse `CreateShareLinkSchema.parse(req.body ?? {})` → call service → `201`
  - `getPublic`: call service with `req.params.token` → `200`
  - `revoke`: call service with `req.user.id`, `req.params.id` → `200 { message: 'Share link revoked' }`

- [ ] **T09** `[PARALLEL]` — Create `apps/backend/src/routes/share-link.routes.ts`
  - `noteShareRouter` (mounted at `/api/notes`): `POST /:id/share` with `authenticate`
  - `shareRouter` (mounted at `/api/share`): `DELETE /:id` with `authenticate`
  - `publicRouter` (mounted at `/api/public`): `GET /:token` (no auth middleware)
  - All three as named exports (`IRouter`)

### Phase 2 Checkpoint
```bash
pnpm tsc --noEmit           # must pass — no implicit any, no missing imports
pnpm --filter backend lint  # must pass — 0 warnings
```

---

## Phase 3 — Integration

> Wire everything together in `app.ts` and verify the routes resolve.

- [ ] **T10** — Modify `apps/backend/src/app.ts`
  - Import `{ noteShareRouter, shareRouter, publicRouter }` from `./routes/share-link.routes`
  - Mount after existing routes, before `errorHandler`:
    ```typescript
    app.use('/api/notes',  noteShareRouter)
    app.use('/api/share',  shareRouter)
    app.use('/api/public', publicRouter)
    ```

### Phase 3 Checkpoint
```bash
pnpm tsc --noEmit           # must pass
pnpm --filter backend lint  # must pass
pnpm --filter backend build # must pass — full compile clean
```

---

## Phase 4 — Tests

> Unit tests first (mock-based, fast), then integration tests (real DB).

### Unit Tests — `apps/backend/src/__tests__/share-link.service.test.ts`

- [ ] **T11** — Test file scaffold: `vi.mock` for `shareLinkRepository` + `noteRepository`; `makeShareLink()` + `makeNote()` factory helpers; `beforeEach(() => vi.clearAllMocks())`

- [ ] **T12** — `U01` `create` returns correct `ShareLinkResponseDTO` for owned note
- [ ] **T13** — `U02` `create` sets `expiresAt: null` when DTO field omitted
- [ ] **T14** — `U03` `create` stores parsed `Date` when DTO provides ISO string
- [ ] **T15** — `U04` `create` throws `NotFoundError` when `noteRepository.findById` returns null
- [ ] **T16** — `U05` `getPublic` returns `PublicNoteDTO` for valid, unexpired, unrevoked token
- [ ] **T17** — `U06` `getPublic` throws `ShareLinkInvalidError` when token not found
- [ ] **T18** — `U07` `getPublic` throws `ShareLinkInvalidError` when `revokedAt` is set
- [ ] **T19** — `U08` `getPublic` throws `ShareLinkInvalidError` when `expiresAt` is in the past
- [ ] **T20** — `U09` `getPublic` throws `ShareLinkInvalidError` when `note.deletedAt` is set
- [ ] **T21** — `U10` `getPublic` calls `incrementViewCount` before returning
- [ ] **T22** — `U11` `getPublic` does NOT call `incrementViewCount` when token is invalid
- [ ] **T23** — `U12` `revoke` calls `shareLinkRepository.revoke` for valid owned link
- [ ] **T24** — `U13` `revoke` throws `NotFoundError` when share link not found
- [ ] **T25** — `U14` `revoke` throws `ForbiddenError` when `note.userId !== userId`

### Integration Tests — `apps/backend/src/__tests__/share-link.integration.test.ts`

- [ ] **T26** — Test file scaffold: `cleanDb` (include `prisma.shareLink.deleteMany()`), `registerAndLogin`, `skipIfNoDb`, helpers `createNote(token)` + `createShareLink(token, noteId)`

- [ ] **T27** — `I01` `POST /api/notes/:id/share` → 201, correct `ShareLink` shape (`token` defined, `viewCount: 0`, `revokedAt: null`)
- [ ] **T28** — `I02` `POST /api/notes/:id/share` → 201, `expiresAt` stored when provided
- [ ] **T29** — `I03` `POST /api/notes/:id/share` → 201, `expiresAt: null` when body omitted
- [ ] **T30** — `I04` `POST /api/notes/:id/share` → 201, second call creates a second active link (multiple allowed)
- [ ] **T31** — `I05` `POST /api/notes/:id/share` → 400, invalid `expiresAt` format
- [ ] **T32** — `I06` `POST /api/notes/:id/share` → 401, no auth
- [ ] **T33** — `I07` `POST /api/notes/:id/share` → 404, note not found
- [ ] **T34** — `I08` `POST /api/notes/:id/share` → 404, note belongs to another user
- [ ] **T35** — `I09` `GET /api/public/:token` → 200, returns `PublicNote` (title, content, tags with name+color)
- [ ] **T36** — `I10` `GET /api/public/:token` → 200, `viewCount` increments on each call
- [ ] **T37** — `I11` `GET /api/public/:token` → 200, succeeds with no `Authorization` header
- [ ] **T38** — `I12` `GET /api/public/:token` → 404 `SHARE_LINK_INVALID`, token not found
- [ ] **T39** — `I13` `GET /api/public/:token` → 404 `SHARE_LINK_INVALID`, token revoked
- [ ] **T40** — `I14` `GET /api/public/:token` → 404 `SHARE_LINK_INVALID`, past `expiresAt`
- [ ] **T41** — `I15` `GET /api/public/:token` → 404 `SHARE_LINK_INVALID`, note soft-deleted
- [ ] **T42** — `I16` `DELETE /api/share/:id` → 200, `message: 'Share link revoked'`
- [ ] **T43** — `I17` `DELETE /api/share/:id` → 200, subsequent `GET /public/:token` returns 404
- [ ] **T44** — `I18` `DELETE /api/share/:id` → 401, no auth
- [ ] **T45** — `I19` `DELETE /api/share/:id` → 404, share link not found
- [ ] **T46** — `I20` `DELETE /api/share/:id` → 403, share link belongs to another user's note

### Phase 4 Checkpoint (Final)
```bash
pnpm tsc --noEmit               # 0 errors
pnpm --filter backend lint      # 0 warnings
pnpm --filter backend test      # all green (unit + integration)
pnpm --filter backend build     # clean build
```

---

## Task Summary

| Phase | Tasks | Parallel? |
|-------|-------|-----------|
| 1 — Foundation | T01–T05 (5 tasks) | Sequential |
| 2 — Core impl | T06–T09 (4 tasks) | **PARALLEL** |
| 3 — Integration | T10 (1 task) | Sequential |
| 4 — Tests | T11–T46 (36 tasks) | Sequential within file |
| **Total** | **46 tasks** | |
