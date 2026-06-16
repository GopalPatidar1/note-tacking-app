# OpenSpec Proposal — Keyword Search with Partial Match

**Ticket:** AB-1020
**Supersedes:** AB-1007 (never implemented — safe to replace entirely)
**Status:** DRAFT
**Date:** 2026-06-16

---

## Problem

PostgreSQL Full-Text Search (`plainto_tsquery`) — the mechanism specified in
AB-1007 — operates on dictionary words and cannot match a keyword as a
substring. Searching `"asad"` would not match a note titled `"asad123"`.

Users expect partial / substring matching:

| Query  | Must match title     |
|--------|----------------------|
| `asad` | my name is asad      |
| `asad` | asad123              |
| `asad` | hello asad world     |

---

## Decision

Replace the FTS approach with case-insensitive `ILIKE '%keyword%'` on
`notes.title`, backed by a `pg_trgm` (trigram) GIN index.

| Axis | Choice | Reason |
|------|--------|--------|
| Mechanism | `ILIKE '%keyword%'` | Substring match — FTS cannot do this |
| Index | `pg_trgm` GIN (`gin_trgm_ops`) | Makes ILIKE fast for queries ≥ 3 chars |
| Scope | `title` only | Specified requirement |
| Case | Case-insensitive | Standard UX expectation; `ILIKE` handles this natively |
| Highlight | Application-layer regex | Wraps matched keyword in `<b>` tags; replaces `ts_headline` |
| Ordering | `updatedAt DESC` | No `ts_rank` signal without tsvector; recency is a reasonable default |
| Tags | Included in response | Keeps existing `SearchResult` schema shape unchanged |

---

## Scope of Change

| Artefact | Change |
|----------|--------|
| `docs/FRS.md` | Update FR-4 acceptance criteria |
| `docs/SDS.md` | Replace Search Design section |
| `openspec/openapi.yaml` | Update `/search` description + `SearchResult.headline` description |
| DB migration | Add `pg_trgm` extension + GIN trigram index on `notes.title` |
| `search.repository.ts` | Replace `$queryRaw` FTS SQL with ILIKE SQL |
| `search.service.ts` | Replace `ts_headline` with `buildHeadline()` helper |
| All other files | **No change** — controller, routes, app.ts, shared package unchanged |

AB-1007 migration was never applied — no `DROP INDEX` needed.

---

## Spec Deltas

### 1. `docs/FRS.md` — FR-4 Search

```diff
 # FR-4 Search

 Users shall search notes.

 Acceptance Criteria:

-* PostgreSQL Full Text Search used.
-* Search supports pagination.
-* Search highlights matching keywords.
+* Keyword search with partial (substring) match support.
+* Search is case-insensitive.
+* Search supports pagination.
+* Search highlights matching keywords in the title.
```

### 2. `docs/SDS.md` — Search Design section

```diff
 # Search Design

-PostgreSQL Full Text Search
-
-Indexes:
-
-* tsvector(title || content)
-
-Functions:
-
-* to_tsvector()
-* plainto_tsquery()
-* ts_headline()
+PostgreSQL pg_trgm trigram index
+
+Query:
+
+* ILIKE '%keyword%' on notes.title
+* Case-insensitive; partial (substring) matches supported
+
+Index:
+
+* GIN trigram index using gin_trgm_ops on notes.title
+* Effective for queries ≥ 3 characters; sequential scan for shorter queries
+
+Highlight:
+
+* Application-layer: matched substring wrapped in <b> tags via regex
+* No ts_headline — FTS functions not used
```

### 3. `openspec/openapi.yaml` — `/search` endpoint

```diff
   /search:
     get:
       tags: [Search]
-      summary: Full-text search across note title and content
+      summary: Keyword search across note title with partial match support
       description: |
-        Uses PostgreSQL `plainto_tsquery` over a `tsvector(title || content)` index.
-        Results include `ts_headline` excerpts with match highlights.
+        Uses PostgreSQL `ILIKE '%keyword%'` on the note `title` column backed by
+        a `pg_trgm` GIN trigram index. Partial matches are supported — query
+        "asad" matches titles "asad123", "hello asad world", etc.
+        Case-insensitive. Results include a `headline` with the matched keyword
+        wrapped in `<b>` tags. Results ordered by `updatedAt DESC`.
```

### 4. `openspec/openapi.yaml` — `SearchResult.headline` schema

```diff
         headline:
           type: string
-          description: ts_headline excerpt with match highlights (HTML tags)
-          example: "Discussed <b>Q3</b> roadmap with the team"
+          description: |
+            Note title with the matched keyword wrapped in <b> tags.
+            Constructed in application code from the raw title.
+          example: "hello <b>asad</b> world"
```

---

## Database Migration

**File:** `apps/backend/prisma/migrations/<ts>_add_notes_title_trgm_index/migration.sql`

```sql
-- Enable pg_trgm extension (required for gin_trgm_ops)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on title for fast case-insensitive partial match
CREATE INDEX CONCURRENTLY IF NOT EXISTS notes_title_trgm_idx
  ON notes
  USING GIN (title gin_trgm_ops);
```

> `schema.prisma` model is **unchanged** — expression index lives outside
> Prisma schema, same pattern as other raw migrations in this project.
>
> AB-1007 GIN FTS index (`notes_fts_idx`) was never applied — no DROP needed.
>
> `CONCURRENTLY` is safe for dev. Ask before running `prisma migrate deploy`
> on staging/prod (CLAUDE.md rule).

---

## Shared Package (`packages/shared`)

**No changes.** All existing types remain valid:

| Type | Status |
|------|--------|
| `SearchQuerySchema` — `q`, `page`, `limit` | Unchanged |
| `SearchResultDTO` — `id`, `title`, `headline`, `tags`, `createdAt`, `updatedAt` | Unchanged |
| `PaginatedSearchResultsDTO` — `items`, `total`, `page`, `limit`, `query` | Unchanged |

---

## Backend Layer Changes

### `search.repository.ts` — replace FTS query

**Internal row type:**

```typescript
interface KeywordRow {
  id:        string
  title:     string
  createdAt: Date
  updatedAt: Date
  total:     bigint  // COUNT(*) OVER() — convert with Number() in service
}
```

**Query:**

```typescript
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
}
```

> `ILIKE ${pattern}` — Prisma parameterises the value; no injection risk.
> `%` wildcards are appended in application code, not inside the template.
>
> `findManyWithTags(ids)` remains unchanged — used for tag hydration.

---

### `search.service.ts` — replace ts_headline with highlight helper

```typescript
function buildHeadline(title: string, q: string): string {
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return title.replace(new RegExp(`(${escaped})`, 'gi'), '<b>$1</b>')
}
```

Called per result row:

```typescript
headline: buildHeadline(row.title, q)
```

The rest of the service (`trim/validate`, early-return on empty, `tagMap`
construction, `Number(ftsRows[0].total)` conversion) is **unchanged**.

---

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC1 | `GET /search?q=asad` returns notes whose title contains "asad" as a substring |
| AC2 | Query "asad" matches title "asad123" (partial match) |
| AC3 | Query "asad" matches title "hello asad world" (substring match) |
| AC4 | Search is case-insensitive: "ASAD" matches "hello asad world" |
| AC5 | `headline` contains the matched keyword wrapped in `<b>` tags |
| AC6 | Multiple occurrences of the keyword in the title are all wrapped |
| AC7 | Soft-deleted notes (`deletedAt IS NOT NULL`) are excluded |
| AC8 | Notes belonging to other users are excluded (IDOR protection) |
| AC9 | Unauthenticated request returns 401 `UNAUTHORIZED` |
| AC10 | Missing `q` parameter returns 400 `VALIDATION_ERROR` |
| AC11 | Whitespace-only `q` returns 400 `VALIDATION_ERROR` |
| AC12 | Pagination works: `page` + `limit` produce correct slices |
| AC13 | `total` reflects the full match count, not the page size |
| AC14 | Response `tags[]` contains only `name` and `color` for each tag |

---

## Non-Functional Requirements

| Concern | Specification |
|---------|---------------|
| Performance | `pg_trgm` GIN index; `ILIKE '%keyword%'` uses the index for queries ≥ 3 chars |
| Short queries (1–2 chars) | Sequential scan fallback; acceptable at current data scale |
| Search latency NFR | < 500ms (carried over from FRS NFR) |
| SQL injection | Prisma tagged template parameterises all variables including `%pattern%` |
| XSS in headline | Only `<b>` tags emitted; keyword value is not injected as raw HTML |

---

## Out of Scope

| Item | Rationale |
|------|-----------|
| Content field search | Title-only for AB-1020; new ticket if needed |
| Result ranking by match position | `updatedAt DESC` is sufficient for MVP |
| Fuzzy / typo-tolerant matching | Not requested; different mechanism |

---

## Test Coverage Plan

### Unit tests (service layer)

| # | Scenario |
|---|----------|
| U01 | Valid query returns `PaginatedSearchResultsDTO` with correct shape |
| U02 | Empty FTS result → `{ items: [], total: 0 }` |
| U03 | Whitespace-only `q` throws `AppError(400, VALIDATION_ERROR)` |
| U04 | `bigint` total from raw row converted to `number` |
| U05 | Tags default to `[]` when noteId not in `tagMap` |
| U06 | `items` order preserved from repository row order |
| U07 | `findManyWithTags` not called when row array is empty |
| U08 | `buildHeadline` wraps single occurrence in `<b>` tags |
| U09 | `buildHeadline` wraps multiple occurrences (case-insensitive) |
| U10 | `buildHeadline` escapes regex special characters in `q` |

### Integration tests (controller + repository against real DB)

| # | Scenario |
|---|----------|
| I01 | `GET /search?q=asad` — 200, returns note with title "asad123" |
| I02 | `GET /search?q=asad` — 200, returns note with title "hello asad world" |
| I03 | `GET /search?q=ASAD` — 200, case-insensitive match on "asad world" |
| I04 | `GET /search?q=asad` — `headline` contains `<b>asad</b>` |
| I05 | `GET /search?q=asad` — soft-deleted note excluded |
| I06 | `GET /search?q=asad` — other user's note excluded (IDOR) |
| I07 | `GET /search?q=xyz_nomatch` — 200, `{ items: [], total: 0 }` |
| I08 | `GET /search?q=hello&page=2&limit=1` — correct offset pagination |
| I09 | `GET /search?q=hello&page=2&limit=1` — `total` reflects full match count |
| I10 | `GET /search` (missing `q`) — 400 `VALIDATION_ERROR` |
| I11 | `GET /search?q=   ` (whitespace only) — 400 `VALIDATION_ERROR` |
| I12 | `GET /search?q=asad` (no auth) — 401 `UNAUTHORIZED` |
| I13 | Result includes correct `tags[]` — only `name` + `color` |
