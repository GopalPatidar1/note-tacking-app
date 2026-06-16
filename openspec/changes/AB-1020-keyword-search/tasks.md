# Task Checklist — AB-1020: Keyword Search with Partial Match

**Branch:** `feat/AB-1020-keyword-search`
**Status:** AWAITING APPROVAL

---

## Phase 0 — DB Migration

> Goal: `notes_fts_idx` dropped, `pg_trgm` extension enabled, `notes_title_trgm_idx` applied.
> No code changes yet — just DB state correct before any query logic is written.

- [ ] **T01** — Generate empty migration file
  ```bash
  pnpm --filter backend exec prisma migrate dev \
    --create-only \
    --name replace_fts_with_trgm_keyword_index
  ```
  _Verify: new directory under `apps/backend/prisma/migrations/<timestamp>_replace_fts_with_trgm_keyword_index/` exists with empty `migration.sql`._

- [ ] **T02** — Write SQL into the generated `migration.sql`
  ```sql
  -- Drop legacy FTS GIN index (replaced by trigram index)
  DROP INDEX CONCURRENTLY IF EXISTS notes_fts_idx;

  -- Enable pg_trgm extension (required for gin_trgm_ops)
  CREATE EXTENSION IF NOT EXISTS pg_trgm;

  -- GIN trigram index on title for fast ILIKE partial match
  CREATE INDEX CONCURRENTLY IF NOT EXISTS notes_title_trgm_idx
    ON notes
    USING GIN (title gin_trgm_ops);
  ```
  _Note: `CONCURRENTLY` is safe for dev. Ask before running `prisma migrate deploy` on staging/prod._

- [ ] **T03** — Apply the migration
  ```bash
  pnpm --filter backend exec prisma migrate dev
  ```
  _Verify: migration applied with no errors; `schema.prisma` model unchanged; `prisma generate` reruns automatically._

### ✅ Checkpoint 0

```bash
pnpm tsc --noEmit              # 0 type errors
pnpm --filter backend build    # compiles clean
```

---

## Phase 1 — Core Backend

> Goal: `GET /api/search?q=asad` returns notes whose title contains "asad" as a substring.
> T04 must complete before T05 (service imports repository row type).

- [ ] **T04** — Update `apps/backend/src/repositories/search.repository.ts`
  - Remove `FtsRow` interface and replace with `KeywordRow`:
    ```typescript
    interface KeywordRow {
      id:        string
      title:     string
      createdAt: Date
      updatedAt: Date
      total:     bigint
    }
    ```
  - Remove `ts_headline`, `ts_rank`, `plainto_tsquery`, `to_tsvector` from the SQL query
  - Replace with ILIKE query:
    ```typescript
    async search(userId, q, page, limit): Promise<KeywordRow[]> {
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
  - Keep `findManyWithTags(ids)` **unchanged**
  - _Verify: `pnpm tsc --noEmit` — 0 errors after this file change._

- [ ] **T05** — Update `apps/backend/src/services/search.service.ts`
  - Add `buildHeadline` helper at module level (not exported):
    ```typescript
    function buildHeadline(title: string, q: string): string {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return title.replace(new RegExp(`(${escaped})`, 'gi'), '<b>$1</b>')
    }
    ```
  - Rename local variable `ftsRows` → `rows` (matches new `KeywordRow[]` return type)
  - Replace `headline: row.headline` with `headline: buildHeadline(row.title, q)` in the `items` map
  - Remove any references to `rank` or FTS-specific types
  - Everything else (`trim/validate`, early-return, `tagMap`, `Number(rows[0].total)`) stays identical
  - _Verify: `pnpm tsc --noEmit` — 0 errors after this file change._

### ✅ Checkpoint 1

```bash
pnpm tsc --noEmit              # 0 type errors
pnpm --filter backend lint     # 0 warnings
pnpm --filter backend build    # compiles clean
```

> At this point `GET /api/search?q=test` should return 200 (or 401 without a token).
> Optional smoke test:
> ```bash
> curl -s http://localhost:3000/api/search?q=asad | jq .
> # Expected: { "error": { "code": "UNAUTHORIZED" } }
> ```

---

## Phase 2 — Docs + Spec

> Goal: FRS.md, SDS.md, and openapi.yaml updated to reflect ILIKE/pg_trgm approach.
> **T06, T07, T08 are PARALLEL** — no dependency between them.

- [ ] **T06** — Update `docs/FRS.md` (FR-4 acceptance criteria)

  Find the FR-4 block and replace the acceptance criteria:
  ```
  Before:
  * PostgreSQL Full Text Search used.
  * Search supports pagination.
  * Search highlights matching keywords.

  After:
  * Keyword search with partial (substring) match support.
  * Search is case-insensitive.
  * Search supports pagination.
  * Search highlights matching keywords in the title.
  ```

- [ ] **T07** — Update `docs/SDS.md` (Search Design section)

  Find `# Search Design` and replace the full section body:
  ```
  Before:
  PostgreSQL Full Text Search

  Indexes:
  * tsvector(title || content)

  Functions:
  * to_tsvector()
  * plainto_tsquery()
  * ts_headline()

  After:
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

- [ ] **T08** — Update `openspec/openapi.yaml` (two description-only edits)

  **Edit 1** — `/search` summary + description:
  ```
  Before:
  summary: Full-text search across note title and content
  description: |
    Uses PostgreSQL `plainto_tsquery` over a `tsvector(title || content)` index.
    Results include `ts_headline` excerpts with match highlights.

  After:
  summary: Keyword search across note title with partial match support
  description: |
    Uses PostgreSQL `ILIKE '%keyword%'` on the note `title` column backed by a
    `pg_trgm` GIN trigram index. Partial matches are supported — query "asad"
    matches titles "asad123", "hello asad world", etc. Case-insensitive.
    Results include a `headline` with the matched keyword wrapped in `<b>` tags.
    Results ordered by `updatedAt DESC`.
  ```

  **Edit 2** — `SearchResult.headline` description + example:
  ```
  Before:
  description: ts_headline excerpt with match highlights (HTML tags)
  example: "Discussed <b>Q3</b> roadmap with the team"

  After:
  description: |
    Note title with the matched keyword wrapped in <b> tags.
    Constructed in application code from the raw title.
  example: "hello <b>asad</b> world"
  ```

### ✅ Checkpoint 2

```bash
pnpm tsc --noEmit              # 0 type errors (no code changed in this phase)
pnpm --filter backend lint     # 0 warnings
```

---

## Phase 3 — Tests

> Goal: all tests green; `search.service.test.ts` and `search.integration.test.ts` updated to reflect ILIKE/title-only approach.
> **T09 and T10 are PARALLEL** — unit and integration tests have no dependency on each other.

- [ ] **T09** — Update `apps/backend/src/__tests__/search.service.test.ts`

  **Mock shape change** — rename `makeFtsRow` → `makeKeywordRow`, remove `headline` and `rank`:
  ```typescript
  // Remove FtsRow interface entirely
  // Add KeywordRow interface to match repository
  interface KeywordRow {
    id:        string
    title:     string
    createdAt: Date
    updatedAt: Date
    total:     bigint
  }

  function makeKeywordRow(overrides?: Partial<KeywordRow>): KeywordRow {
    return {
      id:        'note-1',
      title:     'hello asad world',   // keyword in title so headline test works
      createdAt: NOW,
      updatedAt: NOW,
      total:     BigInt(1),
      ...overrides,
    }
  }
  ```

  **Update existing tests:**
  | Test | Change |
  |------|--------|
  | U01 | Use `makeKeywordRow()`; assert `headline: 'hello <b>asad</b> world'` (built by `buildHeadline`) |
  | U02 | Use `makeKeywordRow()` shape — no structural change, still passes `[]` |
  | U04 | Use `makeKeywordRow({ total: BigInt(42) })` |
  | U05 | Use `makeKeywordRow({ id: 'note-999' })` |
  | U06 | Use `makeKeywordRow({ id: 'note-1' })` + `makeKeywordRow({ id: 'note-2' })` — remove `rank` field |
  | U07 | No change — still tests `findManyWithTags` not called on empty array |

  **Add new tests (test `buildHeadline` indirectly via service):**

  - [ ] **U08** — Single occurrence wrapped in `<b>` tags
    ```typescript
    it('U08: buildHeadline — wraps single keyword occurrence', async () => {
      vi.mocked(searchRepository.search).mockResolvedValue([
        makeKeywordRow({ title: 'hello asad world' }),
      ])
      vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([
        makeNoteWithTags({ id: 'note-1', title: 'hello asad world' }),
      ])
      const result = await searchService.search('user-1', { q: 'asad', page: 1, limit: 20 })
      expect(result.items[0].headline).toBe('hello <b>asad</b> world')
    })
    ```

  - [ ] **U09** — Case-insensitive wrapping preserves original casing
    ```typescript
    it('U09: buildHeadline — case-insensitive, preserves original casing', async () => {
      vi.mocked(searchRepository.search).mockResolvedValue([
        makeKeywordRow({ title: 'ASAD123' }),
      ])
      vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([
        makeNoteWithTags({ id: 'note-1', title: 'ASAD123' }),
      ])
      const result = await searchService.search('user-1', { q: 'asad', page: 1, limit: 20 })
      expect(result.items[0].headline).toBe('<b>ASAD</b>123')
    })
    ```

  - [ ] **U10** — Regex special characters in query are escaped (no crash)
    ```typescript
    it('U10: buildHeadline — escapes regex special characters in query', async () => {
      vi.mocked(searchRepository.search).mockResolvedValue([
        makeKeywordRow({ title: 'test (scope) here' }),
      ])
      vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([
        makeNoteWithTags({ id: 'note-1', title: 'test (scope) here' }),
      ])
      const result = await searchService.search('user-1', { q: '(scope)', page: 1, limit: 20 })
      expect(result.items[0].headline).toBe('test <b>(scope)</b> here')
    })
    ```

- [ ] **T10** — Update `apps/backend/src/__tests__/search.integration.test.ts`

  Move keyword from **content** to **title** in test data for all affected tests:

  | Test | Old note data | New note data |
  |------|---------------|---------------|
  | I01 | `title:'Meeting notes'`, `content:'…Q3 roadmap…'` | `title:'roadmap meeting notes'`, `content:'team sync'` |
  | I02 (headline `<b>`) | Same as I01 | Same fix; assert `headline` contains `<b>roadmap</b>` |
  | I03 (soft-delete) | `title:'Deleted note'`, `content:'…roadmap keyword'` | `title:'roadmap deleted note'`, `content:''` |
  | I04 (IDOR) | `title:'Alice roadmap'` | Already correct — no change |
  | I05 (no match) | `content:'…Q3 roadmap'`, query `'xyz_nomatch'` | `title:'roadmap note'`; query unchanged |
  | I06/I07 (pagination) | `title:'First hello note'` | Already correct — title has keyword |
  | I11 (tags) | `title:'Tagged roadmap note'` | Already correct — title has keyword |

  **Replace I12** — FTS relevance ordering → `updatedAt DESC` ordering:
  ```typescript
  skipIfNoDb('I12: results ordered by updatedAt DESC', async () => {
    const token = await registerAndLogin()

    // Create note A first (older updatedAt)
    await createNote(token, 'asad first note', 'content a')
    // Create note B after (newer updatedAt)
    await createNote(token, 'asad second note', 'content b')

    const res = await request
      .get('/api/search?q=asad')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(2)
    // Most recently created (B) should come first
    expect(res.body.data.items[0].title).toBe('asad second note')
  })
  ```

  **Add new integration test I13 — partial match confirmed:**
  ```typescript
  skipIfNoDb('I13: partial match — query "asad" matches title "asad123"', async () => {
    const token = await registerAndLogin()
    await createNote(token, 'asad123', 'some content')

    const res = await request
      .get('/api/search?q=asad')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].title).toBe('asad123')
    expect(res.body.data.items[0].headline).toBe('<b>asad</b>123')
  })
  ```

### ✅ Final Checkpoint (all quality gates)

```bash
pnpm tsc --noEmit              # 1. type-check monorepo — 0 errors
pnpm --filter backend lint     # 2. lint — 0 warnings
pnpm --filter backend test     # 3. all tests green (10 unit + 13 integration)
pnpm --filter backend build    # 4. build clean
```

---

## Summary

| Phase | Tasks | Modified Files | New Files |
|-------|-------|----------------|-----------|
| 0 — DB Migration | T01–T03 | — | `migration.sql` (via prisma) |
| 1 — Core Backend | T04–T05 | `search.repository.ts`, `search.service.ts` | — |
| 2 — Docs + Spec (PARALLEL) | T06–T08 | `FRS.md`, `SDS.md`, `openapi.yaml` | — |
| 3 — Tests (PARALLEL) | T09–T10 | `search.service.test.ts`, `search.integration.test.ts` | — |
| **Total** | **10 tasks** | **7 files** | **1 new file** |

**No changes to:** controller · routes · app.ts · `packages/shared`
