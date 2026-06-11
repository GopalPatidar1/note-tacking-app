# Implementation Plan — AB-1013: Frontend Search UI with Highlights

**Date:** 2026-06-11  
**Author:** gopalp@mindfiresolutions.com  
**Ticket:** AB-1013 — Frontend — Search UI with highlights  
**Branch:** `feat/AB-1013-frontend-search-ui`  
**Status:** AWAITING APPROVAL

---

## 0. Scope Summary

Pure frontend ticket. No new API endpoints, no DB changes, no backend code changes.

The backend `GET /search?q=&page=&limit=` is already implemented and specified in `openapi.yaml`. This ticket adds the React UI that calls it.

**Files to create: 3**  
**Files to modify: 3**

---

## 1. Database Changes

**None.** PostgreSQL full-text search index (`tsvector(title || content)`) already exists from AB-1004.

---

## 2. Shared Package (`packages/shared`)

### 2a. File to modify

```
packages/shared/src/schemas/notes.ts
```

### 2b. Additions — append to end of file

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
  headline:  string                          // ts_headline HTML — contains <b> tags
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

`packages/shared/src/index.ts` already re-exports `./schemas/notes` — **no changes needed there**.

---

## 3. Frontend — New Files

### 3a. `apps/frontend/src/hooks/notes/use-search.ts` (NEW)

Follows the exact same pattern as `use-notes.ts`.

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
- `queryKey: ['search', params]` — unique cache entry per `{ q, page, limit }` combination
- `enabled: params.q.length >= 2` — prevents API calls for 0–1 char inputs; the backend returns `400` for `q` shorter than 1 char, and single-char queries produce noisy results
- No `retry` override — inherits the global `retry: false` from `query-client.ts`

---

### 3b. `apps/frontend/src/components/notes/search-result-card.tsx` (NEW)

Mirrors `NoteCard` structure but replaces `stripHtml(content)` preview with `dangerouslySetInnerHTML` on the `ts_headline` field.

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
        {/* ts_headline returns HTML with <b> tags — rendering directly is safe
            because this is the authenticated user's own note content */}
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
- `dangerouslySetInnerHTML` — `ts_headline` is a PostgreSQL function that adds only `<b>` tags to the user's own note content. No third-party input. Safe to render directly.
- `[&_b]:font-semibold [&_b]:text-foreground` — Tailwind arbitrary variant to style the `<b>` tags produced by PostgreSQL without touching the HTML
- `line-clamp-3` — keeps the card height predictable even for long headlines
- `key={tag.name}` — `SearchResultDTO.tags` uses `Pick<TagDTO, 'name' | 'color'>` (no `id`), so `name` is used as the key (tag names are unique per user)

---

### 3c. `apps/frontend/src/pages/notes/search.page.tsx` (NEW)

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

  // Uncontrolled local value — gets committed to URL after debounce
  const [inputValue, setInputValue] = useState(q)

  // Keep input in sync if URL changes externally (browser back/forward)
  useEffect(() => {
    setInputValue(q)
  }, [q])

  // Debounce: write to URL 400ms after user stops typing
  useEffect(() => {
    if (inputValue.length < 2) {
      setSearchParams(
        (prev) => { const n = new URLSearchParams(prev); n.delete('q'); n.delete('page'); return n },
        { replace: true }
      )
      return
    }
    const id = setTimeout(() => {
      setSearchParams({ q: inputValue, page: '1' }, { replace: true })
    }, 400)
    return () => clearTimeout(id)
  }, [inputValue])

  const { data, isLoading, isError } = useSearch({ q, page, limit: DEFAULT_LIMIT })

  function handlePageChange(p: number) {
    setSearchParams({ q, page: String(p) })
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-8">

        {/* ── Search input ─────────────────────────────────── */}
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

        {/* ── Idle (< 2 chars) ─────────────────────────────── */}
        {q.length < 2 && !isLoading && (
          <p className="text-center text-sm text-muted-foreground">
            Type at least 2 characters to search.
          </p>
        )}

        {/* ── Loading ──────────────────────────────────────── */}
        {isLoading && q.length >= 2 && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted" />
            ))}
          </div>
        )}

        {/* ── Error ────────────────────────────────────────── */}
        {isError && (
          <p className="py-16 text-center text-destructive">
            Search failed. Please try again.
          </p>
        )}

        {/* ── Results ──────────────────────────────────────── */}
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

**Key decisions:**
- Two-state design: `inputValue` (local, live) vs. `q` (URL, debounced). Avoids the flash where the input jumps back on every TanStack Query re-render
- `replace: true` on `setSearchParams` — keeps browser history clean while typing; avoids polluting back-stack with every keystroke
- When `inputValue < 2`, the URL params are cleared (not set to empty string) — this ensures a clean URL and prevents the backend receiving `q=a` which would pass schema validation but return meaningless results
- Page-change navigation (paginating results) does NOT use `replace: true` — intentionally adds a history entry so the user can navigate back from page 3 to page 2 without clearing the search
- Uses `data.page` / `data.limit` from the response (not URL params) as the pagination source of truth — backend may clamp values

---

## 4. Frontend — Modified Files

### 4a. `apps/frontend/src/components/layout/app-layout.tsx`

**Change:** Add `<Link to="/search">` with a `<Search>` icon to the header, between the logo and the user/logout section.

**Exact diff:**

```diff
+import { Link } from 'react-router-dom'
+import { Search } from 'lucide-react'

 // Inside <header>:
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

**No props change** — `AppLayoutProps` stays as `{ sidebar?: ReactNode, children: ReactNode }`.

---

### 4b. `apps/frontend/src/router.tsx`

**Change:** Import `SearchPage` and add it to the protected children array.

**Exact diff:**

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

Already covered in §2b above — append only, nothing modified.

---

## 5. Architecture Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Search entry point | Dedicated `/search` route | Clean URL state; no collision with `/notes` tag/sort filters |
| State management | URL search params only | Consistent with `/notes` page; shareable URLs; no extra Zustand slice needed |
| Query trigger | 400ms debounce on keystroke | Low friction; avoids API call on every character; `enabled` guard prevents premature fire |
| Min query length | 2 chars (frontend guard) | API `minLength: 1` but 1-char queries are noisy; 2 is a reasonable UX floor |
| Highlight rendering | `dangerouslySetInnerHTML` | `ts_headline` output is derived from the user's own notes — no XSS vector |
| Result click | Navigate to `/notes/:id` | Consistent with NoteCard; no extra preview layer to maintain |
| No tag sidebar | Omitted | `GET /search` does not accept `tagId`; adding client-side tag filtering would mislead users about server-side behavior |
| Pagination | Reuse `<NotesPagination>` | Zero additional component work; it already handles ellipsis and boundary cases |

---

## 6. Reuse of Existing Code

| Existing artifact | Reused in |
|-------------------|-----------|
| `<AppLayout>` | `SearchPage` — wraps the page in the standard shell |
| `<NotesPagination>` | `SearchPage` — unchanged; passes `data.page/total/limit` |
| `<Card>` / `<CardContent>` (shadcn/ui) | `SearchResultCard` — same pattern as `NoteCard` |
| `<Input>` (shadcn/ui) | `SearchPage` search field |
| `http` Axios instance | `use-search.ts` — same import as `use-notes.ts` |
| `useSearchParams` + `setSearchParams` pattern | `SearchPage` — same pattern as `NotesListPage` |
| `DEFAULT_LIMIT` constant | `useSearch` params |
| `TagDTO` (via `Pick`) | `SearchResultDTO.tags` shape |
| `Intl.DateTimeFormat` formatting | `SearchResultCard` — copied from `NoteCard` |
| `lucide-react` `Search` icon | `AppLayout` header + `SearchPage` input prefix |

---

## 7. Implementation Order

Execute in this order to ensure type-safe compilation at each step:

```
Step 1  packages/shared/src/schemas/notes.ts     ← ADD search types
Step 2  use-search.ts                             ← ADD hook (imports Step 1 types)
Step 3  search-result-card.tsx                   ← ADD component (imports Step 1 types)
Step 4  search.page.tsx                          ← ADD page (imports Steps 2 + 3)
Step 5  app-layout.tsx                           ← MODIFY add search icon link
Step 6  router.tsx                               ← MODIFY register /search route
```

---

## 8. Quality Gates

Run in this exact order. Fix all failures before the next gate.

```bash
# 1. Type-check everything (shared + frontend)
pnpm tsc --noEmit

# 2. Lint frontend
pnpm --filter frontend lint

# 3. Frontend unit tests
pnpm --filter frontend test

# 4. Frontend build check
pnpm --filter frontend build
```

**No backend gates** — this ticket makes zero backend changes.

---

## 9. Testing Notes

The existing test suite does not cover search (no `use-search.ts` exists). Tests for new code are out of scope for this plan unless the project's test coverage gate requires them. If tests are needed, the pattern to follow is `hooks/notes/use-notes.test.ts` (if it exists) — mock `http.get` via `vi.mock`, assert `queryKey` and `enabled` behavior.

---

## 10. Out of Scope

- Tag-filtered search — backend API change required first
- Keyboard shortcut (`Cmd+K`) to focus search — not in FRS
- Search within inline toolbar on `/notes` — not in FRS
- Saved searches / history — not in FRS
- Backend search implementation — already done (AB-1004)
