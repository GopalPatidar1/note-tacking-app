# Specification — AB-1015: Version History Drawer + Restore

**Ticket:** AB-1015
**Type:** Full-Stack Feature
**Status:** COMPLETED
**Branch:** `feat/AB-1015-version-history-ui`

---

## 1. Requirements

| ID | Requirement |
|----|-------------|
| R-01 | `GET /api/notes/:id/versions` MUST return a paginated list of version snapshots for the note |
| R-02 | `GET /api/notes/:id/versions/:versionId` MUST return a single version snapshot |
| R-03 | `POST /api/notes/:id/versions/:versionId/restore` MUST restore the note to a previous version |
| R-04 | Restoring MUST write a new version snapshot (same `$transaction` pattern as create/update) and preserve existing tags |
| R-05 | All version endpoints MUST be user-scoped — the note must belong to the requesting user |
| R-06 | A "History" button MUST appear in the Note Editor toolbar in edit mode |
| R-07 | Clicking "History" MUST open a `<VersionHistorySheet>` (shadcn/ui `Sheet`) |
| R-08 | The sheet MUST show a paginated list of versions (left column) and a preview of the selected version (right column) |
| R-09 | The first/latest version MUST be auto-selected on sheet open |
| R-10 | The Restore button MUST be disabled for the latest version (current content) |
| R-11 | Clicking Restore MUST open an `<AlertDialog>` for confirmation |
| R-12 | On confirm, the note editor MUST immediately reflect restored content (no loading flash) |
| R-13 | `NoteVersionDTO` and `PaginatedVersionsDTO` MUST be defined in `packages/shared/src/schemas/versions.ts` |
| R-14 | `noteVersionRepository` MUST be extended with `listByNoteId` and `findById` methods |

---

## 2. Acceptance Criteria

- [ ] `GET /api/notes/:id/versions` → 200 + `PaginatedVersionsDTO` ordered by `versionNumber DESC`
- [ ] `GET /api/notes/:id/versions` without auth → 401 `UNAUTHORIZED`
- [ ] `GET /api/notes/:id/versions` for non-existent/other-user note → 404 `NOT_FOUND`
- [ ] `GET /api/notes/:id/versions/:versionId` → 200 + `NoteVersionDTO`
- [ ] `GET /api/notes/:id/versions/:versionId` for wrong note → 404 `NOT_FOUND`
- [ ] `POST /api/notes/:id/versions/:versionId/restore` → 200 + updated `NoteDTO`
- [ ] Restore creates a new `note_versions` snapshot and preserves existing tags
- [ ] History button visible in editor toolbar (edit mode only)
- [ ] Clicking History opens the version sheet
- [ ] Version list shows all snapshots; oldest paginated with "Load more"
- [ ] First version is auto-selected; preview pane shows title and content
- [ ] Restore button disabled for `items[0]` (latest version)
- [ ] Restore confirmation dialog appears; cancelling closes it without calling mutation
- [ ] Confirming restore updates the editor content immediately; success toast shown
- [ ] `pnpm tsc --noEmit` passes; `pnpm --filter backend test` passes; `pnpm --filter frontend test` passes

---

## 3. Affected Capabilities

| Capability | Impact |
|-----------|--------|
| Version list endpoint | New — GET /api/notes/:id/versions |
| Version detail endpoint | New — GET /api/notes/:id/versions/:versionId |
| Version restore endpoint | New — POST /api/notes/:id/versions/:versionId/restore |
| Backend repository | Modified — `listByNoteId` + `findById` added to `noteVersionRepository` |
| Backend service | Modified — `listVersions`, `getVersion`, `restoreVersion` added to `noteService` |
| Backend controller | Modified — 3 handlers added to `noteController` |
| Backend routes | Modified — 3 routes added to `note.routes.ts` |
| Shared package | Extended — `versions.ts` with `NoteVersionDTO`, `PaginatedVersionsDTO` |
| Version History Sheet | New — `version-history-sheet.tsx` with split-pane layout |
| Note Editor | Modified — `historyOpen` state + History button + `<VersionHistorySheet>` |
| Frontend hooks | New — `use-note-versions.ts`, `use-note-version.ts`, `use-restore-version.ts` |
| shadcn/ui | Extended — `Sheet` and `AlertDialog` components added |

---

## 4. Functional Behavior

### restoreVersion (service)
```
1. Find note by (id + userId) → NotFoundError if absent
2. Find version by (versionId + noteId) → NotFoundError if absent
3. prisma.$transaction:
   a. noteRepository.update(noteId, { title: version.title, content: version.content }, tx)
      — tagIds omitted → existing tags preserved
   b. noteVersionRepository.getNextVersionNumber(noteId, tx)
   c. noteVersionRepository.create({ noteId, title, content, versionNumber }, tx)
4. return toNoteDTO(restored)
```

### Query Key Alignment
| Resource | Query key |
|----------|-----------|
| Single note | `['notes', noteId]` |
| Note list | `['notes']` |
| Version list | `['note-versions', noteId, page]` |
| Single version | `['note-version', noteId, versionId]` |

### useRestoreVersion onSuccess
```typescript
queryClient.setQueryData(['notes', noteId], data)  // immediate editor update
queryClient.invalidateQueries({ queryKey: ['notes'] })
queryClient.invalidateQueries({ queryKey: ['note-versions', noteId] })
```

### VersionHistorySheet Layout
- shadcn/ui Sheet (side="right", w-[700px])
- Left: scrollable version list (w-48); right: scrollable preview (flex-1)
- Load more: "Load more" button when `total > accumulatedItems.length`
- AlertDialog body: "This will replace the current note content with the version from [date]. Your current content will be saved as a new version first."

---

## 5. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| AB-1004 | Prerequisite | `noteVersionRepository` (create/getNextVersionNumber), `noteRepository.findById` |
| AB-1001 | Prerequisite | Prisma `$transaction`, domain errors |
| AB-1012 | Prerequisite | Note editor page where History button is added |
| AB-1010 | Prerequisite | Frontend auth scaffold, TanStack Query |
| `packages/shared` | Internal | `NoteVersionDTO`, `PaginatedVersionsDTO`, `NoteDTO` |
| shadcn/ui Sheet, AlertDialog | External | Version sheet and restore confirmation dialog |
| Lucide React `History` icon | External | Editor toolbar History button icon |
