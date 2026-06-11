# AB-1012 — Tasks: Note Editor with TipTap + Autosave

> **Status: COMPLETE** — branch `feat/AB-1012-note-editor-tiptap-autosave`, commit `339d03f`
> All tasks completed and reviewed before commit. 46/46 tests passing.

---

## Phase 1 — Foundation

> Checkpoint: `pnpm tsc --noEmit` (frontend) → 0 errors · `pnpm --filter frontend lint` → 0 errors

- [x] **T1.1** Install TipTap packages in frontend
  ```bash
  pnpm --filter frontend add @tiptap/react @tiptap/pm @tiptap/starter-kit
  ```
  _No shared package changes needed — `CreateNoteDTO`, `UpdateNoteDTO`, `NoteDTO`, `TagDTO` already exported._

- [x] **T1.2** Verify no new shared-package types are needed
  - `CreateNoteSchema`, `UpdateNoteSchema`, `NoteDTO`, `TagDTO` — all present in `packages/shared/src/schemas/notes.ts`
  - No DB migration needed (frontend-only ticket)

---

## Phase 2 — Core Implementation

> Checkpoint after each task: `pnpm tsc --noEmit` (frontend) → 0 errors

### Hooks `[PARALLEL]`

- [x] **T2.1** `apps/frontend/src/hooks/notes/use-note.ts`
  - `useQuery` — `GET /notes/:id`, `queryKey: ['notes', id]`, `enabled: !!id`

- [x] **T2.2** `apps/frontend/src/hooks/notes/use-create-note.ts`
  - `useMutation` — `POST /notes`
  - `onSuccess`: `invalidateQueries({ queryKey: ['notes'] })`
  - `onError`: `toast.error('Failed to create note')`

- [x] **T2.3** `apps/frontend/src/hooks/notes/use-update-note.ts`
  - `useMutation` — `PATCH /notes/:id`
  - `onSuccess`: `setQueryData(['notes', id], updated)` + `invalidateQueries({ queryKey: ['notes'] })`

### Components `[PARALLEL]`

- [x] **T2.4** `apps/frontend/src/components/notes/tiptap-editor.tsx`
  - Props: `{ content: string, onChange: (html: string) => void, editable?: boolean }`
  - Toolbar: Bold · Italic · Strike · Code · H1 · H2 · H3 · BulletList · OrderedList
  - Active state: `editor.isActive(...)` → `bg-accent` on toolbar button
  - Content stored as HTML string via `editor.getHTML()`
  - Title input is NOT TipTap (CLAUDE.md anti-pattern)

- [x] **T2.5** `apps/frontend/src/components/notes/tag-selector.tsx`
  - Props: `{ tags: TagDTO[], selectedTagIds: string[], onChange: (ids: string[]) => void }`
  - Togglable pill chips; selected = filled with `tag.color`; unselected = border only
  - Renders nothing when `tags` is empty

---

## Phase 3 — Page Integration

> Checkpoint: `pnpm tsc --noEmit` → 0 errors · `pnpm --filter frontend lint` → 0 errors · `pnpm --filter frontend build` → clean

- [x] **T3.1** Replace `apps/frontend/src/pages/notes/note-editor.page.tsx` placeholder

  **Create mode (`/notes/new`)**
  - [ ] Renders empty title `<Input>` + empty `<TipTapEditor>` + `<TagSelector>`
  - [ ] `<Create Note>` button disabled when `title.trim()` is empty
  - [ ] On click → `useCreateNote().mutate({ title, content, tagIds })`
  - [ ] On success → `navigate('/notes/' + newNote.id, { replace: true })`
  - [ ] On error → `toast.error`

  **Edit mode (`/notes/:id`)**
  - [ ] Fetches note via `useNote(id)`; shows `<Loader2 aria-label="Loading note">` while pending
  - [ ] `useEffect` + `!initialised` guard populates `title`, `content`, `tagIds` once from fetched note
  - [ ] Autosave: `useEffect([title, content, tagIds])` with `!isEditMode || !initialised` guard
    - Resets 1500ms `setTimeout` on each change
    - `isSavingRef.current` guard prevents concurrent PATCH dispatches
    - On timer fire → `setSaveStatus('saving')` → `updateNote.mutate({ title, content, tagIds })`
  - [ ] `onSuccess`: `isSavingRef.current = false` → `setSaveStatus('saved')` → 3s fade → `'idle'`
  - [ ] `onError`: `isSavingRef.current = false` → `setSaveStatus('error')` → `toast.error`
  - [ ] `handleRetry` uses same `isSavingRef` guard

  **Save indicator (`<SaveIndicator>`)**
  - [ ] `idle` → render nothing
  - [ ] `unsaved` → amber dot + "Unsaved changes"
  - [ ] `saving` → `<Loader2 animate-spin>` + "Saving…"
  - [ ] `saved` → `<Check>` + "Saved" (green)
  - [ ] `error` → `<AlertCircle>` + "Save failed — retry?" with clickable retry

  **Layout**
  - [ ] `← Notes` back button → `navigate('/notes')`
  - [ ] Save indicator / Create button in top-right header
  - [ ] Full-width title input (no TipTap)
  - [ ] Tags section (hidden when no tags available)
  - [ ] TipTap editor below tags

---

## Phase 4 — Tests

> Checkpoint: `pnpm --filter frontend test` → all green · coverage target ≥ 80%

### `use-note.test.ts` `[PARALLEL with T4.2, T4.3]`

- [x] **T4.1a** Fetches note when `id` is provided → returns `NoteDTO`
- [x] **T4.1b** Does NOT fetch when `id` is `undefined` (`fetchStatus === 'idle'`, `http.get` not called)

### `use-create-note.test.ts` `[PARALLEL with T4.1, T4.3]`

- [x] **T4.2a** Calls `POST /notes` with correct body
- [x] **T4.2b** Returns the created note on success
- [x] **T4.2c** Invalidates `['notes']` query on success _(added post-review)_
- [x] **T4.2d** Shows `toast.error` on failure

### `use-update-note.test.ts` `[PARALLEL with T4.1, T4.2]`

- [x] **T4.3a** Calls `PATCH /notes/:id` with correct body
- [x] **T4.3b** Updates `queryClient.getQueryData(['notes', 'note-1'])` on success
- [x] **T4.3c** Invalidates `['notes']` list query on success _(added post-review)_
- [x] **T4.3d** Returns the updated note on success

### `note-editor.test.tsx`

**Create mode**
- [x] **T4.4a** Renders title input and Create Note button
- [x] **T4.4b** Create Note button disabled when title is empty
- [x] **T4.4c** Create Note button enabled after typing a title
- [x] **T4.4d** Calls `POST /notes` with `{ title: 'My new note' }` on submit
- [x] **T4.4e** Navigates to `/notes/:id` after successful creation _(added post-review)_

**Edit mode**
- [x] **T4.4f** Shows `aria-label="Loading note"` spinner while fetch is pending
- [x] **T4.4g** Populates title input from fetched note
- [x] **T4.4h** Renders TipTap editor area (`data-testid="tiptap-editor"`)
- [x] **T4.4i** Renders all available tags in the tag selector
- [x] **T4.4j** Shows "Unsaved changes" after editing the title
- [x] **T4.4k** Calls `PATCH /notes/:id` after 1500ms debounce fires
- [x] **T4.4l** Shows "Saved" after a successful autosave
- [x] **T4.4m** Shows "Save failed" on autosave error

---

## Quality Gates (final run before commit)

| Gate | Command | Result |
|------|---------|--------|
| Type-check (frontend) | `pnpm tsc --noEmit` (in `apps/frontend`) | ✅ 0 errors |
| Lint (frontend) | `pnpm --filter frontend lint` | ✅ 0 errors, 2 pre-existing warnings in shadcn/ui |
| Tests | `pnpm --filter frontend test` | ✅ 46/46 |
| Build | `pnpm --filter frontend build` | ✅ clean (bundle size advisory is Vite advisory only) |

---

## Post-Review Fixes Applied

The `/review AB-1012` pass identified 2 findings fixed before commit:

| Finding | Fix |
|---------|-----|
| 🔒 Concurrent autosave mutations unguarded | Added `isSavingRef` to both autosave debounce and `handleRetry` |
| ❌ 3 missing test cases | Added T4.2c, T4.3c, T4.4e (invalidation + navigation tests) |

---

## Notes for Future Tickets

| Observation | Target ticket |
|-------------|---------------|
| Bundle size: TipTap adds ~250KB gzip — consider lazy-loading the editor | Chore |
| Tag selector requires backend tags (AB-1006) to be complete | AB-1006 dependency |
| Version history drawer can be added to editor header | AB-1015 |
| Share modal link can be added to editor header | AB-1014 |
