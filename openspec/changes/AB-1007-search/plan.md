# Technical Plan — AB-1007: Backend Search

**Date:** 2026-06-11
**Ticket:** AB-1007
**Branch:** `feat/AB-1007-search`
**Status:** AWAITING APPROVAL

---

## 0. Codebase Baseline

| Location | Current State |
|----------|--------------|
| `openspec/openapi.yaml` | `/search`, `SearchResult`, `PaginatedSearchResults` fully specified — **no changes needed** |
| `packages/shared/src/schemas/notes.ts` | `SearchQuerySchema`, `SearchQueryDTO`, `SearchResultDTO`, `PaginatedSearchResultsDTO` already defined — **no changes needed** |
| `packages/shared/src/index.ts` | Already exports `* from './schemas/notes'` — **no changes needed** |
| `apps/backend/prisma/schema.prisma` | `Note` has `title` + `content` columns — no tsvector column; GIN expression index missing |
| `apps/backend/src/app.ts` | Mounts `/api/auth`, `/api/notes`, `/api/tags` — no `/api/search` |
| `apps/backend/src/repositories/` | No `search.repository.ts` |
| `apps/backend/src/services/` | No `search.service.ts` |
| `apps/backend/src/controllers/` | No `search.controller.ts` |
| `apps/backend/src/routes/` | No `search.routes.ts` |
| `apps/backend/src/__tests__/` | No search tests |

---

## 1. Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| tsvector approach | **On-the-fly** — `to_tsvector()` inline in `$queryRaw` | No stored column or trigger; GIN expression index covers performance target; simpler migration |
| GIN index | **Yes** — expression index on `to_tsvector('english', title \|\| ' ' \|\| content)` | Required for sub-500ms (FRS NFR); without it, sequential scan on every search |
| Result ordering | **`ts_rank` DESC** | Most relevant results first — standard FTS UX |
| Whitespace query | **400 ValidationError** — trim before Zod parse | Consistent with existing `min(1)` on `SearchQuerySchema`; avoids empty tsquery edge case |
| Tags hydration | **Hybrid** — raw SQL for FTS ids/headlines, then Prisma `findMany` with `include: { tags }` | Keeps Prisma for relational joins; avoids `JSON_AGG` complexity in raw SQL |
| total count | **`COUNT(*) OVER()`** window function in the same raw query | Avoids a separate count query round-trip |
| Repository shape | **Named export object** — `searchRepository` | Mirrors `noteRepository`, `tagRepository` — consistent pattern |
| Service shape | **Named export object** — `searchService` | Mirrors all other services |
| Controller shape | **Named export object** — `searchController` | Mirrors all other controllers |
| SQL injection prevention | **Prisma tagged template `$queryRaw\`...\``** | Prisma parameterises every `${variable}` automatically — safe |

---

## 2. DB Changes (Prisma Migration)

**`schema.prisma` is unchanged** — the GIN index is an expression index on existing columns; Prisma cannot represent it in the schema file.

Use `--create-only` to generate an empty migration file, then add raw SQL:

```bash
pnpm --filter backend exec prisma migrate dev --create-only --name add-notes-fts-gin-index
```

Then edit the generated migration file to contain:

```sql
-- Add GIN expression index for PostgreSQL full-text search on notes
CREATE INDEX CONCURRENTLY IF NOT EXISTS notes_fts_idx
  ON notes
  USING GIN (to_tsvector('english', title || ' ' || content));
```

> `CONCURRENTLY` is safe for dev/test. On staging/prod run `prisma migrate deploy` (CLAUDE.md rule: ask before running deploy).
>
> **Backward-compatible:** index-only change; no column added, no data modified, no downtime risk beyond index build time.

---

## 3. OpenAPI Spec Changes

**None.** The `/search` path and all schemas (`SearchResult`, `PaginatedSearchResults`) are fully specified in `openspec/openapi.yaml`.

---

## 4. Shared Package Changes

**None.** `SearchQuerySchema`, `SearchQueryDTO`, `SearchResultDTO`, `PaginatedSearchResultsDTO` are already in `packages/shared/src/schemas/notes.ts` and re-exported from `packages/shared/src/index.ts`.

---

## 5. All Files to Create / Modify

| File | Action | Notes |
|------|--------|-------|
| `apps/backend/prisma/migrations/<ts>_add_notes_fts_gin_index/migration.sql` | **CREATE** via `prisma migrate dev --create-only` + manual SQL | GIN expression index |
| `apps/backend/src/repositories/search.repository.ts` | **CREATE** | `$queryRaw` FTS + Prisma tag hydration |
| `apps/backend/src/services/search.service.ts` | **CREATE** | Trim/validate, orchestrate, map to DTO |
| `apps/backend/src/controllers/search.controller.ts` | **CREATE** | Parse query, call service, return `{ data }` |
| `apps/backend/src/routes/search.routes.ts` | **CREATE** | `GET /` with `authenticate` |
| `apps/backend/src/app.ts` | **MODIFY** | Mount `/api/search` router |
| `apps/backend/src/__tests__/search.service.test.ts` | **CREATE** | Unit tests — mock repository |
| `apps/backend/src/__tests__/search.integration.test.ts` | **CREATE** | Integration tests — real test DB |

**Total: 7 new files, 1 modified.**

---

## 6. TypeScript Interface Shapes

### Internal repository row type

```typescript
// Raw SQL returns this shape per row
interface FtsRow {
  id:        string
  title:     string
  headline:  string
  rank:      number    // float4 from ts_rank
  createdAt: Date
  updatedAt: Date
  total:     bigint    // COUNT(*) OVER() — convert with Number()
}
```

### `SearchResultDTO` (from shared — the API response item shape)

```typescript
// Already in packages/shared/src/schemas/notes.ts — DO NOT redefine
interface SearchResultDTO {
  id:        string
  title:     string
  headline:  string
  tags:      Pick<TagDTO, 'name' | 'color'>[]
  createdAt: string   // ISO 8601
  updatedAt: string
}
```

### `PaginatedSearchResultsDTO` (from shared — the API response envelope)

```typescript
// Already in packages/shared/src/schemas/notes.ts — DO NOT redefine
interface PaginatedSearchResultsDTO {
  items:  SearchResultDTO[]
  total:  number
  page:   number
  limit:  number
  query:  string
}
```

---

## 7. Layer Breakdown

### `search.repository.ts`

```typescript
import type { Note, Tag } from '@prisma/client'
import { prisma } from '../lib/prisma'

interface FtsRow {
  id:        string
  title:     string
  headline:  string
  rank:      number
  createdAt: Date
  updatedAt: Date
  total:     bigint
}

type NoteWithTags = Note & { tags: Tag[] }

export const searchRepository = {
  async search(
    userId: string,
    q: string,
    page: number,
    limit: number,
  ): Promise<FtsRow[]> {
    const offset = (page - 1) * limit

    return prisma.$queryRaw<FtsRow[]>`
      SELECT
        n.id,
        n.title,
        ts_headline(
          'english',
          n.title || ' ' || n.content,
          plainto_tsquery('english', ${q})
        ) AS headline,
        ts_rank(
          to_tsvector('english', n.title || ' ' || n.content),
          plainto_tsquery('english', ${q})
        ) AS rank,
        n."createdAt",
        n."updatedAt",
        COUNT(*) OVER () AS total
      FROM notes n
      WHERE n."userId"    = ${userId}
        AND n."deletedAt" IS NULL
        AND to_tsvector('english', n.title || ' ' || n.content)
            @@ plainto_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT ${limit} OFFSET ${offset}
    `
  },

  findManyWithTags(ids: string[]): Promise<NoteWithTags[]> {
    return prisma.note.findMany({
      where:   { id: { in: ids }, deletedAt: null },
      include: { tags: true },
    })
  },
}
```

> **SQL injection safety:** Every `${variable}` in the tagged template is parameterised by Prisma — no string concatenation, no injection risk.
>
> **Column quoting:** `"userId"`, `"deletedAt"`, `"createdAt"`, `"updatedAt"` are quoted because Prisma preserves camelCase column names in PostgreSQL.
>
> **`total` as `bigint`:** PostgreSQL `COUNT(*) OVER()` returns a `bigint`. Convert to `Number()` in the service. This is the same pattern used in any raw-query result; do NOT use `parseInt` (precision loss for large numbers is safe here, but `Number()` is idiomatic).

---

### `search.service.ts`

```typescript
import type { SearchQueryDTO, SearchResultDTO, PaginatedSearchResultsDTO, TagDTO } from '@note-app/shared'
import { searchRepository } from '../repositories/search.repository'
import { AppError } from '../errors/domain-errors'

export const searchService = {
  async search(userId: string, dto: SearchQueryDTO): Promise<PaginatedSearchResultsDTO> {
    const q = dto.q.trim()
    if (q.length === 0) {
      throw new AppError('Search query must not be empty', 400, 'VALIDATION_ERROR')
    }

    const ftsRows = await searchRepository.search(userId, q, dto.page, dto.limit)

    if (ftsRows.length === 0) {
      return { items: [], total: 0, page: dto.page, limit: dto.limit, query: q }
    }

    const ids = ftsRows.map(r => r.id)
    const notesWithTags = await searchRepository.findManyWithTags(ids)

    const tagMap = new Map<string, Pick<TagDTO, 'name' | 'color'>[]>(
      notesWithTags.map(n => [
        n.id,
        n.tags.map(t => ({ name: t.name, color: t.color })),
      ]),
    )

    const items: SearchResultDTO[] = ftsRows.map(row => ({
      id:        row.id,
      title:     row.title,
      headline:  row.headline,
      tags:      tagMap.get(row.id) ?? [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))

    return {
      items,
      total: Number(ftsRows[0].total),
      page:  dto.page,
      limit: dto.limit,
      query: q,
    }
  },
}
```

> **Why throw `AppError` directly instead of a named subclass?** A whitespace query is a client error that maps to 400 `VALIDATION_ERROR` — the same code Zod produces. Reusing `AppError` with the correct statusCode + code is sufficient; no new class is warranted.
>
> **Ordering of items array:** `ftsRows` is already sorted by `rank DESC` from the SQL. Mapping in order preserves this ranking. `findManyWithTags` returns rows in arbitrary order — we only use it for tag data via the `tagMap`.

---

### `search.controller.ts`

```typescript
import { Request, Response } from 'express'
import { SearchQuerySchema } from '@note-app/shared'
import { searchService } from '../services/search.service'

export const searchController = {
  async search(req: Request, res: Response) {
    const query = SearchQuerySchema.parse(req.query)
    const result = await searchService.search(req.user.id, query)
    res.status(200).json({ data: result })
  },
}
```

> Trim + whitespace validation happens in the service. The controller only parses the query shape via Zod (which enforces `min(1)`, `coerce.number`, defaults for `page`/`limit`).

---

### `search.routes.ts`

```typescript
import { Router, type IRouter } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { searchController } from '../controllers/search.controller'

const router: IRouter = Router()

router.get('/', authenticate, searchController.search)

export default router
```

---

### `app.ts` modification

```typescript
// ADD import after tag router import:
import searchRouter from './routes/search.routes'

// ADD mount after /api/tags line:
app.use('/api/search', searchRouter)
```

Final middleware order: `helmet → cors → json → /api/auth → /api/notes → /api/tags → /api/search → errorHandler`

---

## 8. Error Codes

All reuse existing `domain-errors.ts` — **no new error classes needed**.

| Scenario | Class | HTTP | code |
|----------|-------|------|------|
| Missing `q` param | Zod `ZodError` | 400 | `VALIDATION_ERROR` |
| `q` whitespace only | `AppError` (direct) | 400 | `VALIDATION_ERROR` |
| No auth token / invalid JWT | `UnauthorizedError` | 401 | `UNAUTHORIZED` |

---

## 9. Test Coverage Plan

### Unit tests: `search.service.test.ts`

Pattern: `vi.mock('../repositories/search.repository', ...)` — mirrors `note.service.test.ts`.

```typescript
vi.mock('../repositories/search.repository', () => ({
  searchRepository: {
    search:           vi.fn(),
    findManyWithTags: vi.fn(),
  },
}))
```

| # | Scenario |
|---|----------|
| U01 | Returns `PaginatedSearchResultsDTO` with correct shape for valid query |
| U02 | Returns `{ items: [], total: 0 }` when `search()` returns empty array |
| U03 | Throws `AppError(400, VALIDATION_ERROR)` when `q` is whitespace only (`"   "`) |
| U04 | Converts `bigint` total from FTS row to `number` correctly |
| U05 | Tags default to `[]` for a noteId not in `tagMap` |
| U06 | Result `items` order matches FTS row order (rank preserved) |
| U07 | Does not call `findManyWithTags` when FTS returns no rows |

### Integration tests: `search.integration.test.ts`

Same boilerplate as `note.integration.test.ts` — `skipIfNoDb`, `cleanDb()`, `registerAndLogin()`, `supertest(createApp())`.

| # | Scenario |
|---|----------|
| I01 | `GET /api/search?q=roadmap` — 200, `items` contains note with matching content |
| I02 | `GET /api/search?q=roadmap` — `headline` contains `<b>roadmap</b>` (ts_headline output) |
| I03 | `GET /api/search?q=roadmap` — excludes soft-deleted notes |
| I04 | `GET /api/search?q=roadmap` — excludes notes belonging to another user (IDOR) |
| I05 | `GET /api/search?q=xyz_nomatch` — 200, `{ items: [], total: 0 }` |
| I06 | `GET /api/search?q=hello&page=2&limit=1` — correct offset pagination |
| I07 | `GET /api/search?q=hello&page=2&limit=1` — `total` reflects full match count, not page size |
| I08 | `GET /api/search` (missing `q`) — 400 `VALIDATION_ERROR` |
| I09 | `GET /api/search?q=   ` (whitespace only) — 400 `VALIDATION_ERROR` |
| I10 | `GET /api/search?q=roadmap` (no auth) — 401 `UNAUTHORIZED` |
| I11 | Results include correct `tags[]` (`name` + `color` only) for matched note |
| I12 | More relevant note (both title + content match) ranks above less relevant note (content only) |

---

## 10. Quality Gates

Run in this order before committing:

```bash
pnpm tsc --noEmit               # 1. type-check monorepo
pnpm --filter backend lint      # 2. lint backend
pnpm --filter backend test      # 3. unit + integration tests
pnpm --filter backend build     # 4. build check
```

---

## 11. Open Questions Resolved

| # | Question | Decision |
|---|----------|----------|
| Q1 | tsvector stored or on-the-fly? | **On-the-fly** — GIN expression index, no trigger, no schema.prisma change |
| Q2 | Result ordering? | **`ts_rank` DESC** — relevance-first |
| Q3 | Whitespace query? | **400 `VALIDATION_ERROR`** — trim in service, throw `AppError` |
| Q4 | Tags hydration? | **Hybrid** — raw SQL FTS + Prisma `findMany` with `include: { tags }` |
| Q5 | total count strategy? | **`COUNT(*) OVER()`** window function — one round-trip to DB |
