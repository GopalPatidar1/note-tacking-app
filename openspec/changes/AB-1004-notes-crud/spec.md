# Specification — AB-1004: Notes CRUD

**Ticket:** AB-1004
**Type:** Backend Feature
**Status:** COMPLETED
**Branch:** `feat/AB-1004-notes-crud`

---

## 1. Requirements

| ID | Requirement |
|----|-------------|
| R-01 | The backend MUST expose `POST /api/notes` to create a note with `title`, `content`, and optional `tagIds` |
| R-02 | The backend MUST expose `GET /api/notes` with pagination (`page`, `limit`), sort (`sort`), and tag filter (`tagId`) |
| R-03 | The backend MUST expose `GET /api/notes/:id` to retrieve a single note |
| R-04 | The backend MUST expose `PATCH /api/notes/:id` to partially update `title`, `content`, and/or `tagIds` |
| R-05 | The backend MUST expose `DELETE /api/notes/:id` to soft-delete a note (set `deletedAt`) |
| R-06 | Every note create and update MUST atomically write a version snapshot to `note_versions` in the same transaction |
| R-07 | All note endpoints MUST be scoped to the authenticated user — notes belonging to other users MUST NOT be accessible |
| R-08 | `tagIds` supplied on create or update MUST be validated for ownership — a user MUST NOT attach another user's tag |
| R-09 | Soft-deleted notes MUST NOT appear in list or getById responses |
| R-10 | `DELETE /api/notes/:id` on an already-deleted note MUST return `200` (idempotent) |
| R-11 | Prisma schema MUST define `Note`, `Tag`, and `NoteVersion` models |
| R-12 | Zod schemas (`CreateNoteSchema`, `UpdateNoteSchema`, `ListNotesQuerySchema`) MUST live in `packages/shared` |
| R-13 | Pagination constants (`DEFAULT_PAGE`, `DEFAULT_LIMIT`, `MAX_LIMIT`) MUST live in `packages/shared/src/constants/notes.ts` |

---

## 2. Acceptance Criteria

- [ ] `POST /api/notes` → 201 + `NoteDTO`; corresponding `note_versions` row exists
- [ ] `POST /api/notes` with missing `title` → 400 `VALIDATION_ERROR`
- [ ] `POST /api/notes` without auth token → 401 `UNAUTHORIZED`
- [ ] `GET /api/notes` → 200 with paginated `NoteDTO[]`; excludes other users' notes; excludes soft-deleted notes
- [ ] `GET /api/notes?tagId=<uuid>` → filters by tag correctly; IDOR-safe (cannot filter by another user's tag)
- [ ] `GET /api/notes?sort=title_asc` → returns notes sorted by title ascending
- [ ] `GET /api/notes/:id` → 200 with note including embedded `tags[]`
- [ ] `GET /api/notes/:id` for non-existent or wrong-user note → 404 `NOT_FOUND`
- [ ] `PATCH /api/notes/:id` → 200 + updated `NoteDTO`; new `note_versions` row created
- [ ] `DELETE /api/notes/:id` → 200; `deletedAt` is set; note excluded from subsequent list
- [ ] `DELETE /api/notes/:id` (already deleted) → 200 (idempotent)
- [ ] `pnpm tsc --noEmit` passes with no errors
- [ ] `pnpm --filter backend test` passes all unit and integration tests

---

## 3. Affected Capabilities

| Capability | Impact |
|-----------|--------|
| Note creation | New — POST /api/notes |
| Note listing | New — GET /api/notes with pagination/sort/filter |
| Note retrieval | New — GET /api/notes/:id |
| Note editing | New — PATCH /api/notes/:id |
| Note soft-delete | New — DELETE /api/notes/:id |
| Version snapshots | New — automatic on every create/update |
| Tag ownership | New — IDOR guard on tagId assignment |
| Shared package | Extended — new note schemas and pagination constants |
| Prisma schema | Extended — Note, Tag, NoteVersion models added |

---

## 4. Functional Behavior

### Create Note
1. Parse body with `CreateNoteSchema` (Zod)
2. If `tagIds.length > 0`: fetch tags by IDs filtered by `userId`; throw `ForbiddenError` if count mismatch
3. In a `prisma.$transaction`: create note → compute next version number → create version snapshot
4. Return `201` with `NoteDTO`

### List Notes
- Filter: `userId`, `deletedAt: null`, optional `tagId` (IDOR-safe via `where: { tags: { some: { id, userId } } }`)
- Sort: one of 6 sort values mapped to Prisma `orderBy`; default `updatedAt_desc`
- Pagination: `page`, `limit` (default 20, max 100)
- Returns: `{ items: NoteDTO[], total, page, limit }`

### Get Note
- Find by `id` AND `userId`; `deletedAt: null`; throw `NotFoundError` if not found
- Returns: `NoteDTO` with embedded `tags[]`

### Update Note
1. Find note by `id + userId`; throw `NotFoundError` if absent
2. If `tagIds` present: validate ownership
3. In a `prisma.$transaction`: update note (replace tag set if `tagIds` supplied) → create version snapshot
4. Return `200` with updated `NoteDTO`

### Delete Note
- Find note by `id + userId`; throw `NotFoundError` if absent
- If `deletedAt` already set → return `200` (idempotent)
- Set `deletedAt` and return `200`

### NoteDTO shape
```
{ id, userId, title, content, tags[{ id, userId, name, color }], deletedAt, createdAt, updatedAt }
```

---

## 5. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| AB-1001 | Prerequisite | Monorepo, Prisma singleton, domain errors, auth middleware |
| AB-1002 | Prerequisite | `authenticate` middleware providing `req.user.id` |
| `packages/shared` | Internal | Note Zod schemas, pagination constants |
| Prisma `$transaction` | Technical | Atomicity for note + version write |
| `Note`, `Tag`, `NoteVersion` Prisma models | Technical | New models added to `schema.prisma` |
| AB-1006 | Consumer | Tags CRUD builds on `Tag` model introduced here |
| AB-1007 / AB-1020 | Consumer | Search operates on notes created here |
| AB-1008 | Consumer | Sharing links reference notes |
| AB-1015 | Consumer | Version history UI reads versions written here |
