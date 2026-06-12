# Implementation Plan — AB-1013: Frontend Search UI with Highlights

**Date:** 2026-06-12
**Author:** gopalp@mindfiresolutions.com
**Ticket:** AB-1013 — Frontend — Search UI with highlights
**Branch:** `feat/AB-1013-search-ui-highlights`
**Status:** AWAITING APPROVAL

---

## 0. Scope Summary

Pure frontend ticket. No new API endpoints, no DB changes, no backend code changes.

The backend `GET /search?q=&page=&limit=` is already implemented (AB-1007) and specified in `openapi.yaml`.
This ticket adds the React UI that calls it.

**Files to create:** 3 (hook, component, page)
**Files to modify:** 3 (shared types, router, layout)
**Files to create (tests):** 3 (one per new file)

---

## 1. Database Changes

**None.** PostgreSQL full-text search index (`tsvector(title || content)`) already exists from AB-1004.
No migrations required.

---

## 2. Shared Package (`packages/shared`)

### 2a. File

```
packages/shared/src/schemas/notes.ts   ← MODIFY (append only)
```

### 2b. Types to append

```typescript
// ── search ──────────────────────────────────────────────────────

export const SearchQuerySchema = z.object({
  q:     z.string().min(1),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type SearchQueryDTO = z.infer<typeof SearchQuerySchema>

export interface SearchResultDTO {
  id:        string
  title:     string
  headline:  string                           // ts_headline HTML — contains <b> tags
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

`packages/shared/src/index.ts` already re-exports `./schemas/notes` via `export * from './schemas/notes'` — **no changes needed there**.

---

## 3. New Frontend Files

### 3a. `apps/frontend/src/hooks/notes/use-search.ts`

Follows the identical pattern to `use-notes.ts`.

```typescript
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { SearchQueryDTO, PaginatedSearchResultsDTO } from '@note-app/shared'

export function useSearch(params: SearchQueryDTO) {
  return useQuery({
    queryKey: ['search', params],
    queryFn: () =>
      http
        .get<{ data: PaginatedSearchResultsDTO }>('/search', { params })
        .then((r) => r.data.data),
    enabled: params.q.length >= 2,
  })
}
```

**Key decisions:**
- `queryKey: ['search', params]` — unique cache entry per `{ q, page, limit }` triple
- `enabled: params.q.length >= 2` — frontend guard; prevents API fire on 0–1 char (1-char results are noisy; backend requires min:1 but UX floor is 2)
- No `staleTime` override — inherits global default (always refetch on mount so results reflect the latest note edits)
- No `retry` override — inherits global `retry: false`

---

### 3b. `apps/frontend/src/components/notes/search-result-card.tsx`

Mirrors `NoteCard` structure but replaces `stripHtml(content)` preview with `dangerouslySetInnerHTML` on `headline`.

```typescript
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import type { SearchResultDTO } from '@note-app/shared'

interface SearchResultCardProps {
  result: SearchResultDTO
}

export function SearchResultCard({ result }: SearchResultCardProps) {
  const navigate = useNavigate()

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  }).format(new Date(result.updatedAt))

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => navigate(`/notes/${result.id}`)}
    >
      <CardContent className="p-4">
        <h3 className="truncate font-semibold">{result.title}</h3>
        {/* ts_headline produces only <b> tags on the user's own content — safe to render */}
        <p
          className="mt-1 line-clamp-3 text-sm text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground"
          dangerouslySetInnerHTML={{ __html: result.headline }}
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {result.tags.map((tag) => (
              <span
                key={tag.name}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{formattedDate}</span>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Key decisions:**
- `dangerouslySetInnerHTML` — safe: `ts_headline` is a PostgreSQL built-in that adds only `<b>` tags to the user's own note content. No third-party input. DOMPurify not required (approved in spec Q&A).
- `[&_b]:font-semibold [&_b]:text-foreground` — Tailwind arbitrary variant styles the `<b>` highlight tags from PostgreSQL without touching the HTML
- `line-clamp-3` — keeps card height predictable for long headlines
- `key={tag.name}` — `SearchResultDTO.tags` is `Pick<TagDTO,'name'|'color'>` (no `id`), tag names are unique per user

---

### 3c. `apps/frontend/src/pages/notes/search.page.tsx`

URL-state-driven search page with 400ms debounce and five render states.

```typescript
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { Input } from '@/components/ui/input'
import { NotesPagination } from '@/components/notes/notes-pagination'
import { SearchResultCard } from '@/components/notes/search-result-card'
import { useSearch } from '@/hooks/notes/use-search'
import { DEFAULT_LIMIT } from '@note-app/shared'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q    = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const [inputValue, setInputValue] = useState(q)

  // Keep input in sync when URL changes externally (back/forward navigation)
  useEffect(() => { setInputValue(q) }, [q])

  // Debounce: commit inputValue to URL 400ms after typing stops.
  // Guard: if input already matches URL, skip — avoids spurious timer on initial render.
  useEffect(() => {
    if (inputValue === q) return
    if (inputValue.length < 2) {
      setSearchParams(
        (prev) => { const n = new URLSearchParams(prev); n.delete('q'); n.delete('page'); return n },
        { replace: true },
      )
      return
    }
    const id = setTimeout(() => {
      setSearchParams({ q: inputValue, page: '1' }, { replace: true })
    }, 400)
    return () => clearTimeout(id)
  }, [inputValue]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, isError } = useSearch({ q, page, limit: DEFAULT_LIMIT })

  function handlePageChange(p: number) {
    // No replace — adds a history entry so user can navigate back between result pages
    setSearchParams({ q, page: String(p) })
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search notes…"
            className="pl-10"
            autoFocus
          />
        </div>

        {q.length < 2 && !isLoading && (
          <p className="text-center text-sm text-muted-foreground">
            Type at least 2 characters to search.
          </p>
        )}

        {isLoading && q.length >= 2 && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted" />
            ))}
          </div>
        )}

        {isError && (
          <p className="py-16 text-center text-destructive">
            Search failed. Please try again.
          </p>
        )}

        {!isLoading && !isError && data && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {data.total} result{data.total !== 1 ? 's' : ''} for &ldquo;{data.query}&rdquo;
            </p>
            {data.items.length === 0 ? (
              <p className="py-16 text-center text-muted-foreground">
                No notes found for &ldquo;{data.query}&rdquo;.
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  {data.items.map((result) => (
                    <SearchResultCard key={result.id} result={result} />
                  ))}
                </div>
                <div className="mt-8">
                  <NotesPagination
                    page={data.page}
                    total={data.total}
                    limit={data.limit}
                    onPageChange={handlePageChange}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
```

**State model:**

| State | Condition | UI |
|-------|-----------|-----|
| Idle | `q.length < 2 && !isLoading` | "Type at least 2 characters to search." |
| Loading | `isLoading && q.length >= 2` | 3× skeleton rows (`h-28 animate-pulse`) |
| Error | `isError` | "Search failed. Please try again." |
| Results | `data && items.length > 0` | result count + card list + pagination |
| Empty | `data && items.length === 0` | "No notes found for «query»." |

**Key decisions:**
- Two-value state: `inputValue` (local, live) vs. `q` (URL, debounced). Avoids input jumping back on every TanStack Query re-render.
- `replace: true` on keystroke debounce — keeps browser history clean while typing; page-change does NOT use `replace` — intentionally adds history entry so back-navigation works within search results.
- When `inputValue < 2`, URL params are cleared entirely (not set to empty string) — ensures a clean URL and prevents backend receiving a near-empty query.
- `data.page / data.limit` from the response are used as pagination source of truth — backend may clamp values.

---

## 4. Modified Frontend Files

### 4a. `apps/frontend/src/components/layout/app-layout.tsx`

Add `<Link to="/search">` with a `<Search>` icon to the header, between the logo and the user/logout section.

```diff
+import { Link } from 'react-router-dom'
+import { Search } from 'lucide-react'

 // In <header>:
 <span className="font-semibold">NoteApp</span>
+<Link
+  to="/search"
+  className="text-muted-foreground transition-colors hover:text-foreground"
+  aria-label="Search notes"
+>
+  <Search className="h-5 w-5" />
+</Link>
 <div className="flex items-center gap-3">
```

`AppLayoutProps` stays as `{ sidebar?: ReactNode, children: ReactNode }` — no interface change.

---

### 4b. `apps/frontend/src/router.tsx`

```diff
+import { SearchPage } from '@/pages/notes/search.page'

 {
   element: <ProtectedRoute />,
   children: [
     { path: '/notes',     element: <NotesListPage /> },
     { path: '/notes/new', element: <NoteEditorPage /> },
     { path: '/notes/:id', element: <NoteEditorPage /> },
+    { path: '/search',    element: <SearchPage /> },
   ],
 },
```

---

### 4c. `packages/shared/src/schemas/notes.ts`

Append-only — already covered in §2b above.

---

## 5. Test Files

### 5a. `apps/frontend/src/__tests__/notes/use-search.test.ts`

| Scenario | Description |
|----------|-------------|
| A | Does NOT call `GET /search` when `q` is empty or < 2 chars |
| B | Calls `GET /search` with correct params when `q` is 2+ chars |
| C | Returns `PaginatedSearchResultsDTO` on success |
| D | Unique cache keys: different `q` values produce separate `queryKey` entries |

Pattern: `vi.mock('@/lib/http')`, `renderHook` with `QueryClientProvider` wrapper, `waitFor`.

---

### 5b. `apps/frontend/src/__tests__/notes/search-result-card.test.tsx`

| Scenario | Description |
|----------|-------------|
| E | Renders title, tag pill name, formatted date |
| F | `<b>` tag from `ts_headline` is preserved in the DOM (not stripped) |
| G | Click on card calls `navigate('/notes/:id')` |

Pattern: `vi.mock('react-router-dom', ..., useNavigate: () => mockNavigate)`, `MemoryRouter`, `userEvent.click`.

---

### 5c. `apps/frontend/src/__tests__/notes/search.page.test.tsx`

| Scenario | Description |
|----------|-------------|
| H | Idle prompt shown when no query or query < 2 chars; no API call |
| I | No API call immediately on input change; fires after 400ms via `vi.useFakeTimers` |
| J | 3 skeleton rows rendered while loading |
| K | Result count and both card titles rendered on success; singular/plural "result" |
| L | "No notes found" message when `items` is empty |
| M | "Search failed" error message when API rejects |
| N | Pagination rendered when total > limit; NOT rendered when all fit on one page |

Pattern: `vi.useFakeTimers` + `act(vi.advanceTimersByTimeAsync)`, `QueryClientProvider`, `MemoryRouter` with `/search` + `/notes/:id` routes.

---

## 6. Architecture Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Route | Dedicated `/search` page | Clean URL state; no collision with `/notes` tag/sort filters |
| State | URL search params only | Consistent with `/notes` page; shareable URLs; no extra Zustand slice |
| Query trigger | 400ms debounce + `enabled` guard | Low friction; avoids API call per keystroke; prevents noisy 1-char results |
| Min query length | 2 chars (frontend guard) | API allows 1-char but 1-char queries produce noisy results |
| Highlight rendering | `dangerouslySetInnerHTML` (no DOMPurify) | `ts_headline` built-in only produces `<b>` tags on user's own content — no XSS vector (approved in spec) |
| Result click | `/notes/:id` editor | Consistent with `NoteCard`; immediate edit access |
| Keyboard shortcut | Deferred | Not in FRS; approved as out of scope in spec |
| No tag sidebar | Omitted | `GET /search` has no `tagId` param; client-side tag filtering would mislead |
| Pagination | Reuse `<NotesPagination>` | Zero extra work; handles ellipsis, boundary cases |
| History on page change | No `replace` | User should be able to go back from page 3 → page 2 within results |
| staleTime | Default (no override) | Results should reflect latest note state; stale data after an edit is confusing |

---

## 7. Reuse of Existing Code

| Existing artifact | Reused in |
|-------------------|-----------|
| `<AppLayout>` | `SearchPage` — wraps in standard shell (no sidebar prop = full-width) |
| `<NotesPagination>` | `SearchPage` — unchanged; receives `data.page / total / limit` |
| `<Card>`, `<CardContent>` (shadcn/ui) | `SearchResultCard` — same structure as `NoteCard` |
| `<Input>` (shadcn/ui) | `SearchPage` search field |
| `http` Axios instance | `use-search.ts` — same import as `use-notes.ts` |
| `useSearchParams` + `setSearchParams` pattern | `SearchPage` — mirrors `NotesListPage` exactly |
| `DEFAULT_LIMIT` constant | `useSearch` call in `SearchPage` |
| `TagDTO` (via `Pick`) | `SearchResultDTO.tags` field shape |
| `Intl.DateTimeFormat` pattern | `SearchResultCard` — copied from `NoteCard` |
| `lucide-react` `Search` icon | `AppLayout` header + `SearchPage` input prefix |

---

## 8. Implementation Order

Execute strictly in this order to keep each step type-safe:

```
Step 1  packages/shared/src/schemas/notes.ts      ← ADD search types
Step 2  use-search.ts                              ← ADD hook (imports Step 1)
Step 3  search-result-card.tsx                    ← ADD component (imports Step 1)
Step 4  search.page.tsx                           ← ADD page (imports Steps 2 + 3)
Step 5  app-layout.tsx                            ← MODIFY add search icon link
Step 6  router.tsx                                ← MODIFY register /search route
Step 7  use-search.test.ts                        ← ADD hook tests
Step 8  search-result-card.test.tsx              ← ADD component tests
Step 9  search.page.test.tsx                     ← ADD page tests
```

---

## 9. Quality Gates

Run in this exact order. Fix all failures before advancing to the next gate.

```bash
# 1. Type-check (shared + frontend)
pnpm tsc --noEmit

# 2. Lint frontend
pnpm --filter frontend lint

# 3. Frontend unit tests
pnpm --filter frontend test

# 4. Frontend build
pnpm --filter frontend build
```

**No backend gates** — zero backend changes in this ticket.

---

## 10. Out of Scope

- Tag-filtered search — `GET /search` has no `tagId` param; requires backend change first
- `Cmd+K` keyboard shortcut — not in FRS, explicitly deferred (approved in spec)
- Inline search toolbar on `/notes` — separate UX decision
- Saved searches / search history — not in FRS
- DOMPurify sanitization — not needed; `ts_headline` is safe on own-content (approved in spec)
- Backend search implementation — already done (AB-1007)
