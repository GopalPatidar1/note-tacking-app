# Technical Plan — AB-1015: Version History Drawer + Restore

**Date:** 2026-06-12
**Author:** gopalp@mindfiresolutions.com
**Branch:** feat/AB-1015-version-history-ui
**Scope:** Full-stack — shared types → backend repository/service/controller/routes → frontend hooks/component/editor wiring

---

## 1. Overview

AB-1009 shipped version snapshot creation but never implemented the read/restore endpoints. This ticket fills that gap end-to-end.

**Work split:**
1. `packages/shared` — version DTO types (1 new file, 1 modified)
2. Backend — repository + service + controller + routes (4 files modified)
3. Frontend — shadcn/ui components, hooks, sheet component, editor wiring (9 new files, 1 modified)
4. Tests — backend unit + integration, frontend unit (8 new test files)

---

## 2. Key Findings from Codebase Scan

| Finding | Impact on plan |
|---------|----------------|
| `useNote` query key is `['notes', id]` (plural) | Restore mutation must invalidate `['notes', id]`, not `['note', id]` |
| `useUpdateNote.onSuccess` calls `setQueryData(['notes', id], updated)` | Restore should do the same to update the editor cache immediately |
| shadcn/ui `Sheet` and `AlertDialog` are **not scaffolded** | Must run `npx shadcn@latest add sheet alert-dialog` before implementing |
| `noteService.update` already creates a version snapshot in a `$transaction` | `restoreVersion` should replicate this exact pattern inline, not call `update` recursively |
| `noteVersionRepository` only has `create` + `getNextVersionNumber` | `listByNoteId` + `findById` must be added |
| Integration tests use `skipIfNoDb` guard and `registerAndLogin` helper | New version integration tests follow the same pattern |
| `noteController` is a plain object literal — no class | Add version handlers as new methods on the same object |
| `note.routes.ts` uses `router.use(authenticate)` at the top | New version routes inherit auth automatically — no extra middleware |

---

## 3. Exact File Changes

### 3a. `packages/shared`

| File | Action |
|------|--------|
| `src/schemas/versions.ts` | CREATE |
| `src/index.ts` | MODIFY — add `export * from './schemas/versions'` |

### 3b. `apps/backend/src`

| File | Action |
|------|--------|
| `repositories/note-version.repository.ts` | MODIFY — add `listByNoteId`, `findById` |
| `services/note.service.ts` | MODIFY — add `listVersions`, `getVersion`, `restoreVersion` |
| `controllers/note.controller.ts` | MODIFY — add `listVersions`, `getVersion`, `restoreVersion` |
| `routes/note.routes.ts` | MODIFY — add 3 version routes |

### 3c. `apps/frontend/src`

| File | Action |
|------|--------|
| `components/ui/sheet.tsx` | CREATE (via `npx shadcn@latest add sheet`) |
| `components/ui/alert-dialog.tsx` | CREATE (via `npx shadcn@latest add alert-dialog`) |
| `hooks/versions/use-note-versions.ts` | CREATE |
| `hooks/versions/use-note-version.ts` | CREATE |
| `hooks/versions/use-restore-version.ts` | CREATE |
| `components/versions/version-history-sheet.tsx` | CREATE |
| `pages/notes/note-editor.page.tsx` | MODIFY — `historyOpen` state + History button + `<VersionHistorySheet>` |

### 3d. Tests

| File | Action |
|------|--------|
| `apps/backend/src/__tests__/note-version.repository.test.ts` | CREATE |
| `apps/backend/src/__tests__/note-version.service.test.ts` | CREATE |
| `apps/backend/src/__tests__/note-version.integration.test.ts` | CREATE |
| `apps/frontend/src/__tests__/versions/use-note-versions.test.ts` | CREATE |
| `apps/frontend/src/__tests__/versions/use-note-version.test.ts` | CREATE |
| `apps/frontend/src/__tests__/versions/use-restore-version.test.ts` | CREATE |
| `apps/frontend/src/__tests__/versions/version-history-sheet.test.tsx` | CREATE |

**Total: 11 new files, 5 modified.**

---

## 4. TypeScript Interfaces (Final Shapes)

### 4a. `packages/shared/src/schemas/versions.ts`

```typescript
export interface NoteVersionDTO {
  id:            string
  noteId:        string
  title:         string
  content:       string
  versionNumber: number
  createdAt:     string
}

export interface PaginatedVersionsDTO {
  items: NoteVersionDTO[]
  total: number
  page:  number
  limit: number
}
```

No Zod schemas — all three endpoints are GET/POST with no request bodies. No client-side form validation needed.

### 4b. Backend — repository method signatures

```typescript
// note-version.repository.ts additions
listByNoteId(
  noteId: string,
  opts: { page: number; limit: number },
): Promise<{ items: NoteVersion[]; total: number }>

findById(id: string, noteId: string): Promise<NoteVersion | null>
```

### 4c. Backend — service method signatures

```typescript
// note.service.ts additions
listVersions(
  userId: string,
  noteId: string,
  page: number,
  limit: number,
): Promise<PaginatedVersionsDTO>

getVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<NoteVersionDTO>

restoreVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<NoteDTO>
```

### 4d. Frontend — `VersionHistorySheetProps`

```typescript
interface VersionHistorySheetProps {
  noteId:       string
  open:         boolean
  onOpenChange: (open: boolean) => void
}
```

---

## 5. Architecture Decisions

### D1 — `restoreVersion` inlines its own transaction (does NOT call `noteService.update`)

`noteService.update` already creates a snapshot in a `$transaction`. Calling it from `restoreVersion` would work (self-reference on a plain object is valid JS), but it re-runs the note ownership check twice and adds coupling. Instead, `restoreVersion` mirrors the same `$transaction` pattern:

```typescript
const restored = await prisma.$transaction(async (tx) => {
  const updated = await noteRepository.update(noteId, { title: version.title, content: version.content }, tx)
  const versionNumber = await noteVersionRepository.getNextVersionNumber(noteId, tx)
  await noteVersionRepository.create({ noteId, title: updated.title, content: updated.content, versionNumber }, tx)
  return updated
})
return toNoteDTO(restored)
```

Tags are preserved because we pass only `{ title, content }` — the repository update leaves the existing tag join-rows untouched when `tagIds` is omitted.

### D2 — Query key alignment

| Resource | Query key |
|----------|-----------|
| Single note | `['notes', noteId]` — matches `useNote` and `useUpdateNote.setQueryData` |
| Note list | `['notes']` (prefix match) |
| Version list | `['note-versions', noteId, page]` |
| Single version | `['note-version', noteId, versionId]` |

`useRestoreVersion.onSuccess` must call:
```typescript
queryClient.setQueryData(['notes', noteId], data)  // immediate editor update
queryClient.invalidateQueries({ queryKey: ['notes'] })  // stale list
queryClient.invalidateQueries({ queryKey: ['note-versions', noteId] })  // stale version list
```

Matching `useUpdateNote`'s pattern ensures the editor re-renders the restored content without a loading flash.

### D3 — shadcn/ui Sheet and AlertDialog must be scaffolded first

Neither `Sheet` nor `AlertDialog` exist in `apps/frontend/src/components/ui/`. The shadcn CLI generates these files with the correct Radix UI imports and class-variance-authority setup. This must happen before any component implementation:

```bash
cd apps/frontend
npx shadcn@latest add sheet
npx shadcn@latest add alert-dialog
```

### D4 — `useNoteVersion` is enabled only when a version is selected

The single-version fetch is a lazy query: `enabled: !!noteId && !!versionId`. On sheet open, `selectedVersionId` starts as `null`. A `useEffect` auto-selects `items[0].id` once the version list loads, triggering the first preview fetch. This avoids an unnecessary API call on sheet open.

### D5 — Restore button disabled for `items[0]` (latest version)

The latest version IS the current note content. Restoring it would create an identical snapshot — confusing but not harmful. Disabling it for `items[0]` prevents the noise and makes the UX intent clear.

### D6 — Split pane uses `overflow-y-auto` on the version list, fixed-height Sheet

The Sheet is `size="xl"` (or a custom `w-[700px]`). Left column (version list) is `w-48 shrink-0 overflow-y-auto`. Right column (preview) fills the rest with `flex-1 overflow-y-auto`. This keeps the layout stable as the version list grows.

### D7 — Version list pagination: "Load more" button (not automatic infinite scroll)

`useNoteVersions` accepts a `page` parameter. The sheet tracks `page` in local state. If `total > items.length`, a "Load more" button appears at the bottom of the list. On click, `page` increments, and the new items are appended to the accumulated list. Simple state accumulation — no `useInfiniteQuery` needed at this scale.

### D8 — Content preview uses `dangerouslySetInnerHTML`

TipTap outputs HTML. The version content is the user's own saved content — same trust model as the `ts_headline` rendering in AB-1013. No XSS risk from third-party input.

---

## 6. Detailed Implementation

### Step 1 — Shared package

**`packages/shared/src/schemas/versions.ts`** — new file, exact content in §4a.

**`packages/shared/src/index.ts`** — append:
```typescript
export * from './schemas/versions'
```

---

### Step 2 — Repository

**`apps/backend/src/repositories/note-version.repository.ts`**

Add to the existing `noteVersionRepository` object:

```typescript
async listByNoteId(
  noteId: string,
  opts: { page: number; limit: number },
): Promise<{ items: NoteVersion[]; total: number }> {
  const [items, total] = await prisma.$transaction([
    prisma.noteVersion.findMany({
      where:   { noteId },
      orderBy: { versionNumber: 'desc' },
      skip:    (opts.page - 1) * opts.limit,
      take:    opts.limit,
    }),
    prisma.noteVersion.count({ where: { noteId } }),
  ])
  return { items, total }
},

findById(id: string, noteId: string): Promise<NoteVersion | null> {
  return prisma.noteVersion.findFirst({ where: { id, noteId } })
},
```

Import `NoteVersion` from `@prisma/client` (already imported at the top via `Prisma`):
```typescript
import type { Prisma, NoteVersion } from '@prisma/client'
```

---

### Step 3 — Service

**`apps/backend/src/services/note.service.ts`**

Add imports at top:
```typescript
import type {
  // ... existing imports ...
  NoteVersionDTO,
  PaginatedVersionsDTO,
} from '@note-app/shared'
```

Add helper function (alongside existing `toNoteDTO`):
```typescript
function toVersionDTO(v: NoteVersion): NoteVersionDTO {
  return {
    id:            v.id,
    noteId:        v.noteId,
    title:         v.title,
    content:       v.content,
    versionNumber: v.versionNumber,
    createdAt:     v.createdAt.toISOString(),
  }
}
```

Add to the `noteService` object:

```typescript
async listVersions(
  userId: string,
  noteId: string,
  page: number,
  limit: number,
): Promise<PaginatedVersionsDTO> {
  const note = await noteRepository.findById(noteId, userId)
  if (!note) throw new NotFoundError('Note not found')
  const { items, total } = await noteVersionRepository.listByNoteId(noteId, { page, limit })
  return { items: items.map(toVersionDTO), total, page, limit }
},

async getVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<NoteVersionDTO> {
  const note = await noteRepository.findById(noteId, userId)
  if (!note) throw new NotFoundError('Note not found')
  const version = await noteVersionRepository.findById(versionId, noteId)
  if (!version) throw new NotFoundError('Version not found')
  return toVersionDTO(version)
},

async restoreVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<NoteDTO> {
  const note = await noteRepository.findById(noteId, userId)
  if (!note) throw new NotFoundError('Note not found')
  const version = await noteVersionRepository.findById(versionId, noteId)
  if (!version) throw new NotFoundError('Version not found')

  const restored = await prisma.$transaction(async (tx) => {
    const updated = await noteRepository.update(
      noteId,
      { title: version.title, content: version.content },
      tx,
    )
    const versionNumber = await noteVersionRepository.getNextVersionNumber(noteId, tx)
    await noteVersionRepository.create(
      { noteId, title: updated.title, content: updated.content, versionNumber },
      tx,
    )
    return updated
  })

  return toNoteDTO(restored)
},
```

`NoteVersion` type: import from `@prisma/client` at the top of note.service.ts (already imports `Note`, `Tag` — add `NoteVersion`).

---

### Step 4 — Controller

**`apps/backend/src/controllers/note.controller.ts`**

Add import:
```typescript
import { CreateNoteSchema, UpdateNoteSchema, ListNotesQuerySchema } from '@note-app/shared'
```

Add to the `noteController` object (follow existing handler shape exactly):

```typescript
async listVersions(req: Request, res: Response) {
  const page  = Math.max(1, parseInt(req.query.page  as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20))
  const result = await noteService.listVersions(
    req.user.id,
    req.params.id as string,
    page,
    limit,
  )
  res.status(200).json({ data: result })
},

async getVersion(req: Request, res: Response) {
  const version = await noteService.getVersion(
    req.user.id,
    req.params.id as string,
    req.params.versionId as string,
  )
  res.status(200).json({ data: version })
},

async restoreVersion(req: Request, res: Response) {
  const note = await noteService.restoreVersion(
    req.user.id,
    req.params.id as string,
    req.params.versionId as string,
  )
  res.status(200).json({ data: note })
},
```

---

### Step 5 — Routes

**`apps/backend/src/routes/note.routes.ts`**

Append before `export default router`:
```typescript
router.get('/:id/versions',                      noteController.listVersions)
router.get('/:id/versions/:versionId',           noteController.getVersion)
router.post('/:id/versions/:versionId/restore',  noteController.restoreVersion)
```

---

### Step 6 — shadcn/ui components

```bash
cd apps/frontend
npx shadcn@latest add sheet
npx shadcn@latest add alert-dialog
```

Verify `apps/frontend/src/components/ui/sheet.tsx` and `alert-dialog.tsx` exist.

---

### Step 7 — Frontend hooks

**`apps/frontend/src/hooks/versions/use-note-versions.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { PaginatedVersionsDTO } from '@note-app/shared'

export function useNoteVersions(noteId: string, page = 1) {
  return useQuery({
    queryKey: ['note-versions', noteId, page],
    queryFn:  () =>
      http
        .get<{ data: PaginatedVersionsDTO }>(`/notes/${noteId}/versions`, {
          params: { page, limit: 20 },
        })
        .then((r) => r.data.data),
    enabled: !!noteId,
  })
}
```

**`apps/frontend/src/hooks/versions/use-note-version.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { NoteVersionDTO } from '@note-app/shared'

export function useNoteVersion(noteId: string, versionId: string | null) {
  return useQuery({
    queryKey: ['note-version', noteId, versionId],
    queryFn:  () =>
      http
        .get<{ data: NoteVersionDTO }>(`/notes/${noteId}/versions/${versionId}`)
        .then((r) => r.data.data),
    enabled: !!noteId && !!versionId,
  })
}
```

**`apps/frontend/src/hooks/versions/use-restore-version.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { NoteDTO } from '@note-app/shared'

export function useRestoreVersion(noteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (versionId: string) =>
      http
        .post<{ data: NoteDTO }>(`/notes/${noteId}/versions/${versionId}/restore`)
        .then((r) => r.data.data),
    onSuccess: (data) => {
      queryClient.setQueryData(['notes', noteId], data)
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['note-versions', noteId] })
    },
  })
}
```

---

### Step 8 — `<VersionHistorySheet>` component

**`apps/frontend/src/components/versions/version-history-sheet.tsx`**

Key implementation points:
- Imports: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet`; `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle` from `@/components/ui/alert-dialog`
- Internal state: `selectedVersionId: string | null`, `confirmOpen: boolean`, `page: number`, `accumulatedItems: NoteVersionDTO[]`
- `useEffect` auto-selects first version when list loads
- `useEffect` appends newly loaded page items to `accumulatedItems` (load more)
- Format date helper: `new Date(createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })`

Layout structure (Tailwind):
```
<SheetContent side="right" className="w-[700px] sm:max-w-[700px] flex flex-col p-0">
  <SheetHeader className="px-4 py-3 border-b">
    <SheetTitle>Version History</SheetTitle>
  </SheetHeader>
  <div className="flex flex-1 overflow-hidden">
    {/* Left: version list */}
    <div className="w-48 shrink-0 border-r overflow-y-auto flex flex-col">
      {/* version rows + load more */}
    </div>
    {/* Right: preview */}
    <div className="flex-1 overflow-y-auto flex flex-col p-4">
      {/* title + content + restore button */}
    </div>
  </div>
</SheetContent>
```

Restore button disabled condition: `selectedVersionId === accumulatedItems[0]?.id`

AlertDialog body: `"This will replace the current note content with the version from [formatted date]. Your current content will be saved as a new version first."`

On confirm: call `restoreVersion.mutate(selectedVersionId)` → on success: toast `"Note restored to version N"` + `onOpenChange(false)`.

---

### Step 9 — Editor modification

**`apps/frontend/src/pages/notes/note-editor.page.tsx`**

1. Add import: `VersionHistorySheet` from `@/components/versions/version-history-sheet`; `History` from `lucide-react`
2. Add state: `const [historyOpen, setHistoryOpen] = useState(false)` alongside existing `shareOpen`
3. In the edit-mode header (the `<>` block containing `<SaveIndicator>` and `<ShareModal>`), add:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setHistoryOpen(true)}
  className="gap-1"
>
  <History className="h-4 w-4" />
  History
</Button>
<VersionHistorySheet noteId={id!} open={historyOpen} onOpenChange={setHistoryOpen} />
```

Place the History button between `<SaveIndicator>` and the existing Share button.

---

## 7. Test Specifications

### Backend unit — `note-version.repository.test.ts`

Scope: unit — mock `prisma` directly.

```
T01 listByNoteId: returns items ordered versionNumber DESC with correct skip/take
T02 listByNoteId: returns total count
T03 findById: returns version when id + noteId match
T04 findById: returns null when noteId does not match (IDOR guard)
```

### Backend unit — `note-version.service.test.ts`

Scope: unit — mock `noteRepository`, `noteVersionRepository`, `prisma.$transaction`.
Follow the exact `vi.mock` pattern from `note.service.test.ts`.

```
T05 listVersions: throws NotFoundError when note not found
T06 listVersions: returns PaginatedVersionsDTO on success
T07 getVersion: throws NotFoundError when note not found
T08 getVersion: throws NotFoundError when version not found
T09 getVersion: returns NoteVersionDTO on success
T10 restoreVersion: throws NotFoundError when note not found
T11 restoreVersion: throws NotFoundError when version not found
T12 restoreVersion: calls noteRepository.update + noteVersionRepository.create in transaction
T13 restoreVersion: returns NoteDTO of restored note
```

### Backend integration — `note-version.integration.test.ts`

Scope: Supertest + real test DB. Follow `note.integration.test.ts` pattern — same `skipIfNoDb`, `registerAndLogin`, `cleanDb`.

```
T14 GET /api/notes/:id/versions → 200 with paginated version list
T15 GET /api/notes/:id/versions → 401 without auth
T16 GET /api/notes/:id/versions → 404 when note not found
T17 GET /api/notes/:id/versions/:versionId → 200 with snapshot
T18 GET /api/notes/:id/versions/:versionId → 404 when version not found
T19 POST /api/notes/:id/versions/:versionId/restore → 200, note updated, new snapshot created
T20 POST /api/notes/:id/versions/:versionId/restore → 401 without auth
T21 POST /api/notes/:id/versions/:versionId/restore → 403 for another user's note
```

### Frontend unit — hook tests

Pattern: `renderHook` + `QueryClientProvider` wrapper + `vi.mock('@/lib/http')`. Follow `use-create-share-link.test.ts` exactly.

**`use-note-versions.test.ts`**
```
T01 calls GET /notes/:id/versions?page=1&limit=20
T02 returns PaginatedVersionsDTO on success
T03 query disabled when noteId is empty string
```

**`use-note-version.test.ts`**
```
T01 calls GET /notes/:id/versions/:versionId
T02 query disabled when versionId is null
```

**`use-restore-version.test.ts`**
```
T01 calls POST /notes/:id/versions/:versionId/restore
T02 onSuccess: calls setQueryData(['notes', noteId], data)
T03 onSuccess: invalidates ['notes'] and ['note-versions', noteId]
T04 propagates error to isError state
```

### Frontend unit — `version-history-sheet.test.tsx`

Pattern: `render` + `QueryClientProvider` wrapper. Mock hooks directly.
Follow `share-modal.test.tsx` pattern — mutable flags for hook state, `vi.mock` for each hook.

```
T05 renders loading skeleton while version list fetches
T06 renders version list rows on success
T07 auto-selects first version on load
T08 clicking a version row selects it (bg-accent class or aria-selected)
T09 Restore button is disabled for the latest version (items[0])
T10 Restore button is enabled for older versions
T11 clicking Restore opens the AlertDialog
T12 cancelling the AlertDialog closes it without calling the mutation
T13 confirming the AlertDialog calls restoreVersion.mutate with the versionId
T14 on successful restore, onOpenChange(false) is called
T15 success toast "Note restored to version N" is shown
T16 "Load more" button appears when total > items.length
```

---

## 8. Implementation Order (dependency-aware)

```
Step 1  packages/shared — version types (backend + frontend both depend on this)
Step 2  Backend repository — listByNoteId, findById
Step 3  Backend service — listVersions, getVersion, restoreVersion
Step 4  Backend controller — 3 handlers
Step 5  Backend routes — 3 route registrations
Step 6  Backend tests — repository unit, service unit, integration
Step 7  shadcn/ui components — npx shadcn add sheet alert-dialog
Step 8  Frontend hooks — use-note-versions, use-note-version, use-restore-version
Step 9  Frontend component — version-history-sheet.tsx
Step 10 Frontend editor — historyOpen state + History button + mount VersionHistorySheet
Step 11 Frontend tests — hook tests, component test
```

---

## 9. Quality Gates

Run in this exact order before committing:

```bash
# 1. Type-check entire monorepo (catches shared → backend/frontend drift)
pnpm tsc --noEmit

# 2. Backend lint
pnpm --filter backend lint

# 3. Frontend lint
pnpm --filter frontend lint

# 4. Backend tests (unit + integration)
pnpm --filter backend test

# 5. Frontend tests
pnpm --filter frontend test

# 6. Backend build check
pnpm --filter backend build
```

All 6 gates must pass. Do not commit with `--no-verify`.

---

## 10. No DB Changes

`note_versions` table already exists from AB-1009 migration. No `prisma migrate` required — purely adding query methods on top of the existing schema.

---

## 11. Open Risks / Watchpoints

| Risk | Mitigation |
|------|-----------|
| `noteRepository.update` with `{ title, content }` (no tagIds) — verify tag rows are not cleared | **RESOLVED** — repo uses `tagIds !== undefined` guard before calling `tags: { set: ... }`. Tags are not touched when `tagIds` is omitted. Safe to call with `{ title, content }` only. |
| shadcn `Sheet`/`AlertDialog` CLI may prompt for overwrite confirmations | Run interactively once, accept defaults |
| `useRestoreVersion.onSuccess` `setQueryData` shape must match `NoteDTO` exactly | The `http.post` response is typed `{ data: NoteDTO }` — correct by construction |
