# Technical Plan — AB-1018: Backend README

**Date:** 2026-06-16
**Author:** gopalp@mindfiresolutions.com
**Branch:** docs/AB-1018-backend-readme
**Scope:** Documentation only — two files created, no source code changed

---

## 1. Overview

Two deliverables:

| File | Action | Notes |
|------|--------|-------|
| `apps/backend/README.md` | **CREATE** (overwrite draft) | Primary deliverable — 14 sections |
| `apps/backend/.env.test.example` | **CREATE** | Required for test DB setup section |

`apps/backend/.env.example` already exists — not modified.
No source code, API contracts, database schema, or TypeScript interfaces are changed.

---

## 2. Codebase Scan Findings

These correct or extend the spec proposal based on actual source files.

### 2a. Auth endpoints actually implemented

`src/routes/auth.routes.ts` registers **4 routes only**:

```
POST /register   (rate-limited)
POST /login      (rate-limited)
POST /logout     (NOT rate-limited)
POST /refresh    (rate-limited)
```

`/auth/forgot-password` and `/auth/reset-password` appear in the FRS and AGENTS.md but are **not in the route file**. The README must document implemented routes only — omit forgot/reset.

### 2b. Rate limiting is more granular than documented

| Route group | Limiter | Window | Max | Test mode |
|-------------|---------|--------|-----|-----------|
| `/auth/register`, `/auth/login`, `/auth/refresh` | `authLimiter` | 15 min | 20 req | **skipped** |
| `/auth/logout` | None | — | — | — |
| `GET /api/public/:token` | `publicLimiter` | 15 min | 60 req | **skipped** |

### 2c. Error handler covers two additional cases

`src/middleware/error.middleware.ts` handles three categories:

| Error type | Status | Code | Source |
|------------|--------|------|--------|
| `ZodError` | 400 | `VALIDATION_ERROR` | `@note-app/shared` |
| Any `AppError` subclass | Varies | Varies | `domain-errors.ts` |
| Anything else | 500 | `INTERNAL_ERROR` | fallback |

The error table in the README must include all three categories.

### 2d. JWT payload uses `sub` claim

`src/middleware/auth.middleware.ts`:
```ts
const payload = jwt.verify(token, secret) as { sub: string }
req.user = { id: payload.sub }
```

The access token's subject claim (`sub`) is the user ID. Document in the auth design section.

### 2e. `vitest.config.ts` hard-codes test credentials

```ts
env: {
  NODE_ENV: 'test',
  ACCESS_TOKEN_SECRET: 'test-secret-do-not-use-in-production',
}
```

The `.env.test.example` must use the same `ACCESS_TOKEN_SECRET` value so integration tests that go through the auth middleware can verify tokens correctly.

### 2f. Integration tests use `.env.test` via dotenv config call

`src/__tests__/auth.integration.test.ts` (line ~17):
```ts
config({ path: resolve(__dirname, '../../.env.test') })
```

The test DB steps reference this pattern — `DATABASE_URL` in `.env.test` must point to the test DB.

---

## 3. File Changes

### 3a. `apps/backend/README.md`

**14 sections in order:**

| # | Section | Source | Key content |
|---|---------|--------|-------------|
| 1 | Title + one-liner | AGENTS.md §1 | "Note Taking Application — Backend" |
| 2 | Tech stack | AGENTS.md §3 | Runtime · Framework · Language · DB · Auth · Validation · Testing |
| 3 | Architecture | AGENTS.md §5, backend CLAUDE.md | Text layered table (no Mermaid) |
| 4 | Project structure | `apps/backend/src/` scan | Annotated tree — all controllers / services / repos / routes / middleware / errors / lib / types |
| 5 | Getting Started | AGENTS.md §4, `.env.example` | install → copy env → migrate → generate → dev |
| 6 | Environment variables | `.env.example`, `src/server.ts` | `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `PORT`, `NODE_ENV` |
| 7 | Available scripts | `package.json` | dev, build, start, test, test:coverage, lint, tsc + Prisma commands |
| 8 | API reference | `src/app.ts` + route files | **4 auth routes** (no forgot/reset), 5 notes, 4 tags, 1 search, 3 sharing, 3 versions |
| 9 | Database schema | `prisma/schema.prisma` | 6 models with actual column names from schema |
| 10 | Auth design | AGENTS.md §7, route + middleware scan | Token table, rotation, logout, `sub` claim, rate limiting details |
| 11 | Error handling | `domain-errors.ts`, `error.middleware.ts` | Full 3-category table (Zod, AppError subclasses, fallback 500) |
| 12 | Middleware stack | `src/app.ts` | `helmet → cors → express.json() → routes → errorHandler` |
| 13 | Testing | `vitest.config.ts`, integration test comment | Unit vs integration table + full test DB setup steps |
| 14 | Coding conventions | backend CLAUDE.md anti-patterns | 8 rules pulled from anti-patterns list |

**Accuracy constraints (verified against source):**

| Fact | Source | Value |
|------|--------|-------|
| Default port | `src/server.ts` | `3000` |
| Auth routes implemented | `src/routes/auth.routes.ts` | register, login, logout, refresh |
| Auth routes NOT implemented | Same | forgot-password, reset-password |
| Rate limit (auth) | `src/routes/auth.routes.ts` | 15 min / 20 req; skips in `test` |
| Rate limit (public) | `src/routes/share-link.routes.ts` | 15 min / 60 req; skips in `test` |
| JWT subject claim | `src/middleware/auth.middleware.ts` | `payload.sub` |
| Error codes | `src/middleware/error.middleware.ts`, `domain-errors.ts` | See §2c |
| DB table names | `prisma/schema.prisma` `@@map()` | users, refresh_tokens, notes, tags, share_links, note_versions |

### 3b. `apps/backend/.env.test.example`

```bash
# Test database — separate from the development DB
DATABASE_URL="postgresql://user:password@localhost:5432/note_taking_test"

# Must match the value hard-coded in vitest.config.ts
ACCESS_TOKEN_SECRET="test-secret-do-not-use-in-production"

NODE_ENV=test
```

---

## 4. Section 13 — Testing (detailed content)

### Unit tests

```bash
pnpm --filter backend test
```

Files matching `*.service.test.ts` or `*.repository.test.ts` — repositories mocked with Vitest.
`ACCESS_TOKEN_SECRET` is injected by `vitest.config.ts` automatically.

### Integration tests

```bash
pnpm --filter backend test
pnpm --filter backend test:coverage   # with v8 coverage (target ≥ 80%)
```

Files matching `*.integration.test.ts` — hit a real PostgreSQL database. Require one-time setup:

```bash
# 1. Create the test database
createdb note_taking_test

# 2. Create the test environment file
cp apps/backend/.env.test.example apps/backend/.env.test
# Edit .env.test: replace user:password with your PostgreSQL credentials

# 3. Apply migrations to the test database
dotenv -e apps/backend/.env.test -- \
  npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma

# 4. Run all tests (unit + integration)
pnpm --filter backend test
```

> Tests clean up before each run (`deleteMany` on all tables in `beforeEach`). No manual teardown needed.

---

## 5. Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Omit `/auth/forgot-password` and `/auth/reset-password` | Not implemented in routes — documenting non-existent endpoints misleads contributors |
| Include all three error handler categories | `ZodError` and fallback 500 are handled differently from `AppError`; the table is the only place this is documented |
| Specify `sub` JWT claim | Not obvious from the surface API; contributors writing auth tests or decoding tokens need this |
| Document per-route rate limit detail | Knowing which routes are rate-limited (and that they skip in `test`) prevents confusion when running load tests or integration tests |
| No Mermaid diagram | Root README already has it; audience (backend contributors) doesn't need it repeated |
| Text-only API reference (no JSON bodies) | `openspec/openapi.yaml` is the schema source of truth; duplicating here creates drift risk |

---

## 6. What the Current Draft README Is Missing

`apps/backend/README.md` was drafted earlier and needs these corrections before commit:

| Gap | Fix |
|-----|-----|
| Lists `/auth/forgot-password` and `/auth/reset-password` | Remove — not implemented |
| Rate limiting section only says "auth endpoints" | Add per-route detail and `skip: test` note |
| Error table missing `ZodError` and fallback 500 | Add both with status + code |
| No mention of `sub` JWT claim | Add to Auth design section |
| Missing test DB setup | Add full steps from §4 |
| Missing `.env.test.example` | Create the file |

---

## 7. No Code Quality Gates Required

Documentation-only ticket — TypeScript, linting, and test gates do not apply.

Accuracy verification before commit:

```bash
# Confirm scripts match package.json
grep -A 12 '"scripts"' apps/backend/package.json

# Confirm port default
grep 'PORT' apps/backend/src/server.ts

# Confirm auth routes (no forgot/reset)
cat apps/backend/src/routes/auth.routes.ts

# Confirm domain error classes and codes
grep -E 'class|super\(' apps/backend/src/errors/domain-errors.ts

# Confirm DB table @@map values
grep '@@map' apps/backend/prisma/schema.prisma

# Confirm ACCESS_TOKEN_SECRET value in vitest config
grep 'ACCESS_TOKEN_SECRET' apps/backend/vitest.config.ts
```

---

## 8. Out of Scope

| Item | Reason |
|------|--------|
| Mermaid diagram | Root README covers it |
| JSON API request/response examples | `openspec/openapi.yaml` is the source of truth |
| Docker / deployment guide | Not in FRS |
| CI/CD badges | No pipeline |
| Frontend env vars | Wrong audience |
| Implementing `/auth/forgot-password` | Separate ticket (AB-1003) |

---

## 9. Task Checklist

- [ ] **T01** Overwrite `apps/backend/README.md` — 14 sections per §3a; fixes per §6
  - Remove non-implemented auth routes
  - Add granular rate limit detail
  - Expand error table to all three categories
  - Add `sub` JWT claim detail
  - Add test DB setup steps

- [ ] **T02** Create `apps/backend/.env.test.example` — content per §3b

- [ ] **T03** Accuracy verification pass — all 6 commands in §7

- [ ] **T04** Commit
  ```
  docs(infra): add backend README and .env.test.example
  ```
