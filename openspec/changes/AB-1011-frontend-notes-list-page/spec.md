# Specification — AB-1011: Frontend Notes List Page

**Ticket:** AB-1011
**Type:** Frontend Feature
**Status:** COMPLETED
**Branch:** `feat/AB-1011-frontend-notes-list-page`

---

## 1. Requirements

| ID | Requirement |
|----|-------------|
| R-01 | The Notes List page MUST render at `/notes` inside `ProtectedRoute` |
| R-02 | The page MUST display note cards with title, tag pills, and a truncated content preview |
| R-03 | The page MUST support sorting via a sort dropdown (using `sort` query param values from shared) |
| R-04 | The page MUST support tag-based filtering via a sidebar — clicking a tag filters notes by that tag |
| R-05 | The page MUST support numeric pagination with a "Load more" or numbered pagination component |
| R-06 | Note cards MUST have a delete button (visible on hover) that soft-deletes the note |
| R-07 | A "+ New Note" button MUST navigate to `/notes/new` |
| R-08 | The page MUST fetch notes via `GET /api/notes` and tags via `GET /api/tags` |
| R-09 | A note card click MUST navigate to `/notes/:id` (the editor) |
| R-10 | `TagDTO` in `packages/shared` MUST be extended with an optional `noteCount?` field |
| R-11 | An app-level layout component with a top navbar MUST wrap the page |
| R-12 | A `stripHtml()` utility MUST be added to `lib/utils.ts` for note content preview |

---

## 2. Acceptance Criteria

- [ ] `/notes` renders note cards for the authenticated user's notes
- [ ] Notes from other users are not visible
- [ ] Selecting a tag in the sidebar filters the note list to tagged notes only
- [ ] Clearing the tag filter shows all notes
- [ ] Sort dropdown changes the note order; selection is reflected in URL params
- [ ] Pagination controls appear when total exceeds one page; clicking a page loads correct results
- [ ] Hovering a note card reveals the Delete button; confirming deletes the note and removes it from the list
- [ ] "+ New Note" navigates to `/notes/new`
- [ ] Clicking a note card navigates to `/notes/:id`
- [ ] Tags in the sidebar show `noteCount` badges
- [ ] The app layout navbar is visible on all protected pages
- [ ] `pnpm --filter frontend build` passes; `pnpm --filter frontend test` passes

---

## 3. Affected Capabilities

| Capability | Impact |
|-----------|--------|
| Notes list UI | New — notes-list.page.tsx with full feature set |
| Tag sidebar | New — notes-sidebar.tsx with tag filter |
| Notes toolbar | New — sort select + New Note button |
| Note card | New — note-card.tsx with preview, tags, delete |
| Pagination | New — notes-pagination.tsx |
| Data fetching hooks | New — `use-notes.ts`, `use-tags.ts`, `use-delete-note.ts` |
| App layout | New — `app-layout.tsx` (top navbar + two-column shell) |
| Shared package | Modified — `TagDTO.noteCount?` added |
| Router | Modified — `/notes/new` and `/notes/:id` routes added |

---

## 4. Functional Behavior

### Note List
- Calls `GET /api/notes?page=&limit=&sort=&tagId=` via `useNotes` hook
- Displays results as `<NoteCard>` components
- URL search params drive `page`, `sort`, `tagId` state
- Empty state shown when no notes exist

### Note Card
- Shows: truncated title, `stripHtml(content)` preview, tag pills (color-coded), relative date
- Delete button: opacity-0 until card hover; clicking triggers soft-delete mutation; card removed from list on success

### Tag Sidebar
- Fetches tags via `GET /api/tags` using `useTags` hook
- Clicking a tag sets `tagId` in URL params; active tag highlighted
- Each tag shows `noteCount`

### Pagination
- Numbered page links; derives total pages from `total / limit`
- Page changes update `page` URL param

### Delete Note
- `useMutation` → `DELETE /api/notes/:id`
- On success: invalidate `['notes']` query; toast success

---

## 5. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| AB-1010 | Prerequisite | Auth scaffold, `ProtectedRoute`, Axios `http` instance, TanStack Query setup |
| AB-1004 | Prerequisite | `GET /api/notes`, `DELETE /api/notes/:id` backend endpoints |
| AB-1006 | Prerequisite | `GET /api/tags` backend endpoint |
| `packages/shared` | Internal | `NoteDTO`, `TagDTO`, sort value enums, pagination constants |
| shadcn/ui | External | Card, Button, Select components |
| TanStack Query | External | `useQuery`, `useMutation`, `useQueryClient` |
| AB-1012 | Consumer | Note editor page (create/edit) linked from this page |
