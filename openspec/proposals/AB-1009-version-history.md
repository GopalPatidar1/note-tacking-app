# Proposal: AB-1009 — Version History

## Status
Draft

## Overview

Implement the version history read/restore API on top of the already-working snapshot creation (done in AB-1004). Snapshot writes are already wired into `note.service.ts` for create and update. This ticket adds the three read-side endpoints (list, get, restore) plus their tests.

---

## What Already Exists

| Artifact | Status |
|----------|--------|
| Snapshot creation on note create | Done (`note.service.ts:53-65`) |
| Snapshot creation on note update | Done (`note.service.ts:94-104`) |
| `noteVersionRepository.getNextVersionNumber` | Done |
| `noteVersionRepository.create` | Done |
| OpenAPI `NoteVersion` schema | Done (`openapi.yaml`) |
| OpenAPI version endpoints (list/get/restore) | Done (`openapi.yaml`) |

---

## Deliverables

### 1. `packages/shared` — new version schemas & DTOs

Add to `packages/shared/src/schemas/notes.ts`:

```ts
export const ListVersionsQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export type ListVersionsQueryDTO = z.infer<typeof ListVersionsQuerySchema>

export interface NoteVersionDTO {
  id:            string
  noteId:        string
  title:         string
  content:       string
  versionNumber: number
  createdAt:     string
}

export interface PaginatedVersionsDTO {
  items: NoteVersionDTO[]
  total: number
  page:  number
  limit: number
}
```

Export from `packages/shared/src/index.ts`.

---

### 2. `note-version.repository.ts` — add read methods

```ts
findAll(noteId: string, opts: { page: number; limit: number }): Promise<{ items: NoteVersion[]; total: number }>
// ORDER BY versionNumber DESC, OFFSET/LIMIT for pagination

findById(versionId: string, noteId: string): Promise<NoteVersion | null>
// WHERE id = versionId AND noteId = noteId
```

---

### 3. New `apps/backend/src/services/note-version.service.ts`

```
list(userId, noteId, query: ListVersionsQueryDTO) → PaginatedVersionsDTO
  1. findById(noteId, userId) — throw NotFoundError if missing or soft-deleted
  2. noteVersionRepository.findAll(noteId, { page, limit })
  3. Map to NoteVersionDTO and return paginated envelope

getById(userId, noteId, versionId) → NoteVersionDTO
  1. findById(noteId, userId) — throw NotFoundError if missing or soft-deleted
  2. noteVersionRepository.findById(versionId, noteId) — throw NotFoundError if missing
  3. Map and return

restore(userId, noteId, versionId) → NoteDTO
  1. findById(noteId, userId) — throw NotFoundError if missing or soft-deleted
  2. noteVersionRepository.findById(versionId, noteId) — throw NotFoundError if missing
  3. prisma.$transaction:
       a. noteRepository.update(noteId, { title: version.title, content: version.content })
       b. noteVersionRepository.getNextVersionNumber(noteId, tx)
       c. noteVersionRepository.create({ noteId, title, content, versionNumber }, tx)
  4. Return updated note as NoteDTO
```

---

### 4. New `apps/backend/src/controllers/note-version.controller.ts`

Three handlers following the standard controller pattern:

| Handler | Method | Path |
|---------|--------|------|
| `list` | GET | /notes/:noteId/versions |
| `getById` | GET | /notes/:noteId/versions/:versionId |
| `restore` | POST | /notes/:noteId/versions/:versionId/restore |

Each parses params with Zod (`z.string().uuid()`), calls the service, returns `{ data: ... }`.

---

### 5. New `apps/backend/src/routes/version.routes.ts`

```ts
const router = Router({ mergeParams: true })   // needed for :noteId from parent
router.use(authenticate)
router.get('/',                    noteVersionController.list)
router.get('/:versionId',          noteVersionController.getById)
router.post('/:versionId/restore', noteVersionController.restore)
export default router
```

Mounted in `app.ts` at `/notes/:noteId/versions`.

---

### 6. Tests

| File | Type | What it covers |
|------|------|----------------|
| `__tests__/note-version.service.test.ts` | Unit (Vitest) | list / getById / restore — mock noteRepository and noteVersionRepository |
| `__tests__/note-version.integration.test.ts` | Integration (Supertest) | Full HTTP flow: 200 list, 200 get, 200 restore, 404 for missing note/version, 401 unauthenticated |

---

## API Contract (no openapi.yaml changes needed)

All three endpoints are already fully specified:

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/notes/:id/versions` | `{ data: { items: NoteVersion[], total, page, limit } }` |
| `GET` | `/notes/:id/versions/:versionId` | `{ data: NoteVersion }` |
| `POST` | `/notes/:id/versions/:versionId/restore` | `{ data: Note }` (latest note state) |

---

## Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Full content in list | Yes | Consistent with `NoteVersion` schema in openapi.yaml |
| Soft-deleted notes | 404 | Consistent with how `GET /notes/:id` behaves |
| Auto-purge | Out of scope | Deferred from AB-1009; FRS requirement noted |
| Route structure | Separate `version.routes.ts` | Keeps `note.routes.ts` clean; matches per-feature file convention |
| Restore creates new snapshot | Yes | FRS: "Restore creates a new version. Original versions remain unchanged." |

---

## OpenAPI Delta

No changes to `openapi.yaml` — version endpoints and `NoteVersion` schema are already complete.

---

## Shared Package Delta

New exports added to `packages/shared`:
- `ListVersionsQuerySchema`
- `ListVersionsQueryDTO`
- `NoteVersionDTO`
- `PaginatedVersionsDTO`
