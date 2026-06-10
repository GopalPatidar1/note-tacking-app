# Spec Proposal — AB-1011: Frontend — Notes List Page

**Date:** 2026-06-10  
**Author:** gopalp@mindfiresolutions.com  
**Scope:** Frontend SPA — notes list page, tag sidebar, note cards, sort/filter, delete  
**Status:** DRAFT

---

## 1. Summary

Implement the authenticated notes list page at `/notes`. This is a pure frontend ticket — no new API endpoints. All calls target existing contracts in `openapi.yaml`.

| Feature | Description |
|---------|-------------|
| Notes list | Paginated cards with title, content preview, tags, and date |
| Tag sidebar | Left panel listing all user tags with note counts; click to filter |
| Sort toolbar | Sort select (`updatedAt_desc` default) + "New Note" button |
| Delete | Soft-delete from the card; confirmation toast; optimistic invalidation |
| Layout | App shell with top navbar (user name + logout) wrapping all protected pages |
| Routing | `/notes/new` and `/notes/:id` stubbed as placeholders for AB-1012 |

---

## 2. OpenAPI Contract Delta

None. AB-1011 is purely frontend. All API shapes are already specified in `openapi.yaml`:

- `GET /notes?page&limit&sort&tagId` → `PaginatedNotes`
- `GET /tags` → `Tag[]` (with `noteCount`)
- `DELETE /notes/:id` → `{ data: { message: string } }`

---

## 3. Architecture Decisions

### 3a. Page layout — app shell

AB-1010 left a plain `<ProtectedRoute>` wrapper. AB-1011 introduces an `<AppLayout>` component that wraps all protected content with:

- **Top navbar**: app name on the left; user's `name` (from auth store) + logout button on the right.
- **Body**: two-column flex — fixed left sidebar (tag filter) + scrollable main content area.

```
┌─────────────────────────────────────────────┐
│  NoteApp          [Alice]  [Logout]          │  ← AppLayout top navbar
├────────────┬────────────────────────────────┤
│ All Notes  │  [Sort: Updated ▾] [+ New Note] │
│ ─────────  │  ──────────────────────────────  │
│ Work   (5) │  ┌──────────────────────────┐   │
│ Personal(3)│  │ Note title               │   │
│ Ideas  (2) │  │ Preview text snippet...  │   │
│            │  │ [Work] [Q3]   Jun 10     │   │
│            │  └──────────────────────────┘   │
│            │  ┌──────────────────────────┐   │
│            │  │ ...                      │   │
│            │  └──────────────────────────┘   │
│            │  [← 1  2  3  →]                 │
└────────────┴────────────────────────────────┘
```

### 3b. TanStack Query hooks

Three new hooks, all following the one-hook-per-operation pattern from frontend CLAUDE.md:

```
hooks/notes/use-notes.ts        → useQuery(['notes', filters], GET /notes)
hooks/notes/use-tags.ts         → useQuery(['tags'], GET /tags)
hooks/notes/use-delete-note.ts  → useMutation(DELETE /notes/:id) + invalidate ['notes']
```

Query key for notes includes the full filter object `{ page, limit, sort, tagId }` so any filter change re-fetches correctly.

### 3c. URL-driven filter state

Sort and active `tagId` filter are stored in URL search params (via React Router `useSearchParams`), not in Zustand. This makes the page shareable/bookmarkable and avoids extra client state. Page resets to `1` whenever sort or tagId changes.

```
/notes?page=2&sort=title_asc&tagId=<uuid>
```

### 3d. HTML stripping for content preview

TipTap stores content as HTML. The note card strips tags with a simple regex utility and truncates to 120 characters. This lives in `src/lib/utils.ts` alongside the existing `cn` helper.

```typescript
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
```

### 3e. Delete flow

Clicking the delete icon on a card shows a `sonner` confirmation toast with an "Undo" style pattern: fire the `DELETE /notes/:id` mutation immediately, show a success toast. No separate confirmation dialog — the backend's 30-day retention provides a safety net. On mutation success, invalidate `['notes']` query.

### 3f. "New Note" and note navigation

- **"New Note" button** → `navigate('/notes/new')`
- **Clicking a note card** → `navigate('/notes/:id')`

Both routes are added to the router as placeholder pages in this ticket. The actual TipTap editor is AB-1012's concern.

### 3g. Pagination

Classic numbered pagination with Previous/Next buttons. Uses URL param `?page=N`. The `PaginatedNotesDTO.total` and current `limit` determine total page count. Rendered as: `← Prev  [1] [2] [3]  Next →` using shadcn/ui `Button` components.

---

## 4. Shared Package Additions (`packages/shared`)

### 4a. Add `noteCount` to `TagDTO`

The `GET /tags` endpoint returns `noteCount` per the OpenAPI spec, but `TagDTO` in `packages/shared/src/schemas/notes.ts` is missing the field. Add it as optional (backend may omit it in some contexts):

```typescript
// packages/shared/src/schemas/notes.ts — update TagDTO
export interface TagDTO {
  id:        string
  userId:    string
  name:      string
  color:     string
  noteCount?: number   // ADD — populated by GET /tags
}
```

No new exports needed; `TagDTO` is already exported from `packages/shared/src/index.ts`.

---

## 5. Frontend File Layout

```
apps/frontend/src/
  components/
    layout/
      app-layout.tsx              # Top navbar + sidebar shell; wraps all protected pages
    notes/
      note-card.tsx               # Single note card (title, preview, tags, date, delete btn)
      notes-sidebar.tsx           # Tag list with note counts; "All Notes" + tag items
      notes-toolbar.tsx           # Sort select + "New Note" button
      notes-pagination.tsx        # Prev/Next + page number buttons
  hooks/
    notes/
      use-notes.ts                # useQuery → GET /notes (with filter params)
      use-tags.ts                 # useQuery → GET /tags
      use-delete-note.ts          # useMutation → DELETE /notes/:id
  pages/
    notes/
      notes-list.page.tsx         # Composes AppLayout + sidebar + toolbar + cards + pagination
      note-editor.page.tsx        # Placeholder stub for AB-1012
```

`router.tsx` updated to add `/notes/:id` and `/notes/new` routes pointing to `<NoteEditorPage />`.

---

## 6. Component Designs

### 6a. `<AppLayout>`

Props: `children: ReactNode`

Structure:
- `<header>`: app name ("NoteApp"), `user.name` from `useAuthStore`, logout `<Button>` that calls `useLogout` mutation then navigates to `/login`.
- `<main>`: flex row — `<NotesSidebar>` (fixed width ~220px) + `<section>` (flex-1, contains page content via `children`).

Wraps the `<ProtectedRoute>` outlet in `router.tsx`.

### 6b. `<NotesSidebar>`

Props: `activetTagId: string | undefined`, `onSelectTag: (id: string | undefined) => void`

Fetches tags via `useTags()`. Renders:
- "All Notes" item (active when `activeTagId` is undefined)
- One item per tag: colored dot (using `tag.color`), `tag.name`, `tag.noteCount` badge

Loading state: skeleton rows. Error state: "Failed to load tags."

### 6c. `<NotesToolbar>`

Props: `sort: string`, `onSortChange: (val: string) => void`

- Sort `<select>` (shadcn/ui `Select`) with all 6 values from `NOTE_SORT_VALUES` — human-readable labels:
  - `updatedAt_desc` → "Last updated"
  - `updatedAt_asc`  → "Oldest update"
  - `createdAt_desc` → "Newest first"
  - `createdAt_asc`  → "Oldest first"
  - `title_asc`      → "Title A–Z"
  - `title_desc`     → "Title Z–A"
- "+ New Note" `<Button>` → `navigate('/notes/new')`

### 6d. `<NoteCard>`

Props: `note: NoteDTO`, `onDelete: (id: string) => void`

Renders:
- **Title**: `note.title` (truncated at 1 line with CSS)
- **Preview**: `stripHtml(note.content)` truncated to 120 chars
- **Tags**: each tag as a small pill using `tag.color` as background
- **Date**: `updatedAt` formatted as "Jun 10, 2026" using `Intl.DateTimeFormat`
- **Delete icon** (trash icon from lucide-react) — top-right corner, visible on hover; calls `onDelete(note.id)`
- Entire card is clickable → `navigate('/notes/${note.id}')`

### 6e. `<NotesPagination>`

Props: `page: number`, `total: number`, `limit: number`, `onPageChange: (p: number) => void`

Shows Previous button (disabled on page 1), up to 5 page number buttons with ellipsis for large ranges, Next button (disabled on last page). Only rendered when `total > limit`.

### 6f. `<NotesListPage>` composition

```
<AppLayout>
  <NotesSidebar activeTagId={tagId} onSelectTag={setTagId} />
  <section>
    <NotesToolbar sort={sort} onSortChange={setSort} />
    {/* note cards or loading/empty states */}
    <NotesPagination ... />
  </section>
</AppLayout>
```

**Loading state**: 6 skeleton `<NoteCard>` placeholders (shadcn/ui `Skeleton`).  
**Empty state** (no notes at all): "You have no notes yet. Create your first one!" with a "+ New Note" button.  
**Empty state** (tag filter active, no results): "No notes with this tag." with a "Clear filter" link.  
**Error state**: "Failed to load notes." with a retry button.

---

## 7. Router Updates

```typescript
// apps/frontend/src/router.tsx — updated protected children
{ element: <ProtectedRoute />, children: [
  { path: '/notes',      element: <NotesListPage /> },
  { path: '/notes/new',  element: <NoteEditorPage /> },   // AB-1012 stub
  { path: '/notes/:id',  element: <NoteEditorPage /> },   // AB-1012 stub
]},
```

`<NoteEditorPage />` stub content for AB-1012:
```typescript
export function NoteEditorPage() {
  return <div>Note editor — coming in AB-1012</div>
}
```

---

## 8. New Dependencies

None. All required packages were installed in AB-1010:

| Package | Purpose in this ticket |
|---------|------------------------|
| `@tanstack/react-query` | `useQuery` for notes + tags |
| `axios` (via `http.ts`) | API calls |
| `react-router-dom` | `useSearchParams`, `useNavigate` |
| `zustand` | Auth store (user name for navbar) |
| `sonner` | Delete success toast |
| `lucide-react` | Trash / chevron icons |

> shadcn/ui `Select`, `Button`, `Skeleton`, `Card` used throughout — already available.

---

## 9. Out of Scope for This Ticket

- Note editor (TipTap, autosave) → AB-1012
- Tag create/edit/delete UI → to be scheduled (not in AB-1011 or AB-1012; gap in ticket map)
- Search UI → AB-1013
- Share modal → AB-1014
- Version history drawer → AB-1015
- Trash / deleted notes view — not in FRS
- Drag-and-drop reordering — not in FRS

---

## 10. Open Questions (Resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | New note entry point? | **Navigate to `/notes/new`** — AB-1012 builds the editor |
| 2 | Page layout? | **Full-page list**; click card → navigate to `/notes/:id` |
| 3 | Tag filter placement? | **Left sidebar** with tag list + note counts |
| 4 | Content preview? | **Stripped HTML, ~120 chars** via `stripHtml()` util |
| 5 | Pagination type? | **Numbered pages** driven by URL `?page=N` |
| 6 | Delete confirmation? | **Immediate + toast** — no modal; 30-day retention is safety net |
| 7 | Filter state storage? | **URL search params** — shareable, no extra Zustand slice |
