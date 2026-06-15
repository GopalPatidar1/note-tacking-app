# Task Checklist: AB-1009 — Version History

## Status
Awaiting approval

> No DB migration needed — `note_versions` table already exists from AB-1004.

---

## Phase 1 — Foundation (shared types)

- [ ] **T1.1** Add version types to `packages/shared/src/schemas/notes.ts`
  - `ListVersionsQuerySchema` (page + limit coerce)
  - `ListVersionsQueryDTO` (inferred type)
  - `NoteVersionDTO` interface (id, noteId, title, content, versionNumber, createdAt)
  - `PaginatedVersionsDTO` interface (items, total, page, limit)
  - Note: `packages/shared/src/index.ts` already `export *` from notes — no change needed

### Phase 1 checkpoint
```bash
pnpm tsc --noEmit           # 0 errors
pnpm --filter backend build # builds cleanly
```

---

## Phase 2 — Core implementation

> T2.1 and T2.2 are **PARALLEL** — repository has no dependency on shared types.
> T2.3, T2.4, T2.5 are sequential after both complete.

- [ ] **T2.1** `[PARALLEL]` Add read methods to `apps/backend/src/repositories/note-version.repository.ts`
  - `findAll(noteId, { page, limit })` → `Promise<{ items: NoteVersion[]; total: number }>`
    - `findMany` with `orderBy: { versionNumber: 'desc' }`, `skip` / `take`
    - `count` in parallel via `Promise.all`
  - `findById(versionId, noteId)` → `Promise<NoteVersion | null>`
    - `findFirst` with `where: { id: versionId, noteId }`

- [ ] **T2.2** `[PARALLEL]` Create `apps/backend/src/services/note-version.service.ts`
  - Local `toVersionDTO(v: NoteVersion): NoteVersionDTO` mapper
  - Local `toNoteDTO(note: NoteWithTags): NoteDTO` mapper (mirrors `note.service.ts` — not exported there)
  - `noteVersionService.list(userId, noteId, query)` → `PaginatedVersionsDTO`
    - `noteRepository.findById(noteId, userId)` → 404 if null (covers soft-delete)
    - `noteVersionRepository.findAll(noteId, { page, limit })`
  - `noteVersionService.getById(userId, noteId, versionId)` → `NoteVersionDTO`
    - validate note ownership → 404 if null
    - `noteVersionRepository.findById(versionId, noteId)` → 404 if null
  - `noteVersionService.restore(userId, noteId, versionId)` → `NoteDTO`
    - validate note ownership → 404 if null
    - `noteVersionRepository.findById(versionId, noteId)` → 404 if null
    - `prisma.$transaction`: `noteRepository.update` + `getNextVersionNumber` + `noteVersionRepository.create`

- [ ] **T2.3** Create `apps/backend/src/controllers/note-version.controller.ts`
  - `const uuidSchema = z.string().uuid()`
  - `list`: parse `:id` + `req.query` via `ListVersionsQuerySchema` → `service.list` → `200 { data }`
  - `getById`: parse `:id` + `:versionId` → `service.getById` → `200 { data }`
  - `restore`: parse `:id` + `:versionId` → `service.restore` → `200 { data }`

- [ ] **T2.4** Create `apps/backend/src/routes/version.routes.ts`
  - `export const noteVersionRouter: IRouter = Router()`
  - `noteVersionRouter.use(authenticate)`
  - `GET  /:id/versions`                     → `noteVersionController.list`
  - `GET  /:id/versions/:versionId`          → `noteVersionController.getById`
  - `POST /:id/versions/:versionId/restore`  → `noteVersionController.restore`

### Phase 2 checkpoint
```bash
pnpm tsc --noEmit              # 0 errors
pnpm --filter backend lint     # 0 warnings
```

---

## Phase 3 — Integration (wire into app)

- [ ] **T3.1** Mount `noteVersionRouter` in `apps/backend/src/app.ts`
  - Import: `import { noteVersionRouter } from './routes/version.routes'`
  - Mount: `app.use('/api/notes', noteVersionRouter)` — after the `noteShareRouter` line

### Phase 3 checkpoint
```bash
pnpm tsc --noEmit              # 0 errors
pnpm --filter backend lint     # 0 warnings
pnpm --filter backend build    # builds cleanly
```

---

## Phase 4 — Tests

- [ ] **T4.1** Create `apps/backend/src/__tests__/note-version.service.test.ts` (unit)

  Mock targets: `noteRepository`, `noteVersionRepository`, `../../lib/prisma` (for `$transaction`)

  | ID | describe | it |
  |----|----------|----|
  | U01 | `noteVersionService.list` | returns PaginatedVersionsDTO with correct shape |
  | U02 | `noteVersionService.list` | throws NotFoundError when note not found |
  | U03 | `noteVersionService.list` | throws NotFoundError when note is soft-deleted |
  | U04 | `noteVersionService.list` | returns empty items array when no versions exist |
  | U05 | `noteVersionService.getById` | returns NoteVersionDTO for valid note + version |
  | U06 | `noteVersionService.getById` | throws NotFoundError when note not found |
  | U07 | `noteVersionService.getById` | throws NotFoundError when version not found |
  | U08 | `noteVersionService.getById` | throws NotFoundError when versionId exists on a different note |
  | U09 | `noteVersionService.restore` | calls noteRepository.update + noteVersionRepository.create in transaction |
  | U10 | `noteVersionService.restore` | returns NoteDTO reflecting restored title and content |
  | U11 | `noteVersionService.restore` | throws NotFoundError when note not found |
  | U12 | `noteVersionService.restore` | throws NotFoundError when version not found |

- [ ] **T4.2** Create `apps/backend/src/__tests__/note-version.integration.test.ts` (integration)

  Pattern: `skipIfNoDb`, `beforeEach(cleanDb)`, `afterAll(cleanDb + prisma.$disconnect)`

  Helper functions:
  - `registerAndLogin(email)` → accessToken
  - `createNote(token, overrides?)` → noteId
  - `updateNote(token, noteId, body)` — triggers a new version snapshot

  | ID | describe | it |
  |----|----------|----|
  | I01 | `GET /api/notes/:id/versions` | 200, correct paginated shape (items/total/page/limit) |
  | I02 | `GET /api/notes/:id/versions` | 200, versions ordered newest first (highest versionNumber first) |
  | I03 | `GET /api/notes/:id/versions` | 200, page=2&limit=1 returns the older version |
  | I04 | `GET /api/notes/:id/versions` | 401, no Authorization header |
  | I05 | `GET /api/notes/:id/versions` | 404, note does not exist |
  | I06 | `GET /api/notes/:id/versions` | 404, note belongs to another user |
  | I07 | `GET /api/notes/:id/versions` | 404, note is soft-deleted |
  | I08 | `GET /api/notes/:id/versions/:versionId` | 200, returns correct NoteVersion with full title + content |
  | I09 | `GET /api/notes/:id/versions/:versionId` | 401, no auth |
  | I10 | `GET /api/notes/:id/versions/:versionId` | 404, note not found |
  | I11 | `GET /api/notes/:id/versions/:versionId` | 404, version not found |
  | I12 | `POST /api/notes/:id/versions/:versionId/restore` | 200, returns full Note shape |
  | I13 | `POST /api/notes/:id/versions/:versionId/restore` | note.title + content match the restored version |
  | I14 | `POST /api/notes/:id/versions/:versionId/restore` | total versions count increases by 1 |
  | I15 | `POST /api/notes/:id/versions/:versionId/restore` | original version row content unchanged (immutable) |
  | I16 | `POST /api/notes/:id/versions/:versionId/restore` | 401, no auth |
  | I17 | `POST /api/notes/:id/versions/:versionId/restore` | 404, note not found |
  | I18 | `POST /api/notes/:id/versions/:versionId/restore` | 404, version not found |

### Phase 4 checkpoint (final — all quality gates)
```bash
pnpm tsc --noEmit               # 1. 0 errors
pnpm --filter backend lint      # 2. 0 warnings
pnpm --filter backend test      # 3. all green (≥ 80% coverage)
pnpm --filter backend build     # 4. clean build
```

---

## Dependency graph

```
T1.1 (shared types)
  └── T2.2 (service) ──┐
T2.1 (repository) ──────┤
                        ├── T2.3 (controller)
                             └── T2.4 (routes)
                                  └── T3.1 (app.ts)
                                       ├── T4.1 (unit tests)   [can start after T2.2]
                                       └── T4.2 (integration)  [needs T3.1]
```

> T4.1 (unit tests) can be written as soon as T2.2 (service) is done — no need to wait for T3.1.

---

## Summary

| Phase | Tasks | Blocking |
|-------|-------|---------|
| 1 — Foundation | 1 | T2.2 |
| 2 — Core | 4 (2 parallel) | T3.1 |
| 3 — Integration | 1 | T4.2 |
| 4 — Tests | 2 | — |
| **Total** | **8** | |

30 test cases total: 12 unit + 18 integration.
