# Technical Plan — AB-1006: Tags

**Date:** 2026-06-11
**Ticket:** AB-1006
**Branch:** `feat/AB-1006-tags`
**Status:** AWAITING APPROVAL

---

## 0. Codebase Baseline

| Location | Current State |
|----------|--------------|
| `apps/backend/prisma/schema.prisma` | `Tag` model exists (from AB-1004) — has `@@unique([userId, name])` and **no `createdAt`** |
| `packages/shared/src/schemas/notes.ts` | `TagDTO` defined with `noteCount?: number` — no tag Zod schemas |
| `apps/backend/src/routes/` | No `tag.routes.ts` — only auth + notes routers |
| `apps/backend/src/app.ts` | No `/api/tags` mounted |

---

## 1. Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Tag name uniqueness | **No** — duplicates allowed | Per clarifying answer: same user can have two tags with the same name |
| DB migration needed | **Yes** — drop `@@unique([userId, name])`, add `createdAt` | Both changes on the existing `Tag` model from AB-1004 |
| Color validation | **Hex only** (`/^#([0-9A-Fa-f]{3}){1,2}$/`) | Enforced via Zod regex in shared schema; applied on create + update |
| GET /tags ordering | **`createdAt DESC`** (newest first) | Per clarifying answer; requires `createdAt` column on `Tag` |
| DELETE side-effect | **Silent detach** — no version snapshots | Remove `note_tags` rows only; notes are not considered "edited" |
| noteCount computation | **Prisma `_count`** in repository | Count active (non-deleted) notes per tag in a single query |
| TagDTO scope | New `TagResponseDTO` in `tags.ts` | Separate from `TagDTO` in `notes.ts`; keeps note responses minimal |
| No pagination on GET /tags | **Flat array** | Consistent with openapi.yaml — tags are a bounded, user-scoped list |

---

## 2. DB Changes (Prisma Schema)

**Modifies existing `Tag` model** — two changes from AB-1004's schema:

```prisma
model Tag {
  id        String   @id @default(uuid())
  userId    String
  name      String
  color     String
  createdAt DateTime @default(now())        // ADD: required for ordering

  user  User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  notes Note[] @relation("NoteTags")

  // @@unique([userId, name])               // REMOVE: duplicates now allowed
  @@index([userId])
  @@map("tags")
}
```

### Migration command

```bash
pnpm --filter backend exec prisma migrate dev --name add-tag-createdat-drop-name-unique
```

> **Note:** This migration drops an existing unique index. Safe on dev; will need `prisma migrate deploy` for staging/prod.

---

## 3. OpenAPI Spec Delta (`openspec/openapi.yaml`)

Three targeted changes — no paths added (all four tag endpoints already exist).

### 3a. `Tag` schema — add `createdAt` to required fields

```yaml
# BEFORE
Tag:
  type: object
  required: [id, userId, name, color]
  properties:
    id: ...
    userId: ...
    name: ...
    color: ...
    noteCount: ...

# AFTER
Tag:
  type: object
  required: [id, userId, name, color, createdAt]
  properties:
    id: ...
    userId: ...
    name: ...
    color: ...
    noteCount: ...
    createdAt:
      type: string
      format: date-time
```

### 3b. `CreateTagRequest.color` — add hex pattern

```yaml
# BEFORE
color:
  type: string
  example: "#3B82F6"

# AFTER
color:
  type: string
  pattern: '^#([0-9A-Fa-f]{3}){1,2}$'
  example: "#3B82F6"
```

### 3c. `UpdateTagRequest.color` — add hex pattern (same as above)

### 3d. `GET /tags` — add ordering note to description

```yaml
# AFTER
get:
  tags: [Tags]
  summary: List all tags for the authenticated user (with note counts)
  description: Ordered by `createdAt` DESC (newest first).
  operationId: listTags
  ...
```

---

## 4. Shared Package Changes

### 4a. New file: `packages/shared/src/schemas/tags.ts`

```typescript
import { z } from 'zod'

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}){1,2}$/

export const CreateTagSchema = z.object({
  name:  z.string().min(1),
  color: z.string().regex(HEX_COLOR_REGEX, 'Must be a valid hex color (#RGB or #RRGGBB)'),
})

export const UpdateTagSchema = z.object({
  name:  z.string().min(1).optional(),
  color: z.string().regex(HEX_COLOR_REGEX, 'Must be a valid hex color (#RGB or #RRGGBB)').optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' })

export type CreateTagDTO = z.infer<typeof CreateTagSchema>
export type UpdateTagDTO = z.infer<typeof UpdateTagSchema>

export interface TagResponseDTO {
  id:        string
  userId:    string
  name:      string
  color:     string
  createdAt: string
  noteCount: number
}
```

### 4b. Update `packages/shared/src/index.ts`

Add tag exports alongside existing note exports:

```typescript
export * from './schemas/auth'
export * from './schemas/notes'
export * from './schemas/tags'      // ADD
export * from './constants/auth'
export * from './constants/notes'
export * from './types/user'
export { ZodError } from 'zod'
```

---

## 5. All Files to Create / Modify

### Prisma

| File | Action |
|------|--------|
| `apps/backend/prisma/schema.prisma` | **MODIFY** — add `createdAt` to `Tag`, remove `@@unique([userId, name])` |

### Shared package

| File | Action |
|------|--------|
| `packages/shared/src/schemas/tags.ts` | **CREATE** |
| `packages/shared/src/index.ts` | **MODIFY** — add tag exports |

### Backend feature files

| File | Action |
|------|--------|
| `apps/backend/src/repositories/tag.repository.ts` | **CREATE** |
| `apps/backend/src/services/tag.service.ts` | **CREATE** |
| `apps/backend/src/controllers/tag.controller.ts` | **CREATE** |
| `apps/backend/src/routes/tag.routes.ts` | **CREATE** |
| `apps/backend/src/app.ts` | **MODIFY** — mount `/api/tags` |

### OpenAPI spec

| File | Action |
|------|--------|
| `openspec/openapi.yaml` | **MODIFY** — add `createdAt` to Tag schema, hex patterns to color fields, ordering note to GET /tags |

### Tests

| File | Action |
|------|--------|
| `apps/backend/src/__tests__/tag.service.test.ts` | **CREATE** — unit tests |
| `apps/backend/src/__tests__/tag.integration.test.ts` | **CREATE** — integration tests |

---

## 6. TypeScript Interface Shapes

### `TagWithCount` (internal repository return type)

```typescript
import type { Tag } from '@prisma/client'
type TagWithCount = Tag & { _count: { notes: number } }
```

### `TagResponseDTO` (service return / API response `data` field)

Defined in `packages/shared/src/schemas/tags.ts` (see section 4a).

---

## 7. Layer Breakdown

### `tag.repository.ts`

```typescript
{
  findAll(userId: string): Promise<TagWithCount[]>
  // prisma.tag.findMany({
  //   where: { userId },
  //   orderBy: { createdAt: 'desc' },
  //   include: { _count: { select: { notes: { where: { deletedAt: null } } } } },
  // })

  findById(id: string, userId: string): Promise<Tag | null>
  // prisma.tag.findFirst({ where: { id, userId } })

  create(data: { userId: string; name: string; color: string }): Promise<Tag>
  // prisma.tag.create({ data })

  update(id: string, data: { name?: string; color?: string }): Promise<Tag>
  // prisma.tag.update({ where: { id }, data })

  delete(id: string): Promise<void>
  // prisma.tag.delete({ where: { id } })
  // Prisma cascade handles note_tags detach automatically via implicit M2M
}
```

### `tag.service.ts`

```typescript
{
  async list(userId: string): Promise<TagResponseDTO[]>
  // tags = await tagRepository.findAll(userId)
  // return tags.map(toTagResponseDTO)

  async create(userId: string, dto: CreateTagDTO): Promise<TagResponseDTO>
  // tag = await tagRepository.create({ userId, ...dto })
  // return toTagResponseDTO(tag, 0)

  async update(userId: string, tagId: string, dto: UpdateTagDTO): Promise<TagResponseDTO>
  // tag = await tagRepository.findById(tagId, userId)
  // if !tag → throw NotFoundError
  // updated = await tagRepository.update(tagId, dto)
  // re-fetch with count: tagRepository.findAll(userId) is too heavy — do a targeted count query
  // return toTagResponseDTO(updated, noteCount)

  async delete(userId: string, tagId: string): Promise<void>
  // tag = await tagRepository.findById(tagId, userId)
  // if !tag → throw NotFoundError
  // await tagRepository.delete(tagId)
}
```

> **Note on `update` noteCount:** After update, `findById` returns a plain `Tag` without `_count`. Options: (a) do a second `findAll` and find the updated tag, or (b) add a `findByIdWithCount(id, userId)` method to the repository. Approach (b) is cleaner — add it to the repository.

### `tag.controller.ts`

```typescript
{
  list(req, res):   tagService.list(req.user.id) → res.json({ data: tags })
  create(req, res): parse CreateTagSchema → tagService.create → res.status(201).json({ data: tag })
  update(req, res): parse UpdateTagSchema → tagService.update → res.json({ data: tag })
  delete(req, res): tagService.delete → res.json({ data: { message: 'Tag deleted' } })
}
```

### `tag.routes.ts`

```typescript
const router = Router()
router.use(authenticate)

router.get('/',       tagController.list)
router.post('/',      tagController.create)
router.patch('/:id',  tagController.update)
router.delete('/:id', tagController.delete)

export default router
```

### `app.ts` addition

```typescript
import tagRouter from './routes/tag.routes'
app.use('/api/tags', tagRouter)
```

---

## 8. Error Codes (Tags Domain)

All errors reuse existing `domain-errors.ts` — **no new error classes needed**.

| Scenario | Error class | HTTP | code |
|----------|-------------|------|------|
| Tag not found (update/delete) | `NotFoundError` | 404 | `NOT_FOUND` |
| Tag belongs to another user | `ForbiddenError` | 403 | `FORBIDDEN` |
| Invalid hex color | Zod → `VALIDATION_ERROR` | 400 | `VALIDATION_ERROR` |
| Missing required fields | Zod → `VALIDATION_ERROR` | 400 | `VALIDATION_ERROR` |

---

## 9. Test Coverage Plan

### Unit tests: `tag.service.test.ts`

Mock `tagRepository`.

| # | Scenario |
|---|----------|
| U01 | `list`: returns mapped `TagResponseDTO[]` for user |
| U02 | `list`: returns empty array when user has no tags |
| U03 | `create`: returns new tag with noteCount = 0 |
| U04 | `update`: success — returns updated tag with current noteCount |
| U05 | `update`: tag not found — throws `NotFoundError` |
| U06 | `update`: tag belongs to another user — throws `NotFoundError` (findById returns null) |
| U07 | `delete`: success — calls `tagRepository.delete` |
| U08 | `delete`: tag not found — throws `NotFoundError` |

### Integration tests: `tag.integration.test.ts`

Real test DB.

| # | Scenario |
|---|----------|
| I01 | `POST /api/tags` — 201, tag created with correct fields |
| I02 | `POST /api/tags` — 400, missing name |
| I03 | `POST /api/tags` — 400, invalid color (not hex) |
| I04 | `POST /api/tags` — 401, no auth |
| I05 | `GET /api/tags` — 200, returns only tags for requesting user |
| I06 | `GET /api/tags` — 200, noteCount reflects active (non-deleted) notes only |
| I07 | `GET /api/tags` — 200, ordered newest first |
| I08 | `PATCH /api/tags/:id` — 200, updates name |
| I09 | `PATCH /api/tags/:id` — 400, invalid hex color |
| I10 | `PATCH /api/tags/:id` — 404, tag not found |
| I11 | `PATCH /api/tags/:id` — 403, tag belongs to another user |
| I12 | `DELETE /api/tags/:id` — 200, tag deleted |
| I13 | `DELETE /api/tags/:id` — 200, note_tags rows removed (note still exists, just tag-less) |
| I14 | `DELETE /api/tags/:id` — 404, tag not found |
| I15 | `DELETE /api/tags/:id` — 401, no auth |

---

## 10. Quality Gates

```bash
pnpm tsc --noEmit               # 1. type-check monorepo
pnpm --filter backend lint      # 2. lint backend
pnpm --filter backend test      # 3. unit + integration tests
pnpm --filter backend build     # 4. build check
```

---

## 11. Open Questions Resolved

| # | Question | Decision |
|---|----------|----------|
| Q1 | Tag name uniqueness? | **No** — duplicates allowed; drop `@@unique([userId, name])` migration required |
| Q2 | Color validation? | **Hex only** — `/^#([0-9A-Fa-f]{3}){1,2}$/` via Zod regex |
| Q3 | GET /tags ordering? | **`createdAt DESC`** — requires adding `createdAt` column to Tag model |
| Q4 | DELETE snapshot side-effect? | **No** — silent detach via Prisma M2M cascade |
| Q5 | noteCount scope? | **Non-deleted notes only** — `_count` with `where: { deletedAt: null }` |
| Q6 | noteCount on create? | **0** — newly created tag has no notes |
