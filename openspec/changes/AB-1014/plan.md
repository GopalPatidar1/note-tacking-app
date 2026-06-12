# Technical Plan — AB-1014: Frontend — Share Modal + Active Links

**Date:** 2026-06-12
**Ticket:** AB-1014
**Branch:** `feat/AB-1014-share-modal`
**Status:** AWAITING APPROVAL

---

## 0. Codebase Baseline

| Location | Current State |
|----------|--------------|
| `packages/shared/src/schemas/sharing.ts` | EXISTS — `CreateShareLinkSchema`, `CreateShareLinkDTO`, `ShareLinkResponseDTO`, `PublicNoteDTO` all defined |
| `packages/shared/src/index.ts` | Exports `sharing.ts` — **no changes needed** |
| `apps/frontend/src/lib/http.ts` | EXISTS — authenticated axios instance with Bearer interceptor + token refresh |
| `apps/frontend/src/hooks/sharing/` | MISSING — create directory + 3 hooks |
| `apps/frontend/src/components/sharing/` | MISSING — create directory + ShareModal |
| `apps/frontend/src/pages/public/` | MISSING — create directory + PublicNotePage |
| `apps/frontend/src/pages/notes/note-editor.page.tsx` | EXISTS — needs Share button + `<ShareModal>` wiring |
| `apps/frontend/src/router.tsx` | EXISTS — needs `/public/:token` unprotected route |
| `openspec/openapi.yaml` | Sharing endpoints fully specified — **no changes needed** |

---

## 1. Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Active-link list strategy | Session-only `useState<ShareLinkResponseDTO[]>` | No `GET /notes/:id/share-links` endpoint exists; no backend change in scope |
| Share button placement | Editor toolbar, edit mode only | Note must exist on server before a share link can be created |
| Expiry UX | 4 presets: No expiry / 1 day / 7 days / 30 days | FRS requires optional expiry; presets cover all practical cases |
| Expiry computation | Plain JS `Date.now() + days * 86_400_000` | No date-fns needed; consistent with the rest of the codebase |
| Public URL format | `` `${window.location.origin}/public/${token}` `` | Works in all environments; no extra `.env` variable |
| Public HTTP client | Separate `publicHttp` axios instance (no interceptors) | `http.ts` adds Bearer + redirects to `/login` on 401; the public page must NOT do that |
| Public content rendering | `dangerouslySetInnerHTML` on `content` | TipTap-generated HTML from the note owner's own content — same safety rationale as AB-1013 `ts_headline` |
| `usePublicNote` retry | `retry: false` | An invalid/expired/revoked token will never succeed on retry; fail fast |
| No query invalidation in `useCreateShareLink` | Correct | Share links don't appear in any other cached query; local state is the single source of truth in the modal |

---

## 2. OpenAPI Contract Delta

**None.** All three endpoints are already specified and implemented:

| Endpoint | Hook |
|----------|------|
| `POST /notes/:id/share` | `useCreateShareLink` |
| `DELETE /share/:id` | `useRevokeShareLink` |
| `GET /public/:token` | `usePublicNote` |

---

## 3. Shared Package Changes

**None.** `packages/shared/src/schemas/sharing.ts` already exports everything required.

```typescript
// Already available via import from '@note-app/shared':
CreateShareLinkSchema     // Zod — used for form/body validation
CreateShareLinkDTO        // { expiresAt?: string | null }
ShareLinkResponseDTO      // { id, noteId, token, expiresAt, revokedAt, viewCount, createdAt }
PublicNoteDTO             // { id, title, content, tags[{name,color}], createdAt, updatedAt }
```

---

## 4. All Files to Create / Modify

### New files

| File | Purpose |
|------|---------|
| `apps/frontend/src/lib/public-http.ts` | Plain axios instance — no auth interceptors |
| `apps/frontend/src/hooks/sharing/use-create-share-link.ts` | `POST /notes/:id/share` mutation |
| `apps/frontend/src/hooks/sharing/use-revoke-share-link.ts` | `DELETE /share/:id` mutation |
| `apps/frontend/src/hooks/sharing/use-public-note.ts` | `GET /public/:token` query (uses `publicHttp`) |
| `apps/frontend/src/components/sharing/share-modal.tsx` | Dialog: expiry presets → generate → link list → copy/revoke |
| `apps/frontend/src/pages/public/public-note.page.tsx` | Unprotected read-only note view |
| `apps/frontend/src/__tests__/sharing/use-create-share-link.test.ts` | Hook unit tests |
| `apps/frontend/src/__tests__/sharing/use-revoke-share-link.test.ts` | Hook unit tests |
| `apps/frontend/src/__tests__/sharing/share-modal.test.tsx` | Component tests |
| `apps/frontend/src/__tests__/public/public-note.page.test.tsx` | Page component tests |

### Modified files

| File | Change |
|------|--------|
| `apps/frontend/src/pages/notes/note-editor.page.tsx` | Add `shareOpen` state, Share button in header (edit mode only), `<ShareModal>` mount |
| `apps/frontend/src/router.tsx` | Add `{ path: '/public/:token', element: <PublicNotePage /> }` as top-level unprotected route |

**Total: 10 new files, 2 modified.**

---

## 5. Implementation — Exact File Contents

### 5a. `lib/public-http.ts`

```typescript
import axios from 'axios'

const publicHttp = axios.create({
  baseURL: import.meta.env.VITE_API_URL as string,
})

export { publicHttp }
```

No request or response interceptors — requests go out without an `Authorization` header and 401 responses are not handled.

---

### 5b. `hooks/sharing/use-create-share-link.ts`

```typescript
import { useMutation } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { CreateShareLinkDTO, ShareLinkResponseDTO } from '@note-app/shared'

export function useCreateShareLink(noteId: string) {
  return useMutation({
    mutationFn: (body: CreateShareLinkDTO) =>
      http
        .post<{ data: ShareLinkResponseDTO }>(`/notes/${noteId}/share`, body)
        .then((r) => r.data.data),
  })
}
```

No `onError` toast — the modal handles error display inline (button disabled state + inline message). No query invalidation — active links live in modal local state only.

---

### 5c. `hooks/sharing/use-revoke-share-link.ts`

```typescript
import { useMutation } from '@tanstack/react-query'
import { http } from '@/lib/http'

export function useRevokeShareLink() {
  return useMutation({
    mutationFn: (shareLinkId: string) =>
      http.delete(`/share/${shareLinkId}`),
  })
}
```

---

### 5d. `hooks/sharing/use-public-note.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { publicHttp } from '@/lib/public-http'
import type { PublicNoteDTO } from '@note-app/shared'

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

---

### 5e. `components/sharing/share-modal.tsx`

**Props:**
```typescript
interface ShareModalProps {
  noteId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

**Internal state:**
```typescript
type ExpiryPreset = 'none' | '1d' | '7d' | '30d'

const [links, setLinks]   = useState<ShareLinkResponseDTO[]>([])
const [preset, setPreset] = useState<ExpiryPreset>('none')
```

**Expiry helper (plain JS — no external dependency):**
```typescript
function toExpiresAt(preset: ExpiryPreset): string | null {
  if (preset === 'none') return null
  const days = preset === '1d' ? 1 : preset === '7d' ? 7 : 30
  return new Date(Date.now() + days * 86_400_000).toISOString()
}
```

**Share URL helper:**
```typescript
function buildShareUrl(token: string): string {
  return `${window.location.origin}/public/${token}`
}
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

**Generate handler:**
```typescript
async function handleGenerate() {
  const link = await createShareLink.mutateAsync({ expiresAt: toExpiresAt(preset) })
  setLinks((prev) => [link, ...prev])
}
```

**Revoke handler:**
```typescript
async function handleRevoke(linkId: string) {
  await revokeShareLink.mutateAsync(linkId)
  setLinks((prev) => prev.filter((l) => l.id !== linkId))
}
```

**Copy handler:**
```typescript
function handleCopy(token: string) {
  navigator.clipboard.writeText(buildShareUrl(token))
  toast.success('Link copied to clipboard')
}
```

**Skeleton of rendered JSX (using shadcn/ui `Dialog`):**

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Share Note</DialogTitle>
    </DialogHeader>

    {/* Expiry preset selection */}
    <fieldset>
      <legend className="text-sm font-medium mb-2">Link expiry</legend>
      <div className="flex flex-wrap gap-3">
        {(['none', '1d', '7d', '30d'] as ExpiryPreset[]).map((p) => (
          <label key={p} className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="radio"
              name="expiry"
              value={p}
              checked={preset === p}
              onChange={() => setPreset(p)}
              className="accent-primary"
            />
            {p === 'none' ? 'No expiry' : p === '1d' ? '1 day' : p === '7d' ? '7 days' : '30 days'}
          </label>
        ))}
      </div>
    </fieldset>

    {/* Generate button */}
    <Button
      onClick={handleGenerate}
      disabled={createShareLink.isPending}
      className="w-full"
    >
      {createShareLink.isPending
        ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating…</>
        : 'Generate Link'}
    </Button>

    {createShareLink.isError && (
      <p className="text-sm text-destructive">Failed to generate link. Please try again.</p>
    )}

    {/* Active links (session-only) */}
    {links.length > 0 && (
      <div className="space-y-3 border-t pt-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Active links — this session
        </p>
        {links.map((link) => (
          <div key={link.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-xs bg-muted px-2 py-1 rounded">
                {buildShareUrl(link.token)}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleCopy(link.token)}
                aria-label="Copy link"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {link.viewCount} view{link.viewCount !== 1 ? 's' : ''}
                </span>
                <span>{formatExpiry(link.expiresAt)}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-7 text-xs"
                onClick={() => handleRevoke(link.id)}
                disabled={revokeShareLink.isPending}
              >
                Revoke
              </Button>
            </div>
          </div>
        ))}
      </div>
    )}

    {links.length === 0 && (
      <p className="text-sm text-muted-foreground text-center py-2">
        No links generated yet.
      </p>
    )}
  </DialogContent>
</Dialog>
```

**Imports needed:** `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from `@/components/ui/dialog`; `Button` from `@/components/ui/button`; `Loader2`, `Copy`, `Eye` from `lucide-react`; `toast` from `sonner`; `useState` from `react`.

> `shadcn/ui Dialog` is already used in the project — verify `components/ui/dialog.tsx` exists or generate it with `npx shadcn@latest add dialog` if missing.

---

### 5f. `pages/public/public-note.page.tsx`

```typescript
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { usePublicNote } from '@/hooks/sharing/use-public-note'

export function PublicNotePage() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, isError } = usePublicNote(token!)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading note" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Link invalid or expired</p>
          <p className="text-sm text-muted-foreground">
            This shared note link is no longer available.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-3">
        <span className="font-semibold">NoteApp</span>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <h1 className="text-2xl font-bold">{data.title}</h1>
        {data.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((tag) => (
              <span
                key={tag.name}
                style={{ backgroundColor: tag.color }}
                className="text-xs px-2 py-0.5 rounded-full text-white"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
        <footer className="border-t pt-4 text-xs text-muted-foreground">
          Shared note — view only
        </footer>
      </main>
    </div>
  )
}
```

---

### 5g. `note-editor.page.tsx` — modifications

**Add to imports:**
```typescript
import { Share2 } from 'lucide-react'
import { ShareModal } from '@/components/sharing/share-modal'
```

**Add state (inside `NoteEditorPage`):**
```typescript
const [shareOpen, setShareOpen] = useState(false)
```

**Modify the header `<div className="flex items-center gap-2">` (edit-mode branch):**
```tsx
{isEditMode ? (
  <>
    <SaveIndicator status={saveStatus} onRetry={handleRetry} />
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
) : (
  <Button
    onClick={handleCreate}
    disabled={createNote.isPending || !title.trim()}
    size="sm"
  >
    {createNote.isPending ? (
      <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Creating…</>
    ) : (
      'Create Note'
    )}
  </Button>
)}
```

---

### 5h. `router.tsx` — modifications

```typescript
// Add import:
import { PublicNotePage } from '@/pages/public/public-note.page'

// Add top-level unprotected route (after ProtectedRoute block, before the / redirect):
{ path: '/public/:token', element: <PublicNotePage /> },
```

Full router after change:
```typescript
export const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [
      { path: '/login',           element: <LoginPage /> },
      { path: '/register',        element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password',  element: <ResetPasswordPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/notes',      element: <NotesListPage /> },
      { path: '/notes/new',  element: <NoteEditorPage /> },
      { path: '/notes/:id',  element: <NoteEditorPage /> },
      { path: '/search',     element: <SearchPage /> },
    ],
  },
  { path: '/public/:token', element: <PublicNotePage /> },   // unprotected
  { path: '/', element: <Navigate to="/notes" replace /> },
])
```

---

## 6. Test Coverage Plan

### `use-create-share-link.test.ts`

Pattern: `renderHook`, mock `@/lib/http`, `makeWrapper()` with `QueryClientProvider`.

| # | Scenario |
|---|----------|
| T01 | Mutation calls `http.post('/notes/note-1/share', { expiresAt: null })` when preset is `none` |
| T02 | Mutation calls `http.post` with a future ISO string when `expiresAt` is provided |
| T03 | Returns `ShareLinkResponseDTO` on 201 success |
| T04 | `isError` is true when `http.post` rejects |

### `use-revoke-share-link.test.ts`

| # | Scenario |
|---|----------|
| T01 | Mutation calls `http.delete('/share/link-1')` with the correct ID |
| T02 | Resolves on success (no error state) |

### `share-modal.test.tsx`

Pattern: `render` with `QueryClientProvider`, mock `@/lib/http`, mock `@/hooks/sharing/use-create-share-link` and `@/hooks/sharing/use-revoke-share-link`.

| # | Scenario |
|---|----------|
| T01 | Renders all four expiry radio options |
| T02 | "Generate Link" button is visible and enabled by default |
| T03 | "Generate Link" shows spinner and is disabled while mutation is pending |
| T04 | On successful generation, the new link's share URL appears in the list |
| T05 | Clicking the copy icon calls `navigator.clipboard.writeText` with the correct URL |
| T06 | Toast "Link copied to clipboard" is shown after copy |
| T07 | Clicking "Revoke" calls the revoke mutation with the correct link ID |
| T08 | Revoked link is removed from the list on mutation success |
| T09 | Empty state message "No links generated yet" shown when `links` is empty |
| T10 | Inline error message shown when generate mutation fails |

### `public-note.page.test.tsx`

Pattern: `render` with `QueryClientProvider` + `MemoryRouter`, mock `@/lib/public-http`.

| # | Scenario |
|---|----------|
| T01 | Loading spinner rendered while `usePublicNote` is pending |
| T02 | Note title rendered on success |
| T03 | Tag pills rendered with correct names |
| T04 | Content rendered via `dangerouslySetInnerHTML` |
| T05 | "Link invalid or expired" message shown when query errors |
| T06 | "Shared note — view only" footer rendered on success |

---

## 7. shadcn/ui Dependencies Check

The `<ShareModal>` uses `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle`. Verify before implementation:

```bash
ls apps/frontend/src/components/ui/dialog.tsx 2>/dev/null \
  || echo "MISSING — run: pnpm --filter frontend exec npx shadcn@latest add dialog"
```

All other components (`Button`, `Input`, `Skeleton`) are confirmed present.

---

## 8. Implementation Sequence

Execute in this order to keep the app compilable at every step:

| Step | Action | Compilable after? |
|------|--------|------------------|
| 1 | Create `lib/public-http.ts` | Yes |
| 2 | Create `hooks/sharing/use-create-share-link.ts` | Yes |
| 3 | Create `hooks/sharing/use-revoke-share-link.ts` | Yes |
| 4 | Create `hooks/sharing/use-public-note.ts` | Yes |
| 5 | Add shadcn Dialog if missing | Yes |
| 6 | Create `components/sharing/share-modal.tsx` | Yes |
| 7 | Create `pages/public/public-note.page.tsx` | Yes |
| 8 | Modify `note-editor.page.tsx` (add Share button + modal) | Yes |
| 9 | Modify `router.tsx` (add /public/:token route) | Yes |
| 10 | Write all test files | Yes |

---

## 9. Quality Gates

Run in order before committing:

```bash
pnpm tsc --noEmit                  # 1. type-check monorepo
pnpm --filter frontend lint        # 2. lint frontend
pnpm --filter frontend test        # 3. frontend unit tests (target ≥ 80%)
pnpm --filter frontend build       # 4. build check
```

Do not commit if any gate fails. Do not use `--no-verify`.

---

## 10. Open Questions (All Resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | Active-link list without a GET endpoint? | Session-only `useState` |
| 2 | Public page in scope? | Yes — included |
| 3 | Expiry UX? | 4 presets (none / 1d / 7d / 30d) |
| 4 | Share button placement? | Editor toolbar, edit mode only |
| 5 | Public URL base? | `window.location.origin` |
| 6 | Auth on public fetch? | Separate `publicHttp` instance |
