# Specification — AB-1008: Note Sharing

**Ticket:** AB-1008
**Type:** Backend Feature
**Status:** COMPLETED
**Branch:** `feat/AB-1008-sharing`

---

## 1. Requirements

| ID | Requirement |
|----|-------------|
| R-01 | `POST /api/notes/:id/share` MUST create a share link for an authenticated user's note |
| R-02 | Share links MUST contain a cryptographically random 64-character hex token (`randomBytes(32)`) |
| R-03 | Multiple active share links per note MUST be allowed |
| R-04 | Share links MUST support an optional `expiresAt` (ISO 8601 datetime string) |
| R-05 | `GET /api/public/:token` MUST be unauthenticated and return the public note view |
| R-06 | `GET /api/public/:token` MUST increment the share link's `viewCount` atomically |
| R-07 | `DELETE /api/share/:id` MUST revoke a share link (set `revokedAt`) |
| R-08 | Accessing a revoked, expired, or non-existent token MUST return `404 SHARE_LINK_INVALID` |
| R-09 | Accessing a public link for a soft-deleted note MUST return `404 SHARE_LINK_INVALID` |
| R-10 | Revoking a link belonging to another user's note MUST return `403 FORBIDDEN` |
| R-11 | `ShareLink` Prisma model MUST be added to `schema.prisma` |
| R-12 | Zod schemas and DTOs MUST live in `packages/shared/src/schemas/sharing.ts` |
| R-13 | A new `ShareLinkInvalidError` domain error class MUST be added to `domain-errors.ts` |

---

## 2. Acceptance Criteria

- [ ] `POST /api/notes/:id/share` → 201 + `ShareLinkResponseDTO` with `token`, `viewCount: 0`, `revokedAt: null`
- [ ] `POST /api/notes/:id/share` → accepts optional `expiresAt` ISO string
- [ ] `POST /api/notes/:id/share` → `expiresAt: null` when body is empty
- [ ] `POST /api/notes/:id/share` → 201 multiple times for same note (multiple active links)
- [ ] `POST /api/notes/:id/share` with invalid `expiresAt` → 400 `VALIDATION_ERROR`
- [ ] `POST /api/notes/:id/share` without auth → 401 `UNAUTHORIZED`
- [ ] `POST /api/notes/:id/share` for non-existent or other user's note → 404 `NOT_FOUND`
- [ ] `GET /api/public/:token` → 200 + `PublicNoteDTO` (no auth required)
- [ ] `GET /api/public/:token` → `viewCount` increments on each call
- [ ] `GET /api/public/:token` with revoked token → 404 `SHARE_LINK_INVALID`
- [ ] `GET /api/public/:token` with expired token → 404 `SHARE_LINK_INVALID`
- [ ] `GET /api/public/:token` for soft-deleted note → 404 `SHARE_LINK_INVALID`
- [ ] `DELETE /api/share/:id` → 200 + `{ message: 'Share link revoked' }`
- [ ] `DELETE /api/share/:id` → subsequent `GET /api/public/:token` returns 404
- [ ] `DELETE /api/share/:id` for another user's note → 403 `FORBIDDEN`
- [ ] `DELETE /api/share/:id` for non-existent link → 404 `NOT_FOUND`

---

## 3. Affected Capabilities

| Capability | Impact |
|-----------|--------|
| Share link creation | New — POST /api/notes/:id/share |
| Public note view | New — GET /api/public/:token (unauthenticated) |
| Share link revocation | New — DELETE /api/share/:id |
| Prisma schema | Extended — `ShareLink` model added; back-relation on `Note` |
| Shared package | Extended — `sharing.ts` with schemas and DTOs |
| Domain errors | Extended — `ShareLinkInvalidError` added |
| Route structure | Three routers mounted: `noteShareRouter`, `shareRouter`, `publicRouter` |

---

## 4. Functional Behavior

### Create Share Link
1. Find note by `id + userId` via `noteRepository.findById` → 404 if absent
2. Generate `token = randomBytes(32).toString('hex')` (64-char hex)
3. Parse `expiresAt` from body (optional ISO string → `Date` or `null`)
4. Create `ShareLink` row; return `201` + `ShareLinkResponseDTO`

### Get Public Note
1. Find share link by token (include `note`) → 404 `SHARE_LINK_INVALID` if not found
2. Check `revokedAt` → 404 if set
3. Check `expiresAt` → 404 if in the past
4. Check `note.deletedAt` → 404 if set
5. Increment `viewCount` atomically (`{ increment: 1 }`)
6. Fetch note with tags → return `200` + `PublicNoteDTO`

### Revoke Share Link
1. Find share link by id (include `note`) → 404 `NOT_FOUND` if absent
2. Check `note.userId !== userId` → 403 `FORBIDDEN`
3. Set `revokedAt = new Date()` → return `200`

### DTOs
- `ShareLinkResponseDTO`: `{ id, noteId, token, expiresAt, revokedAt, viewCount, createdAt }`
- `PublicNoteDTO`: `{ id, title, content, tags[{ name, color }], createdAt, updatedAt }`

---

## 5. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| AB-1001 | Prerequisite | Monorepo, Prisma singleton, domain errors |
| AB-1002 | Prerequisite | `authenticate` middleware |
| AB-1004 | Prerequisite | `Note` model and `noteRepository.findById` |
| `packages/shared` | Internal | `sharing.ts` schemas and DTOs |
| Node `crypto` | Technical | `randomBytes(32)` for token generation |
| AB-1014 | Consumer | Frontend Share Modal calls these endpoints |
