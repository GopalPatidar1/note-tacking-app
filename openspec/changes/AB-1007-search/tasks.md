# Task Checklist — AB-1007: Backend Search

**Branch:** `feat/AB-1007-search`
**Status:** AWAITING APPROVAL

---

## Phase 1 — Foundation (DB migration)

> Goal: GIN expression index applied to the `notes` table so FTS queries can run against a real DB.
> No changes to `schema.prisma`, `packages/shared`, or `openspec/openapi.yaml` — all already in place.

- [ ] **T01** — Generate empty migration file
  ```bash
  pnpm --filter backend exec prisma migrate dev --create-only --name add-notes-fts-gin-index
  ```
  _Verify: new directory created under `apps/backend/prisma/migrations/<timestamp>_add_notes_fts_gin_index/` containing an empty `migration.sql`._

- [ ] **T02** — Write GIN index SQL into the generated `migration.sql`
  ```sql
  -- Add GIN expression index for PostgreSQL full-text search on notes
  CREATE INDEX CONCURRENTLY IF NOT EXISTS notes_fts_idx
    ON notes
    USING GIN (to_tsvector('english', title || ' ' || content));
  ```
  _Note: `CONCURRENTLY` is valid for dev. Ask before running `prisma migrate deploy` on staging/prod._

- [ ] **T03** — Apply the migration
  ```bash
  pnpm --filter backend exec prisma migrate dev
  ```
  _Verify: migration applied with no errors; `prisma generate` reruns automatically; `schema.prisma` is unchanged._

### ✅ Checkpoint 1

```bash
pnpm tsc --noEmit                # 0 type errors
pnpm --filter backend build      # compiles clean
```

---

## Phase 2 — Backend Layers (sequential by dependency)

> Goal: full stack wired end-to-end; `GET /api/search?q=test` returns 200 from curl/Postman.
> Each layer imports the one below — implement in order T04 → T05 → T06 → T07 → T08.

- [ ] **T04** — Create `apps/backend/src/repositories/search.repository.ts`
  - `FtsRow` interface: `{ id, title, headline, rank: number, createdAt: Date, updatedAt: Date, total: bigint }`
  - `NoteWithTags` type: `Note & { tags: Tag[] }`
  - `search(userId, q, page, limit)` — `prisma.$queryRaw<FtsRow[]>` tagged template:
    - `SELECT id, title, ts_headline(…) AS headline, ts_rank(…) AS rank, "createdAt", "updatedAt", COUNT(*) OVER() AS total`
    - `FROM notes n WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND tsvector @@ tsquery`
    - `ORDER BY rank DESC LIMIT ${limit} OFFSET ${(page-1)*limit}`
  - `findManyWithTags(ids)` — `prisma.note.findMany({ where: { id: { in: ids }, deletedAt: null }, include: { tags: true } })`
  - Quote all camelCase column names: `"userId"`, `"deletedAt"`, `"createdAt"`, `"updatedAt"`

- [ ] **T05** — Create `apps/backend/src/services/search.service.ts`
  - Import `SearchQueryDTO`, `SearchResultDTO`, `PaginatedSearchResultsDTO`, `TagDTO` from `@note-app/shared`
  - Import `AppError` from `../errors/domain-errors`
  - `search(userId, dto)`:
    1. `const q = dto.q.trim()` — throw `new AppError('Search query must not be empty', 400, 'VALIDATION_ERROR')` if empty
    2. Call `searchRepository.search(userId, q, dto.page, dto.limit)`
    3. Early return `{ items: [], total: 0, page, limit, query: q }` if `ftsRows.length === 0`
    4. Call `searchRepository.findManyWithTags(ids)` to hydrate tags
    5. Build `tagMap: Map<noteId, { name, color }[]>` from Prisma result
    6. Map `ftsRows` → `SearchResultDTO[]` preserving rank order; `tags: tagMap.get(id) ?? []`
    7. Return `{ items, total: Number(ftsRows[0].total), page, limit, query: q }`

- [ ] **T06** — Create `apps/backend/src/controllers/search.controller.ts`
  - Import `SearchQuerySchema` from `@note-app/shared`
  - `search(req, res)`:
    - `const query = SearchQuerySchema.parse(req.query)` — Zod handles missing `q` (400) + type coercion for page/limit
    - `const result = await searchService.search(req.user.id, query)`
    - `res.status(200).json({ data: result })`

- [ ] **T07** — Create `apps/backend/src/routes/search.routes.ts`
  - `const router: IRouter = Router()`
  - `router.get('/', authenticate, searchController.search)`
  - `export default router`

- [ ] **T08** — Modify `apps/backend/src/app.ts`
  - Add import: `import searchRouter from './routes/search.routes'`
  - Add mount after `/api/tags` line: `app.use('/api/search', searchRouter)`
  - Final order: `helmet → cors → json → /api/auth → /api/notes → /api/tags → /api/search → errorHandler`

### ✅ Checkpoint 2

```bash
pnpm tsc --noEmit                # 0 type errors
pnpm --filter backend lint       # 0 warnings
pnpm --filter backend build      # compiles clean
```

---

## Phase 3 — Integration (smoke test the wired route)

> Goal: confirm the route is reachable before writing the full test suite.

- [ ] **T09** — Manual smoke test (optional but recommended)
  ```bash
  # Start backend dev server
  pnpm --filter backend dev
  # In a separate terminal — should return 401 (route exists, auth required)
  curl -s http://localhost:3000/api/search?q=test | jq .
  ```
  _Expected: `{ "error": { "message": "Unauthorized", "code": "UNAUTHORIZED" } }` — confirms route is mounted and middleware fires._

### ✅ Checkpoint 3

```bash
pnpm tsc --noEmit                # still 0 errors
pnpm --filter backend lint       # still 0 warnings
pnpm --filter backend build      # still clean
```

---

## Phase 4 — Tests [T10 and T11 are PARALLEL]

> Goal: all 19 scenarios covered; `pnpm --filter backend test` green.
> T10 (unit) and T11 (integration) have no dependency on each other — write concurrently.

- [ ] **T10** — Create `apps/backend/src/__tests__/search.service.test.ts` (unit)

  Mock setup (mirrors `note.service.test.ts`):
  ```typescript
  vi.mock('../repositories/search.repository', () => ({
    searchRepository: {
      search:           vi.fn(),
      findManyWithTags: vi.fn(),
    },
  }))
  ```

  | Test ID | Scenario |
  |---------|----------|
  | U01 | Valid query → returns `PaginatedSearchResultsDTO` with correct shape |
  | U02 | FTS returns empty array → `{ items: [], total: 0, page, limit, query }` |
  | U03 | `q = "   "` (whitespace only) → throws `AppError` with `statusCode 400` and `code VALIDATION_ERROR` |
  | U04 | `total: bigint` from FTS row → converted to `number` in response |
  | U05 | NoteId not in `tagMap` → `tags` defaults to `[]` |
  | U06 | `items` order matches FTS row order (rank preserved, not re-sorted) |
  | U07 | `findManyWithTags` is NOT called when FTS returns no rows |

- [ ] **T11** — Create `apps/backend/src/__tests__/search.integration.test.ts` (integration)

  Boilerplate: `skipIfNoDb`, `cleanDb()`, `registerAndLogin()` — identical to `note.integration.test.ts`.

  | Test ID | Scenario |
  |---------|----------|
  | I01 | `GET /api/search?q=roadmap` — 200, `items` contains the matching note |
  | I02 | `GET /api/search?q=roadmap` — `headline` field contains `<b>` tag(s) |
  | I03 | `GET /api/search?q=roadmap` — soft-deleted note (`deletedAt` set) is excluded |
  | I04 | `GET /api/search?q=roadmap` — note belonging to a different user is excluded (IDOR) |
  | I05 | `GET /api/search?q=xyz_nomatch` — 200, `{ items: [], total: 0 }` |
  | I06 | `GET /api/search?q=hello&page=2&limit=1` — returns the correct page slice |
  | I07 | `GET /api/search?q=hello&page=2&limit=1` — `total` equals the full match count (not page size) |
  | I08 | `GET /api/search` (missing `q`) — 400 `VALIDATION_ERROR` |
  | I09 | `GET /api/search?q=   ` (whitespace only) — 400 `VALIDATION_ERROR` |
  | I10 | `GET /api/search?q=roadmap` (no auth) — 401 `UNAUTHORIZED` |
  | I11 | Result includes correct `tags[]` — only `name` + `color` fields present |
  | I12 | Note with match in both title + content ranks above note with match in content only |

### ✅ Final Checkpoint (all quality gates)

```bash
pnpm tsc --noEmit                # 1. type-check monorepo — 0 errors
pnpm --filter backend lint       # 2. lint — 0 warnings
pnpm --filter backend test       # 3. all tests green (7 unit + 12 integration)
pnpm --filter backend build      # 4. build clean
```

---

## Summary

| Phase | Tasks | New Files | Modified Files |
|-------|-------|-----------|----------------|
| 1 — DB Migration | T01–T03 | `migration.sql` (via prisma) | — |
| 2 — Backend Layers | T04–T08 | `search.repository.ts`, `search.service.ts`, `search.controller.ts`, `search.routes.ts` | `app.ts` |
| 3 — Integration | T09 | — | — |
| 4 — Tests | T10–T11 (**PARALLEL**) | `search.service.test.ts`, `search.integration.test.ts` | — |
| **Total** | **11 tasks** | **7 new files** | **1 modified** |

**No changes to:** `openspec/openapi.yaml` · `packages/shared` · `schema.prisma` model · `domain-errors.ts`
