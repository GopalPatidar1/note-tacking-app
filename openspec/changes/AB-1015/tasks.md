# Task Checklist — AB-1015: Version History Drawer + Restore

**Branch:** feat/AB-1015-version-history-ui
**Total tasks:** 20 implementation + 7 test tasks
**No DB migration required** — `note_versions` table exists from AB-1009

---

## Phase 1 — Foundation (shared types)

> Unblocks both backend and frontend. Must complete before any other phase.

- [ ] **T01** — Create `packages/shared/src/schemas/versions.ts`
  - Export `NoteVersionDTO` interface (`id`, `noteId`, `title`, `content`, `versionNumber`, `createdAt`)
  - Export `PaginatedVersionsDTO` interface (`items: NoteVersionDTO[]`, `total`, `page`, `limit`)
  - No Zod schemas needed (no request bodies)

- [ ] **T02** — Modify `packages/shared/src/index.ts`
  - Append `export * from './schemas/versions'`

### Phase 1 Checkpoint
```bash
pnpm tsc --noEmit    # 0 errors
```

---

## Phase 2 — Core Implementation

> Backend steps are sequential (each builds on the previous).
> Frontend steps T07–T11 can start in parallel with backend once Phase 1 is done.
> T12 (component) requires T07–T11 to be complete.

### Backend

- [ ] **T03** — Modify `apps/backend/src/repositories/note-version.repository.ts`
  - Add `import type { Prisma, NoteVersion } from '@prisma/client'` (add `NoteVersion` to existing import)
  - Add `listByNoteId(noteId, { page, limit })` — `prisma.$transaction([findMany + count])`, `orderBy: { versionNumber: 'desc' }`, skip/take pagination
  - Add `findById(id, noteId)` — `prisma.noteVersion.findFirst({ where: { id, noteId } })` (scopes by noteId to prevent cross-note access)

- [ ] **T04** — Modify `apps/backend/src/services/note.service.ts`
  - Add `NoteVersion` to `@prisma/client` import
  - Add `NoteVersionDTO`, `PaginatedVersionsDTO` to `@note-app/shared` import
  - Add `toVersionDTO(v: NoteVersion): NoteVersionDTO` helper (alongside existing `toNoteDTO`)
  - Add `listVersions(userId, noteId, page, limit)` — ownership guard → `listByNoteId` → return `PaginatedVersionsDTO`
  - Add `getVersion(userId, noteId, versionId)` — ownership guard → `findById` → return `NoteVersionDTO`
  - Add `restoreVersion(userId, noteId, versionId)` — ownership guard → `findById` version → `$transaction(noteRepository.update + getNextVersionNumber + create)` → return `NoteDTO`
  - **Note:** `noteRepository.update({ title, content })` with no `tagIds` preserves existing tags (confirmed: repo uses `tagIds !== undefined` guard)

- [ ] **T05** — Modify `apps/backend/src/controllers/note.controller.ts`
  - Add `listVersions(req, res)` — parse `page`/`limit` from `req.query` with `parseInt` + bounds clamp → call service → `res.status(200).json({ data: result })`
  - Add `getVersion(req, res)` — `req.params.id` + `req.params.versionId` → call service → `res.status(200).json({ data: version })`
  - Add `restoreVersion(req, res)` — `req.params.id` + `req.params.versionId` → call service → `res.status(200).json({ data: note })`

- [ ] **T06** — Modify `apps/backend/src/routes/note.routes.ts`
  - Append before `export default router`:
    ```typescript
    router.get('/:id/versions',                      noteController.listVersions)
    router.get('/:id/versions/:versionId',           noteController.getVersion)
    router.post('/:id/versions/:versionId/restore',  noteController.restoreVersion)
    ```
  - Auth is inherited from `router.use(authenticate)` at the top — no additional middleware needed

### Frontend [PARALLEL with Backend T03–T06 after Phase 1 complete]

- [ ] **T07** — Scaffold `apps/frontend/src/components/ui/sheet.tsx`
  - Run: `cd apps/frontend && npx shadcn@latest add sheet`
  - Verify file exists at `src/components/ui/sheet.tsx`

- [ ] **T08** — Scaffold `apps/frontend/src/components/ui/alert-dialog.tsx`
  - Run: `cd apps/frontend && npx shadcn@latest add alert-dialog`
  - Verify file exists at `src/components/ui/alert-dialog.tsx`

- [ ] **T09** — Create `apps/frontend/src/hooks/versions/use-note-versions.ts`
  - `useQuery({ queryKey: ['note-versions', noteId, page], ... })`
  - `GET /notes/${noteId}/versions?page=&limit=20`
  - `enabled: !!noteId`

- [ ] **T10** — Create `apps/frontend/src/hooks/versions/use-note-version.ts`
  - `useQuery({ queryKey: ['note-version', noteId, versionId], ... })`
  - `GET /notes/${noteId}/versions/${versionId}`
  - `enabled: !!noteId && !!versionId` — dormant until a version is selected

- [ ] **T11** — Create `apps/frontend/src/hooks/versions/use-restore-version.ts`
  - `useMutation({ mutationFn: (versionId) => POST /notes/${noteId}/versions/${versionId}/restore })`
  - `onSuccess`: `setQueryData(['notes', noteId], data)` + `invalidateQueries(['notes'])` + `invalidateQueries(['note-versions', noteId])`
  - **Key:** query key is `['notes', noteId]` (plural) — matches `useNote` and `useUpdateNote`

- [ ] **T12** — Create `apps/frontend/src/components/versions/version-history-sheet.tsx`
  - Props: `{ noteId: string, open: boolean, onOpenChange: (open: boolean) => void }`
  - State: `selectedVersionId: string | null`, `confirmOpen: boolean`, `page: number`, `accumulatedItems: NoteVersionDTO[]`
  - `useEffect` — auto-select `items[0].id` when version list first loads
  - `useEffect` — append new page items to `accumulatedItems` when `page` changes
  - Layout: `SheetContent side="right" className="w-[700px] sm:max-w-[700px]"` → flex row → left panel (list, `w-48 shrink-0 border-r overflow-y-auto`) + right panel (`flex-1 overflow-y-auto`)
  - Version row: `versionNumber`, formatted date, `bg-accent` when selected, `(current)` badge for `items[0]`
  - Restore button: disabled for `selectedVersionId === accumulatedItems[0]?.id`; clicking sets `confirmOpen = true`
  - Preview: `dangerouslySetInnerHTML={{ __html: versionData?.content ?? '' }}` for TipTap HTML
  - "Load more": show when `total > accumulatedItems.length`; increments `page`
  - AlertDialog: title "Restore to version N?", body describes overwrite + auto-save, Cancel + Restore actions
  - On confirm: `restoreVersion.mutate(selectedVersionId)` → `onSuccess`: `toast.success("Note restored to version N")` + `onOpenChange(false)`

### Phase 2 Checkpoint
```bash
pnpm tsc --noEmit              # 0 errors
pnpm --filter backend lint     # 0 warnings
pnpm --filter frontend lint    # 0 warnings
```

---

## Phase 3 — Integration

- [ ] **T13** — Modify `apps/frontend/src/pages/notes/note-editor.page.tsx`
  - Add imports: `VersionHistorySheet` from `@/components/versions/version-history-sheet`; `History` from `lucide-react`
  - Add state: `const [historyOpen, setHistoryOpen] = useState(false)`
  - In edit-mode header block (the `<>` fragment), add between `<SaveIndicator>` and Share button:
    ```tsx
    <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="gap-1">
      <History className="h-4 w-4" />
      History
    </Button>
    <VersionHistorySheet noteId={id!} open={historyOpen} onOpenChange={setHistoryOpen} />
    ```

### Phase 3 Checkpoint
```bash
pnpm tsc --noEmit              # 0 errors
pnpm --filter backend lint     # 0 warnings
pnpm --filter frontend lint    # 0 warnings
```

---

## Phase 4 — Tests

> Backend test files are independent and can be written in parallel.
> Frontend test files are independent and can be written in parallel.

### Backend Tests [PARALLEL]

- [ ] **T14** — Create `apps/backend/src/__tests__/note-version.repository.test.ts`
  - Mock `prisma` directly (same pattern as other repository tests)
  - T01: `listByNoteId` returns items ordered `versionNumber DESC`
  - T02: `listByNoteId` applies correct `skip`/`take` for pagination
  - T03: `findById` returns version when both `id` and `noteId` match
  - T04: `findById` returns `null` when `noteId` does not match (IDOR guard)

- [ ] **T15** — Create `apps/backend/src/__tests__/note-version.service.test.ts`
  - Use `vi.mock` pattern from `note.service.test.ts` — mock `noteRepository`, `noteVersionRepository`, `prisma.$transaction`
  - Add `listByNoteId` and `findById` to the `noteVersionRepository` mock
  - T05: `listVersions` throws `NotFoundError` when note not found (ownership check)
  - T06: `listVersions` returns `PaginatedVersionsDTO` on success
  - T07: `getVersion` throws `NotFoundError` when note not found
  - T08: `getVersion` throws `NotFoundError` when version not found
  - T09: `getVersion` returns `NoteVersionDTO` on success
  - T10: `restoreVersion` throws `NotFoundError` when note not found
  - T11: `restoreVersion` throws `NotFoundError` when version not found
  - T12: `restoreVersion` calls `noteRepository.update` + `getNextVersionNumber` + `noteVersionRepository.create` inside `$transaction`
  - T13: `restoreVersion` returns `NoteDTO` of the restored note

- [ ] **T16** — Create `apps/backend/src/__tests__/note-version.integration.test.ts`
  - Follow `note.integration.test.ts` — same `skipIfNoDb`, `registerAndLogin()`, `cleanDb()` helpers
  - Create a note + trigger a second save (update) to generate 2 versions before testing
  - T14: `GET /api/notes/:id/versions` → 200, paginated list
  - T15: `GET /api/notes/:id/versions` → 401 without auth
  - T16: `GET /api/notes/:id/versions` → 404 when note not found
  - T17: `GET /api/notes/:id/versions/:versionId` → 200 with snapshot
  - T18: `GET /api/notes/:id/versions/:versionId` → 404 when version not found
  - T19: `POST /api/notes/:id/versions/:versionId/restore` → 200, note title/content updated, new snapshot created (verify `noteVersion.count`)
  - T20: `POST /api/notes/:id/versions/:versionId/restore` → 401 without auth
  - T21: `POST /api/notes/:id/versions/:versionId/restore` → 403 when note belongs to a different user

### Frontend Tests [PARALLEL]

- [ ] **T17** — Create `apps/frontend/src/__tests__/versions/use-note-versions.test.ts`
  - Pattern: `renderHook` + `QueryClientProvider` wrapper + `vi.mock('@/lib/http')` (follow `use-create-share-link.test.ts`)
  - T01: calls `GET /notes/:id/versions?page=1&limit=20`
  - T02: returns `PaginatedVersionsDTO` on success
  - T03: query is disabled when `noteId` is empty string

- [ ] **T18** — Create `apps/frontend/src/__tests__/versions/use-note-version.test.ts`
  - T01: calls `GET /notes/:id/versions/:versionId`
  - T02: query is disabled when `versionId` is `null`

- [ ] **T19** — Create `apps/frontend/src/__tests__/versions/use-restore-version.test.ts`
  - T01: mutation calls `POST /notes/:id/versions/:versionId/restore`
  - T02: `onSuccess` calls `setQueryData(['notes', noteId], data)`
  - T03: `onSuccess` invalidates `['notes']` and `['note-versions', noteId]`
  - T04: propagates error to `isError` state

- [ ] **T20** — Create `apps/frontend/src/__tests__/versions/version-history-sheet.test.tsx`
  - Pattern: mock hooks with mutable flag objects (follow `share-modal.test.tsx`)
  - Mock `useNoteVersions`, `useNoteVersion`, `useRestoreVersion`, `sonner`
  - T05: renders skeleton loaders while version list is fetching
  - T06: renders version list rows on success
  - T07: auto-selects the first version on load
  - T08: clicking a version row selects it (renders it as active)
  - T09: Restore button is disabled for the latest version (`items[0]`)
  - T10: Restore button is enabled for an older version
  - T11: clicking Restore opens the AlertDialog
  - T12: cancelling the AlertDialog closes it without calling the mutation
  - T13: confirming the AlertDialog calls `restoreVersion.mutate` with the correct `versionId`
  - T14: `onOpenChange(false)` is called after successful restore
  - T15: success toast `"Note restored to version N"` is shown
  - T16: "Load more" button appears when `total > items.length`

### Phase 4 Checkpoint (Final Quality Gates)
```bash
pnpm tsc --noEmit              # 1. type-check — 0 errors
pnpm --filter backend lint     # 2. backend lint — 0 warnings
pnpm --filter frontend lint    # 3. frontend lint — 0 warnings
pnpm --filter backend test     # 4. backend unit + integration — all green
pnpm --filter frontend test    # 5. frontend unit — all green
pnpm --filter backend build    # 6. backend build — 0 errors
```

---

## Summary

| Phase | Tasks | Parallel? | Gate |
|-------|-------|-----------|------|
| 1 — Foundation | T01–T02 | Sequential | `pnpm tsc --noEmit` |
| 2 — Core | T03–T06 (backend), T07–T12 (frontend) | Backend sequential; frontend parallel with backend | `pnpm tsc + lint` |
| 3 — Integration | T13 | Sequential | `pnpm tsc + lint` |
| 4 — Tests | T14–T20 | All parallel | Full quality gates |
