# Spec Proposal — AB-1014: Frontend — Share Modal + Active Links

**Date:** 2026-06-12
**Author:** gopalp@mindfiresolutions.com
**Scope:** Frontend SPA — share modal in the note editor, TanStack Query hooks for share CRUD, public read-only note page
**Status:** DRAFT

---

## 1. Summary

Implement the sharing UI on top of the backend endpoints shipped in AB-1008. This is a pure frontend ticket — no new API endpoints are added. The ticket delivers:

| Feature | Description |
|---------|-------------|
| Share button | "Share" button in the note editor toolbar — edit mode only (saved notes) |
| Share modal | shadcn/ui Dialog — expiry presets, generate link, active-link list, copy, revoke |
| Session-only link state | Active links shown are those created in the current browser session (no list API) |
| Clipboard copy | `navigator.clipboard.writeText` with toast feedback |
| Public note page | Unauthenticated `/public/:token` route renders a read-only note |
| Public HTTP client | Standalone axios instance (no auth interceptor) for the public route |

---

## 2. OpenAPI Contract Delta

**None.** AB-1014 is purely frontend. All three sharing endpoints are already specified in `openapi.yaml` and implemented in the backend (AB-1008):

| Endpoint | Used by |
|----------|---------|
| `POST /notes/:id/share` | `useCreateShareLink` mutation |
| `DELETE /share/:id` | `useRevokeShareLink` mutation |
| `GET /public/:token` | `usePublicNote` query (no auth) |

---

## 3. Architecture Decisions

### 3a. Session-only active link list

The backend has no `GET /notes/:id/share-links` list endpoint. Rather than adding one or using localStorage, the modal accumulates links in local React state (`useState<ShareLinkResponseDTO[]>`) for the lifetime of the modal's mount. On each successful `POST /notes/:id/share` response the returned `ShareLinkResponseDTO` is prepended to the list. Revoking a link removes it from the same local array.

**Consequence:** Reopening the modal on a fresh page shows an empty state with a "Generate link" CTA — no historical links displayed. This is consistent with the session-only decision and avoids over-engineering.

### 3b. Share button placement — editor toolbar, edit mode only

The "Share" button sits in the note editor header row (right side, next to the save indicator). It is hidden in create mode (`/notes/new`) because a note must exist on the server before a share link can be created. This avoids the UX confusion of sharing an unsaved note.

```
┌──────────────────────────────────────────────────┐
│  ← Notes       [Unsaved changes]  [Share] [···]  │
└──────────────────────────────────────────────────┘
```

### 3c. Expiry presets

The modal offers four radio options that convert to an ISO datetime at submission time, using plain JS `Date` arithmetic (no date-fns needed):

| Label | Computed `expiresAt` |
|-------|----------------------|
| No expiry | `null` (omitted from request body) |
| 1 day | `new Date(Date.now() + 86_400_000).toISOString()` |
| 7 days | `new Date(Date.now() + 7 * 86_400_000).toISOString()` |
| 30 days | `new Date(Date.now() + 30 * 86_400_000).toISOString()` |

### 3d. Public URL construction

The link exposed to users is constructed at runtime:

```ts
const shareUrl = `${window.location.origin}/public/${link.token}`
```

`window.location.origin` resolves to `http://localhost:5173` in dev and to the production domain in prod — no extra `.env` variable required.

### 3e. Public HTTP client

`lib/http.ts` attaches a `Bearer` token on every request via an interceptor and redirects to `/login` on 401. The public note page must call `GET /public/:token` with no auth headers. A separate `publicHttp` axios instance is created in `lib/public-http.ts` — plain axios, same `VITE_API_URL` base, no interceptors.

---

## 4. Shared Package Changes

**None.** `packages/shared/src/schemas/sharing.ts` already exports everything needed:

```typescript
CreateShareLinkSchema    // Zod schema for POST body
CreateShareLinkDTO       // inferred type
ShareLinkResponseDTO     // response from POST /notes/:id/share
PublicNoteDTO            // response from GET /public/:token
```

`packages/shared/src/index.ts` already re-exports `sharing.ts`.

---

## 5. Frontend File Layout

```
apps/frontend/src/
  lib/
    public-http.ts                           NEW — plain axios, no auth interceptor

  hooks/sharing/
    use-create-share-link.ts                 NEW — POST /notes/:id/share
    use-revoke-share-link.ts                 NEW — DELETE /share/:id
    use-public-note.ts                       NEW — GET /public/:token (uses publicHttp)

  components/sharing/
    share-modal.tsx                          NEW — Dialog with generation + link list

  pages/public/
    public-note.page.tsx                     NEW — unauthenticated read-only view

  pages/notes/
    note-editor.page.tsx                     MODIFY — share button + <ShareModal>

  router.tsx                                 MODIFY — /public/:token route (outside ProtectedRoute)

  __tests__/sharing/
    use-create-share-link.test.ts            NEW
    use-revoke-share-link.test.ts            NEW
    share-modal.test.tsx                     NEW
  __tests__/public/
    public-note.page.test.tsx                NEW
```

**Total: 8 new files, 2 modified.**

---

## 6. Component & Hook Designs

### 6a. `lib/public-http.ts`

```typescript
import axios from 'axios'

const publicHttp = axios.create({
  baseURL: import.meta.env.VITE_API_URL as string,
})

export { publicHttp }
```

No interceptors — requests go out without an `Authorization` header.

### 6b. `useCreateShareLink`

```typescript
// hooks/sharing/use-create-share-link.ts
export function useCreateShareLink(noteId: string) {
  return useMutation({
    mutationFn: (body: CreateShareLinkDTO) =>
      http
        .post<{ data: ShareLinkResponseDTO }>(`/notes/${noteId}/share`, body)
        .then((r) => r.data.data),
  })
}
```

No query invalidation needed — the active-link list lives in `<ShareModal>` local state.

### 6c. `useRevokeShareLink`

```typescript
// hooks/sharing/use-revoke-share-link.ts
export function useRevokeShareLink() {
  return useMutation({
    mutationFn: (shareLinkId: string) =>
      http.delete(`/share/${shareLinkId}`),
  })
}
```

### 6d. `usePublicNote`

```typescript
// hooks/sharing/use-public-note.ts
export function usePublicNote(token: string) {
  return useQuery({
    queryKey: ['public-note', token],
    queryFn: () =>
      publicHttp
        .get<{ data: PublicNoteDTO }>(`/public/${token}`)
        .then((r) => r.data.data),
    retry: false,
  })
}
```

`retry: false` — an invalid / expired token should immediately show an error state; no retries.

### 6e. `<ShareModal>`

**Props:**
```typescript
interface ShareModalProps {
  noteId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

**Local state:**
- `links: ShareLinkResponseDTO[]` — accumulated this session, starts `[]`
- `expiry: null | '1d' | '7d' | '30d'` — selected preset, defaults to `null`

**Behavior:**
1. User selects expiry preset (default: No expiry).
2. Clicks "Generate Link" → `createShareLink.mutate(...)`.
3. On success → prepend returned link to `links`.
4. Each link row: copyable URL, view count badge, expiry label, "Revoke" button.
5. Revoke → `revokeShareLink.mutate(link.id)` → on success, filter link from `links`.
6. Clipboard copy: `navigator.clipboard.writeText(shareUrl)` + `toast.success('Link copied')`.

**Wire mockup:**

```
┌───────────────────────────────────────────────────────┐
│  Share Note                                       ✕   │
├───────────────────────────────────────────────────────┤
│                                                       │
│  Link expiry                                          │
│  ● No expiry  ○ 1 day  ○ 7 days  ○ 30 days           │
│                                                       │
│  [        Generate Link        ]                      │
│                                                       │
│  ──────── Active links (this session) ────────────    │
│                                                       │
│  http://localhost:5173/public/a1b2c3…  [📋 Copy]      │
│  👁 0 views  •  No expiry                             │
│                                    [Revoke]           │
│                                                       │
│  http://localhost:5173/public/f9e8d7…  [📋 Copy]      │
│  👁 4 views  •  Expires Jun 19, 2026                  │
│                                    [Revoke]           │
│                                                       │
│  ────────────────────────────────────────────────     │
│  (empty state: "No links generated yet.")            │
└───────────────────────────────────────────────────────┘
```

**Expiry display helper:**

```typescript
function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiry'
  return `Expires ${new Date(expiresAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })}`
}
```

### 6f. `<NoteEditorPage>` modification

Two changes to `note-editor.page.tsx`:

1. Add `shareOpen` boolean state (`useState(false)`).
2. In the header row (edit mode), add the Share button and mount `<ShareModal>`:

```tsx
// In the flex header — after SaveIndicator, before (or after) any future actions:
{isEditMode && (
  <>
    <Button
      variant="outline"
      size="sm"
      onClick={() => setShareOpen(true)}
      className="gap-1"
    >
      <Share2 className="h-4 w-4" />
      Share
    </Button>
    <ShareModal noteId={id!} open={shareOpen} onOpenChange={setShareOpen} />
  </>
)}
```

No other changes to editor logic.

### 6g. `<PublicNotePage>`

Unauthenticated. Reads `:token` from route params. Renders read-only note content.

**States:**

| State | Condition | UI |
|-------|-----------|-----|
| Loading | `isLoading` | Centered spinner |
| Valid | `data` present | Title + tag pills + prose content |
| Invalid | `isError` | "This link is invalid or has expired." message |

Content rendering: The `content` field from `PublicNoteDTO` is TipTap-generated HTML. Render it with `dangerouslySetInnerHTML` — same owner-content safety rationale as `ts_headline` in AB-1013.

```
┌───────────────────────────────────────────────────────┐
│  NoteApp                                              │
├───────────────────────────────────────────────────────┤
│                                                       │
│  Meeting notes                                        │
│  [Work]  [Q3]                                         │
│                                                       │
│  Discussed the Q3 roadmap with the team. Action       │
│  items: …                                             │
│                                                       │
│  Shared note — view only                              │
└───────────────────────────────────────────────────────┘
```

The page uses a minimal layout (no sidebar, no auth toolbar). A bare wrapper with the app name as a heading and a "Shared note — view only" footer badge is sufficient.

### 6h. Router update

```typescript
// router.tsx — add as a top-level (unprotected) route
{ path: '/public/:token', element: <PublicNotePage /> },
```

Full router after change:

```typescript
export const router = createBrowserRouter([
  { element: <GuestRoute />,    children: [ /* auth pages */ ] },
  { element: <ProtectedRoute />, children: [
    { path: '/notes',      element: <NotesListPage /> },
    { path: '/notes/new',  element: <NoteEditorPage /> },
    { path: '/notes/:id',  element: <NoteEditorPage /> },
    { path: '/search',     element: <SearchPage /> },
  ]},
  { path: '/public/:token', element: <PublicNotePage /> },   // NEW — unprotected
  { path: '/', element: <Navigate to="/notes" replace /> },
])
```

---

## 7. New Dependencies

None. All packages are already installed:

| Package | Purpose in this ticket |
|---------|------------------------|
| `@tanstack/react-query` | `useCreateShareLink`, `useRevokeShareLink`, `usePublicNote` |
| `axios` | `publicHttp` instance |
| `react-router-dom` | `useParams` in PublicNotePage; router update |
| `lucide-react` | `Share2`, `Copy`, `Eye` icons |
| `sonner` | Toast for copy confirmation |

> shadcn/ui `Dialog`, `Button`, `RadioGroup`, `Badge`, `Skeleton` used — already available.

---

## 8. Test Coverage Plan

### `use-create-share-link.test.ts`

| # | Scenario |
|---|----------|
| T01 | Mutation calls `POST /notes/:id/share` with `{ expiresAt: null }` when no expiry |
| T02 | Mutation calls `POST /notes/:id/share` with correct ISO `expiresAt` when set |
| T03 | Returns `ShareLinkResponseDTO` on success |
| T04 | Propagates HTTP error to mutation error state |

### `use-revoke-share-link.test.ts`

| # | Scenario |
|---|----------|
| T01 | Mutation calls `DELETE /share/:id` with the correct link ID |
| T02 | Resolves successfully on 200 response |

### `share-modal.test.tsx`

| # | Scenario |
|---|----------|
| T01 | Renders expiry preset radios and "Generate Link" button |
| T02 | "Generate Link" button is disabled while mutation is pending |
| T03 | On successful generation, the new link appears in the active-links list |
| T04 | Clicking copy triggers `navigator.clipboard.writeText` with the correct URL |
| T05 | Clicking "Revoke" calls the revoke mutation with the correct link ID |
| T06 | Revoked link is removed from the active-links list on success |
| T07 | Empty state message rendered when `links` is empty |
| T08 | Error toast shown when generation fails |

### `public-note.page.test.tsx`

| # | Scenario |
|---|----------|
| T01 | Shows loading spinner while `usePublicNote` is pending |
| T02 | Renders note title and tags on success |
| T03 | Renders note content via `dangerouslySetInnerHTML` |
| T04 | Shows "invalid or expired" error message when query errors |

---

## 9. Out of Scope for This Ticket

- Backend `GET /notes/:id/share-links` list endpoint — not needed with session-only design
- localStorage persistence of share links across sessions — not in FRS
- Expiry date picker / custom date — preset options are sufficient per FRS
- Share entry point on NoteCard (list page) — editor toolbar is the sole entry point
- Version history drawer → AB-1015
- E2E share + public view journey → AB-1016

---

## 10. Open Questions (Resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | How to list active links without a GET endpoint? | **Session-only** — local state, no backend change |
| 2 | Include public `/public/:token` page in this ticket? | **Yes** — without it the share feature is unusable end-to-end |
| 3 | Expiry UX? | **Preset options** — No expiry, 1 day, 7 days, 30 days |
| 4 | Share button entry point? | **Editor toolbar only** (edit mode only) |
| 5 | Public URL base? | **`window.location.origin`** — no extra env var |
| 6 | Auth on public note fetch? | **Separate `publicHttp` axios instance** — no interceptors |
