# Task Checklist — AB-1006: Tags

**Branch:** `feat/AB-1006-tags`
**Status:** AWAITING APPROVAL

---

## Phase 1 — Foundation (shared types + DB)

> Goal: types and DB are ready; everything downstream can import without errors.

- [ ] **T01** — Modify `apps/backend/prisma/schema.prisma`
  - Add `createdAt DateTime @default(now())` to `Tag` model
  - Remove `@@unique([userId, name])` from `Tag` model

- [ ] **T02** — Run Prisma migration
  ```bash
  pnpm --filter backend exec prisma migrate dev --name add-tag-createdat-drop-name-unique
  ```
  _Verify: migration file created in `prisma/migrations/`; `prisma generate` re-runs automatically._

- [ ] **T03** — Create `packages/shared/src/schemas/tags.ts`
  - `CreateTagSchema` — `{ name: string.min(1), color: string.regex(hex) }`
  - `UpdateTagSchema` — both fields optional, `.refine(≥1 field)`
  - `CreateTagDTO`, `UpdateTagDTO` inferred types
  - `TagResponseDTO` interface — `{ id, userId, name, color, createdAt, noteCount }`

- [ ] **T04** — Modify `packages/shared/src/index.ts`
  - Add `export * from './schemas/tags'`

### ✅ Checkpoint 1

```bash
pnpm tsc --noEmit                # 0 type errors
pnpm --filter backend build      # compiles clean
```

---

## Phase 2 — Backend Layers

> Goal: full stack wired; `GET /api/tags` returns 200 from curl/Postman.
> T05 and T06 are sequential (service imports repository types). T07 and T08 follow T06.

- [ ] **T05** — Create `apps/backend/src/repositories/tag.repository.ts`
  - `TAG_INCLUDE` constant with `_count: { select: { notes: { where: { deletedAt: null } } } }`
  - `findAll(userId)` — `findMany` ordered by `createdAt desc`, includes `TAG_INCLUDE`
  - `findById(id, userId)` — `findFirst` by id + userId (no count; for existence checks only)
  - `create(data)` — `create` with `TAG_INCLUDE`
  - `update(id, data)` — `update` with `TAG_INCLUDE`
  - `delete(id)` — `delete`; returns `void`

- [ ] **T06** — Create `apps/backend/src/services/tag.service.ts`
  - Import `CreateTagDTO`, `UpdateTagDTO`, `TagResponseDTO` from `@note-app/shared`
  - Private `TagWithCount` type and `toTagResponseDTO()` helper
  - `list(userId)` → `tagRepository.findAll` → map
  - `create(userId, dto)` → `tagRepository.create` → map
  - `update(userId, tagId, dto)` → `findById` → throw `NotFoundError` if null → `tagRepository.update` → map
  - `delete(userId, tagId)` → `findById` → throw `NotFoundError` if null → `tagRepository.delete`

- [ ] **T07** — Create `apps/backend/src/controllers/tag.controller.ts`
  - `list` — call `tagService.list`, respond `200 { data: tags }`
  - `create` — `CreateTagSchema.parse(req.body)`, call `tagService.create`, respond `201 { data: tag }`
  - `update` — `UpdateTagSchema.parse(req.body)`, call `tagService.update`, respond `200 { data: tag }`
  - `delete` — call `tagService.delete`, respond `200 { data: { message: 'Tag deleted' } }`

- [ ] **T08** — Create `apps/backend/src/routes/tag.routes.ts`
  - `router.use(authenticate)`
  - `GET /` → `tagController.list`
  - `POST /` → `tagController.create`
  - `PATCH /:id` → `tagController.update`
  - `DELETE /:id` → `tagController.delete`

- [ ] **T09** — Modify `apps/backend/src/app.ts`
  - Import `tagRouter` from `./routes/tag.routes`
  - Mount `app.use('/api/tags', tagRouter)` after the notes router line

### ✅ Checkpoint 2

```bash
pnpm tsc --noEmit                # 0 type errors
pnpm --filter backend lint       # 0 warnings
pnpm --filter backend build      # compiles clean
```

---

## Phase 3 — Integration (spec + routing wired)

- [ ] **T10** — Modify `openspec/openapi.yaml` (4 amendments)
  - `components.schemas.Tag`: add `createdAt` to `required` array; add `createdAt: { type: string, format: date-time }` property
  - `components.schemas.CreateTagRequest.properties.color`: add `pattern: '^#([0-9A-Fa-f]{3}){1,2}$'`
  - `components.schemas.UpdateTagRequest.properties.color`: add same hex pattern
  - `paths./tags.get`: add `description: 'Ordered by createdAt DESC (newest first).'`

### ✅ Checkpoint 3

```bash
pnpm tsc --noEmit                # still 0 errors
pnpm --filter backend lint       # still 0 warnings
pnpm --filter backend build      # still clean
```

---

## Phase 4 — Tests

- [ ] **T11** — Create `apps/backend/src/__tests__/tag.service.test.ts` (unit)

  Mock: `vi.mock('../repositories/tag.repository', ...)`

  | Scenario | Test ID |
  |----------|---------|
  | `list`: returns mapped `TagResponseDTO[]` | U01 |
  | `list`: returns `[]` when no tags | U02 |
  | `create`: returns new tag with `noteCount: 0` | U03 |
  | `update`: returns updated tag | U04 |
  | `update`: throws `NotFoundError` when tag not found | U05 |
  | `delete`: calls `tagRepository.delete` on success | U06 |
  | `delete`: throws `NotFoundError` when tag not found | U07 |

- [ ] **T12** — Create `apps/backend/src/__tests__/tag.integration.test.ts` (integration)

  Boilerplate: `skipIfNoDb`, `cleanDb()`, `registerAndLogin()` — same pattern as `note.integration.test.ts`.

  | Scenario | Test ID |
  |----------|---------|
  | `POST /api/tags` — 201, tag created, `noteCount: 0` | I01 |
  | `POST /api/tags` — 400, missing `name` | I02 |
  | `POST /api/tags` — 400, invalid color (`"red"`) | I03 |
  | `POST /api/tags` — 201, short hex `"#FFF"` accepted | I04 |
  | `POST /api/tags` — 401, no auth token | I05 |
  | `GET /api/tags` — 200, returns only requesting user's tags | I06 |
  | `GET /api/tags` — 200, `noteCount` counts non-deleted notes only | I07 |
  | `GET /api/tags` — 200, ordered newest first | I08 |
  | `PATCH /api/tags/:id` — 200, name updated | I09 |
  | `PATCH /api/tags/:id` — 200, color updated (valid hex) | I10 |
  | `PATCH /api/tags/:id` — 400, invalid hex color | I11 |
  | `PATCH /api/tags/:id` — 400, empty body | I12 |
  | `PATCH /api/tags/:id` — 404, tag not found | I13 |
  | `PATCH /api/tags/:id` — 404, tag belongs to another user (IDOR) | I14 |
  | `DELETE /api/tags/:id` — 200, tag deleted | I15 |
  | `DELETE /api/tags/:id` — 200, note_tags detached (note still exists) | I16 |
  | `DELETE /api/tags/:id` — 404, tag not found | I17 |
  | `DELETE /api/tags/:id` — 401, no auth | I18 |

### ✅ Final Checkpoint (all quality gates)

```bash
pnpm tsc --noEmit                # 1. type-check
pnpm --filter backend lint       # 2. lint
pnpm --filter backend test       # 3. all tests green (unit + integration)
pnpm --filter backend build      # 4. build
```

---

## Summary

| Phase | Tasks | Files |
|-------|-------|-------|
| 1 — Foundation | T01–T04 | schema.prisma, tags.ts (shared), index.ts |
| 2 — Backend | T05–T09 | repository, service, controller, routes, app.ts |
| 3 — Integration | T10 | openapi.yaml |
| 4 — Tests | T11–T12 | tag.service.test.ts, tag.integration.test.ts |
| **Total** | **12 tasks** | **11 files** |
