# Specification — AB-1013: Frontend Search UI with Highlights

**Ticket:** AB-1013
**Type:** Frontend Feature
**Status:** COMPLETED
**Branch:** `feat/AB-1013-search-ui-highlights`

---

## 1. Requirements

| ID | Requirement |
|----|-------------|
| R-01 | A Search page MUST be accessible at `/search` inside `ProtectedRoute` |
| R-02 | The search input MUST be debounced (400ms) before committing to URL state |
| R-03 | The search query MUST NOT fire until the user has typed at least 2 characters |
| R-04 | URL search params (`?q=&page=`) MUST drive the search state (shareable, back/forward navigable) |
| R-05 | Search results MUST be rendered as `SearchResultCard` components |
| R-06 | `SearchResultCard` MUST render the `headline` field using `dangerouslySetInnerHTML` to preserve `<b>` highlight tags |
| R-07 | Five UI states MUST be handled: Idle, Loading (skeleton), Error, Results, Empty |
| R-08 | Pagination MUST reuse `<NotesPagination>` component |
| R-09 | Clicking a result card MUST navigate to `/notes/:id` |
| R-10 | A search icon link MUST be added to the app-layout header |
| R-11 | `SearchQuerySchema`, `SearchResultDTO`, and `PaginatedSearchResultsDTO` MUST be added to `packages/shared/src/schemas/notes.ts` |
| R-12 | `dangerouslySetInnerHTML` is safe: `ts_headline` only emits `<b>` tags on the user's own content — DOMPurify is NOT required |

---

## 2. Acceptance Criteria

- [ ] Navigating to `/search` shows the search input with autofocus
- [ ] Typing fewer than 2 characters shows "Type at least 2 characters to search." message
- [ ] Typing 2+ characters triggers search after 400ms debounce; API is NOT called per keystroke
- [ ] Loading state shows 3 skeleton rows while results are fetching
- [ ] Successful results show count ("N results for «query»") + result cards with tag pills and formatted date
- [ ] `<b>` tags inside `headline` are rendered as bold text (not escaped)
- [ ] Empty results show "No notes found for «query»." message
- [ ] API error shows "Search failed. Please try again." message
- [ ] Clicking a result card navigates to `/notes/:id`
- [ ] Page navigation works correctly; URL reflects current page
- [ ] Clearing input clears URL params (no empty `?q=` in URL)
- [ ] App layout header shows a search icon linking to `/search`

---

## 3. Affected Capabilities

| Capability | Impact |
|-----------|--------|
| Search page | New — `/search` route with URL-state-driven search |
| Search hook | New — `use-search.ts` calling `GET /api/search` |
| Search result card | New — `search-result-card.tsx` with `dangerouslySetInnerHTML` headline |
| App layout | Modified — search icon link added to header |
| Router | Modified — `/search` route added |
| Shared package | Extended — search DTO types added to `notes.ts` |

---

## 4. Functional Behavior

### URL State Model
- `inputValue`: local React state (live, updates on every keystroke)
- `q`: URL param (debounced commit of `inputValue`)
- Debounce: 400ms timeout after `inputValue` changes; `replace: true` to avoid cluttering history
- Page change: `setSearchParams({ q, page })` WITHOUT `replace` (adds history entry)
- Input < 2 chars: clear `q` and `page` from URL entirely

### `useSearch` hook
- `queryKey: ['search', { q, page, limit }]`
- `enabled: params.q.length >= 2`
- No `staleTime` override (always refetch on mount)

### SearchResultCard
- `dangerouslySetInnerHTML={{ __html: result.headline }}`
- Tailwind class `[&_b]:font-semibold [&_b]:text-foreground` styles the `<b>` highlight tags
- Click navigates to `/notes/:id`
- Tags rendered as colored pills

### UI States
| State | Condition | UI |
|-------|-----------|-----|
| Idle | `q.length < 2 && !isLoading` | "Type at least 2 characters to search." |
| Loading | `isLoading && q.length >= 2` | 3× skeleton rows |
| Error | `isError` | "Search failed. Please try again." |
| Results | `data && items.length > 0` | count + card list + pagination |
| Empty | `data && items.length === 0` | "No notes found for «query»." |

---

## 5. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| AB-1010 | Prerequisite | Auth scaffold, Axios `http` instance, TanStack Query setup |
| AB-1007 / AB-1020 | Prerequisite | `GET /api/search` backend endpoint |
| AB-1011 | Prerequisite | `<AppLayout>`, `<NotesPagination>`, `<Input>`, `<Card>` components |
| `packages/shared` | Internal | `SearchQueryDTO`, `SearchResultDTO`, `PaginatedSearchResultsDTO`, `DEFAULT_LIMIT` |
| react-router-dom `useSearchParams` | External | URL state management |
| TanStack Query `useQuery` | External | Data fetching |
