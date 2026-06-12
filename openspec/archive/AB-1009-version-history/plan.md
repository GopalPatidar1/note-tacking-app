# Technical Plan: AB-1009 — Version History

## Status
Awaiting approval

---

## Context Snapshot

### Already done (AB-1004)
| What | Location |
|------|----------|
| Snapshot on note create | `note.service.ts:53-65` (prisma.$transaction) |
| Snapshot on note update | `note.service.ts:94-104` (prisma.$transaction) |
| `getNextVersionNumber` | `note-version.repository.ts:7-11` |
| `create` (version row) | `note-version.repository.ts:13-19` |
| OpenAPI `NoteVersion` schema | `openapi.yaml:433-454` |
| OpenAPI 3 version endpoints | `openapi.yaml:1147-1241` |

### Gap (what this ticket builds)
`findAll` + `findById` on the repo, a new service, controller, and route file, plus shared DTOs and tests.

---

## File Map

### Files to modify
| File | Change |
|------|--------|
| `packages/shared/src/schemas/notes.ts` | Add `ListVersionsQuerySchema`, `NoteVersionDTO`, `PaginatedVersionsDTO` |
| `packages/shared/src/index.ts` | Re-export new types (no change needed — already `export * from './schemas/notes'`) |
| `apps/backend/src/repositories/note-version.repository.ts` | Add `findAll`, `findById` |
| `apps/backend/src/app.ts` | Import and mount `noteVersionRouter` at `/api/notes` |

### Files to create
| File | Purpose |
|------|---------|
| `apps/backend/src/services/note-version.service.ts` | Business logic: list, getById, restore |
| `apps/backend/src/controllers/note-version.controller.ts` | HTTP handlers: list, getById, restore |
| `apps/backend/src/routes/version.routes.ts` | Route definitions, mounted at `/api/notes` |
| `apps/backend/src/__tests__/note-version.service.test.ts` | Unit tests (mock repos) |
| `apps/backend/src/__tests__/note-version.integration.test.ts` | Integration tests (real DB) |

---

## Implementation Details

### 1. `packages/shared/src/schemas/notes.ts`

Append after the existing search types:

```ts
// ── versions ─────────────────────────────────────────────────

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

`packages/shared/src/index.ts` already has `export * from './schemas/notes'` — no change needed there.

---

### 2. `note-version.repository.ts` — new methods

Pattern: mirrors `noteRepository.findAll` (Promise.all for count + data).

```ts
findAll(noteId: string, opts: { page: number; limit: number }) {
  return Promise.all([
    prisma.noteVersion.findMany({
      where:   { noteId },
      orderBy: { versionNumber: 'desc' },
      skip:    (opts.page - 1) * opts.limit,
      take:    opts.limit,
    }),
    prisma.noteVersion.count({ where: { noteId } }),
  ]).then(([items, total]) => ({ items, total }))
},

findById(versionId: string, noteId: string) {
  return prisma.noteVersion.findFirst({
    where: { id: versionId, noteId },
  })
},
```

No `tx` param — these are read-only queries, never called inside a transaction.

---

### 3. `note-version.service.ts`

```ts
import type { Note, NoteVersion, Tag } from '@prisma/client'
import type {
  ListVersionsQueryDTO,
  NoteVersionDTO,
  PaginatedVersionsDTO,
  NoteDTO,
  TagDTO,
} from '@note-app/shared'
import { prisma }                from '../lib/prisma'
import { noteRepository }        from '../repositories/note.repository'
import { noteVersionRepository } from '../repositories/note-version.repository'
import { NotFoundError }         from '../errors/domain-errors'

type NoteWithTags = Note & { tags: Tag[] }

function toVersionDTO(v: NoteVersion): NoteVersionDTO { ... }

// Local mapper — mirrors note.service.ts toNoteDTO (not exported there)
function toNoteDTO(note: NoteWithTags): NoteDTO { ... }

export const noteVersionService = {
  async list(userId, noteId, query): Promise<PaginatedVersionsDTO>
  async getById(userId, noteId, versionId): Promise<NoteVersionDTO>
  async restore(userId, noteId, versionId): Promise<NoteDTO>
}
```

**`restore` transaction:**
```
prisma.$transaction(async tx => {
  noteRepository.update(noteId, { title: version.title, content: version.content }, tx)
  noteVersionRepository.getNextVersionNumber(noteId, tx)
  noteVersionRepository.create({ noteId, title, content, versionNumber }, tx)
  return updatedNote
})
```

**Authorization model:** `noteRepository.findById(noteId, userId)` already filters both `userId` and `deletedAt: null`. Null result → `NotFoundError` (consistent with rest of codebase; no 403 for wrong-user access).

**`toNoteDTO` duplication:** `note.service.ts` does not export this mapper. Rather than extracting a utility module (premature abstraction for an 8-line function), define a local copy in `note-version.service.ts`.

---

### 4. `note-version.controller.ts`

Pattern: mirrors `share-link.controller.ts`.

```ts
import { z }                       from 'zod'
import { Request, Response }       from 'express'
import { ListVersionsQuerySchema } from '@note-app/shared'
import { noteVersionService }      from '../services/note-version.service'

const uuidSchema = z.string().uuid()

export const noteVersionController = {
  async list(req, res)    // parse :id + query → service.list
  async getById(req, res) // parse :id + :versionId → service.getById
  async restore(req, res) // parse :id + :versionId → service.restore
}
```

---

### 5. `version.routes.ts`

Pattern: mirrors `share-link.routes.ts` — named export mounted at `/api/notes`.

```ts
import { Router, type IRouter } from 'express'
import { authenticate }          from '../middleware/auth.middleware'
import { noteVersionController } from '../controllers/note-version.controller'

export const noteVersionRouter: IRouter = Router()

noteVersionRouter.use(authenticate)
noteVersionRouter.get('/:id/versions',                     noteVersionController.list)
noteVersionRouter.get('/:id/versions/:versionId',          noteVersionController.getById)
noteVersionRouter.post('/:id/versions/:versionId/restore', noteVersionController.restore)
```

`:id` matches the note ID param name used consistently across `noteRouter` and `noteShareRouter`.

---

### 6. `app.ts` change

```ts
import { noteVersionRouter } from './routes/version.routes'
// ...
app.use('/api/notes', noteVersionRouter)   // after noteShareRouter line
```

---

## Test Plan

### Unit — `note-version.service.test.ts`

Mocks: `noteRepository`, `noteVersionRepository`, `prisma.$transaction`.

| ID | Method | Scenario |
|----|--------|----------|
| U01 | `list` | Returns `PaginatedVersionsDTO` with correct shape |
| U02 | `list` | Throws `NotFoundError` when note not found |
| U03 | `list` | Throws `NotFoundError` when note is soft-deleted (`findById` returns null) |
| U04 | `list` | Returns empty `items` array when no versions exist |
| U05 | `getById` | Returns `NoteVersionDTO` for valid note + version |
| U06 | `getById` | Throws `NotFoundError` when note not found |
| U07 | `getById` | Throws `NotFoundError` when version not found |
| U08 | `getById` | Throws `NotFoundError` when version exists on a different note |
| U09 | `restore` | Calls `noteRepository.update` + `noteVersionRepository.create` in transaction |
| U10 | `restore` | Returns `NoteDTO` with restored title and content |
| U11 | `restore` | Throws `NotFoundError` when note not found |
| U12 | `restore` | Throws `NotFoundError` when version not found |

### Integration — `note-version.integration.test.ts`

Pattern: mirrors `share-link.integration.test.ts` — `skipIfNoDb`, `beforeEach(cleanDb)`, `afterAll(cleanDb + disconnect)`.

| ID | Endpoint | Scenario |
|----|----------|----------|
| I01 | GET /notes/:id/versions | 200, correct paginated shape (items/total/page/limit) |
| I02 | GET /notes/:id/versions | 200, versions ordered newest first (versionNumber DESC) |
| I03 | GET /notes/:id/versions | 200, pagination: page 2 returns correct slice |
| I04 | GET /notes/:id/versions | 401, no Authorization header |
| I05 | GET /notes/:id/versions | 404, note does not exist |
| I06 | GET /notes/:id/versions | 404, note belongs to another user |
| I07 | GET /notes/:id/versions | 404, note is soft-deleted |
| I08 | GET /notes/:id/versions/:versionId | 200, returns correct version with full content |
| I09 | GET /notes/:id/versions/:versionId | 401, no auth |
| I10 | GET /notes/:id/versions/:versionId | 404, note not found |
| I11 | GET /notes/:id/versions/:versionId | 404, version not found |
| I12 | POST /notes/:id/versions/:versionId/restore | 200, returns full Note shape |
| I13 | POST /notes/:id/versions/:versionId/restore | note.title + content match restored version |
| I14 | POST /notes/:id/versions/:versionId/restore | new version snapshot created (total versions +1) |
| I15 | POST /notes/:id/versions/:versionId/restore | original version row unchanged (immutable) |
| I16 | POST /notes/:id/versions/:versionId/restore | 401, no auth |
| I17 | POST /notes/:id/versions/:versionId/restore | 404, note not found |
| I18 | POST /notes/:id/versions/:versionId/restore | 404, version not found |

---

## DB Changes

**None.** The `note_versions` table and all columns (`id`, `noteId`, `title`, `content`, `versionNumber`, `createdAt`) already exist from AB-1004's migration. No new migration needed.

---

## Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Route mounting | Named export `noteVersionRouter` at `/api/notes` | Matches `noteShareRouter` precedent exactly |
| Route param name | `/:id/versions/:versionId` | Consistent with `/:id/share` used by `noteShareRouter` |
| `toNoteDTO` placement | Local copy in `note-version.service.ts` | `note.service.ts` doesn't export it; 8-line pure function doesn't warrant its own module |
| Soft-deleted notes | 404 via `noteRepository.findById` (filters `deletedAt: null`) | Consistent with all other note endpoints |
| IDOR handling | 404 (not 403) | Consistent with rest of codebase |
| Read methods `tx` param | None on `findAll`/`findById` | Read-only; never called inside transaction |

---

## Quality Gates

Run in order before committing:

```bash
pnpm tsc --noEmit               # 1. type-check — fix all errors first
pnpm --filter backend lint      # 2. lint backend
pnpm --filter backend test      # 3. unit + integration tests
pnpm --filter backend build     # 4. build check
```

Do not commit if any gate fails.
