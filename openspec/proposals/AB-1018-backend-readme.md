# Spec Proposal — AB-1018: Backend README

**Date:** 2026-06-16
**Author:** gopalp@mindfiresolutions.com
**Scope:** Documentation only — `apps/backend/README.md` + `apps/backend/.env.test.example`
**Status:** DRAFT

---

## 1. Summary

Create a comprehensive `README.md` inside `apps/backend/` that serves as the authoritative reference for backend engineers working on the Express 5 / Prisma / PostgreSQL layer.

The README targets **backend contributors only** — frontend developers use the root `README.md` or `openspec/openapi.yaml` for API integration. DevOps context is out of scope.

Two files are produced by this ticket:

| File | Action |
|------|--------|
| `apps/backend/README.md` | **CREATE** |
| `apps/backend/.env.test.example` | **CREATE** |

`apps/backend/.env.example` already exists and is not modified.

No source code, API contracts, database schema, or TypeScript interfaces are changed.

---

## 2. OpenAPI Contract Delta

None. This is a documentation-only ticket.

---

## 3. Clarifying Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Primary audience | Backend contributors only | Frontend devs use root README + OpenAPI spec; no need to duplicate CORS/frontend env details here |
| `.env.example` | Already exists — create `.env.test.example` instead | Integration tests load `.env.test`; engineers need a template to know required vars |
| API endpoint examples | Table + envelope shapes only | Full schemas are in `openspec/openapi.yaml`; JSON examples would duplicate that source |
| Test database setup | Include full setup steps | Integration tests require a real PostgreSQL DB; omitting this blocks first-time contributors from running tests |

---

## 4. README Section Plan

Sections in this order:

| # | Section | Source of truth |
|---|---------|----------------|
| 1 | Title + one-liner | Ticket title + AGENTS.md §1 |
| 2 | Tech stack table | AGENTS.md §3 |
| 3 | Architecture (layered, text only) | AGENTS.md §5, backend CLAUDE.md |
| 4 | Project structure (annotated file tree) | Current `apps/backend/src/` directory |
| 5 | Getting Started (dev setup) | AGENTS.md §4, `.env.example` |
| 6 | Environment variables table | `.env.example`, `src/server.ts` |
| 7 | Available scripts | `apps/backend/package.json` |
| 8 | API reference (tables, no JSON examples) | AGENTS.md §8, `src/routes/`, `src/app.ts` |
| 9 | Database schema | `prisma/schema.prisma` |
| 10 | Auth design | AGENTS.md §7, `src/services/auth.service.ts` |
| 11 | Error handling (domain error table) | `src/errors/domain-errors.ts` |
| 12 | Middleware stack | `src/app.ts` |
| 13 | Testing (unit + integration + test DB setup) | `vitest.config.ts`, `src/__tests__/auth.integration.test.ts` |
| 14 | Coding conventions | AGENTS.md §6, backend CLAUDE.md anti-patterns |

---

## 5. Content Decisions

### 5a. Architecture section

Text-only layered description — no Mermaid diagram. The root `README.md` already contains the full Mermaid architecture diagram; repeating it in the backend README adds noise without adding information for the target audience.

```
Request → Controller → Service → Repository → Prisma → PostgreSQL
```

Table: Layer → Responsibility

### 5b. API reference

One table per domain group (Auth, Notes, Tags, Search, Sharing, Version History).
Columns: Method · Path · Auth · Description.
No JSON request/response bodies — full schemas are in `openspec/openapi.yaml`.

**Response envelopes** (shown once, not repeated per endpoint):
```json
// Success
{ "data": { ... } }

// Error
{ "error": { "message": "...", "code": "..." } }
```

### 5c. Error handling table

Map every `AppError` subclass from `src/errors/domain-errors.ts` to its HTTP status and error code:

| Class | Status | Code |
|-------|--------|------|
| `EmailConflictError` | 409 | `EMAIL_CONFLICT` |
| `InvalidCredentialsError` | 401 | `INVALID_CREDENTIALS` |
| `InvalidRefreshTokenError` | 401 | `INVALID_REFRESH_TOKEN` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `ShareLinkInvalidError` | 404 | `SHARE_LINK_INVALID` |

### 5d. Test database setup

Integration tests load `.env.test` via `dotenv` at the top of each integration test file. Engineers must provision a separate test DB before running tests.

Document these steps in the Testing section:

```bash
# 1. Create the test database
createdb note_taking_test

# 2. Create the test environment file
cp apps/backend/.env.test.example apps/backend/.env.test
# Edit .env.test: set DATABASE_URL to the test DB

# 3. Run migrations against the test DB
dotenv -e apps/backend/.env.test -- npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma

# 4. Run tests
pnpm --filter backend test
```

### 5e. `.env.test.example` content

```bash
# Test database — separate from development DB
DATABASE_URL="postgresql://user:password@localhost:5432/note_taking_test"

# Must match ACCESS_TOKEN_SECRET used when signing tokens in tests
# vitest.config.ts already sets this to "test-secret-do-not-use-in-production"
ACCESS_TOKEN_SECRET="test-secret-do-not-use-in-production"

NODE_ENV=test
```

---

## 6. Out of Scope

| Item | Reason |
|------|--------|
| Mermaid architecture diagram | Root README already has it; duplication adds noise |
| JSON request/response examples | Full schemas are in `openspec/openapi.yaml` |
| Docker / deployment guide | Not in FRS; not requested |
| CI/CD pipeline reference | No pipeline exists |
| Frontend env vars | Target audience is backend contributors only |
| Shields.io badges | No CI pipeline to link to |

---

## 7. Task Checklist

- [ ] **T01** Create `apps/backend/README.md`
  - Sections 1–14 in order per §4
  - API tables: no JSON examples, envelope shapes once
  - Error table from §5c
  - Test DB setup steps from §5d

- [ ] **T02** Create `apps/backend/.env.test.example`
  - Content per §5e

- [ ] **T03** Verify internal accuracy
  - Commands match `apps/backend/package.json` scripts exactly
  - Port default (3000) matches `src/server.ts`
  - Domain error classes match `src/errors/domain-errors.ts`
  - DB table names match `prisma/schema.prisma` `@@map()` values
  - Test DB steps match the setup comment in `src/__tests__/auth.integration.test.ts`

- [ ] **T04** Commit
  ```
  docs(infra): add backend README and .env.test.example
  ```
