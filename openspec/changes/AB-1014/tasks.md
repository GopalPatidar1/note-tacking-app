# Task Checklist — AB-1014: Frontend — Share Modal + Active Links

**Branch:** `feat/AB-1014-share-modal`
**Spec:** `openspec/proposals/AB-1014-frontend-share-modal.md`
**Plan:** `openspec/changes/AB-1014/plan.md`
**Status:** AWAITING APPROVAL

Legend: `[ ]` = pending · `[x]` = done · `[PARALLEL]` = can run concurrently with siblings

---

## Phase 1 — Foundation

> No shared package changes. No DB migrations. Establish the unauthenticated HTTP client and verify the Dialog component is available.

- [ ] **T-01** Verify `apps/frontend/src/components/ui/dialog.tsx` exists; if missing, add it:
  ```bash
  pnpm --filter frontend exec npx shadcn@latest add dialog
  ```
  _(ShareModal depends on Dialog — must exist before Phase 2)_

- [ ] **T-02** Create `apps/frontend/src/lib/public-http.ts`
  - Plain `axios.create({ baseURL: import.meta.env.VITE_API_URL })`
  - No request interceptors, no response interceptors
  - Export as `publicHttp`

### Phase 1 Checkpoint
```bash
pnpm tsc --noEmit                  # 0 type errors
pnpm --filter frontend lint        # 0 warnings
pnpm --filter frontend build       # build succeeds
```

---

## Phase 2 — Core Implementation

> All three hooks are independent and can be written in parallel. The modal and public page depend on their respective hooks but can also be written in parallel with each other once hooks exist.

- [ ] **T-03** `[PARALLEL]` Create `apps/frontend/src/hooks/sharing/use-create-share-link.ts`
  - `useMutation` — `POST /notes/${noteId}/share`
  - Returns `ShareLinkResponseDTO` on success
  - No `onError` toast (modal handles inline error display)
  - No query invalidation (session-only local state owns the list)
  - Import: `CreateShareLinkDTO`, `ShareLinkResponseDTO` from `@note-app/shared`

- [ ] **T-04** `[PARALLEL]` Create `apps/frontend/src/hooks/sharing/use-revoke-share-link.ts`
  - `useMutation` — `DELETE /share/${shareLinkId}`
  - Single `string` argument (the share link ID)
  - No side effects — caller removes entry from local list on success

- [ ] **T-05** `[PARALLEL]` Create `apps/frontend/src/hooks/sharing/use-public-note.ts`
  - `useQuery` using `publicHttp` (NOT `http`) — no auth header
  - `queryKey: ['public-note', token]`
  - `retry: false` — expired/revoked tokens must fail fast
  - Import: `PublicNoteDTO` from `@note-app/shared`

- [ ] **T-06** Create `apps/frontend/src/components/sharing/share-modal.tsx`
  _(Depends on T-03 and T-04)_
  - Props: `{ noteId: string; open: boolean; onOpenChange: (open: boolean) => void }`
  - Local state: `links: ShareLinkResponseDTO[]` (starts `[]`), `preset: ExpiryPreset` (starts `'none'`)
  - Expiry helper: `toExpiresAt(preset)` — plain JS `Date.now() + days * 86_400_000`
  - Share URL helper: `` `${window.location.origin}/public/${token}` ``
  - Expiry display helper: `formatExpiry(expiresAt: string | null)`
  - **Generate handler**: `mutateAsync` → prepend returned link to `links`
  - **Copy handler**: `navigator.clipboard.writeText(buildShareUrl(token))` + `toast.success`
  - **Revoke handler**: `mutateAsync(link.id)` → filter link from `links`
  - Renders: expiry radios (No expiry / 1 day / 7 days / 30 days), Generate button with pending spinner, inline error on failure, active-links list with copy + revoke per row, empty state when `links.length === 0`
  - Uses shadcn/ui: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `Button`
  - Icons: `Loader2`, `Copy`, `Eye` from `lucide-react`

- [ ] **T-07** `[PARALLEL with T-06]` Create `apps/frontend/src/pages/public/public-note.page.tsx`
  _(Depends on T-05)_
  - Reads `:token` from `useParams`
  - Calls `usePublicNote(token!)`
  - **Loading state**: centered `<Loader2>` spinner with `aria-label="Loading note"`
  - **Error state**: centered "Link invalid or expired" heading + sub-message
  - **Success state**: minimal header ("NoteApp" brand), `<h1>` title, tag pills (color via `style.backgroundColor`), content via `dangerouslySetInnerHTML={{ __html: data.content }}`, "Shared note — view only" footer
  - No `<AppLayout>` — this is an unauthenticated standalone page
  - No auth-dependent imports

### Phase 2 Checkpoint
```bash
pnpm tsc --noEmit                  # 0 type errors
pnpm --filter frontend lint        # 0 warnings
pnpm --filter frontend build       # build succeeds
```

---

## Phase 3 — Integration

> Wire the new components into the existing editor and router. Both edits are in different files and can be done in parallel.

- [ ] **T-08** `[PARALLEL]` Modify `apps/frontend/src/pages/notes/note-editor.page.tsx`
  - Add import: `Share2` from `lucide-react`
  - Add import: `ShareModal` from `@/components/sharing/share-modal`
  - Add state: `const [shareOpen, setShareOpen] = useState(false)`
  - In the edit-mode branch of the header `<div className="flex items-center gap-2">`:
    - Wrap existing `<SaveIndicator>` and new Share button + modal in a React Fragment `<>`
    - Add `<Button variant="outline" size="sm" onClick={() => setShareOpen(true)} className="gap-1"><Share2 className="h-4 w-4" />Share</Button>`
    - Add `<ShareModal noteId={id!} open={shareOpen} onOpenChange={setShareOpen} />`
  - Create mode branch is unchanged

- [ ] **T-09** `[PARALLEL]` Modify `apps/frontend/src/router.tsx`
  - Add import: `PublicNotePage` from `@/pages/public/public-note.page`
  - Add top-level unprotected route **after** the `ProtectedRoute` block, **before** the `/` redirect:
    ```typescript
    { path: '/public/:token', element: <PublicNotePage /> },
    ```
  - The route must be outside both `<GuestRoute>` and `<ProtectedRoute>` wrappers

### Phase 3 Checkpoint
```bash
pnpm tsc --noEmit                  # 0 type errors
pnpm --filter frontend lint        # 0 warnings
pnpm --filter frontend build       # build succeeds
```

---

## Phase 4 — Tests

> Four test files. Hook tests and component tests are independent and can be written in parallel.

- [ ] **T-10** `[PARALLEL]` Create `apps/frontend/src/__tests__/sharing/use-create-share-link.test.ts`

  Pattern: `renderHook` + `makeWrapper()` (QueryClientProvider) + `vi.mock('@/lib/http')`

  | Scenario | Assert |
  |----------|--------|
  | T-10a | Calls `http.post('/notes/note-1/share', { expiresAt: null })` when no expiry |
  | T-10b | Calls `http.post` with a valid ISO future datetime when `expiresAt` is provided |
  | T-10c | Returns `ShareLinkResponseDTO` from `mutate` on 201 success |
  | T-10d | `isError` is `true` when `http.post` rejects |

- [ ] **T-11** `[PARALLEL]` Create `apps/frontend/src/__tests__/sharing/use-revoke-share-link.test.ts`

  Pattern: `renderHook` + `makeWrapper()` + `vi.mock('@/lib/http')`

  | Scenario | Assert |
  |----------|--------|
  | T-11a | Calls `http.delete('/share/link-1')` with the correct ID |
  | T-11b | `isSuccess` is `true` on 200 response |

- [ ] **T-12** `[PARALLEL]` Create `apps/frontend/src/__tests__/sharing/share-modal.test.tsx`

  Pattern: `render` + `QueryClientProvider` + mock hooks at module level

  Mock strategy: mock `@/hooks/sharing/use-create-share-link` and `@/hooks/sharing/use-revoke-share-link` to return controllable pending/success/error states. Mock `navigator.clipboard.writeText`. Mock `sonner`.

  | Scenario | Assert |
  |----------|--------|
  | T-12a | All four expiry radio labels rendered (No expiry, 1 day, 7 days, 30 days) |
  | T-12b | "Generate Link" button is visible and enabled by default |
  | T-12c | "Generate Link" shows spinner + is disabled while `isPending` |
  | T-12d | Link share URL appears in the list after successful generation |
  | T-12e | Copy icon click calls `navigator.clipboard.writeText` with correct URL |
  | T-12f | `toast.success('Link copied to clipboard')` fires after copy |
  | T-12g | Clicking "Revoke" calls `revokeShareLink` mutation with the link's ID |
  | T-12h | Revoked link disappears from the list on mutation success |
  | T-12i | "No links generated yet." shown when `links` array is empty |
  | T-12j | Inline error text shown when generate mutation `isError` |

- [ ] **T-13** `[PARALLEL]` Create `apps/frontend/src/__tests__/public/public-note.page.test.tsx`

  Pattern: `render` + `QueryClientProvider` + `MemoryRouter` with `/public/:token` route + `vi.mock('@/lib/public-http')`

  | Scenario | Assert |
  |----------|--------|
  | T-13a | Loading spinner (`aria-label="Loading note"`) shown while query is pending |
  | T-13b | Note title rendered as `<h1>` on success |
  | T-13c | Tag pills rendered with correct names |
  | T-13d | Content rendered via `dangerouslySetInnerHTML` (inspect container for HTML) |
  | T-13e | "Link invalid or expired" message shown when query errors |
  | T-13f | "Shared note — view only" footer text present on success |

### Phase 4 Checkpoint — Final Quality Gate
```bash
pnpm tsc --noEmit                  # 0 type errors
pnpm --filter frontend lint        # 0 warnings
pnpm --filter frontend test        # all green, coverage ≥ 80%
pnpm --filter frontend build       # clean production build
```

---

## Commit

After all gates pass:

```
feat(sharing): implement share modal and public note page AB#1014
```

Body (optional):
```
- Share button in note editor toolbar (edit mode only)
- ShareModal: expiry presets, generate link, copy, session-only revoke
- PublicNotePage at /public/:token — unauthenticated, read-only
- publicHttp: standalone axios instance without auth interceptor
```

---

## Task Summary

| Phase | Tasks | Files |
|-------|-------|-------|
| 1 — Foundation | T-01, T-02 | `dialog.tsx` (verify), `public-http.ts` |
| 2 — Core | T-03 to T-07 | 3 hooks + modal + public page |
| 3 — Integration | T-08, T-09 | `note-editor.page.tsx`, `router.tsx` |
| 4 — Tests | T-10 to T-13 | 4 test files (16 scenarios total) |
| **Total** | **13 tasks** | **10 new files, 2 modified** |
