# Technical Plan — AB-1020: Keyword Search with Partial Match

**Date:** 2026-06-16
**Ticket:** AB-1020
**Branch:** `feat/AB-1020-keyword-search`
**Status:** AWAITING APPROVAL

---

## 0. Codebase Baseline

| Location | Current State |
|----------|---------------|
| `apps/backend/prisma/migrations/20260611154145_add_notes_fts_gin_index/migration.sql` | `notes_fts_idx` GIN FTS index **already applied** — must be dropped |
| `apps/backend/src/repositories/search.repository.ts` | EXISTS — FTS implementation; replace query + row type |
| `apps/backend/src/services/search.service.ts` | EXISTS — FTS implementation; add `buildHeadline`, update mapping |
| `apps/backend/src/controllers/search.controller.ts` | EXISTS — **no change needed** |
| `apps/backend/src/routes/search.routes.ts` | EXISTS — **no change needed** |
| `apps/backend/src/__tests__/search.service.test.ts` | EXISTS — FTS mock shape; update row type + add `buildHeadline` tests |
| `apps/backend/src/__tests__/search.integration.test.ts` | EXISTS — content-based FTS tests; update all note data to use title-based keywords |
| `packages/shared/src/schemas/notes.ts` | `SearchQuerySchema`, `SearchResultDTO`, `PaginatedSearchResultsDTO` — **no change needed** |
| `openspec/openapi.yaml` | `/search` + `SearchResult.headline` — description-only changes |
| `docs/FRS.md` | FR-4 acceptance criteria — update |
| `docs/SDS.md` | Search Design section — replace |

---

## 1. Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Query mechanism | `ILIKE '%keyword%'` on `notes.title` | Only mechanism that supports substring match; FTS (`plainto_tsquery`) cannot match "asad" inside "asad123" |
| Index type | `pg_trgm` GIN (`gin_trgm_ops`) on `title` | Makes `ILIKE '%…%'` efficient for queries ≥ 3 chars; without it every search is a full table scan |
| Drop `notes_fts_idx` | Yes — include in same migration | FTS index is now dead weight; removing it reduces write overhead on every note insert/update |
| Highlight generation | `buildHeadline()` in service layer | Pure string logic — no DB involvement; consistent with "no business logic in repository" rule |
| `%` wildcard placement | Built in service (`const pattern = \`%${q}%\``) **before** the tagged template | Prisma parameterises `${pattern}` as a single value — safe. If built inside the template it would be `'%' || ${q} || '%'`, which requires a SQL expression and breaks parameterisation |
| Result ordering | `updatedAt DESC` | No `ts_rank` signal exists without tsvector; recency is a sensible default |
| Row type name | Rename `FtsRow` → `KeywordRow` | Shape changed (removed `headline` + `rank`); keeping the old name would be misleading |
| Controller / routes / app.ts | No change | Already wired and correct for `GET /api/search` |
| `packages/shared` | No change | `SearchResultDTO.headline` is a plain `string` — the source of the value changes but the type does not |

---

## 2. TypeScript Interfaces (Final Shapes)

### `search.repository.ts` — internal row type

```typescript
// Replaces FtsRow — headline and rank removed; computed in service
interface KeywordRow {
  id:        string
  title:     string
  createdAt: Date
  updatedAt: Date
  total:     bigint  // COUNT(*) OVER() — PostgreSQL returns bigint
}
```

### `search.service.ts` — highlight helper (module-level, not exported)

```typescript
function buildHeadline(title: string, q: string): string {
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return title.replace(new RegExp(`(${escaped})`, 'gi'), '<b>$1</b>')
}
```

> Escaping regex metacharacters prevents crashes on queries like `(test)` or `c++`.
> The `gi` flags ensure case-insensitive matching and all-occurrences wrapping.

### Shared DTOs (unchanged)

```typescript
// packages/shared/src/schemas/notes.ts — no change
export type SearchQueryDTO = { q: string; page: number; limit: number }

export interface SearchResultDTO {
  id:        string
  title:     string
  headline:  string   // now built in service, not from ts_headline
  tags:      Pick<TagDTO, 'name' | 'color'>[]
  createdAt: string
  updatedAt: string
}

export interface PaginatedSearchResultsDTO {
  items:  SearchResultDTO[]
  total:  number
  page:   number
  limit:  number
  query:  string
}
```

---

## 3. DB Changes

### Migration file

**Generated via:**
```bash
pnpm --filter backend exec prisma migrate dev --create-only --name replace_fts_with_trgm_keyword_index
```

**SQL content:**
```sql
-- Drop legacy FTS GIN index (no longer used)
DROP INDEX CONCURRENTLY IF EXISTS notes_fts_idx;

-- Enable pg_trgm extension (required for gin_trgm_ops)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on title for fast ILIKE partial match
CREATE INDEX CONCURRENTLY IF NOT EXISTS notes_title_trgm_idx
  ON notes
  USING GIN (title gin_trgm_ops);
```

**Backward-compatible?** Yes.
- Dropping `notes_fts_idx` only affects query performance for the old FTS query (which is being removed).
- Adding `notes_title_trgm_idx` is an additive change — no columns added, no data modified.
- `schema.prisma` model is **unchanged** — expression indexes live outside Prisma schema.

---

## 4. All Files to Create / Modify

| File | Action | Summary |
|------|--------|---------|
| `apps/backend/prisma/migrations/<ts>_replace_fts_with_trgm_keyword_index/migration.sql` | **CREATE** (via `--create-only`) | DROP FTS index + pg_trgm + trigram GIN index |
| `apps/backend/src/repositories/search.repository.ts` | **MODIFY** | Replace `FtsRow` with `KeywordRow`; replace FTS `$queryRaw` with ILIKE `$queryRaw` |
| `apps/backend/src/services/search.service.ts` | **MODIFY** | Add `buildHeadline()`; replace `row.headline` with `buildHeadline(row.title, q)` |
| `apps/backend/src/__tests__/search.service.test.ts` | **MODIFY** | Update mock row shape; update U01/U06; add U08–U10 for `buildHeadline` |
| `apps/backend/src/__tests__/search.integration.test.ts` | **MODIFY** | Move keywords from content to title; replace I12 relevance test with `updatedAt` ordering test |
| `openspec/openapi.yaml` | **MODIFY** | Update `/search` summary/description + `SearchResult.headline` description |
| `docs/FRS.md` | **MODIFY** | Update FR-4 acceptance criteria |
| `docs/SDS.md` | **MODIFY** | Replace Search Design section |

**Total: 0 new files, 8 modified.**
No new routes, no new controllers, no shared package changes.

---

## 5. Layer Breakdown

### `search.repository.ts` — full replacement

```typescript
import type { Note, Tag } from '@prisma/client'
import { prisma } from '../lib/prisma'

interface KeywordRow {
  id:        string
  title:     string
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
  ): Promise<KeywordRow[]> {
    const pattern = `%${q}%`
    const offset  = (page - 1) * limit

    return prisma.$queryRaw<KeywordRow[]>`
      SELECT
        id,
        title,
        "createdAt",
        "updatedAt",
        COUNT(*) OVER () AS total
      FROM notes
      WHERE "userId"    = ${userId}
        AND "deletedAt" IS NULL
        AND title       ILIKE ${pattern}
      ORDER BY "updatedAt" DESC
      LIMIT  ${limit}
      OFFSET ${offset}
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

> `findManyWithTags` is **unchanged** — tag hydration pattern stays the same.
>
> Column quoting: `"userId"`, `"deletedAt"`, `"createdAt"`, `"updatedAt"` quoted because Prisma preserves camelCase column names in PostgreSQL.
>
> `total` is `bigint` in PostgreSQL — convert with `Number()` in the service. Never `parseInt` (loses precision for large values, though this is academic at MVP scale).

---

### `search.service.ts` — full replacement

```typescript
import type {
  SearchQueryDTO,
  SearchResultDTO,
  PaginatedSearchResultsDTO,
  TagDTO,
} from '@note-app/shared'
import { searchRepository } from '../repositories/search.repository'
import { AppError } from '../errors/domain-errors'

function buildHeadline(title: string, q: string): string {
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return title.replace(new RegExp(`(${escaped})`, 'gi'), '<b>$1</b>')
}

export const searchService = {
  async search(userId: string, dto: SearchQueryDTO): Promise<PaginatedSearchResultsDTO> {
    const q = dto.q.trim()
    if (q.length === 0) {
      throw new AppError('Search query must not be empty', 400, 'VALIDATION_ERROR')
    }

    const rows = await searchRepository.search(userId, q, dto.page, dto.limit)

    if (rows.length === 0) {
      return { items: [], total: 0, page: dto.page, limit: dto.limit, query: q }
    }

    const ids           = rows.map(r => r.id)
    const notesWithTags = await searchRepository.findManyWithTags(ids)

    const tagMap = new Map<string, Pick<TagDTO, 'name' | 'color'>[]>(
      notesWithTags.map(n => [
        n.id,
        n.tags.map(t => ({ name: t.name, color: t.color })),
      ]),
    )

    const items: SearchResultDTO[] = rows.map(row => ({
      id:        row.id,
      title:     row.title,
      headline:  buildHeadline(row.title, q),
      tags:      tagMap.get(row.id) ?? [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))

    return {
      items,
      total: Number(rows[0].total),
      page:  dto.page,
      limit: dto.limit,
      query: q,
    }
  },
}
```

---

### `search.controller.ts` — no change

Already correct. Parses via `SearchQuerySchema`, delegates to `searchService.search`, returns `{ data: result }`.

---

### `search.routes.ts` — no change

Already: `router.get('/', authenticate, searchController.search)`.

---

## 6. Test Changes

### `search.service.test.ts` — changes required

**Mock row shape**: Remove `headline` and `rank` from `makeFtsRow`; rename to `makeKeywordRow`.

**Affected existing tests:**
| Test | Change |
|------|--------|
| U01 | Update `makeFtsRow` → `makeKeywordRow` (no `headline`/`rank`); assert `headline` comes from `buildHeadline('Meeting notes', 'roadmap')` — which is `'Meeting notes'` with no `<b>` (no match in title) → update title to include keyword |
| U04 | Change `total: BigInt(42)` in `makeKeywordRow` — structure same, name changes |
| U06 | Change `makeFtsRow` → `makeKeywordRow`; remove `rank` field |

**New tests to add:**
| Test | Scenario |
|------|----------|
| U08 | `buildHeadline('hello asad world', 'asad')` → `'hello <b>asad</b> world'` |
| U09 | `buildHeadline('ASAD123', 'asad')` → `'<b>ASAD</b>123'` (case-insensitive, preserves original casing) |
| U10 | `buildHeadline('test (scope)', '(scope)')` → `'test <b>(scope)</b>'` (regex special chars escaped) |

> `buildHeadline` is not exported — test it indirectly via `searchService.search` with a mocked repository that returns a row with a known title, then assert on `result.items[0].headline`.

---

### `search.integration.test.ts` — changes required

The existing tests create notes with the keyword in the **content** field. Since AB-1020 searches title-only, all note creation data must move the keyword to the title.

**Test-by-test changes:**

| Test | Existing data | Updated data |
|------|---------------|-------------|
| I01 | `title: 'Meeting notes'`, `content: '…Q3 roadmap…'` | `title: 'roadmap meeting notes'`, `content: 'team sync'` |
| I02 | Same as I01 | Same fix as I01; assert `headline` contains `<b>roadmap</b>` |
| I03 (soft-delete) | `title: 'Deleted note'`, `content: '…roadmap keyword'` | `title: 'roadmap deleted note'`, `content: ''` |
| I04 (IDOR) | `title: 'Alice roadmap'`, content: `'Alice roadmap content'` | Already has keyword in title — **no change needed** |
| I05 (no match) | `content: '…Q3 roadmap'`, query `'xyz_nomatch'` | `title: 'roadmap note'`; query stays `'xyz_nomatch'` |
| I06/I07 (pagination) | `title: 'First hello note'`, `content: 'hello world one'` | Title already contains keyword — **no change needed** |
| I11 (tags) | `title: 'Tagged roadmap note'`, `content: 'roadmap planning session'` | Title already contains keyword — **no change needed** |
| I12 (ordering) | FTS `ts_rank` ordering test | **Replace entirely** — see below |

**I12 replacement — `updatedAt DESC` ordering:**
```
Scenario: Two notes with keyword in title; most recently updated is returned first.
Setup:
  1. Create note A ("roadmap alpha") — older
  2. Slightly later, create note B ("roadmap beta") — newer
Assert: items[0].title === 'roadmap beta'
```

> Note: `createdAt` order is sufficient in test since both notes are created in sequence with no explicit timestamp manipulation.

---

## 7. Doc + Spec Changes (exact diffs)

### `docs/FRS.md`

Replace lines in FR-4:
```
Old:
* PostgreSQL Full Text Search used.
* Search supports pagination.
* Search highlights matching keywords.

New:
* Keyword search with partial (substring) match support.
* Search is case-insensitive.
* Search supports pagination.
* Search highlights matching keywords in the title.
```

### `docs/SDS.md`

Replace the Search Design section:
```
Old:
PostgreSQL Full Text Search

Indexes:
* tsvector(title || content)

Functions:
* to_tsvector()
* plainto_tsquery()
* ts_headline()

New:
PostgreSQL pg_trgm trigram index

Query:
* ILIKE '%keyword%' on notes.title
* Case-insensitive; partial (substring) matches supported

Index:
* GIN trigram index using gin_trgm_ops on notes.title
* Effective for queries ≥ 3 characters; sequential scan for shorter queries

Highlight:
* Application-layer: matched substring wrapped in <b> tags via regex
* No ts_headline — FTS functions not used
```

### `openspec/openapi.yaml`

Two description-only changes (no schema structure changes):
1. `/search` `summary` + `description` — replace FTS language with ILIKE/pg_trgm language
2. `SearchResult.headline` `description` + `example` — replace `ts_headline` language with app-layer regex language

---

## 8. Quality Gates

Run in this order before committing:

```bash
pnpm tsc --noEmit                # 1. type-check monorepo — fix all errors first
pnpm --filter backend lint       # 2. lint backend
pnpm --filter backend test       # 3. unit + integration tests
pnpm --filter backend build      # 4. build check
```

---

## 9. Implementation Order (sequential — each phase depends on the previous)

| Phase | Tasks | Files |
|-------|-------|-------|
| **P0 — Migration** | Generate `--create-only`, write SQL, apply | `migration.sql` |
| **P1 — Repository** | Replace `FtsRow` + FTS query | `search.repository.ts` |
| **P2 — Service** | Add `buildHeadline`, fix mapping | `search.service.ts` |
| **P3 — Checkpoint** | `pnpm tsc --noEmit` + `pnpm --filter backend build` | — |
| **P4 — Unit tests** | Update mock shape, add U08–U10 | `search.service.test.ts` |
| **P5 — Integration tests** | Move keywords to title, replace I12 | `search.integration.test.ts` |
| **P6 — Final gates** | All four quality gates green | — |
| **P7 — Docs + Spec** | FRS.md, SDS.md, openapi.yaml | 3 files |

P4 and P5 can run in parallel. P7 has no code dependency and can run at any point after P0.

---

## 10. Open Questions Resolved

| # | Question | Decision |
|---|----------|----------|
| Q1 | Drop `notes_fts_idx`? | Yes — migration confirmed it exists; drop in same migration as trigram add |
| Q2 | Rename `FtsRow`? | Yes → `KeywordRow` — shape is different, old name is misleading |
| Q3 | Where does `buildHeadline` live? | Service layer — pure logic, not a DB concern |
| Q4 | Wildcard injection pattern? | Build `pattern = \`%${q}%\`` in service before tagged template |
| Q5 | `findManyWithTags` change? | None — tag hydration pattern is identical |
