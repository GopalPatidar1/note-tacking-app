# Task Checklist — AB-1018: Backend README

**Date:** 2026-06-16
**Branch:** `docs/AB-1018-backend-readme`
**Type:** Documentation only — no TypeScript, no migrations, no tests

> Standard quality gates (pnpm build / lint / test) do not apply.
> The checkpoint for this ticket is the accuracy verification pass in Phase 3.

---

## Phase 1 — Source Verification (before writing anything)

Grep the actual source files to confirm all facts the README will assert. This prevents documentation drift on the first commit.

- [ ] **T01** Confirm implemented auth routes

  ```bash
  cat apps/backend/src/routes/auth.routes.ts
  ```

  **Expected:** 4 routes — `register`, `login`, `logout`, `refresh`.
  **Action:** `/auth/forgot-password` and `/auth/reset-password` must NOT appear in the README.

- [ ] **T02** Confirm rate limiter configuration

  ```bash
  grep -A 6 'rateLimit' apps/backend/src/routes/auth.routes.ts
  grep -A 6 'rateLimit' apps/backend/src/routes/share-link.routes.ts
  ```

  **Expected:**
  - `authLimiter`: 15 min / 20 req / skips in `test`
  - `publicLimiter`: 15 min / 60 req / skips in `test`
  - `logout` has no rate limiter applied

- [ ] **T03** Confirm domain error classes and HTTP codes

  ```bash
  grep -E 'class|super\(' apps/backend/src/errors/domain-errors.ts
  grep -E 'ZodError|AppError|status(500)' apps/backend/src/middleware/error.middleware.ts
  ```

  **Expected error categories (3 total):**
  - `ZodError` → 400 / `VALIDATION_ERROR`
  - `AppError` subclasses → varies
  - Unhandled catch → 500 / `INTERNAL_ERROR`

- [ ] **T04** Confirm DB table names

  ```bash
  grep '@@map' apps/backend/prisma/schema.prisma
  ```

  **Expected:** `users`, `refresh_tokens`, `notes`, `tags`, `share_links`, `note_versions`
  (no `password_reset_otps` — model not in schema)

- [ ] **T05** Confirm JWT `sub` claim and `req.user` injection

  ```bash
  grep 'sub\|req.user' apps/backend/src/middleware/auth.middleware.ts
  ```

  **Expected:** `payload.sub` → `req.user = { id: payload.sub }`

- [ ] **T06** Confirm `ACCESS_TOKEN_SECRET` value in vitest config

  ```bash
  grep 'ACCESS_TOKEN_SECRET' apps/backend/vitest.config.ts
  ```

  **Expected:** `"test-secret-do-not-use-in-production"` — `.env.test.example` must use the same value.

- [ ] **T07** Confirm default port

  ```bash
  grep 'PORT' apps/backend/src/server.ts
  ```

  **Expected:** `process.env.PORT ?? 3000`

- [ ] **T08** Confirm available scripts

  ```bash
  grep -A 12 '"scripts"' apps/backend/package.json
  ```

  **Expected:** `dev`, `build`, `start`, `test`, `test:coverage`, `lint`, `tsc`

---

**Phase 1 Checkpoint** — all grep outputs match the expected values above.
No build / lint / test gates apply for a documentation ticket.

---

## Phase 2 — Write Artifacts [PARALLEL]

T09 and T10 are independent — write them simultaneously.

- [ ] **T09** [PARALLEL] Overwrite `apps/backend/README.md`

  Write all 14 sections in order. Each sub-item is a section gate — do not move to the next section until the current one passes the accuracy constraint.

  - [ ] **§1 Title + one-liner** — "Note Taking Application — Backend"
  - [ ] **§2 Tech stack** — 7-row table: Runtime, Framework, Language, Database, Auth, Validation, Testing
  - [ ] **§3 Architecture** — text-only layered table, no Mermaid; cites root README for the diagram
  - [ ] **§4 Project structure** — annotated tree covering `controllers/`, `services/`, `repositories/`, `routes/`, `middleware/`, `errors/`, `lib/`, `types/`, `__tests__/`
  - [ ] **§5 Getting Started** — 5 steps: `pnpm install` → `cp .env.example .env` → `prisma migrate dev` → `prisma generate` → `pnpm dev`
  - [ ] **§6 Environment variables** — 4-row table: `DATABASE_URL` (required), `ACCESS_TOKEN_SECRET` (required), `PORT` (optional, default 3000), `NODE_ENV` (optional); note re: refresh token storage
  - [ ] **§7 Available scripts** — 7 `pnpm` commands from `package.json` + 4 Prisma commands
  - [ ] **§8 API reference** — 6 domain groups; **exactly 20 endpoints**:
    - Auth: 4 (register, login, logout, refresh) — NOT forgot/reset
    - Notes: 5 (GET list, GET :id, POST, PATCH, DELETE)
    - Tags: 4 (GET, POST, PATCH, DELETE)
    - Search: 1 (GET /search)
    - Sharing: 3 (POST share, GET public/:token, DELETE share/:id)
    - Versions: 3 (GET list, GET :versionId, POST restore)
    - Response envelopes shown once after the tables
  - [ ] **§9 Database schema** — 6-model table from `prisma/schema.prisma` @@map values; note `password_reset_otps` is in FRS but NOT in current schema
  - [ ] **§10 Auth design** — token table (JWT `sub` claim + 15 min TTL; opaque hex + 7 days); rotation; logout; per-route rate limiting; `skip: test` caveat
  - [ ] **§11 Error handling** — 3-category table + 7 `AppError` subclasses; note `ZodError` (400/`VALIDATION_ERROR`) and fallback 500 (`INTERNAL_ERROR`)
  - [ ] **§12 Middleware stack** — `helmet → cors → express.json() → routes → errorHandler`; auth middleware note; rate limiter placement note
  - [ ] **§13 Testing** — unit vs integration table; test DB setup (createdb → .env.test → migrate deploy → pnpm test); cleanup note
  - [ ] **§14 Coding conventions** — 8 anti-patterns from backend CLAUDE.md (no Prisma outside repos, no raw errors to client, no IDOR skip, no inline Zod schemas, no res.send(), no hard-delete, no missing version snapshot, no `any`)

- [ ] **T10** [PARALLEL] Create `apps/backend/.env.test.example`

  ```bash
  # Test database — separate from the development DB
  DATABASE_URL="postgresql://user:password@localhost:5432/note_taking_test"

  # Must match the value hard-coded in vitest.config.ts
  ACCESS_TOKEN_SECRET="test-secret-do-not-use-in-production"

  NODE_ENV=test
  ```

---

**Phase 2 Checkpoint** — both files exist; README has all 14 sections; `.env.test.example` has all 3 variables.

---

## Phase 3 — Accuracy Verification Pass

Run each check against the written README and fix any mismatch before moving to the commit.

- [ ] **T11** Endpoint count — count API table rows in §8; must be exactly 20
- [ ] **T12** Auth routes — confirm `/auth/forgot-password` and `/auth/reset-password` do NOT appear anywhere in the README
- [ ] **T13** Rate limiter numbers — README §10 must say `20 req / 15 min` for auth and `60 req / 15 min` for public; both must note they skip in `NODE_ENV=test`
- [ ] **T14** Error table completeness — README §11 must include `ZodError → 400/VALIDATION_ERROR`, all 7 `AppError` subclasses, and `fallback → 500/INTERNAL_ERROR`
- [ ] **T15** DB table names — README §9 must use `@@map` values: `users`, `refresh_tokens`, `notes`, `tags`, `share_links`, `note_versions`; must not include `password_reset_otps`
- [ ] **T16** Script names — README §7 must list exactly: `dev`, `build`, `start`, `test`, `test:coverage`, `lint`, `tsc` (match `package.json` "scripts" keys)
- [ ] **T17** `.env.test.example` `ACCESS_TOKEN_SECRET` — must be `"test-secret-do-not-use-in-production"` (exact match with `vitest.config.ts`)
- [ ] **T18** Test DB step path — test section must reference `.env.test.example` (the file being created), not a hypothetical template

---

**Phase 3 Checkpoint** — all 8 verification items pass.
No code changes → `pnpm build`, `pnpm lint`, `pnpm test` are not applicable.

---

## Phase 4 — Tests

**Not applicable.** AB-1018 is documentation-only. No TypeScript is written, no behavior changes, no test scenarios exist in the spec.

The accuracy verification pass in Phase 3 is the functional equivalent.

---

## Commit

- [ ] **T19** Stage and commit

  ```bash
  git add apps/backend/README.md apps/backend/.env.test.example
  git commit -m "docs(infra): add backend README and .env.test.example"
  ```

---

## Summary

| Phase | Tasks | Gate |
|-------|-------|------|
| 1 — Source Verification | T01–T08 | All grep outputs match expected values |
| 2 — Write Artifacts [PARALLEL] | T09–T10 | Both files exist; README has 14 sections |
| 3 — Accuracy Verification | T11–T18 | All 8 checks pass |
| 4 — Tests | N/A | Documentation-only ticket |
| Commit | T19 | Clean commit with 2 files staged |

**Total tasks:** 19 (8 verification + 1 README write + 1 env file write + 8 accuracy checks + 1 commit)
