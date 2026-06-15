# Spec Proposal — AB-1015: Frontend — Version History Drawer + Restore

**Date:** 2026-06-12
**Author:** gopalp@mindfiresolutions.com
**Scope:** Full-stack — missing backend version endpoints + frontend version history Sheet with split-pane preview and restore
**Status:** DRAFT

---

## 1. Summary

AB-1009 shipped version snapshot creation (on every note save) but the three read/restore endpoints were never wired up. AB-1015 is therefore a **full-stack ticket**: it completes the backend API and builds the frontend UI on top of it.

| Deliverable | Description |
|-------------|-------------|
| `packages/shared` version types | `NoteVersionDTO`, `PaginatedVersionsDTO` — single source of truth |
| Backend: repository | `listByNoteId`, `findById` on `noteVersionRepository` |
| Backend: service | `listVersions`, `getVersion`, `restoreVersion` on `noteService` |
| Backend: routes | `GET /notes/:id/versions`, `GET /notes/:id/versions/:versionId`, `POST /notes/:id/versions/:versionId/restore` |
| Frontend: hooks | `useNoteVersions`, `useNoteVersion`, `useRestoreVersion` |
| Frontend: component | `<VersionHistorySheet>` — Sheet with version list + read-only split-pane preview |
| Frontend: editor wiring | "History" button in note editor toolbar; AlertDialog confirmation before restore |

---

## 2. OpenAPI Contract Delta

**No new spec additions required.** All three version endpoints are already specified in `openapi.yaml` and the `NoteVersion` schema is fully defined. This ticket is an **implementation gap fill**.

Endpoints already in spec (confirming contract, not changing it):

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/notes/{id}/versions` | `{ data: { items: NoteVersion[], total, page, limit } }` |
| `GET` | `/notes/{id}/versions/{versionId}` | `{ data: NoteVersion }` |
| `POST` | `/notes/{id}/versions/{versionId}/restore` | `{ data: Note }` |

`NoteVersion` schema (from openapi.yaml):

```yaml
id: string (uuid)
noteId: string (uuid)
title: string
content: string
versionNumber: integer
createdAt: string (date-time)
```

Restore response is the full `Note` object (same shape as `NoteDTO`).

---

## 3. Shared Package Changes

**File:** `packages/shared/src/schemas/versions.ts` — **NEW**

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

No Zod schemas needed — versions have no request bodies (list/get are GET, restore has no body).

**File:** `packages/shared/src/index.ts` — **MODIFY**

Add: `export * from './schemas/versions'`

---

## 4. Backend Architecture

### 4a. Repository additions (`note-version.repository.ts`)

Two new methods added to the existing `noteVersionRepository` object:

```typescript
listByNoteId(
  noteId: string,
  opts: { page: number; limit: number }
): Promise<{ items: NoteVersion[]; total: number }>

findById(id: string, noteId: string): Promise<NoteVersion | null>
```

- `listByNoteId` orders by `versionNumber DESC` (newest first), applies `skip`/`take` for pagination.
- `findById` scopes by both `id` and `noteId` to prevent cross-note version access.

### 4b. Service additions (`note.service.ts`)

Three new methods added to the existing `noteService` object:

**`listVersions(userId, noteId, page, limit)`**
1. Verify note exists and belongs to user (`noteRepository.findById`) — throws `NotFoundError` if not.
2. Call `noteVersionRepository.listByNoteId(noteId, { page, limit })`.
3. Return `PaginatedVersionsDTO`.

**`getVersion(userId, noteId, versionId)`**
1. Verify note ownership (same guard as above).
2. Call `noteVersionRepository.findById(versionId, noteId)` — throws `NotFoundError` if absent.
3. Return `NoteVersionDTO`.

**`restoreVersion(userId, noteId, versionId)`**
1. Verify note ownership.
2. Fetch version via `noteVersionRepository.findById` — throws `NotFoundError` if absent.
3. In a `prisma.$transaction`:
   - `noteRepository.update(noteId, { title: version.title, content: version.content })` — preserves tags.
   - `noteVersionRepository.getNextVersionNumber(noteId, tx)`.
   - `noteVersionRepository.create({ noteId, title, content, versionNumber }, tx)`.
4. Return `NoteDTO` of the updated note.

> Tags are preserved on restore — `note_versions` stores only `title` and `content`; tag associations live on the `note` itself and are not reverted.

### 4c. Controller additions (`note.controller.ts`)

Three new handlers added to the existing `noteController` object:

```typescript
listVersions:   async (req, res) => { ... }  // GET /notes/:id/versions
getVersion:     async (req, res) => { ... }  // GET /notes/:id/versions/:versionId
restoreVersion: async (req, res) => { ... }  // POST /notes/:id/versions/:versionId/restore
```

Each follows the standard pattern: validate params, call service, `res.json({ data: result })`.

Query parsing for `listVersions` uses the existing `ListNotesQuerySchema`-style coercion for `page`/`limit`.

### 4d. Route additions (`note.routes.ts`)

```typescript
router.get('/:id/versions',                      noteController.listVersions)
router.get('/:id/versions/:versionId',           noteController.getVersion)
router.post('/:id/versions/:versionId/restore',  noteController.restoreVersion)
```

These mount under the existing `authenticate` middleware (already applied with `router.use(authenticate)`), so no additional auth wiring is needed.

---

## 5. Frontend Architecture

### 5a. File layout

```
apps/frontend/src/
  hooks/versions/
    use-note-versions.ts          NEW — GET /notes/:id/versions (paginated list)
    use-note-version.ts           NEW — GET /notes/:id/versions/:versionId (single)
    use-restore-version.ts        NEW — POST /notes/:id/versions/:versionId/restore

  components/versions/
    version-history-sheet.tsx     NEW — Sheet + split pane (list + preview + restore)

  pages/notes/
    note-editor.page.tsx          MODIFY — History button + <VersionHistorySheet>

  __tests__/versions/
    use-note-versions.test.ts     NEW
    use-note-version.test.ts      NEW
    use-restore-version.test.ts   NEW
    version-history-sheet.test.tsx NEW
```

**Total: 7 new files, 1 modified.**

### 5b. Hooks

**`useNoteVersions(noteId: string, page = 1)`**

```typescript
export function useNoteVersions(noteId: string, page = 1) {
  return useQuery({
    queryKey: ['note-versions', noteId, page],
    queryFn: () =>
      http
        .get<{ data: PaginatedVersionsDTO }>(`/notes/${noteId}/versions`, {
          params: { page, limit: 20 },
        })
        .then((r) => r.data.data),
    enabled: !!noteId,
  })
}
```

**`useNoteVersion(noteId: string, versionId: string | null)`**

```typescript
export function useNoteVersion(noteId: string, versionId: string | null) {
  return useQuery({
    queryKey: ['note-version', noteId, versionId],
    queryFn: () =>
      http
        .get<{ data: NoteVersionDTO }>(`/notes/${noteId}/versions/${versionId}`)
        .then((r) => r.data.data),
    enabled: !!noteId && !!versionId,
  })
}
```

`enabled: !!versionId` — the query is dormant until a version is selected in the list, avoiding a spurious fetch on sheet open.

**`useRestoreVersion(noteId: string)`**

```typescript
export function useRestoreVersion(noteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (versionId: string) =>
      http
        .post<{ data: NoteDTO }>(`/notes/${noteId}/versions/${versionId}/restore`)
        .then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['note', noteId] })
      queryClient.invalidateQueries({ queryKey: ['note-versions', noteId] })
    },
  })
}
```

Invalidating both `['note', noteId]` and `['note-versions', noteId]` ensures the editor re-fetches the latest content and the version list reflects the new snapshot.

### 5c. `<VersionHistorySheet>` component

**Props:**

```typescript
interface VersionHistorySheetProps {
  noteId:       string
  open:         boolean
  onOpenChange: (open: boolean) => void
}
```

**Internal state:**

- `selectedVersionId: string | null` — which version is highlighted; defaults to `null` (nothing selected until list loads, then auto-selects the first item)
- `confirmOpen: boolean` — controls the AlertDialog

**Behavior flow:**

1. Sheet opens → `useNoteVersions(noteId)` fetches the list.
2. When list loads, auto-select `items[0].id` (latest version).
3. User clicks a version row → `selectedVersionId` updates → `useNoteVersion` fetches the preview.
4. Restore button in preview pane is **disabled** if the selected version is the latest (index 0).
5. Clicking Restore → `confirmOpen = true` → AlertDialog shows.
6. Confirming → `restoreVersion.mutate(selectedVersionId)` → on success: `onOpenChange(false)` closes the sheet; toast: `"Note restored to version N"`.

**Wire mockup:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Version History                                             ✕   │
├─────────────────────────┬────────────────────────────────────────┤
│  v3  •  Jun 12, 10:42   │  Meeting notes (v2)                    │
│  v2  •  Jun 11, 15:30 ← │                                        │
│  v1  •  Jun 10, 09:00   │  Discussed the Q3 roadmap with the     │
│                         │  team. Action items: …                 │
│                         │                                        │
│                         │                                        │
│  ── 3 versions ──       │                    [ Restore version ] │
└─────────────────────────┴────────────────────────────────────────┘
```

- Selected row is highlighted with `bg-accent`.
- Latest version row shows `(current)` badge; its Restore button is disabled.
- Content rendered via `dangerouslySetInnerHTML` (TipTap HTML, same rationale as AB-1013 headline rendering).
- Pagination: "Load more" button at the bottom of the version list if `total > items.length`.

**AlertDialog copy:**

```
Title:  Restore to version N?
Body:   This will replace the current note content with the content
        from [date]. Your current content will be saved as a new
        version first.
Actions: Cancel | Restore
```

### 5d. Note editor modification

Two additions to `note-editor.page.tsx`:

1. `const [historyOpen, setHistoryOpen] = useState(false)` alongside existing `shareOpen`.
2. In the edit-mode header block, add History button between ShareModal and SaveIndicator:

```tsx
{isEditMode && (
  <>
    <SaveIndicator status={saveStatus} onRetry={handleRetry} />
    <Button
      variant="outline"
      size="sm"
      onClick={() => setHistoryOpen(true)}
      className="gap-1"
    >
      <History className="h-4 w-4" />
      History
    </Button>
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
    <VersionHistorySheet noteId={id!} open={historyOpen} onOpenChange={setHistoryOpen} />
  </>
)}
```

Import `History` from `lucide-react` (already a dependency).

---

## 6. New Dependencies

None. All packages already installed:

| Package | Usage in this ticket |
|---------|----------------------|
| `@tanstack/react-query` | `useNoteVersions`, `useNoteVersion`, `useRestoreVersion` |
| `axios` | existing `http` instance |
| `lucide-react` | `History` icon |
| `sonner` | restore success/error toasts |

> shadcn/ui `Sheet`, `AlertDialog`, `Button`, `Badge`, `Skeleton` used — all already available.

---

## 7. Test Coverage Plan

### Backend

#### `note-version.repository` (unit)

| # | Scenario |
|---|----------|
| T01 | `listByNoteId` returns versions ordered by `versionNumber DESC` |
| T02 | `listByNoteId` applies `skip`/`take` for pagination |
| T03 | `findById` returns version when `id` + `noteId` both match |
| T04 | `findById` returns `null` when `noteId` does not match (prevents cross-note access) |

#### `noteService` version methods (unit — mock repo)

| # | Scenario |
|---|----------|
| T05 | `listVersions` throws `NotFoundError` when note does not belong to user |
| T06 | `listVersions` returns `PaginatedVersionsDTO` on success |
| T07 | `getVersion` throws `NotFoundError` when version not found |
| T08 | `getVersion` returns `NoteVersionDTO` on success |
| T09 | `restoreVersion` throws `NotFoundError` when version not found |
| T10 | `restoreVersion` updates note title+content, creates new snapshot, returns `NoteDTO` |
| T11 | `restoreVersion` preserves existing tag associations |

#### Integration (Supertest + real test DB)

| # | Scenario |
|---|----------|
| T12 | `GET /notes/:id/versions` → 200 with version list |
| T13 | `GET /notes/:id/versions` → 403 when note belongs to another user |
| T14 | `GET /notes/:id/versions/:versionId` → 200 with version snapshot |
| T15 | `GET /notes/:id/versions/:versionId` → 404 when version not found |
| T16 | `POST /notes/:id/versions/:versionId/restore` → 200, note updated, new snapshot created |
| T17 | `POST /notes/:id/versions/:versionId/restore` → 401 when unauthenticated |

### Frontend

#### `use-note-versions.test.ts`

| # | Scenario |
|---|----------|
| T01 | Query calls `GET /notes/:id/versions?page=1&limit=20` |
| T02 | Returns `PaginatedVersionsDTO` on success |
| T03 | Query is disabled when `noteId` is empty |

#### `use-note-version.test.ts`

| # | Scenario |
|---|----------|
| T01 | Query calls `GET /notes/:id/versions/:versionId` |
| T02 | Query is disabled when `versionId` is null |

#### `use-restore-version.test.ts`

| # | Scenario |
|---|----------|
| T01 | Mutation calls `POST /notes/:id/versions/:versionId/restore` |
| T02 | On success, invalidates `['note', noteId]` and `['note-versions', noteId]` |
| T03 | Propagates error to mutation error state |

#### `version-history-sheet.test.tsx`

| # | Scenario |
|---|----------|
| T01 | Renders version list when sheet opens |
| T02 | Auto-selects the first (latest) version on load |
| T03 | Clicking a version row updates the preview pane |
| T04 | Restore button is disabled for the latest version |
| T05 | Restore button is enabled for older versions |
| T06 | Clicking Restore opens the AlertDialog |
| T07 | Confirming the AlertDialog calls the restore mutation |
| T08 | On successful restore, sheet closes and success toast appears |
| T09 | "Load more" button appears when `total > items.length` |
| T10 | Shows skeleton loaders while list is fetching |

---

## 8. Out of Scope for This Ticket

- Diff view between versions (show what changed) — not in FRS
- Version labelling / naming — not in FRS
- Version purge UI — automated server-side, not a user action
- Restore from the Notes list page — editor is the sole entry point
- E2E version history journey → AB-1016

---

## 9. Open Questions (Resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | Does AB-1015 include the missing backend endpoints? | **Yes** — full-stack: backend + frontend in one PR |
| 2 | Shared types needed? | **Yes** — `NoteVersionDTO` + `PaginatedVersionsDTO` added to `packages/shared` |
| 3 | UI component? | **shadcn/ui Sheet** (slide-in from right) |
| 4 | Preview on version select? | **Split pane** — list left, read-only preview right |
| 5 | Post-restore behavior? | **Close drawer + query invalidation** — editor re-fetches restored content |
| 6 | Restore confirmation? | **AlertDialog** — "Restore to version N?" with cancel/confirm |
| 7 | Tags on restore? | **Preserved** — `note_versions` stores title+content only; tags stay on the note |
| 8 | Latest version restore? | **Disabled** — Restore button disabled for `items[0]` (already current) |
