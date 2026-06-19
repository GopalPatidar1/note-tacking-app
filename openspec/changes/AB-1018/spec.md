# Specification — AB-1018: Backend README

**Ticket:** AB-1018
**Type:** Documentation
**Status:** COMPLETED
**Branch:** `docs/AB-1018-backend-readme`

---

## 1. Requirements

| ID | Requirement |
|----|-------------|
| R-01 | `apps/backend/README.md` MUST be created (or overwrite an existing draft) |
| R-02 | `apps/backend/.env.test.example` MUST be created for integration test setup |
| R-03 | The README MUST document only the 4 auth routes actually implemented (`/register`, `/login`, `/logout`, `/refresh`) — NOT `/forgot-password` or `/reset-password` |
| R-04 | The README MUST document rate limiting per route group with `skip: test` note |
| R-05 | The README MUST include an error handling table covering all three categories: `ZodError` (400), `AppError` subclasses (varies), and fallback 500 |
| R-06 | The README MUST document that the JWT access token's subject claim (`sub`) is the user ID |
| R-07 | The README MUST include full integration test DB setup steps (`createdb` → `.env.test` → `migrate deploy`) |
| R-08 | The README MUST document the project directory structure (`src/` tree with all layers) |
| R-09 | `.env.test.example` MUST use `ACCESS_TOKEN_SECRET=test-secret-do-not-use-in-production` (matching `vitest.config.ts`) |

---

## 2. Acceptance Criteria

- [ ] `apps/backend/README.md` exists with 14 sections
- [ ] Auth endpoints section lists exactly 4 routes (register, login, logout, refresh); forgot/reset NOT listed
- [ ] Rate limiting section specifies: `authLimiter` (15 min / 20 req, skips in test) for register/login/refresh; `publicLimiter` (15 min / 60 req, skips in test) for `/public/:token`
- [ ] Error handling table includes `ZodError → 400 VALIDATION_ERROR`, each `AppError` subclass, and `any → 500 INTERNAL_ERROR`
- [ ] Auth design section mentions JWT `sub` claim contains user ID
- [ ] Testing section includes full test DB setup steps referencing `.env.test`
- [ ] `apps/backend/.env.test.example` exists with correct `ACCESS_TOKEN_SECRET` value

---

## 3. Affected Capabilities

| Capability | Impact |
|-----------|--------|
| Backend README | New (overwrite draft) — 14-section comprehensive doc |
| Test environment example | New — `apps/backend/.env.test.example` |

No source code, API contracts, database schema, or TypeScript interfaces are changed by this ticket.

---

## 4. Functional Behavior

### README Sections (14)
1. Title + one-liner
2. Tech stack table
3. Architecture (text layered table; no Mermaid — root README has it)
4. Project structure (`apps/backend/src/` annotated tree)
5. Getting Started
6. Environment variables
7. Available scripts
8. API reference (4 auth + 5 notes + 4 tags + 1 search + 3 sharing + 3 versions)
9. Database schema (6 Prisma models with actual `@@map()` table names)
10. Auth design (token TTL, rotation, logout, `sub` claim, rate limiting)
11. Error handling (3-category table)
12. Middleware stack (`helmet → cors → express.json() → routes → errorHandler`)
13. Testing (unit vs integration; test DB setup; `vitest.config.ts` hard-coded secret)
14. Coding conventions (8 rules from anti-patterns list)

### `.env.test.example` content
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/note_taking_test"
ACCESS_TOKEN_SECRET="test-secret-do-not-use-in-production"
NODE_ENV=test
```

### Accuracy Facts
| Fact | Source | Value |
|------|--------|-------|
| Default port | `src/server.ts` | 3000 |
| Auth routes | `src/routes/auth.routes.ts` | register, login, logout, refresh |
| Auth rate limit | `src/routes/auth.routes.ts` | 15 min / 20 req |
| Public rate limit | `src/routes/share-link.routes.ts` | 15 min / 60 req |
| JWT sub claim | `src/middleware/auth.middleware.ts` | `payload.sub` |
| vitest secret | `vitest.config.ts` | `test-secret-do-not-use-in-production` |
| DB table names | `prisma/schema.prisma` | users, refresh_tokens, notes, tags, share_links, note_versions |

---

## 5. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| AB-1001 | Source | Monorepo setup, tsconfig, domain errors |
| AB-1002 | Source | Auth routes, auth middleware, JWT claims |
| AB-1004–AB-1008 | Source | Notes/Tags/Search/Sharing/Versions endpoints |
| AB-1015 | Source | Version history endpoints |
| `apps/backend/src/` | Source | All route files, middleware, error handler |
| `apps/backend/vitest.config.ts` | Source | Hard-coded ACCESS_TOKEN_SECRET for test env |
| AB-1017 | Related | Root README uses Mermaid; backend README uses text table instead |
