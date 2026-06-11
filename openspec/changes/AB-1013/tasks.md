# Task Checklist — AB-1013: Frontend Search UI with Highlights

**Branch:** `feat/AB-1013-frontend-search-ui`  
**Plan:** `openspec/changes/AB-1013/plan.md`  
**Status:** AWAITING APPROVAL

---

## Phase 1 — Foundation (Shared Types)

> Unblocks all frontend work. No DB migrations needed — search index exists from AB-1004.

- [ ] **T-01** Add search types to `packages/shared/src/schemas/notes.ts`
  - Append `SearchQuerySchema` (Zod, `q` min 1, `page`, `limit`)
  - Append `SearchQueryDTO` (inferred from schema)
  - Append `SearchResultDTO` interface (`id`, `title`, `headline`, `tags: Pick<TagDTO,'name'|'color'>[]`, `createdAt`, `updatedAt`)
  - Append `PaginatedSearchResultsDTO` interface (`items`, `total`, `page`, `limit`, `query`)
  - No changes needed to `packages/shared/src/index.ts` (already re-exports `./schemas/notes`)

### Phase 1 Checkpoint

```bash
pnpm tsc --noEmit          # must pass with 0 errors
pnpm --filter frontend lint # must pass with 0 warnings
```

---

## Phase 2 — Core Implementation

> T-02 and T-03 depend only on T-01 and are **PARALLEL** — implement in either order or simultaneously.

- [ ] **T-02** `[PARALLEL]` Create `apps/frontend/src/hooks/notes/use-search.ts`
  - `useSearch(params: SearchQueryDTO)` using `useQuery`
  - `queryKey: ['search', params]`
  - `queryFn`: `GET /search` via `http`, returns `PaginatedSearchResultsDTO`
  - `enabled: params.q.length >= 2`
  - No `retry` override (inherits global `retry: false`)

- [ ] **T-03** `[PARALLEL]` Create `apps/frontend/src/components/notes/search-result-card.tsx`
  - Props: `result: SearchResultDTO`
  - Render title (`h3`, truncated), headline (`dangerouslySetInnerHTML`), tags (colored pills), date (`Intl.DateTimeFormat`)
  - Tailwind: `[&_b]:font-semibold [&_b]:text-foreground` to style `<b>` highlight tags
  - `line-clamp-3` on headline paragraph
  - Entire `<Card>` clickable → `navigate('/notes/${result.id}')`
  - `key={tag.name}` on tag pills (no `id` in `Pick<TagDTO,'name'|'color'>`)

### Phase 2 Checkpoint

```bash
pnpm tsc --noEmit
pnpm --filter frontend lint
```

---

## Phase 3 — Integration

> T-04, T-05, T-06 can all be done in parallel; T-04 depends on T-02 + T-03 being compilable.

- [ ] **T-04** `[PARALLEL]` Create `apps/frontend/src/pages/notes/search.page.tsx`
  - Local state: `inputValue` (controlled input, live)
  - URL state: `q`, `page` from `useSearchParams`
  - `useEffect` sync: when URL `q` changes externally (back/forward), update `inputValue`
  - `useEffect` debounce: 400ms timeout on `inputValue` changes
    - If `inputValue.length < 2`: clear `q` and `page` params with `replace: true`
    - Otherwise: `setSearchParams({ q: inputValue, page: '1' }, { replace: true })`
  - `useSearch({ q, page, limit: DEFAULT_LIMIT })` — `enabled` guard lives in hook
  - Render four mutually exclusive states:
    - **Idle** (`q.length < 2 && !isLoading`): "Type at least 2 characters to search."
    - **Loading** (`isLoading && q.length >= 2`): 3× skeleton rows (`h-28 animate-pulse`)
    - **Error** (`isError`): "Search failed. Please try again."
    - **Results** (`data`): result count, `SearchResultCard` list, `NotesPagination`
    - **Empty** (sub-state of results, `data.items.length === 0`): "No notes found for «query»."
  - `handlePageChange`: `setSearchParams({ q, page: String(p) })` — no `replace`, adds history entry
  - Pagination uses `data.page / data.total / data.limit` (not raw URL params)
  - Wrapped in `<AppLayout>` with no sidebar prop (full-width layout)

- [ ] **T-05** `[PARALLEL]` Modify `apps/frontend/src/components/layout/app-layout.tsx`
  - Add `import { Link } from 'react-router-dom'`
  - Add `import { Search } from 'lucide-react'`
  - Insert `<Link to="/search" aria-label="Search notes">` with `<Search className="h-5 w-5" />` between the `NoteApp` logo span and the user/logout `<div>`
  - No prop changes to `AppLayoutProps`

- [ ] **T-06** `[PARALLEL]` Modify `apps/frontend/src/router.tsx`
  - Add `import { SearchPage } from '@/pages/notes/search.page'`
  - Add `{ path: '/search', element: <SearchPage /> }` inside the `<ProtectedRoute>` children array

### Phase 3 Checkpoint

```bash
pnpm tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend build   # catches missing imports and unused vars
```

---

## Phase 4 — Tests

> One test file per testable unit. All test scenarios map directly to FRS acceptance criteria.

- [ ] **T-07** Create `apps/frontend/src/hooks/notes/use-search.test.ts`

  **Scenario A — enabled guard:**
  - Given `q = 'a'` (length 1), assert `useSearch` does NOT call `GET /search`

  **Scenario B — fires when q >= 2:**
  - Given `q = 'ro'` (length 2), assert `GET /search?q=ro&page=1&limit=20` is called

  **Scenario C — returns paginated data:**
  - Mock `http.get` to return a `PaginatedSearchResultsDTO`
  - Assert hook resolves with `data.items`, `data.total`, `data.query`

  **Scenario D — unique cache keys:**
  - Different `q` values produce different `queryKey` entries

- [ ] **T-08** Create `apps/frontend/src/components/notes/search-result-card.test.tsx`

  **Scenario E — renders result fields:**
  - Render `<SearchResultCard>` with a mock `SearchResultDTO`
  - Assert title text is visible
  - Assert headline HTML is rendered (tag names appear in DOM)
  - Assert tag pill text and date string are visible

  **Scenario F — highlights are rendered:**
  - Mock `headline = 'Discussed <b>roadmap</b> with team'`
  - Assert `<b>` tag is present in the DOM (not stripped)

  **Scenario G — click navigates to editor:**
  - Click the card
  - Assert `navigate('/notes/<id>')` was called

- [ ] **T-09** Create `apps/frontend/src/pages/notes/search.page.test.tsx`

  **Scenario H — idle state:**
  - Render `<SearchPage>` with empty URL (`q=''`)
  - Assert "Type at least 2 characters" prompt is visible
  - Assert no API call made

  **Scenario I — debounce fires after 400ms:**
  - Use `vi.useFakeTimers`
  - Type "ro" into input
  - Assert no API call immediately
  - Advance timers by 400ms
  - Assert URL param `q=ro` is set

  **Scenario J — loading state:**
  - Mock `useSearch` to return `isLoading: true`
  - Assert skeleton rows are rendered (3× `animate-pulse` divs)

  **Scenario K — results rendered:**
  - Mock `useSearch` to return data with 2 items
  - Assert result count text shows "2 results for …"
  - Assert 2 `SearchResultCard` components are rendered

  **Scenario L — empty state:**
  - Mock `useSearch` to return `{ items: [], total: 0, query: 'xyz' }`
  - Assert "No notes found for «xyz»" is visible

  **Scenario M — error state:**
  - Mock `useSearch` to return `isError: true`
  - Assert "Search failed" error message is visible

  **Scenario N — pagination (FR-4 pagination requirement):**
  - Mock data with `total: 40, limit: 20, page: 1`
  - Assert `NotesPagination` is rendered with correct props

### Phase 4 Checkpoint

```bash
pnpm tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test    # all scenarios green
pnpm --filter frontend build   # final build clean
```

---

## Completion Criteria

All tasks checked off AND all four gates passing:

```bash
pnpm tsc --noEmit                      # 0 type errors
pnpm --filter frontend lint            # 0 warnings
pnpm --filter frontend test            # all T-07 / T-08 / T-09 scenarios green
pnpm --filter frontend build           # 0 build errors
```

---

## Dependency Graph

```
T-01 (shared types)
  ├── T-02 (use-search hook)    ──┐
  └── T-03 (SearchResultCard)  ──┤
                                 └── T-04 (SearchPage)
                                       └── T-06 (router)

T-05 (AppLayout header) ── independent, can go any time after T-01 compiles
T-07 (hook tests)        ── after T-02
T-08 (card tests)        ── after T-03
T-09 (page tests)        ── after T-04
```
