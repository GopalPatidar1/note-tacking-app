# Task Checklist — AB-1013: Frontend Search UI with Highlights

**Branch:** `feat/AB-1013-search-ui-highlights`
**Plan:** `openspec/changes/AB-1013/plan.md`
**Status:** AWAITING APPROVAL

---

## Phase 1 — Foundation (Shared Types)

> Unblocks all frontend work. No DB migrations needed — search index exists from AB-1004.

- [ ] **T-01** Add search types to `packages/shared/src/schemas/notes.ts`
  - Append `SearchQuerySchema` — Zod: `q` (min 1), `page` (coerce int, default 1), `limit` (coerce int, max 100, default 20)
  - Append `SearchQueryDTO` — inferred from schema via `z.infer<typeof SearchQuerySchema>`
  - Append `SearchResultDTO` interface — `{ id, title, headline, tags: Pick<TagDTO,'name'|'color'>[], createdAt, updatedAt }`
  - Append `PaginatedSearchResultsDTO` interface — `{ items, total, page, limit, query }`
  - `packages/shared/src/index.ts` already re-exports `./schemas/notes` — no change needed

### Phase 1 Checkpoint

```bash
pnpm tsc --noEmit           # 0 type errors
pnpm --filter frontend lint  # 0 warnings
```

---

## Phase 2 — Core Implementation

> T-02 and T-03 depend only on T-01. They are **PARALLEL** — implement in either order.

- [ ] **T-02** `[PARALLEL]` Create `apps/frontend/src/hooks/notes/use-search.ts`
  - `export function useSearch(params: SearchQueryDTO)` using `useQuery`
  - `queryKey: ['search', params]` — unique cache entry per `{ q, page, limit }` triple
  - `queryFn`: `http.get<{ data: PaginatedSearchResultsDTO }>('/search', { params }).then(r => r.data.data)`
  - `enabled: params.q.length >= 2` — frontend 2-char guard; prevents noisy 1-char results
  - No `retry` override — inherits global `retry: false`
  - No `staleTime` override — always refetches on mount so results reflect latest note edits

- [ ] **T-03** `[PARALLEL]` Create `apps/frontend/src/components/notes/search-result-card.tsx`
  - Props: `result: SearchResultDTO`
  - Render `<h3>` title (truncated), `<p>` headline via `dangerouslySetInnerHTML={{ __html: result.headline }}`
  - Tailwind on headline: `[&_b]:font-semibold [&_b]:text-foreground` — styles PostgreSQL `<b>` tags; `line-clamp-3`
  - Tags rendered as colored pills: `key={tag.name}` (no `id` in `Pick<TagDTO,'name'|'color'>`)
  - Date via `Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric' })`
  - Entire `<Card>` is clickable — `onClick={() => navigate('/notes/${result.id}')}`

### Phase 2 Checkpoint

```bash
pnpm tsc --noEmit
pnpm --filter frontend lint
```

---

## Phase 3 — Integration

> T-04 depends on T-02 + T-03. T-05 and T-06 are independent and can run in parallel with T-04.

- [ ] **T-04** `[PARALLEL with T-05, T-06]` Create `apps/frontend/src/pages/notes/search.page.tsx`
  - Local state: `inputValue` (controlled `<Input>`, live-updated on every keystroke)
  - URL state: `q`, `page` from `useSearchParams` — single source of truth for the committed search
  - `useEffect` sync: when URL `q` changes externally (back/forward nav), update `inputValue`
  - `useEffect` debounce: 400ms timeout on `inputValue` changes
    - Skip if `inputValue === q` — avoids spurious timer on initial render
    - If `inputValue.length < 2`: delete `q` and `page` from params with `replace: true`
    - Otherwise: `setSearchParams({ q: inputValue, page: '1' }, { replace: true })`
  - `useSearch({ q, page, limit: DEFAULT_LIMIT })` — enabled guard lives in hook, not page
  - `handlePageChange(p)`: `setSearchParams({ q, page: String(p) })` — no `replace`, adds history entry
  - Pagination reads `data.page / data.total / data.limit` from response (not raw URL params)
  - Wrapped in `<AppLayout>` with no `sidebar` prop — full-width layout
  - **Five render states (mutually exclusive):**

    | State | Condition | UI |
    |-------|-----------|-----|
    | Idle | `q.length < 2 && !isLoading` | "Type at least 2 characters to search." |
    | Loading | `isLoading && q.length >= 2` | 3× `h-28 animate-pulse rounded-lg border bg-muted` |
    | Error | `isError` | "Search failed. Please try again." (`text-destructive`) |
    | Results | `data && items.length > 0` | result count + `SearchResultCard` list + `NotesPagination` |
    | Empty | `data && items.length === 0` | "No notes found for «query»." |

- [ ] **T-05** `[PARALLEL]` Modify `apps/frontend/src/components/layout/app-layout.tsx`
  - Add `import { Link } from 'react-router-dom'`
  - Add `import { Search } from 'lucide-react'`
  - Insert between logo `<span>` and user/logout `<div>`:
    ```tsx
    <Link to="/search" className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Search notes">
      <Search className="h-5 w-5" />
    </Link>
    ```
  - `AppLayoutProps` unchanged — `{ sidebar?: ReactNode, children: ReactNode }`

- [ ] **T-06** `[PARALLEL]` Modify `apps/frontend/src/router.tsx`
  - Add `import { SearchPage } from '@/pages/notes/search.page'`
  - Add `{ path: '/search', element: <SearchPage /> }` inside the `<ProtectedRoute>` children array

### Phase 3 Checkpoint

```bash
pnpm tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend build   # catches missing imports and unused exports
```

---

## Phase 4 — Tests

> One test file per new unit. All scenarios map to FRS FR-4 acceptance criteria.
> Test files live in `apps/frontend/src/__tests__/notes/`.

- [ ] **T-07** Create `__tests__/notes/use-search.test.ts`

  Setup: `vi.mock('@/lib/http', () => ({ http: { get: vi.fn() } }))`, `renderHook` with `QueryClientProvider` wrapper (`retry: false`).

  **Scenario A — enabled guard (q empty):**
  - `useSearch({ q: '', page: 1, limit: 20 })` → assert `http.get` NOT called

  **Scenario A2 — enabled guard (q = 1 char):**
  - `useSearch({ q: 'a', page: 1, limit: 20 })` → assert `http.get` NOT called

  **Scenario B — fires when q ≥ 2:**
  - `useSearch({ q: 'ro', page: 1, limit: 20 })` with mocked response
  - `waitFor(() => http.get called once)`, assert params `{ q: 'ro', page: 1, limit: 20 }`

  **Scenario C — returns paginated data:**
  - Mock returns `PaginatedSearchResultsDTO`
  - Assert `result.current.data` equals mock; `data.items.length === 1`; `data.query === 'roadmap'`

  **Scenario D — unique cache keys:**
  - Two hooks with `q: 'foo'` and `q: 'bar'` in separate wrappers
  - Assert `http.get` called with `q: 'foo'` AND with `q: 'bar'`

- [ ] **T-08** Create `__tests__/notes/search-result-card.test.tsx`

  Setup: `vi.mock('react-router-dom', async () => ({ ...actual, useNavigate: () => mockNavigate }))`, `MemoryRouter`, `userEvent`.

  **Scenario E — renders all result fields:**
  - Assert title `'Meeting notes'` visible
  - Assert tag pill `'Work'` visible
  - Assert formatted date `'Jun 10, 2026'` visible

  **Scenario F — ts_headline highlights preserved in DOM:**
  - `headline = 'Discussed <b>roadmap</b> with the team'`
  - Assert `container.querySelector('b')` is not null
  - Assert `bold.textContent === 'roadmap'`
  - Assert surrounding text (`/Discussed/`, `/with the team/`) visible

  **Scenario G — click navigates to editor:**
  - `userEvent.click` on the card
  - Assert `mockNavigate` called with `'/notes/note-1'`

- [ ] **T-09** Create `__tests__/notes/search.page.test.tsx`

  Setup: `vi.mock('@/lib/http')`, mock `useLogout` + `useAuthStore`, `QueryClientProvider` + `MemoryRouter` with `/search` and `/notes/:id` routes.

  **Scenario H — idle state (no query):**
  - `renderPage('/search')` → assert "Type at least 2 characters" visible; `http.get` not called

  **Scenario H2 — idle state (q = 1 char):**
  - `renderPage('/search?q=a')` → assert "Type at least 2 characters" visible

  **Scenario I — debounce: no immediate API call:**
  - `vi.useFakeTimers()`
  - `fireEvent.change(input, { target: { value: 'ro' } })`
  - Assert `http.get` NOT called immediately

  **Scenario I2 — debounce: fires after 400ms:**
  - `act(() => vi.advanceTimersByTimeAsync(400))`
  - Assert `http.get` called with `params: { q: 'roadmap', ... }`

  **Scenario J — loading state:**
  - `http.get` returns a never-resolving promise
  - `renderPage('/search?q=roadmap')` → assert 3× `.animate-pulse` in DOM

  **Scenario K — results rendered:**
  - Mock returns `{ total: 2, items: [...2 items...], query: 'roadmap' }`
  - Assert `'2 results for'` visible; both card titles visible

  **Scenario K2 — singular "result":**
  - `total: 1` → assert `'1 result for'` (no plural 's')

  **Scenario L — empty state:**
  - `items: [], total: 0, query: 'roadmap'`
  - Assert `'No notes found for'` visible

  **Scenario M — error state:**
  - `http.get.mockRejectedValue(new Error('Network error'))`
  - Assert `'Search failed'` visible

  **Scenario N — pagination shown when total > limit:**
  - `total: 40, limit: 20` → assert Next/Prev buttons present

  **Scenario N2 — pagination hidden when all fit on one page:**
  - `total: 2, limit: 20` → assert Next/Prev buttons absent

### Phase 4 Checkpoint

```bash
pnpm tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test    # all scenarios green
pnpm --filter frontend build   # final build clean
```

---

## Completion Criteria

All tasks checked off **and** all four gates passing:

```bash
pnpm tsc --noEmit                # 0 type errors
pnpm --filter frontend lint      # 0 warnings
pnpm --filter frontend test      # all T-07/T-08/T-09 scenarios green
pnpm --filter frontend build     # 0 build errors
```

---

## Dependency Graph

```
T-01 (shared types)
  ├── T-02 (use-search hook)   ──┐
  └── T-03 (SearchResultCard) ──┤
                                └── T-04 (SearchPage)
                                      └── T-06 (router)

T-05 (AppLayout header) — independent of T-04, can run any time after T-01
T-07 (hook tests)       — after T-02
T-08 (card tests)       — after T-03
T-09 (page tests)       — after T-04
```
