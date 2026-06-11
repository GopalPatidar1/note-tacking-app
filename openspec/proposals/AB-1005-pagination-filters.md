# OpenSpec Proposal — AB-1005: Pagination & Filters

**Date:** 2026-06-11
**Ticket:** AB-1005
**Branch:** `feat/AB-1005-pagination-filters`
**Status:** AWAITING APPROVAL

---

## 1. Summary

AB-1004 implemented basic pagination (`page`/`limit`), sorting, and single-tag filtering on `GET /notes`. AB-1005 extends this with **date-range filtering** on both `createdAt` and `updatedAt`, and adds **comprehensive test coverage** for all list query parameters (including those already implemented).

No breaking changes. All new parameters are optional with no defaults.

---

## 2. Scope

| # | Item | Type |
|---|------|------|
| 1 | Add `createdFrom`, `createdTo`, `updatedFrom`, `updatedTo` query params to `GET /notes` | **New feature** |
| 2 | Update `ListNotesQuerySchema` in `packages/shared` to include date params | **New feature** |
| 3 | Update `note.repository.ts` `findAll()` to apply date filters in Prisma `where` | **New feature** |
| 4 | Update OpenAPI spec with the 4 new params | **Spec delta** |
| 5 | Write unit + integration tests for all list params (pagination, sort, tagId, date ranges) | **Tests** |

---

## 3. API Changes

### `GET /notes` — new query parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `createdFrom` | `string` (ISO 8601) | No | Return notes with `createdAt ≥ createdFrom` |
| `createdTo` | `string` (ISO 8601) | No | Return notes with `createdAt ≤ createdTo` |
| `updatedFrom` | `string` (ISO 8601) | No | Return notes with `updatedAt ≥ updatedFrom` |
| `updatedTo` | `string` (ISO 8601) | No | Return notes with `updatedAt ≤ updatedTo` |

**Validation rules:**
- All four are optional; omitting any means no filter on that bound.
- Must be valid ISO 8601 datetime strings (Zod `z.coerce.date()` → stored as `Date`).
- `createdFrom` ≤ `createdTo` is **not** enforced server-side — the query simply returns an empty set if the range is inverted. This keeps the API simple and avoids ambiguous 400 responses.
- Combined with other filters: date ranges AND tag filter AND sort are all composed together.

**Unchanged parameters** (already implemented in AB-1004):

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `page` | integer (min 1) | `1` | — |
| `limit` | integer (1–100) | `20` | — |
| `sort` | enum (6 values) | `updatedAt_desc` | — |
| `tagId` | UUID string | — | Single-tag filter |

**Response shape:** unchanged — `{ items, total, page, limit }`.

---

## 4. Spec Delta (OpenAPI YAML)

The following is the precise diff to apply to `openspec/openapi.yaml`:

### 4a. New reusable parameters (add to `components.parameters`)

```yaml
  createdFromParam:
    in: query
    name: createdFrom
    schema:
      type: string
      format: date-time
    description: Return notes created on or after this timestamp (ISO 8601)
    example: "2024-01-01T00:00:00Z"

  createdToParam:
    in: query
    name: createdTo
    schema:
      type: string
      format: date-time
    description: Return notes created on or before this timestamp (ISO 8601)
    example: "2024-12-31T23:59:59Z"

  updatedFromParam:
    in: query
    name: updatedFrom
    schema:
      type: string
      format: date-time
    description: Return notes updated on or after this timestamp (ISO 8601)
    example: "2024-06-01T00:00:00Z"

  updatedToParam:
    in: query
    name: updatedTo
    schema:
      type: string
      format: date-time
    description: Return notes updated on or before this timestamp (ISO 8601)
    example: "2024-06-30T23:59:59Z"
```

### 4b. `GET /notes` — add 4 new parameters (after the existing `tagId` param)

```yaml
        - $ref: "#/components/parameters/createdFromParam"
        - $ref: "#/components/parameters/createdToParam"
        - $ref: "#/components/parameters/updatedFromParam"
        - $ref: "#/components/parameters/updatedToParam"
```

---

## 5. Shared Package Changes

### `packages/shared/src/schemas/notes.ts` — `ListNotesQuerySchema`

Add four optional date params:

```typescript
export const ListNotesQuerySchema = z.object({
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
  sort:         z.enum([
    'createdAt_asc', 'createdAt_desc',
    'updatedAt_asc', 'updatedAt_desc',
    'title_asc',     'title_desc',
  ]).default('updatedAt_desc'),
  tagId:        z.string().uuid().optional(),
  // New in AB-1005
  createdFrom:  z.coerce.date().optional(),
  createdTo:    z.coerce.date().optional(),
  updatedFrom:  z.coerce.date().optional(),
  updatedTo:    z.coerce.date().optional(),
})

export type ListNotesQueryDTO = z.infer<typeof ListNotesQuerySchema>
```

`z.coerce.date()` accepts ISO 8601 strings from query params and converts them to `Date` objects. The controller passes the raw query string; Zod coerces it.

---

## 6. Backend Changes

### `note.repository.ts` — `findAll()` signature and `where` clause

```typescript
// Updated opts type
type FindAllOpts = {
  page:        number
  limit:       number
  orderBy:     Prisma.NoteOrderByWithRelationInput
  tagId?:      string
  createdFrom?: Date
  createdTo?:   Date
  updatedFrom?: Date
  updatedTo?:   Date
}

// Updated where clause (additions only)
where: {
  userId,
  deletedAt: null,
  ...(opts.tagId && { tags: { some: { id: opts.tagId, userId } } }),
  // New date filters
  ...(opts.createdFrom || opts.createdTo ? {
    createdAt: {
      ...(opts.createdFrom && { gte: opts.createdFrom }),
      ...(opts.createdTo   && { lte: opts.createdTo   }),
    }
  } : {}),
  ...(opts.updatedFrom || opts.updatedTo ? {
    updatedAt: {
      ...(opts.updatedFrom && { gte: opts.updatedFrom }),
      ...(opts.updatedTo   && { lte: opts.updatedTo   }),
    }
  } : {}),
}
```

### `note.service.ts` — `list()` method

Pass the four new fields through from `ListNotesQueryDTO` to the repository opts — no business logic needed:

```typescript
async list(userId: string, query: ListNotesQueryDTO): Promise<PaginatedNotesDTO> {
  const orderBy = SORT_MAP[query.sort]
  return noteRepository.findAll(userId, {
    page:        query.page,
    limit:       query.limit,
    orderBy,
    tagId:       query.tagId,
    createdFrom: query.createdFrom,
    createdTo:   query.createdTo,
    updatedFrom: query.updatedFrom,
    updatedTo:   query.updatedTo,
  })
}
```

No controller changes needed — the controller already calls `ListNotesQuerySchema.parse(req.query)` and passes the result to `noteService.list()`.

---

## 7. Files to Create / Modify

| File | Action | What changes |
|------|--------|--------------|
| `openspec/openapi.yaml` | **MODIFY** | Add 4 date params to `components.parameters` and `GET /notes` |
| `packages/shared/src/schemas/notes.ts` | **MODIFY** | Add 4 optional date fields to `ListNotesQuerySchema` |
| `apps/backend/src/repositories/note.repository.ts` | **MODIFY** | Extend `FindAllOpts` type and `where` clause |
| `apps/backend/src/services/note.service.ts` | **MODIFY** | Pass new fields through to repository |
| `apps/backend/src/__tests__/note.service.test.ts` | **CREATE or MODIFY** | Full unit test coverage for list params |
| `apps/backend/src/__tests__/note.integration.test.ts` | **CREATE or MODIFY** | Full integration test coverage for list query params |

---

## 8. Test Coverage Plan

### Unit tests: `note.service.test.ts`

Mock `noteRepository.findAll`.

| # | Scenario |
|---|----------|
| U01 | `list`: default params → `findAll` called with `page=1, limit=20, sort=updatedAt_desc` |
| U02 | `list`: custom `page=2, limit=5` → correctly passed through |
| U03 | `list`: `sort=title_asc` → mapped to `{ title: 'asc' }` |
| U04 | `list`: `tagId=<uuid>` → passed through to repo |
| U05 | `list`: `createdFrom` + `createdTo` → both passed through to repo |
| U06 | `list`: `updatedFrom` only → passed through; `updatedTo` is undefined |
| U07 | `list`: all four date params simultaneously → all passed through |
| U08 | `list`: returns paginated DTO with correct `total`, `page`, `limit` from repo |

### Integration tests: `note.integration.test.ts`

Real test DB.

| # | Scenario |
|---|----------|
| I01 | `GET /api/notes` — 200, returns only current user's non-deleted notes |
| I02 | `GET /api/notes?page=1&limit=2` — returns 2 items when >2 exist |
| I03 | `GET /api/notes?page=2&limit=2` — returns correct second page |
| I04 | `GET /api/notes?sort=title_asc` — items sorted alphabetically by title |
| I05 | `GET /api/notes?sort=createdAt_desc` — newest first |
| I06 | `GET /api/notes?tagId=<uuid>` — only notes with that tag returned |
| I07 | `GET /api/notes?tagId=<other-user-tag-uuid>` — returns empty (IDOR guard) |
| I08 | `GET /api/notes?createdFrom=<t1>` — only notes created on or after t1 |
| I09 | `GET /api/notes?createdTo=<t1>` — only notes created on or before t1 |
| I10 | `GET /api/notes?createdFrom=<t1>&createdTo=<t2>` — notes in range [t1, t2] |
| I11 | `GET /api/notes?updatedFrom=<t1>&updatedTo=<t2>` — notes updated in range |
| I12 | `GET /api/notes?createdFrom=<future>` — empty items array, total=0 |
| I13 | `GET /api/notes?createdFrom=<t2>&createdTo=<t1>` (inverted) — empty, no 400 |
| I14 | `GET /api/notes?createdFrom=not-a-date` — 400 validation error |
| I15 | `GET /api/notes` — does not return soft-deleted notes |
| I16 | `GET /api/notes?limit=200` — 400 validation error (exceeds max 100) |
| I17 | `GET /api/notes` — 401 without auth token |

---

## 9. Open Questions / Decisions

| # | Question | Decision |
|---|----------|----------|
| Q1 | Enforce `createdFrom ≤ createdTo` server-side? | **No** — inverted range returns empty set (not 400). Simpler API surface; frontend is responsible for sensible inputs. |
| Q2 | Date params as `Date` objects or ISO strings in the DTO? | **`Date` objects** via `z.coerce.date()` — avoids repeated string-to-Date conversion in the repository. |
| Q3 | Multi-tag filtering? | **Out of scope** — keep single `tagId` param from AB-1004. |
| Q4 | Add `totalPages` / `hasNextPage` to response? | **Out of scope** — frontend derives from `total` and `limit`. |
| Q5 | Date filter applies to soft-deleted notes? | **No** — `deletedAt: null` filter is always applied; date filters compose on top of it. |
