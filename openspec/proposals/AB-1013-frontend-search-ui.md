# Spec Proposal — AB-1013: Frontend — Search UI with Highlights

**Date:** 2026-06-11  
**Author:** gopalp@mindfiresolutions.com  
**Scope:** Frontend SPA — dedicated search page, search hook, result cards with ts_headline highlights  
**Status:** DRAFT

---

## 1. Summary

Implement the authenticated search page at `/search`. This is a pure frontend ticket — no new API endpoints. The backend `GET /search` endpoint is already specified and implemented. The ticket covers:

| Feature | Description |
|---------|-------------|
| Search route | Dedicated `/search` page; URL state drives query + pagination |
| Search input | Debounced (400ms, min 2 chars) — fires automatically on keystroke |
| Result cards | Title, `ts_headline` excerpt with bold highlights, tags, date |
| Highlight rendering | `dangerouslySetInnerHTML` on the `ts_headline` HTML from PostgreSQL |
| Pagination | Reuses existing `<NotesPagination>` component |
| Header entry point | Search icon in `<AppLayout>` navbar navigates to `/search` |
| Result navigation | Clicking a result navigates to `/notes/:id` (editor) |

---

## 2. OpenAPI Contract Delta

None. AB-1013 is purely frontend. The search endpoint is already specified in `openapi.yaml`:

- `GET /search?q=&page=&limit=` → `PaginatedSearchResults`
  - `items[].id` — UUID of the note
  - `items[].title` — note title
  - `items[].headline` — `ts_headline` excerpt with `<b>` highlight tags
  - `items[].tags[]` — tag objects (`name`, `color`)
  - `items[].createdAt`, `items[].updatedAt`
  - `total`, `page`, `limit`, `query`

---

## 3. Architecture Decisions

### 3a. Route and URL state

The search lives at `/search` (a protected route) with URL search params as the single source of truth — consistent with the existing `/notes` page pattern.

```
/search?q=roadmap&page=2
```

- `q` — the search query string
- `page` — current page (defaults to `1`)

On query change, page resets to `1`. On mount, if `q` is pre-populated (e.g. navigated from a bookmark), the search fires immediately.

### 3b. Debounce strategy

The input is an uncontrolled local state value. A `useEffect` with a 400ms `setTimeout` updates the `q` URL param. The TanStack Query hook is `enabled` only when `q.length >= 2` — this prevents a single-character API call and avoids the empty-query `400` the API would return.

```
User types "ro"     →  400ms debounce
User types "roa"    →  timer resets, 400ms debounce
Timer fires "roa"   →  setSearchParams({ q: 'roa', page: '1' })
useSearch enabled   →  GET /search?q=roa&page=1&limit=20
```

When the input is cleared or falls below 2 chars, the query is disabled and results are hidden (show idle state instead of empty state).

### 3c. Highlight rendering with dangerouslySetInnerHTML

`ts_headline` returns HTML like `"Discussed <b>Q3</b> roadmap with the team"`. This is rendered directly:

```tsx
<p dangerouslySetInnerHTML={{ __html: result.headline }} />
```

**Safety rationale**: The content originates from the authenticated user's own notes — not from third-party or anonymous input. The `ts_headline` function wraps matched terms only in `<b>` tags; it does not introduce script injection. No additional sanitization is required.

### 3d. Result click → editor navigation

Clicking anywhere on a `<SearchResultCard>` navigates to `/notes/:id`, landing in the note editor — same as clicking a `<NoteCard>` on the notes list page. This keeps the interaction model consistent.

### 3e. No tag sidebar

The `GET /search` endpoint does not accept a `tagId` parameter, so there is no server-side tag filtering to support. The search page uses the full-width layout (no left sidebar) to maximize result card real estate.

```
┌───────────────────────────────────────────────────┐
│  NoteApp    [🔍 Search]        [Alice]  [Logout]  │
├───────────────────────────────────────────────────┤
│                                                   │
│  🔍 [__search input_________________________]     │
│                                                   │
│  12 results for "roadmap"                         │
│  ─────────────────────────────────────────────    │
│  ┌───────────────────────────────────────────┐    │
│  │ Meeting notes                   Jun 10    │    │
│  │ Discussed <b>roadmap</b> with the team…   │    │
│  │ [Work] [Q3]                               │    │
│  └───────────────────────────────────────────┘    │
│  ┌───────────────────────────────────────────┐    │
│  │ Q3 Planning                     Jun 08    │    │
│  │ The <b>roadmap</b> items need owners…     │    │
│  │ [Planning]                                │    │
│  └───────────────────────────────────────────┘    │
│                                                   │
│  [← Prev]  [1]  [2]  [Next →]                    │
└───────────────────────────────────────────────────┘
```

---

## 4. Shared Package Additions (`packages/shared`)

The `packages/shared/src/schemas/notes.ts` has no search types yet. Add:

```typescript
// packages/shared/src/schemas/notes.ts — additions

export const SearchQuerySchema = z.object({
  q:     z.string().min(1),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type SearchQueryDTO = z.infer<typeof SearchQuerySchema>

export interface SearchResultDTO {
  id:        string
  title:     string
  headline:  string
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

`index.ts` already re-exports everything from `schemas/notes.ts` — no changes needed there.

---

## 5. Frontend File Layout

```
apps/frontend/src/
  components/
    layout/
      app-layout.tsx              # MODIFY — add search icon to navbar
    notes/
      search-result-card.tsx      # NEW — result card with ts_headline highlight
  hooks/
    notes/
      use-search.ts               # NEW — useQuery → GET /search
  pages/
    notes/
      search.page.tsx             # NEW — search page with input, results, pagination
  router.tsx                      # MODIFY — add /search route
```

Total new files: 3. Modified files: 2.

---

## 6. Component Designs

### 6a. `useSearch` hook

```typescript
// apps/frontend/src/hooks/notes/use-search.ts
export function useSearch(params: SearchQueryDTO) {
  return useQuery({
    queryKey: ['search', params],
    queryFn: () =>
      http.get<{ data: PaginatedSearchResultsDTO }>('/search', { params })
           .then((r) => r.data.data),
    enabled: params.q.length >= 2,
  })
}
```

Query key includes the full params object so every unique `{ q, page, limit }` combination has its own cache entry.

### 6b. `<SearchResultCard>`

Props: `result: SearchResultDTO`

Renders:
- **Title**: `result.title` (single line, truncated with CSS)
- **Headline**: `result.headline` via `dangerouslySetInnerHTML` — styled so `<b>` tags appear highlighted (e.g. bold + primary color via Tailwind `[&_b]:text-primary [&_b]:font-semibold`)
- **Tags**: each tag as a colored pill (same rendering as `<NoteCard>`)
- **Date**: `result.updatedAt` formatted as "Jun 10, 2026"
- Entire card is a `<button>` / clickable `<div>` → `navigate('/notes/${result.id}')`

```tsx
<div
  role="button"
  onClick={() => navigate(`/notes/${result.id}`)}
  className="cursor-pointer rounded-lg border p-4 hover:bg-muted/50 transition-colors"
>
  <h3 className="font-semibold truncate">{result.title}</h3>
  <p
    className="text-sm text-muted-foreground mt-1 [&_b]:text-foreground [&_b]:font-semibold"
    dangerouslySetInnerHTML={{ __html: result.headline }}
  />
  <div className="flex items-center justify-between mt-3">
    <div className="flex gap-1 flex-wrap">
      {result.tags.map((tag) => (
        <span key={tag.name} style={{ backgroundColor: tag.color }}
              className="text-xs px-2 py-0.5 rounded-full text-white">
          {tag.name}
        </span>
      ))}
    </div>
    <span className="text-xs text-muted-foreground">
      {formatDate(result.updatedAt)}
    </span>
  </div>
</div>
```

### 6c. `<SearchPage>`

State:
- `inputValue` — local React state (controlled input, not debounced yet)
- `q`, `page` — from URL search params (the debounced, committed values)

Debounce logic:
```typescript
// inputValue changes → 400ms timeout → setSearchParams({ q: inputValue, page: '1' })
useEffect(() => {
  if (inputValue.length < 2) {
    setSearchParams((p) => { p.delete('q'); p.delete('page'); return p })
    return
  }
  const id = setTimeout(() => {
    setSearchParams({ q: inputValue, page: '1' })
  }, 400)
  return () => clearTimeout(id)
}, [inputValue])
```

`useSearch` called with `{ q, page: Number(page ?? 1), limit: 20 }`.

**States rendered:**

| State | Condition | UI |
|-------|-----------|-----|
| Idle | `inputValue.length < 2` | Prompt: "Type at least 2 characters to search" |
| Loading | `isLoading && q.length >= 2` | Skeleton rows (3 × card-height blocks) |
| Results | `data.items.length > 0` | Result count header + result cards + pagination |
| Empty | `data.items.length === 0` | "No notes found for «query»." |
| Error | `isError` | "Search failed. Please try again." + retry button |

**Full page structure:**
```tsx
<AppLayout>
  <div className="max-w-2xl mx-auto px-4 py-8">
    <div className="relative mb-6">
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Search notes…"
        className="pl-10"
        autoFocus
      />
    </div>

    {/* result count */}
    {data && <p className="text-sm text-muted-foreground mb-4">
      {data.total} result{data.total !== 1 ? 's' : ''} for "{data.query}"
    </p>}

    {/* result cards */}
    <div className="space-y-3">
      {data?.items.map((r) => <SearchResultCard key={r.id} result={r} />)}
    </div>

    {/* pagination */}
    {data && data.total > 20 && (
      <NotesPagination
        page={Number(page ?? 1)}
        total={data.total}
        limit={20}
        onPageChange={(p) => setSearchParams({ q, page: String(p) })}
      />
    )}
  </div>
</AppLayout>
```

### 6d. `<AppLayout>` header modification

Add a search icon `<Link>` between the logo and the user name. Uses `lucide-react`'s `<Search>` icon:

```tsx
// In header, between logo and user section:
<Link to="/search" className="text-muted-foreground hover:text-foreground transition-colors">
  <Search size={20} />
  <span className="sr-only">Search</span>
</Link>
```

---

## 7. Router Updates

```typescript
// apps/frontend/src/router.tsx — add inside protected children
{ path: '/search', element: <SearchPage /> },
```

Full protected routes after change:
```typescript
{ element: <ProtectedRoute />, children: [
  { path: '/notes',      element: <NotesListPage /> },
  { path: '/notes/new',  element: <NoteEditorPage /> },
  { path: '/notes/:id',  element: <NoteEditorPage /> },
  { path: '/search',     element: <SearchPage /> },   // NEW
]},
```

---

## 8. New Dependencies

None. All required packages are already installed:

| Package | Purpose in this ticket |
|---------|------------------------|
| `@tanstack/react-query` | `useSearch` hook |
| `axios` (via `http.ts`) | `GET /search` calls |
| `react-router-dom` | `useSearchParams`, `useNavigate`, `<Link>` |
| `lucide-react` | `<Search>` icon in header and search page |

> `shadcn/ui` `Input`, `Button`, `Skeleton` used throughout — already available.

---

## 9. Out of Scope for This Ticket

- Tag-filtered search — `GET /search` does not accept `tagId`; if needed it's a backend+frontend ticket
- Search within the notes list page (inline toolbar search) — separate UX decision; current design uses a dedicated page
- Saved searches / search history — not in FRS
- Keyboard shortcut to focus search (`Cmd+K`) — not in FRS
- Share modal → AB-1014
- Version history drawer → AB-1015

---

## 10. Open Questions (Resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | Dedicated page or inline on /notes? | **Dedicated `/search` route** — cleaner URL state, no collision with notes list filters |
| 2 | Debounce vs. explicit submit? | **Debounced keystroke (400ms)** — lower friction, mirrors modern search UX |
| 3 | Minimum query length? | **2 characters** — frontend guard; prevents trivial single-char API calls |
| 4 | Highlight rendering? | **`dangerouslySetInnerHTML`** — safe for own-content; preserves `<b>` highlighting |
| 5 | Result click action? | **Navigate to `/notes/:id`** — consistent with NoteCard behaviour |
| 6 | Tag sidebar on search? | **No** — API has no tag filter; full-width layout maximises result cards |
