# Technical Plan — AB-1006: Tags

**Date:** 2026-06-11
**Ticket:** AB-1006
**Branch:** `feat/AB-1006-tags`
**Status:** AWAITING APPROVAL

---

## 0. Codebase Baseline

| Location | Current State |
|----------|--------------|
| `apps/backend/prisma/schema.prisma` | `Tag` model exists from AB-1004 — has `@@unique([userId, name])`, no `createdAt` |
| `packages/shared/src/schemas/notes.ts` | `TagDTO { id, userId, name, color, noteCount? }` — no tag Zod schemas |
| `packages/shared/src/index.ts` | Exports auth + notes schemas/constants only |
| `apps/backend/src/routes/` | No `tag.routes.ts`; `app.ts` has no `/api/tags` mount |
| `apps/backend/src/errors/domain-errors.ts` | `NotFoundError`, `ForbiddenError` already exist — **reuse** |

---

## 1. Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Tag name uniqueness | **No** — drop `@@unique([userId, name])` | Per spec: same user may have duplicate tag names |
| DB migration required | **Yes** — add `createdAt`, drop unique index | Both changes on existing model; backward-compatible data-wise |
| Color validation | **Hex regex** `^#([0-9A-Fa-f]{3}){1,2}$` | Enforced in Zod; rejected with `400 VALIDATION_ERROR` |
| GET /tags ordering | `createdAt DESC` (newest first) | Requires new `createdAt` column on `Tag` |
| GET /tags pagination | **None** — flat array | Consistent with openapi.yaml; tags are bounded per user |
| DELETE side-effect | **Silent detach only** — no version snapshots | M2M rows removed; note content unchanged; no new snapshot |
| noteCount computation | `_count` with `where: { deletedAt: null }` in `include` | Single query; only active notes counted |
| TagResponseDTO placement | **New `tags.ts` in shared** — separate from `TagDTO` | `TagDTO` in `notes.ts` is for tag shapes embedded in note responses (no `createdAt`); tag API needs its own response type |
| Repository shape | Same plain-object export pattern as `noteRepository` | Consistency across backend |
| No transaction needed | **No** — all tag ops are single-table | No atomicity requirement for create/update/delete |

---

## 2. DB Changes (Prisma Schema)

**Modifies existing `Tag` model** — two changes from AB-1004:

```prisma
model Tag {
  id        String   @id @default(uuid())
  userId    String
  name      String
  color     String
  createdAt DateTime @default(now())   // NEW — required for ordering

  user  User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  notes Note[] @relation("NoteTags")

  // @@unique([userId, name])          // REMOVED — duplicates now allowed
  @@index([userId])
  @@map("tags")
}
```

**Backward-compatible:** existing rows get `createdAt = now()` on migration; no data loss.

### Migration command

```bash
pnpm --filter backend exec prisma migrate dev --name add-tag-createdat-drop-name-unique
```

> Ask before running `prisma migrate deploy` on staging/prod.

---

## 3. OpenAPI Spec Changes (`openspec/openapi.yaml`)

Four targeted amendments — no new paths added:

| # | Location | Change |
|---|----------|--------|
| 1 | `components.schemas.Tag` | Add `createdAt` to `required`; add `createdAt: { type: string, format: date-time }` property |
| 2 | `components.schemas.CreateTagRequest.properties.color` | Add `pattern: '^#([0-9A-Fa-f]{3}){1,2}$'` |
| 3 | `components.schemas.UpdateTagRequest.properties.color` | Same hex pattern |
| 4 | `paths./tags.get` | Add `description: 'Ordered by createdAt DESC (newest first).'` |

---

## 4. Shared Package Changes

### 4a. New file: `packages/shared/src/schemas/tags.ts`

```typescript
import { z } from 'zod'

const HEX_COLOR = /^#([0-9A-Fa-f]{3}){1,2}$/

export const CreateTagSchema = z.object({
  name:  z.string().min(1),
  color: z.string().regex(HEX_COLOR, 'Must be a valid hex color (#RGB or #RRGGBB)'),
})

export const UpdateTagSchema = z.object({
  name:  z.string().min(1).optional(),
  color: z.string().regex(HEX_COLOR, 'Must be a valid hex color (#RGB or #RRGGBB)').optional(),
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

> `TagDTO` in `notes.ts` stays unchanged (`noteCount?` optional, no `createdAt`). It is used only for tag shapes embedded inside note responses. `TagResponseDTO` is the full shape returned by tag CRUD endpoints.

### 4b. Modify `packages/shared/src/index.ts`

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

| File | Action | Notes |
|------|--------|-------|
| `apps/backend/prisma/schema.prisma` | **MODIFY** | Add `createdAt` to Tag; remove `@@unique([userId, name])` |
| `packages/shared/src/schemas/tags.ts` | **CREATE** | Zod schemas + `TagResponseDTO` |
| `packages/shared/src/index.ts` | **MODIFY** | Add `export * from './schemas/tags'` |
| `apps/backend/src/repositories/tag.repository.ts` | **CREATE** | |
| `apps/backend/src/services/tag.service.ts` | **CREATE** | |
| `apps/backend/src/controllers/tag.controller.ts` | **CREATE** | |
| `apps/backend/src/routes/tag.routes.ts` | **CREATE** | |
| `apps/backend/src/app.ts` | **MODIFY** | Mount `/api/tags` |
| `openspec/openapi.yaml` | **MODIFY** | Four spec amendments (see §3) |
| `apps/backend/src/__tests__/tag.service.test.ts` | **CREATE** | Unit tests |
| `apps/backend/src/__tests__/tag.integration.test.ts` | **CREATE** | Integration tests |

---

## 6. TypeScript Interface Shapes

### Internal repository type

```typescript
import type { Tag } from '@prisma/client'

type TagWithCount = Tag & {
  _count: { notes: number }
}
```

### `TagResponseDTO` (from shared — the API response shape)

```typescript
interface TagResponseDTO {
  id:        string
  userId:    string
  name:      string
  color:     string
  createdAt: string      // ISO 8601
  noteCount: number      // non-deleted notes only
}
```

### Mapping helper (inside `tag.service.ts`)

```typescript
function toTagResponseDTO(tag: TagWithCount): TagResponseDTO {
  return {
    id:        tag.id,
    userId:    tag.userId,
    name:      tag.name,
    color:     tag.color,
    createdAt: tag.createdAt.toISOString(),
    noteCount: tag._count.notes,
  }
}
```

---

## 7. Layer Breakdown

### `tag.repository.ts`

```typescript
import { prisma } from '../lib/prisma'
import type { Tag } from '@prisma/client'

type TagWithCount = Tag & { _count: { notes: number } }

const TAG_INCLUDE = {
  _count: { select: { notes: { where: { deletedAt: null } } } },
} as const

export const tagRepository = {
  findAll(userId: string): Promise<TagWithCount[]> {
    return prisma.tag.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      include: TAG_INCLUDE,
    })
  },

  findById(id: string, userId: string): Promise<Tag | null> {
    return prisma.tag.findFirst({ where: { id, userId } })
  },

  create(data: { userId: string; name: string; color: string }): Promise<TagWithCount> {
    return prisma.tag.create({ data, include: TAG_INCLUDE })
  },

  update(id: string, data: { name?: string; color?: string }): Promise<TagWithCount> {
    return prisma.tag.update({ where: { id }, data, include: TAG_INCLUDE })
  },

  delete(id: string): Promise<void> {
    return prisma.tag.delete({ where: { id } }).then(() => undefined)
    // Prisma implicit M2M cascade removes note_tags rows automatically
  },
}
```

> `findById` returns plain `Tag` (no count) — used only for existence/ownership checks before mutate operations. `create` and `update` return `TagWithCount` so the service can map directly to `TagResponseDTO`.

### `tag.service.ts`

```typescript
import type { CreateTagDTO, UpdateTagDTO, TagResponseDTO } from '@note-app/shared'
import { tagRepository } from '../repositories/tag.repository'
import { NotFoundError } from '../errors/domain-errors'
import type { Tag } from '@prisma/client'

type TagWithCount = Tag & { _count: { notes: number } }

function toTagResponseDTO(tag: TagWithCount): TagResponseDTO {
  return {
    id:        tag.id,
    userId:    tag.userId,
    name:      tag.name,
    color:     tag.color,
    createdAt: tag.createdAt.toISOString(),
    noteCount: tag._count.notes,
  }
}

export const tagService = {
  async list(userId: string): Promise<TagResponseDTO[]> {
    const tags = await tagRepository.findAll(userId)
    return tags.map(toTagResponseDTO)
  },

  async create(userId: string, dto: CreateTagDTO): Promise<TagResponseDTO> {
    const tag = await tagRepository.create({ userId, ...dto })
    return toTagResponseDTO(tag)
  },

  async update(userId: string, tagId: string, dto: UpdateTagDTO): Promise<TagResponseDTO> {
    const existing = await tagRepository.findById(tagId, userId)
    if (!existing) throw new NotFoundError('Tag not found')
    const updated = await tagRepository.update(tagId, dto)
    return toTagResponseDTO(updated)
  },

  async delete(userId: string, tagId: string): Promise<void> {
    const existing = await tagRepository.findById(tagId, userId)
    if (!existing) throw new NotFoundError('Tag not found')
    await tagRepository.delete(tagId)
  },
}
```

> **IDOR pattern:** `findById(id, userId)` scopes by userId. A tag that exists but belongs to another user returns `null` → `NotFoundError` (404). This avoids leaking that the ID exists. Consistent with the notes layer.

### `tag.controller.ts`

```typescript
import { Request, Response } from 'express'
import { CreateTagSchema, UpdateTagSchema } from '@note-app/shared'
import { tagService } from '../services/tag.service'

export const tagController = {
  async list(req: Request, res: Response) {
    const tags = await tagService.list(req.user.id)
    res.status(200).json({ data: tags })
  },

  async create(req: Request, res: Response) {
    const body = CreateTagSchema.parse(req.body)
    const tag = await tagService.create(req.user.id, body)
    res.status(201).json({ data: tag })
  },

  async update(req: Request, res: Response) {
    const body = UpdateTagSchema.parse(req.body)
    const tag = await tagService.update(req.user.id, req.params.id as string, body)
    res.status(200).json({ data: tag })
  },

  async delete(req: Request, res: Response) {
    await tagService.delete(req.user.id, req.params.id as string)
    res.status(200).json({ data: { message: 'Tag deleted' } })
  },
}
```

### `tag.routes.ts`

```typescript
import { Router, type IRouter } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { tagController } from '../controllers/tag.controller'

const router: IRouter = Router()

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
// After existing noteRouter line:
app.use('/api/tags', tagRouter)
```

---

## 8. Error Codes

All reuse existing `domain-errors.ts` — no new classes needed.

| Scenario | Class | HTTP | code |
|----------|-------|------|------|
| Tag not found (update/delete) | `NotFoundError` | 404 | `NOT_FOUND` |
| Tag ID exists but wrong user | `NotFoundError` | 404 | `NOT_FOUND` (IDOR safe) |
| Invalid hex color / missing name | Zod → error middleware | 400 | `VALIDATION_ERROR` |
| No auth token | `UnauthorizedError` | 401 | `UNAUTHORIZED` |

---

## 9. Test Coverage Plan

### Unit tests: `tag.service.test.ts`

Pattern mirrors `note.service.test.ts` exactly.

```typescript
vi.mock('../repositories/tag.repository', () => ({
  tagRepository: {
    findAll:  vi.fn(),
    findById: vi.fn(),
    create:   vi.fn(),
    update:   vi.fn(),
    delete:   vi.fn(),
  },
}))
```

| # | Scenario |
|---|----------|
| U01 | `list`: returns `TagResponseDTO[]` mapped from repository |
| U02 | `list`: returns `[]` when user has no tags |
| U03 | `create`: returns new `TagResponseDTO` with `noteCount: 0` |
| U04 | `update`: returns updated `TagResponseDTO` |
| U05 | `update`: throws `NotFoundError` when `findById` returns null |
| U06 | `delete`: calls `tagRepository.delete` on success |
| U07 | `delete`: throws `NotFoundError` when `findById` returns null |

### Integration tests: `tag.integration.test.ts`

Same boilerplate as `note.integration.test.ts` — `skipIfNoDb`, `cleanDb()`, `registerAndLogin()`.

| # | Scenario |
|---|----------|
| I01 | `POST /api/tags` — 201, tag created, `noteCount: 0` |
| I02 | `POST /api/tags` — 400, missing `name` |
| I03 | `POST /api/tags` — 400, invalid color (e.g. `"red"`) |
| I04 | `POST /api/tags` — 201, short hex `"#FFF"` accepted |
| I05 | `POST /api/tags` — 401, no auth token |
| I06 | `GET /api/tags` — 200, returns only requesting user's tags |
| I07 | `GET /api/tags` — 200, `noteCount` counts non-deleted notes only |
| I08 | `GET /api/tags` — 200, ordered newest first |
| I09 | `PATCH /api/tags/:id` — 200, name updated |
| I10 | `PATCH /api/tags/:id` — 200, color updated (valid hex) |
| I11 | `PATCH /api/tags/:id` — 400, invalid hex color |
| I12 | `PATCH /api/tags/:id` — 400, empty body |
| I13 | `PATCH /api/tags/:id` — 404, tag not found |
| I14 | `PATCH /api/tags/:id` — 404, tag belongs to another user (IDOR safe) |
| I15 | `DELETE /api/tags/:id` — 200, tag deleted |
| I16 | `DELETE /api/tags/:id` — 200, note_tags detached (note still exists) |
| I17 | `DELETE /api/tags/:id` — 404, tag not found |
| I18 | `DELETE /api/tags/:id` — 401, no auth |

---

## 10. Quality Gates

Run in this order before committing:

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
| Q1 | Tag name uniqueness? | **No** — drop `@@unique([userId, name])`; migration required |
| Q2 | Color validation? | **Hex only** — `/^#([0-9A-Fa-f]{3}){1,2}$/` |
| Q3 | GET /tags ordering? | **`createdAt DESC`** — add `createdAt` to Tag model |
| Q4 | DELETE snapshot side-effect? | **No** — silent M2M detach; no note version created |
| Q5 | noteCount scope? | **Non-deleted notes** — `_count` with `where: { deletedAt: null }` |
| Q6 | Wrong-user tag ownership error? | **404 `NOT_FOUND`** — same as note IDOR pattern; avoids leaking ID existence |
| Q7 | TagDTO vs TagResponseDTO? | **Separate** — `TagDTO` (notes.ts) for note responses; `TagResponseDTO` (tags.ts) for tag CRUD |
