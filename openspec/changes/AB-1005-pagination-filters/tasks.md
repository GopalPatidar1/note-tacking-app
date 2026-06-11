# Tasks — AB-1005: Pagination & Filters

**Date:** 2026-06-11
**Branch:** `feat/AB-1005-pagination-filters`
**Status:** AWAITING APPROVAL

---

## Pre-flight

- [ ] Confirm on branch `feat/AB-1005-pagination-filters`
- [ ] `pnpm tsc --noEmit` passes on current master baseline

---

## Phase 1 — Foundation (shared types + OpenAPI spec)

> No DB migration needed — `createdAt`/`updatedAt` already exist on `notes`.

- [ ] **T01** — `packages/shared/src/schemas/notes.ts`
  Add four optional fields to `ListNotesQuerySchema` after the `tagId` line:
  ```typescript
  createdFrom: z.coerce.date().optional(),
  createdTo:   z.coerce.date().optional(),
  updatedFrom: z.coerce.date().optional(),
  updatedTo:   z.coerce.date().optional(),
  ```
  `ListNotesQueryDTO` auto-updates via `z.infer` — no separate type change.

- [ ] **T02** — `openspec/openapi.yaml`
  Add 4 reusable params to `components.parameters` (after `shareTokenParam`):
  `createdFromParam`, `createdToParam`, `updatedFromParam`, `updatedToParam` — each with
  `in: query`, `format: date-time`, no `required`.
  Reference all four in `GET /notes` parameters after the existing `tagId` inline param.

### Phase 1 Checkpoint

```bash
pnpm tsc --noEmit                # 0 errors — ListNotesQueryDTO now has 4 date fields
pnpm --filter backend lint       # 0 warnings
pnpm --filter backend build      # clean compile
```

---

## Phase 2 — Core Implementation [PARALLEL]

> Both tasks are independent — T03 touches the repository, T04 touches the service.
> Run them in parallel if pairing; serial is fine too.

- [ ] **T03** `[PARALLEL]` — `apps/backend/src/repositories/note.repository.ts`
  1. Extend the `opts` inline type in `findAll()` — add four optional date fields:
     ```typescript
     createdFrom?: Date
     createdTo?:   Date
     updatedFrom?: Date
     updatedTo?:   Date
     ```
  2. Add date conditions to `where: Prisma.NoteWhereInput` after the existing tagId spread:
     ```typescript
     ...(opts.createdFrom || opts.createdTo
       ? {
           createdAt: {
             ...(opts.createdFrom ? { gte: opts.createdFrom } : {}),
             ...(opts.createdTo   ? { lte: opts.createdTo }   : {}),
           },
         }
       : {}),
     ...(opts.updatedFrom || opts.updatedTo
       ? {
           updatedAt: {
             ...(opts.updatedFrom ? { gte: opts.updatedFrom } : {}),
             ...(opts.updatedTo   ? { lte: opts.updatedTo }   : {}),
           },
         }
       : {}),
     ```
  Both `findMany` and `count` share the same `where` — filtered total stays accurate.

- [ ] **T04** `[PARALLEL]` — `apps/backend/src/services/note.service.ts`
  In `list()` (currently lines 69–78), add four fields to the `noteRepository.findAll` call:
  ```typescript
  createdFrom: query.createdFrom,
  createdTo:   query.createdTo,
  updatedFrom: query.updatedFrom,
  updatedTo:   query.updatedTo,
  ```
  No business logic — pure pass-through from DTO to repo opts.
  No controller changes needed (controller already calls `ListNotesQuerySchema.parse(req.query)`).

### Phase 2 Checkpoint

```bash
pnpm tsc --noEmit                # 0 errors — repo + service types align
pnpm --filter backend lint       # 0 warnings
pnpm --filter backend build      # clean compile
```

---

## Phase 3 — Integration (wiring verification)

> No new routes, no app.ts changes, no middleware. This phase is a manual smoke check
> to confirm the query param flows end-to-end before writing tests.

- [ ] **T05** — Smoke-test `GET /notes?createdFrom=2024-01-01T00:00:00Z` with a running dev server
  (or skip to Phase 4 and rely on integration tests for this verification).

---

## Phase 4 — Tests

### Unit tests — `apps/backend/src/__tests__/note.service.test.ts`

Append inside the existing `noteService.list` describe block.

- [ ] **T06 (U04b)** — Default query: verify `findAll` called with `page=1`, `limit=20`, `orderBy: { updatedAt: 'desc' }`
- [ ] **T07 (U04c)** — `page=2, limit=5`: both fields passed through to `findAll`
- [ ] **T08 (U04d)** — `sort=title_asc`: mapped to `{ title: 'asc' }` in `findAll` call
- [ ] **T09 (U04e)** — `tagId=<uuid>`: passed through to `findAll`
- [ ] **T10 (U04f)** — `createdFrom` + `createdTo`: both `Date` objects passed to `findAll`
- [ ] **T11 (U04g)** — `updatedFrom` only: passed through; `updatedTo` is `undefined` in call
- [ ] **T12 (U04h)** — All four date params: all passed through to `findAll` simultaneously

### Integration tests — `apps/backend/src/__tests__/note.integration.test.ts`

Append as a new `describe('GET /api/notes — date filters', ...)` block after the DELETE tests.
Also append three tests to the existing `GET /api/notes` block.

**Existing block additions:**

- [ ] **T13 (I-page2)** — `page=2&limit=2`: returns correct second page (1 item), `page` field = 2
- [ ] **T14 (I-limit)** — `limit=200`: 400 response, `code: VALIDATION_ERROR`
- [ ] **T15 (I-idor)** — `tagId` from another user: 200 response, `items` is empty (IDOR guard)

**New date-filter block:**

- [ ] **T16 (I17)** — `createdFrom=<cutoff>`: only notes created after cutoff are returned
- [ ] **T17 (I18)** — `createdTo=<cutoff>`: only notes created before cutoff are returned
- [ ] **T18 (I19)** — `createdFrom + createdTo` range: notes within the window are returned
- [ ] **T19 (I20)** — `updatedFrom + updatedTo` range: notes updated within window are returned
- [ ] **T20 (I21)** — `createdFrom` in the far future: `items=[]`, `total=0`
- [ ] **T21 (I22)** — Inverted range (`createdFrom > createdTo`): 200, `items=[]` (not 400)
- [ ] **T22 (I23)** — `createdFrom=not-a-date`: 400, `code: VALIDATION_ERROR`

### Phase 4 Checkpoint

```bash
pnpm --filter backend test       # all unit + integration tests green
```

---

## Final Quality Gate

```bash
pnpm tsc --noEmit                # 1. type-check monorepo
pnpm --filter backend lint       # 2. lint — 0 warnings
pnpm --filter backend test       # 3. all tests green
pnpm --filter backend build      # 4. build clean
```

All four must pass before committing.

---

## Commit message (when ready)

```
feat(notes): add date-range filters and comprehensive list tests to GET /notes

Add createdFrom, createdTo, updatedFrom, updatedTo query params to GET /notes.
Params are optional ISO 8601 date-times; inverted ranges return empty, not 400.
Adds 7 unit tests for param pass-through and 10 integration tests for filter
behaviour, pagination edge cases, and IDOR guard.
```
