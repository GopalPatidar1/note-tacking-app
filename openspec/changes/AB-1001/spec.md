# Specification Delta — AB-1001: Monorepo Setup

**Ticket:** AB-1001  
**Type:** Infrastructure / Setup  
**Status:** COMPLETED  
**Branch:** `feat/AB-1001` (landed in `feat(auth): implement authentication module with monorepo setup`)

---

## 1. Requirements

Derived from `docs/SDS.md` — Monorepo Structure and Tech Stack sections.

| ID | Requirement |
|----|-------------|
| R-01 | Repository MUST use pnpm workspaces with packages in `apps/*` and `packages/*` |
| R-02 | Backend app MUST be an Express 5 + TypeScript application under `apps/backend` |
| R-03 | Frontend app MUST be a React 19 + Vite SPA under `apps/frontend` |
| R-04 | `packages/shared` MUST be the single source of truth for all types, schemas, enums, and constants shared between apps |
| R-05 | TypeScript strict mode MUST be enabled across all packages |
| R-06 | All packages MUST inherit from a root `tsconfig.json` base |
| R-07 | The backend MUST use Prisma ORM against PostgreSQL 16 |
| R-08 | Domain errors MUST be mapped to HTTP responses in a global error middleware; raw Prisma errors MUST NOT reach the client |
| R-09 | Backend app MUST have unit + integration test infrastructure (Vitest + Supertest) |
| R-10 | The `DATABASE_URL` MUST be sourced from environment variables via `dotenv` |

---

## 2. Acceptance Criteria

- [ ] `pnpm install` at the repo root installs all workspace dependencies without errors
- [ ] `pnpm tsc --noEmit` passes with zero TypeScript errors across all packages
- [ ] `pnpm --filter backend build` compiles the backend to `apps/backend/dist/` without errors
- [ ] `pnpm --filter '@note-app/shared' build` compiles the shared package to `packages/shared/dist/` without errors
- [ ] `@note-app/shared` is importable from `apps/backend` using `workspace:*` resolution
- [ ] Prisma client is generated (`prisma generate`) without errors
- [ ] `apps/backend/prisma/schema.prisma` defines `users` and `refresh_tokens` tables as the baseline schema
- [ ] `apps/backend/src/errors/domain-errors.ts` provides `AppError`, `NotFoundError`, `ForbiddenError`, `ValidationError`, `ConflictError`, `UnauthorizedError`
- [ ] Global error middleware returns `{ error: { message, code } }` for all `AppError` subclasses
- [ ] `apps/backend/src/lib/prisma.ts` exports a singleton `PrismaClient` instance
- [ ] `apps/backend/.env.example` documents all required environment variables

---

## 3. Affected Capabilities

This ticket is a prerequisite for all other tickets. It defines no API capabilities itself.

| Ticket | Depends on AB-1001 for |
|--------|------------------------|
| AB-1002 | Auth routes, domain errors, Prisma singleton, shared schemas |
| AB-1003 | Same as AB-1002 |
| AB-1004 | Same + `notes` model added to Prisma schema |
| AB-1006 | Same + `tags`, `note_tags` models |
| AB-1007 | Same + search index on `notes` |
| AB-1008 | Same + `share_links` model |
| AB-1009 | Same + `note_versions` model |
| AB-1010+ | `apps/frontend` scaffold, `@note-app/shared` imports |

---

## 4. User-Facing Behavior

None. This ticket delivers no user-visible functionality. All deliverables are infrastructure.

---

## 5. Technical Impact

### 5a. Files created

| Path | Description |
|------|-------------|
| `pnpm-workspace.yaml` | Workspace package globs |
| `package.json` (root) | Root package with aggregate scripts |
| `tsconfig.json` (root) | Base TypeScript config (strict, ES2022, CommonJS) |
| `.gitignore` | Standard Node + pnpm ignore patterns |
| `apps/backend/package.json` | Backend dependencies + scripts |
| `apps/backend/tsconfig.json` | Extends root; adds `outDir`, `rootDir` |
| `apps/backend/.eslintrc.json` | ESLint config (`@typescript-eslint`) |
| `apps/backend/.env.example` | Required env vars: `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `PORT` |
| `apps/backend/vitest.config.ts` | Vitest configuration |
| `apps/backend/prisma/schema.prisma` | Prisma schema — `users`, `refresh_tokens` tables |
| `apps/backend/src/server.ts` | HTTP server entry point |
| `apps/backend/src/app.ts` | Express app factory with global middleware |
| `apps/backend/src/lib/prisma.ts` | PrismaClient singleton |
| `apps/backend/src/middleware/error.middleware.ts` | Global error handler |
| `apps/backend/src/middleware/auth.middleware.ts` | JWT bearer token verifier stub |
| `apps/backend/src/errors/domain-errors.ts` | Domain error class hierarchy |
| `apps/backend/src/types/express.d.ts` | `req.user` type augmentation |
| `packages/shared/package.json` | `@note-app/shared` package metadata |
| `packages/shared/tsconfig.json` | Extends root; adds `outDir`, `rootDir` |
| `packages/shared/src/index.ts` | Central re-export barrel |
| `packages/shared/src/schemas/` | Directory stub (populated by feature tickets) |
| `packages/shared/src/constants/` | Directory stub (populated by feature tickets) |
| `packages/shared/src/types/` | Directory stub (populated by feature tickets) |

### 5b. OpenAPI impact

No paths or schemas are added by this ticket. The `openspec/openapi.yaml` baseline document is initialized with project metadata, server definition, and empty `components/schemas` and `paths` sections.

### 5c. Database migrations

No migration files are generated by this ticket. The first migration (`prisma migrate dev --name init`) is run during AB-1002 bootstrap to create the `users` and `refresh_tokens` tables.

---

## 6. Dependencies and Assumptions

### Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `pnpm` | 9.x | Workspace package manager |
| `typescript` | ^5.4 | Language (all packages) |
| `express` | ^5.0 | HTTP framework |
| `@prisma/client` | ^5.14 | ORM runtime |
| `prisma` | ^5.14 | ORM CLI (dev) |
| `tsx` | ^4.15 | TypeScript execution in dev (`tsx watch`) |
| `vitest` | ^1.6 | Test runner |
| `supertest` | ^7.0 | HTTP integration test client |
| `zod` | ^3.23 | Schema validation (shared package) |
| `dotenv` | ^16.4 | Environment variable loading |
| `helmet` | ^7.1 | HTTP security headers |
| `cors` | ^2.8 | CORS middleware |

### Assumptions

1. PostgreSQL 16 is running locally and the `DATABASE_URL` in `.env` points to it before any `prisma migrate dev` commands are run.
2. Node.js 22 is installed.
3. `preserveSymlinks` is NOT set in any `tsconfig.json` — it breaks pnpm symlink resolution for Prisma client and `@note-app/shared` (confirmed issue from memory).
4. The shared package uses `main`/`types` pointing to `./src/index.ts` (source, not compiled `dist/`) so no pre-build step is needed during development.
5. Frontend scaffold (`apps/frontend`) is created alongside the first frontend ticket, not in this setup ticket.

---

## 7. Non-Goals

- No API endpoints (all deferred to AB-1002+)
- No database seed data
- No Docker / container setup
- No CI/CD pipeline
- No frontend scaffold (see Assumption 5)
- No production deployment configuration
