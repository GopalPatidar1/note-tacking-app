# Specification — AB-1020: Keyword Search with Partial Match

**Ticket:** AB-1020
**Type:** Backend Feature (replaces AB-1007)
**Status:** COMPLETED
**Branch:** `feat/AB-1020-keyword-search`

---

## 1. Requirements

| ID | Requirement |
|----|-------------|
| R-01 | Search MUST support partial/substring matching on `notes.title` — querying "asad" MUST match "asad123" |
| R-02 | Search MUST be case-insensitive |
| R-03 | The search mechanism MUST use `ILIKE '%keyword%'` on `notes.title` (NOT PostgreSQL FTS) |
| R-04 | A `pg_trgm` GIN index on `notes.title` MUST be created via Prisma raw migration |
| R-05 | The legacy FTS GIN index (`notes_fts_idx`) MUST be dropped in the same migration |
| R-06 | The `headline` field in `SearchResultDTO` MUST contain the matched keyword wrapped in `<b>` tags (application-layer, not `ts_headline`) |
| R-07 | Multiple keyword occurrences in the title MUST all be wrapped |
| R-08 | Regex special characters in the query MUST be escaped before building the `<b>` regex |
| R-09 | Results MUST be ordered by `updatedAt DESC` (no `ts_rank` without FTS) |
| R-10 | The API contract (`/search` endpoint, `SearchResultDTO`, `PaginatedSearchResultsDTO`) MUST remain unchanged |
| R-11 | Search MUST exclude soft-deleted notes and notes from other users |
| R-12 | A whitespace-only `q` MUST return `400 VALIDATION_ERROR` |
| R-13 | `docs/FRS.md` FR-4 and `docs/SDS.md` Search Design section MUST be updated to reflect ILIKE approach |
| R-14 | `openspec/openapi.yaml` `/search` endpoint description and `SearchResult.headline` description MUST be updated |

---

## 2. Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC1 | `GET /search?q=asad` returns notes with "asad" as a substring in title |
| AC2 | "asad" matches "asad123" (partial match) |
| AC3 | "asad" matches "hello asad world" (substring match) |
| AC4 | "ASAD" matches "hello asad world" (case-insensitive) |
| AC5 | `headline` contains matched keyword in `<b>` tags |
| AC6 | Multiple occurrences of keyword in title are all wrapped |
| AC7 | Soft-deleted notes excluded |
| AC8 | Other users' notes excluded (IDOR protection) |
| AC9 | Unauthenticated request → 401 `UNAUTHORIZED` |
| AC10 | Missing `q` → 400 `VALIDATION_ERROR` |
| AC11 | Whitespace-only `q` → 400 `VALIDATION_ERROR` |
| AC12 | Pagination (`page` + `limit`) produces correct slices |
| AC13 | `total` reflects full match count |
| AC14 | `tags[]` contains only `name` and `color` per tag |

---

## 3. Affected Capabilities

| Capability | Impact |
|-----------|--------|
| Search mechanism | Changed — FTS `plainto_tsquery` → `ILIKE '%keyword%'` on title |
| Search ordering | Changed — `ts_rank DESC` → `updatedAt DESC` |
| Headline generation | Changed — `ts_headline` (DB) → `buildHeadline()` (application layer) |
| Database index | Changed — `notes_fts_idx` (GIN FTS) dropped; `notes_title_trgm_idx` (GIN trigram) added |
| API contract | Unchanged — same endpoint, same DTOs |
| Shared package | Unchanged — `SearchQuerySchema`, `SearchResultDTO`, `PaginatedSearchResultsDTO` unchanged |
| FRS.md | Updated — FR-4 acceptance criteria |
| SDS.md | Updated — Search Design section |
| openapi.yaml | Updated — description fields only (no schema structure changes) |
| AB-1013 Search UI | Unaffected — calls same endpoint; highlight `<b>` tags still present |

---

## 4. Functional Behavior

### DB Migration
```sql
DROP INDEX CONCURRENTLY IF EXISTS notes_fts_idx;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS notes_title_trgm_idx
  ON notes USING GIN (title gin_trgm_ops);
```

### search.repository.ts (replacement query)
```typescript
const pattern = `%${q}%`
prisma.$queryRaw<KeywordRow[]>`
  SELECT id, title, "createdAt", "updatedAt", COUNT(*) OVER() AS total
  FROM notes
  WHERE "userId" = ${userId}
    AND "deletedAt" IS NULL
    AND title ILIKE ${pattern}
  ORDER BY "updatedAt" DESC
  LIMIT ${limit} OFFSET ${offset}
`
```
`KeywordRow`: `{ id, title, createdAt: Date, updatedAt: Date, total: bigint }`

### buildHeadline helper (service layer)
```typescript
function buildHeadline(title: string, q: string): string {
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return title.replace(new RegExp(`(${escaped})`, 'gi'), '<b>$1</b>')
}
```
- `gi` flags: case-insensitive + all occurrences
- Escaping prevents crashes on queries like `(test)` or `c++`

### Service flow (unchanged except headline source)
1. Trim `q`; throw `AppError(400)` if empty
2. `searchRepository.search(userId, q, page, limit)` → `KeywordRow[]`
3. If empty → return `{ items: [], total: 0, ... }`
4. `searchRepository.findManyWithTags(ids)` → tag hydration
5. Map rows: `headline: buildHeadline(row.title, q)`
6. Return `PaginatedSearchResultsDTO`

---

## 5. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| AB-1007 | Supersedes | FTS implementation replaced; API contract preserved |
| AB-1004 | Prerequisite | `notes` table with `title`, `userId`, `deletedAt` columns |
| AB-1001 | Prerequisite | Prisma `$queryRaw` infrastructure |
| AB-1002 | Prerequisite | `authenticate` middleware |
| `packages/shared` | Internal | No changes; `SearchQuerySchema`, `SearchResultDTO`, `PaginatedSearchResultsDTO` unchanged |
| `pg_trgm` PostgreSQL extension | Technical | Required for `gin_trgm_ops` operator class |
| AB-1013 | Consumer | Frontend Search UI calls the same endpoint; `<b>` tags still present in headline |
