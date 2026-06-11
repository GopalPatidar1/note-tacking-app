# AB-1012 — Frontend: Note Editor with TipTap + Autosave

## Ticket Summary

Build the note editor page in the React frontend. Covers:
- Rich text editing via TipTap (StarterKit)
- Autosave (debounced PATCH for existing notes)
- Create flow (manual save → redirect → autosave kicks in)
- Tag multi-selection
- Save status indicator

---

## Codebase State (at planning time)

| File | Status |
|------|--------|
| `apps/frontend/src/pages/notes/note-editor.page.tsx` | Placeholder — `"coming in AB-1012"` |
| `apps/frontend/src/hooks/notes/use-create-note.ts` | **Missing** |
| `apps/frontend/src/hooks/notes/use-update-note.ts` | **Missing** |
| `apps/frontend/src/hooks/notes/use-note.ts` | **Missing** |
| `apps/frontend/src/components/notes/tiptap-editor.tsx` | **Missing** |
| `apps/frontend/src/components/notes/tag-selector.tsx` | **Missing** |
| TipTap npm packages | **Not installed** |
| Shared schemas (CreateNoteSchema, UpdateNoteSchema, NoteDTO) | Already exported |
| `useTags` hook | Already implemented |
| Router routes `/notes/new`, `/notes/:id` | Already wired to `NoteEditorPage` |

---

## Architecture Decisions

### 1. Create vs. Edit Flow
**Decision:** Two distinct modes driven by the URL param.

- `/notes/new` — **Create mode**: user types title + content → clicks **Create** button → `POST /notes` → on success, redirect to `/notes/:id` (edit mode).
- `/notes/:id` — **Edit mode**: page loads note via `GET /notes/:id`, then autosave fires on any change with a 1500ms debounce.

**Rationale:** Autosave requires an `id` to PATCH. Separate flows avoids race conditions between creation and the first autosave. The one-time Create click gives users a clear save checkpoint.

### 2. Autosave Mechanism
**Decision:** `useEffect` with `setTimeout`/`clearTimeout` (manual debounce), not a library.

```
onChange → reset 1500ms timer → on expire → mutate PATCH /notes/:id
```

- Triggered by changes to `title`, `content`, or `tagIds`.
- Only active in edit mode (when `noteId` exists).
- Save status derived from: timer pending → "Unsaved" | mutation loading → "Saving…" | success → "Saved" | error → "Save failed".

**Rationale:** Simple and dependency-free. No third-party debounce library needed.

### 3. TipTap Usage
**Decision:** TipTap with `@tiptap/starter-kit` only. No collaboration extensions.

- Title input: plain `<Input>` (shadcn/ui) — TipTap is for content only (per frontend CLAUDE.md anti-patterns).
- StarterKit provides: Bold, Italic, Strike, Code, Heading (H1–H3), BulletList, OrderedList, Blockquote, HardBreak, HorizontalRule.
- Custom minimal toolbar above the editor (icon buttons using shadcn `Button variant="ghost"`).

### 4. Tag Selector
**Decision:** Inline tag chips (toggle-style) fetched from `useTags`.

- Displays all user tags as togglable badge chips below the title.
- Selected tags highlighted (filled color). Unselected: outlined.
- No external popover/command component needed — keeps the dependency footprint minimal.

### 5. State Management
- **Server data** (note content, tag list): TanStack Query only — no Zustand.
- **Local editor state** (unsaved title, content, tagIds, save status): `useState` in `NoteEditorPage`.
- Editor is controlled: TipTap `onUpdate` → `setContent(editor.getHTML())`.

---

## Files to Create / Modify

### Install (package.json change)
```
apps/frontend/package.json  — add TipTap dependencies
```

### New files
```
apps/frontend/src/hooks/notes/use-create-note.ts
apps/frontend/src/hooks/notes/use-update-note.ts
apps/frontend/src/hooks/notes/use-note.ts
apps/frontend/src/components/notes/tiptap-editor.tsx
apps/frontend/src/components/notes/tag-selector.tsx
```

### Modified files
```
apps/frontend/src/pages/notes/note-editor.page.tsx   — replace placeholder
```

### Test files
```
apps/frontend/src/__tests__/notes/use-create-note.test.ts
apps/frontend/src/__tests__/notes/use-update-note.test.ts
apps/frontend/src/__tests__/notes/use-note.test.ts
apps/frontend/src/__tests__/notes/note-editor.test.tsx
```

---

## TypeScript Interfaces (final shapes)

All note/tag DTOs imported from `@note-app/shared` — no local re-definition.

```ts
// Already in packages/shared — import, don't redefine
import type {
  NoteDTO,
  TagDTO,
  CreateNoteDTO,
  UpdateNoteDTO,
} from '@note-app/shared'
```

### Local component props (in component files, not shared)

```ts
// tiptap-editor.tsx
interface TipTapEditorProps {
  content: string
  onChange: (html: string) => void
  editable?: boolean
}

// tag-selector.tsx
interface TagSelectorProps {
  tags: TagDTO[]
  selectedTagIds: string[]
  onChange: (ids: string[]) => void
}
```

### Save status type (local to editor page)
```ts
type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'
```

---

## Hook Signatures

### `use-note.ts`
```ts
export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: ['notes', id],
    queryFn: () => http.get<{ data: NoteDTO }>(`/notes/${id}`).then(r => r.data.data),
    enabled: !!id,
  })
}
```

### `use-create-note.ts`
```ts
export function useCreateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateNoteDTO) =>
      http.post<{ data: NoteDTO }>('/notes', body).then(r => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}
```

### `use-update-note.ts`
```ts
export function useUpdateNote(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateNoteDTO) =>
      http.patch<{ data: NoteDTO }>(`/notes/${id}`, body).then(r => r.data.data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['notes', id], updated)
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}
```

---

## NoteEditorPage — Behaviour Spec

### Create mode (`/notes/new`)
1. Render empty title input + empty TipTap editor + tag selector.
2. User fills title (required) and optional content/tags.
3. **Create** button calls `useCreateNote().mutate(...)`.
4. On success → `navigate('/notes/' + newNote.id, { replace: true })`.
5. On error → toast.error.

### Edit mode (`/notes/:id`)
1. Fetch note via `useNote(id)` — show skeleton while loading.
2. Populate local state: `title`, `content`, `tagIds`.
3. On any change → set `saveStatus = 'unsaved'` → reset 1500ms timer.
4. Timer fires → `saveStatus = 'saving'` → call `useUpdateNote(id).mutate(...)`.
5. On success → `saveStatus = 'saved'`.
6. On error → `saveStatus = 'error'` + toast.error.
7. **Back** button navigates to `/notes`.

### Save status display
```
idle     → nothing shown
unsaved  → "Unsaved changes" (amber dot)
saving   → "Saving…" (spinner icon, gray)
saved    → "Saved" (green checkmark, fades after 3s → idle)
error    → "Save failed — retry?" (red, with retry button)
```

---

## TipTap Editor Component Spec

```
┌──────────────────────────────────────────┐
│ [B] [I] [S] [<>] │ [H1][H2][H3] │ [• ][1.]│
├──────────────────────────────────────────┤
│                                          │
│  (prose editing area — min-h 400px)      │
│                                          │
└──────────────────────────────────────────┘
```

- Toolbar icons: Bold, Italic, Strike, Code | H1, H2, H3 | BulletList, OrderedList
- Active state: toolbar button shows filled/highlighted when mark/node is active
- `editor.isActive('bold')` → apply `bg-accent` class to button
- Content stored as HTML string (TipTap default)
- CSS: `prose` class from Tailwind Typography plugin (or manual prose styles if not installed)

---

## Tag Selector Component Spec

```
Tags:  [● Work]  [○ Personal]  [● Ideas]  [○ Reading]
```
- Each tag shown as a pill/badge
- Color: tag's own `color` field used as background tint
- Clicking toggles selection
- Selected: filled background; unselected: border only (ghost)

---

## Page Layout

```
┌─────────────────────────────────────────────┐
│ ← Notes                        [Saving…]    │
├─────────────────────────────────────────────┤
│ [Title input — full width]                  │
├─────────────────────────────────────────────┤
│ Tags:  [Work ×]  [Ideas ×]  [+ Add Tag]     │
├─────────────────────────────────────────────┤
│ [B][I][S][<>] │ [H1][H2][H3] │ [•][1.]     │ ← Toolbar
├─────────────────────────────────────────────┤
│                                             │
│  [TipTap editor content area]               │
│                                             │
│                                (min-h 60vh) │
└─────────────────────────────────────────────┘
```
For **create mode** only: **[Create Note]** button replaces the autosave indicator.

---

## DB / Backend Changes

**None.** AB-1012 is frontend-only. All API contracts already exist:
- `POST /notes` (CreateNoteDTO)
- `GET /notes/:id` (NoteDTO response)
- `PATCH /notes/:id` (UpdateNoteDTO)
- `GET /tags` (TagDTO[])

---

## npm Packages to Install (frontend only)

```bash
pnpm --filter frontend add @tiptap/react @tiptap/pm @tiptap/starter-kit
```

No shared or backend package changes.

---

## Shared Package Changes

**None.** `CreateNoteSchema`, `UpdateNoteSchema`, `NoteDTO`, `TagDTO` are already exported. All required types are available.

---

## Implementation Order

1. Install TipTap packages
2. Create `use-note.ts` hook
3. Create `use-create-note.ts` hook
4. Create `use-update-note.ts` hook
5. Create `tiptap-editor.tsx` component
6. Create `tag-selector.tsx` component
7. Replace `note-editor.page.tsx` with full implementation
8. Write tests for hooks and page
9. Run quality gates

---

## Quality Gates

```bash
pnpm --filter frontend add @tiptap/react @tiptap/pm @tiptap/starter-kit
pnpm tsc --noEmit                    # 1. type-check — fix all errors first
pnpm --filter frontend lint          # 2. lint
pnpm --filter frontend test          # 3. unit tests
pnpm --filter frontend build         # 4. build check
```

---

## Test Plan

### `use-note.test.ts`
- Returns data when id provided
- Does not fetch when id is undefined (`enabled: false`)

### `use-create-note.test.ts`
- Calls POST /notes with correct body
- Invalidates `['notes']` query on success

### `use-update-note.test.ts`
- Calls PATCH /notes/:id with correct body
- Updates query cache on success
- Invalidates `['notes']` query on success

### `note-editor.test.tsx`
- Renders loading skeleton while note fetch is in progress
- Renders title + content once loaded
- Shows "Unsaved changes" after typing
- Calls update mutation after debounce delay
- Shows "Saved" on successful mutation
- Shows "Save failed" on error mutation
- Create mode: submit button present; navigates to `/notes/:id` on success

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| TipTap HTML vs Markdown format mismatch with existing content | Store as HTML (TipTap default). Backend stores raw string — format is frontend concern. |
| Autosave firing on every keystroke causing 429s | 1500ms debounce window is sufficient for typical typing speed. |
| Tag selector state desyncing from server | On create/update success, invalidate `['notes', id]` — query refetch re-aligns state. |
| TipTap SSR issues | N/A — Vite SPA, client-only. |
