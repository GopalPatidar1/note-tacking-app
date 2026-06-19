# Specification — AB-1014: Frontend Share Modal + Public Note Page

**Ticket:** AB-1014
**Type:** Frontend Feature
**Status:** COMPLETED
**Branch:** `feat/AB-1014-share-modal`

---

## 1. Requirements

| ID | Requirement |
|----|-------------|
| R-01 | A Share button MUST appear in the Note Editor toolbar in edit mode only |
| R-02 | Clicking the Share button MUST open a `<ShareModal>` dialog |
| R-03 | The modal MUST allow the user to select one of four expiry presets: No expiry, 1 day, 7 days, 30 days |
| R-04 | Clicking "Generate Link" MUST call `POST /api/notes/:id/share` and display the generated URL |
| R-05 | Generated links MUST be displayed with a copy button; clicking it copies the full public URL to the clipboard |
| R-06 | Each generated link MUST show its `viewCount` and expiry |
| R-07 | The modal MUST show a "Revoke" button per link that calls `DELETE /api/share/:id` |
| R-08 | Active links list MUST be session-only (`useState`) — no `GET /share-links` endpoint exists |
| R-09 | A Public Note page MUST render at `/public/:token` without requiring authentication |
| R-10 | The public page MUST render the note's `title`, `content` (via `dangerouslySetInnerHTML`), and tag pills |
| R-11 | A separate `publicHttp` Axios instance (no auth interceptors) MUST be used for the public page |
| R-12 | An expired/revoked/invalid token MUST show a "Link invalid or expired" error message on the public page |
| R-13 | The public route MUST be a top-level unprotected route (not inside `ProtectedRoute`) |

---

## 2. Acceptance Criteria

- [ ] Share button appears in editor toolbar when editing an existing note (not on create)
- [ ] Clicking Share opens the ShareModal dialog
- [ ] All four expiry radio buttons (No expiry / 1 day / 7 days / 30 days) are rendered
- [ ] "Generate Link" calls `POST /api/notes/:id/share`; generated link URL appears in the modal
- [ ] Copy icon calls `navigator.clipboard.writeText` with the correct URL; toast "Link copied to clipboard" shown
- [ ] "Revoke" calls `DELETE /api/share/:id`; link disappears from modal list on success
- [ ] "No links generated yet" shown when the list is empty
- [ ] Failed generation shows inline error message
- [ ] `/public/:token` renders note title, content, and tags without requiring login
- [ ] `/public/:token` shows "Link invalid or expired" for bad/revoked/expired tokens
- [ ] `dangerouslySetInnerHTML` renders TipTap HTML content in the public view
- [ ] `pnpm --filter frontend build` passes; `pnpm --filter frontend test` passes

---

## 3. Affected Capabilities

| Capability | Impact |
|-----------|--------|
| Share Modal | New — `share-modal.tsx` with expiry presets, link list, copy, revoke |
| Note Editor | Modified — Share button + modal wiring added to edit mode |
| Public Note Page | New — `/public/:token` unauthenticated route |
| Public HTTP client | New — `lib/public-http.ts` (no auth interceptors) |
| Sharing hooks | New — `use-create-share-link.ts`, `use-revoke-share-link.ts`, `use-public-note.ts` |
| Router | Modified — `/public/:token` top-level route added |
| shadcn/ui | Extended — Dialog component added |

---

## 4. Functional Behavior

### ShareModal
- Props: `{ noteId, open, onOpenChange }`
- Internal state: `links: ShareLinkResponseDTO[]` (session-only), `preset: ExpiryPreset`
- Expiry helper: `toExpiresAt(preset)` → `null` or future ISO string using plain JS `Date.now()`
- Public URL: `` `${window.location.origin}/public/${token}` ``
- Generate: `mutateAsync({ expiresAt })` → prepend to `links`
- Revoke: `mutateAsync(linkId)` → filter out from `links`
- Copy: `navigator.clipboard.writeText(url)` + `toast.success('Link copied to clipboard')`

### usePublicNote
- Uses `publicHttp` (no Bearer header, no 401 redirect)
- `retry: false` — invalid tokens never succeed on retry
- `queryKey: ['public-note', token]`

### PublicNotePage
- States: Loading (spinner), Error ("Link invalid or expired"), Success (title + tags + content)
- Content rendered with `dangerouslySetInnerHTML` (TipTap HTML from user's own notes — no XSS risk)
- No `<AppLayout>` wrapper — standalone page with minimal header

---

## 5. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| AB-1010 | Prerequisite | Auth scaffold, Axios `http` instance, TanStack Query |
| AB-1008 | Prerequisite | Backend share link endpoints |
| AB-1012 | Prerequisite | Note editor page (Share button added there) |
| `packages/shared` | Internal | `CreateShareLinkDTO`, `ShareLinkResponseDTO`, `PublicNoteDTO` |
| shadcn/ui Dialog | External | Modal container for ShareModal |
| sonner | External | "Link copied to clipboard" toast |
| Lucide React | External | `Share2`, `Copy`, `Eye`, `Loader2` icons |
