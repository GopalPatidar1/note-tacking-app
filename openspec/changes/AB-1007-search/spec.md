# Specification — AB-1007: Backend Search (FTS)

**Ticket:** AB-1007
**Type:** Backend Feature
**Status:** SUPERSEDED by AB-1020
**Branch:** `feat/AB-1007-search`

> **Note:** AB-1007 specified and implemented PostgreSQL Full-Text Search (`plainto_tsquery` / `ts_headline`).
> It was superseded by AB-1020 which replaced the FTS mechanism with `ILIKE '%keyword%'` partial matching
> on `notes.title` backed by a `pg_trgm` GIN index. The AB-1007 GIN FTS index (`notes_fts_idx`) was
> dropped as part of AB-1020. The API contract (`/search` endpoint, `SearchResultDTO`) remained unchanged.

---

## 1. Requirements

| ID | Requirement |
|----|-------------|
| R-01 | The backend MUST expose `GET /api/search?q=&page=&limit=` requiring authentication |
| R-02 | Search MUST use PostgreSQL Full-Text Search (`plainto_tsquery`) over `title || ' ' || content` |
| R-03 | Results MUST be ordered by `ts_rank DESC` (most relevant first) |
| R-04 | Results MUST include a `headline` field from `ts_headline` with matched terms wrapped in `<b>` tags |
| R-05 | Search MUST exclude soft-deleted notes and notes belonging to other users |
| R-06 | A whitespace-only `q` MUST return `400 VALIDATION_ERROR` |
| R-07 | A missing `q` parameter MUST return `400 VALIDATION_ERROR` |
| R-08 | Results MUST include `tags[]` (name + color only) for each matched note |
| R-09 | `total` MUST reflect the full match count, not the page size |
| R-10 | A GIN expression index on `to_tsvector('english', title || ' ' || content)` MUST be created via raw migration |
| R-11 | All SQL MUST use Prisma tagged template `$queryRaw` for parameterisation (no injection risk) |

---

## 2. Acceptance Criteria

- [ ] `GET /api/search?q=roadmap` → 200, items contain notes with "roadmap" in title or content
- [ ] `GET /api/search?q=roadmap` → `headline` contains `<b>roadmap</b>` (ts_headline output)
- [ ] `GET /api/search?q=roadmap` → excludes soft-deleted notes and other users' notes
- [ ] `GET /api/search?q=xyz_nomatch` → 200, `{ items: [], total: 0 }`
- [ ] `GET /api/search?q=hello&page=2&limit=1` → correct offset pagination
- [ ] `GET /api/search` (missing `q`) → 400 `VALIDATION_ERROR`
- [ ] `GET /api/search?q=   ` (whitespace only) → 400 `VALIDATION_ERROR`
- [ ] `GET /api/search?q=roadmap` (no auth) → 401 `UNAUTHORIZED`
- [ ] Results include correct `tags[]` (name + color only)
- [ ] More-relevant note (title + content match) ranks above less-relevant note (content only)

---

## 3. Affected Capabilities

| Capability | Impact |
|-----------|--------|
| Search | New — GET /api/search with FTS |
| Database | New — GIN expression index on `notes` via raw migration |
| Shared package | Extended — `SearchQuerySchema`, `SearchResultDTO`, `PaginatedSearchResultsDTO` |
| OpenAPI | No change (already fully specified) |
| Superseded by | AB-1020 replaces FTS with ILIKE; API contract unchanged |

---

## 4. Functional Behavior

### Search flow (as implemented)
1. Parse `SearchQuerySchema` (`q: min(1)`, `page`, `limit`)
2. Trim `q`; throw `AppError(400, VALIDATION_ERROR)` if empty after trim
3. Execute `$queryRaw` FTS query: `to_tsvector() @@ plainto_tsquery()` with `ts_rank` + `ts_headline` + `COUNT(*) OVER()`
4. If no rows → return early with empty result
5. Fetch notes with tags via `prisma.note.findMany({ where: { id: { in: ids } }, include: { tags: true } })`
6. Build `tagMap` from noteId → tags; map FTS rows to `SearchResultDTO`
7. Return `PaginatedSearchResultsDTO`

### SearchResultDTO shape
```
{ id, title, headline (HTML with <b> tags), tags[{ name, color }], createdAt, updatedAt }
```

### PaginatedSearchResultsDTO shape
```
{ items: SearchResultDTO[], total, page, limit, query }
```

---

## 5. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| AB-1001 | Prerequisite | Monorepo, Prisma singleton |
| AB-1002 | Prerequisite | `authenticate` middleware |
| AB-1004 | Prerequisite | `notes` table with `title` + `content` columns |
| `packages/shared` | Internal | Search schemas already present |
| AB-1020 | Supersedes | Replaces FTS with ILIKE; drops `notes_fts_idx`; API unchanged |
| AB-1013 | Consumer | Frontend Search UI calls this endpoint |
