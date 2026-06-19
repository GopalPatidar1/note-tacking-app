# Specification — AB-1006: Tags CRUD

**Ticket:** AB-1006
**Type:** Backend Feature
**Status:** COMPLETED
**Branch:** `feat/AB-1006-tags`

---

## 1. Requirements

| ID | Requirement |
|----|-------------|
| R-01 | The backend MUST expose `GET /api/tags` returning all tags for the authenticated user ordered by `createdAt DESC` |
| R-02 | The backend MUST expose `POST /api/tags` to create a tag with `name` and `color` |
| R-03 | The backend MUST expose `PATCH /api/tags/:id` to update a tag's `name` and/or `color` |
| R-04 | The backend MUST expose `DELETE /api/tags/:id` to permanently delete a tag |
| R-05 | Tag color MUST be validated as a valid hex color string (`#RGB` or `#RRGGBB`) |
| R-06 | Tag names MUST NOT be required to be unique per user (duplicates allowed) |
| R-07 | `GET /api/tags` MUST include a `noteCount` per tag counting only non-deleted notes |
| R-08 | Deleting a tag MUST silently detach it from all notes (M2M rows removed); notes MUST NOT be deleted |
| R-09 | All tag endpoints MUST be scoped to the authenticated user — users MUST NOT see or modify other users' tags |
| R-10 | Accessing a tag that belongs to another user MUST return `404 NOT_FOUND` (IDOR-safe; avoids leaking ID existence) |
| R-11 | Zod schemas (`CreateTagSchema`, `UpdateTagSchema`) and `TagResponseDTO` MUST live in `packages/shared/src/schemas/tags.ts` |
| R-12 | `GET /api/tags` MUST NOT paginate — returns a flat array |
| R-13 | The `Tag` model MUST have `createdAt` for ordering; the `@@unique([userId, name])` constraint from AB-1004 MUST be dropped |

---

## 2. Acceptance Criteria

- [ ] `POST /api/tags` → 201 + `TagResponseDTO` with `noteCount: 0`
- [ ] `POST /api/tags` with missing `name` → 400 `VALIDATION_ERROR`
- [ ] `POST /api/tags` with invalid hex color (e.g. `"red"`) → 400 `VALIDATION_ERROR`
- [ ] `POST /api/tags` with short hex `"#FFF"` → 201 (accepted)
- [ ] `POST /api/tags` without auth → 401 `UNAUTHORIZED`
- [ ] `GET /api/tags` → 200 with `TagResponseDTO[]` for authenticated user only
- [ ] `GET /api/tags` → `noteCount` counts only non-deleted notes
- [ ] `GET /api/tags` → ordered newest first (`createdAt DESC`)
- [ ] `PATCH /api/tags/:id` → 200 + updated `TagResponseDTO`
- [ ] `PATCH /api/tags/:id` with invalid hex → 400 `VALIDATION_ERROR`
- [ ] `PATCH /api/tags/:id` with empty body → 400 `VALIDATION_ERROR`
- [ ] `PATCH /api/tags/:id` for another user's tag → 404 `NOT_FOUND`
- [ ] `DELETE /api/tags/:id` → 200; tag removed; attached notes still exist
- [ ] `DELETE /api/tags/:id` for non-existent tag → 404 `NOT_FOUND`
- [ ] `pnpm tsc --noEmit` passes; `pnpm --filter backend test` passes

---

## 3. Affected Capabilities

| Capability | Impact |
|-----------|--------|
| Tag listing | New — GET /api/tags with noteCount |
| Tag creation | New — POST /api/tags |
| Tag update | New — PATCH /api/tags/:id |
| Tag deletion | New — DELETE /api/tags/:id (with M2M detach) |
| Prisma schema | Modified — Tag model gets `createdAt`; `@@unique([userId, name])` dropped |
| Shared package | Extended — `tags.ts` schema + `TagResponseDTO` |
| OpenAPI | Updated — Tag schema gets `createdAt`; color fields get hex pattern |

---

## 4. Functional Behavior

### TagResponseDTO shape
```
{ id, userId, name, color, createdAt (ISO 8601), noteCount }
```

Note: `TagDTO` in `notes.ts` (used in note responses) is a different, lighter shape — no `createdAt`, optional `noteCount`.

### List Tags
- Query: `findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { notes: { where: { deletedAt: null } } } } } })`
- Returns flat `TagResponseDTO[]` (no pagination)

### Create Tag
- Parse body with `CreateTagSchema` (name: min(1), color: hex regex)
- Create with `{ userId, name, color }`; include `_count`
- Return `201` + `TagResponseDTO`

### Update Tag
- Find by `id + userId` → 404 if missing (IDOR-safe)
- Parse body with `UpdateTagSchema` (at least one field required)
- Update; return `200` + `TagResponseDTO`

### Delete Tag
- Find by `id + userId` → 404 if missing
- `prisma.tag.delete` — Prisma cascade removes M2M rows in `_NoteTags`
- Return `200` + `{ message: 'Tag deleted' }`

### Color validation regex
```
/^#([0-9A-Fa-f]{3}){1,2}$/
```

---

## 5. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| AB-1001 | Prerequisite | Monorepo, Prisma singleton, domain errors |
| AB-1002 | Prerequisite | `authenticate` middleware |
| AB-1004 | Prerequisite | `Tag` model defined; `@@unique` constraint exists and must be dropped here |
| `packages/shared` | Internal | `tags.ts` schemas and `TagResponseDTO` |
| AB-1011 | Consumer | Notes list page uses tags for sidebar filter |
| AB-1014 | Consumer | Share modal accesses tag data |
