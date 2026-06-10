# Change Record — AB-1011: Frontend — Notes List Page

**Date:** 2026-06-10  
**Status:** PROPOSED

## OpenAPI Delta

None. All API contracts (`GET /notes`, `GET /tags`, `DELETE /notes/:id`) are already specified in `openapi.yaml`.

## Shared Package Delta

### `packages/shared/src/schemas/notes.ts`

```diff
 export interface TagDTO {
   id:        string
   userId:    string
   name:      string
   color:     string
+  noteCount?: number   // populated by GET /tags
 }
```

## Frontend Files Added / Modified

| Path | Change |
|------|--------|
| `apps/frontend/src/components/layout/app-layout.tsx` | NEW — top navbar + two-column shell |
| `apps/frontend/src/components/notes/note-card.tsx` | NEW — note card with preview, tags, delete |
| `apps/frontend/src/components/notes/notes-sidebar.tsx` | NEW — tag filter sidebar |
| `apps/frontend/src/components/notes/notes-toolbar.tsx` | NEW — sort select + New Note button |
| `apps/frontend/src/components/notes/notes-pagination.tsx` | NEW — numbered pagination |
| `apps/frontend/src/hooks/notes/use-notes.ts` | NEW — useQuery → GET /notes |
| `apps/frontend/src/hooks/notes/use-tags.ts` | NEW — useQuery → GET /tags |
| `apps/frontend/src/hooks/notes/use-delete-note.ts` | NEW — useMutation → DELETE /notes/:id |
| `apps/frontend/src/pages/notes/notes-list.page.tsx` | MODIFY — replace stub with full page |
| `apps/frontend/src/pages/notes/note-editor.page.tsx` | NEW — placeholder stub for AB-1012 |
| `apps/frontend/src/lib/utils.ts` | MODIFY — add `stripHtml()` helper |
| `apps/frontend/src/router.tsx` | MODIFY — add `/notes/new` and `/notes/:id` routes |
