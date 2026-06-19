# Spec Proposal — AB-1001: Monorepo Setup

**Date:** 2026-06-09  
**Author:** gopalp@mindfiresolutions.com  
**Scope:** Repository infrastructure, monorepo configuration, backend scaffold, shared package skeleton  
**Status:** COMPLETED

---

## 1. Summary

Establish the foundational pnpm monorepo structure for the note-taking application. This ticket delivers:

- `pnpm workspaces` monorepo with three packages: `apps/backend`, `apps/frontend`, `packages/shared`
- Backend Express 5 application scaffold with TypeScript, ESLint, Vitest, and Prisma
- `@note-app/shared` package as the single source of truth for Zod schemas, DTOs, types, enums, and constants
- Prisma ORM wired to PostgreSQL with the initial `users` and `refresh_tokens` tables
- AI/dev infrastructure: `AGENTS.md`, `CLAUDE.md`, `docs/FRS.md`, `docs/SDS.md`, OpenSpec project

This ticket produces no user-facing API endpoints. All output is consumed by subsequent feature tickets.

---

## 2. Repository Structure Delivered

```
/                          # root workspace (private, pnpm@9)
  package.json             # root scripts: build, tsc, test:e2e
  pnpm-workspace.yaml      # packages: apps/*, packages/*
  tsconfig.json            # root TS config — shared base; strict mode
  .gitignore

/apps/backend/
  package.json             # name: backend; depends on @note-app/shared (workspace:*)
  tsconfig.json            # extends ../../tsconfig.json
  .eslintrc.json
  .env.example
  vitest.config.ts
  prisma/
    schema.prisma          # datasource + generator + User + RefreshToken models
  src/
    server.ts              # HTTP server entry (PORT from env)
    app.ts                 # Express app factory, global middleware, router mount
    lib/
      prisma.ts            # PrismaClient singleton
    middleware/
      error.middleware.ts  # Global error handler — maps domain errors to HTTP
    errors/
      domain-errors.ts     # Base domain error classes (NotFoundError, ForbiddenError, etc.)
    types/
      express.d.ts         # Augments Express.Request with `user: { id: string }`

/packages/shared/
  package.json             # name: @note-app/shared; main/types → ./src/index.ts
  tsconfig.json
  src/
    index.ts               # Re-exports all schemas, constants, types
    schemas/               # Zod schemas (populated by feature tickets)
    constants/             # Shared constants (populated by feature tickets)
    types/                 # Shared TypeScript types (populated by feature tickets)

/docs/
  FRS.md                   # Functional Requirement Specification
  SDS.md                   # Software Design Specification

/openspec/
  openapi.yaml             # OpenAPI 3.0 specification (baseline)
  project.md               # Project reference for AI agents
```

---

## 3. Shared Package Contract

`@note-app/shared` is referenced as `workspace:*` from both `apps/backend` and `apps/frontend`. The package's `main` and `types` fields point directly to `./src/index.ts` — no build step required at runtime during development. The `build` script compiles to `dist/` for production packaging.

**Exports pattern:**
```typescript
// packages/shared/src/index.ts
export * from './schemas/<domain>'
export * from './constants/<domain>'
export * from './types/<domain>'
export { ZodError, z } from 'zod'
```

Rule: any type, schema, or constant used by more than one app MUST live in `packages/shared`. No duplication between `apps/backend` and `apps/frontend`.

---

## 4. Backend Scaffold Design

### 4a. Express app factory (`src/app.ts`)

```
app.use(helmet())
app.use(cors())
app.use(express.json())
app.use('/api/auth', authRouter)       ← mounted by AB-1002
app.use('/api/notes', notesRouter)     ← mounted by AB-1004
app.use('/api/tags', tagsRouter)       ← mounted by AB-1006
...
app.use(errorMiddleware)               ← global error handler (last)
```

### 4b. Domain error hierarchy (`src/errors/domain-errors.ts`)

| Class | HTTP | Used by |
|-------|------|---------|
| `AppError` | — | Base class; carries `message`, `statusCode`, `code` |
| `NotFoundError` | 404 | Notes, tags, versions, share links |
| `ForbiddenError` | 403 | User-scoped resource access violations |
| `ValidationError` | 400 | Zod failures (caught in controller) |
| `ConflictError` | 409 | Duplicate email at registration |
| `UnauthorizedError` | 401 | Invalid / expired tokens |

### 4c. Global error middleware

- Catches any `AppError` subclass → maps `statusCode` + `code` → `{ error: { message, code } }`
- Falls through to 500 for unhandled errors
- Never leaks Prisma error detail to the client

### 4d. Prisma client singleton (`src/lib/prisma.ts`)

```typescript
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
export default prisma
```

Single instance across the application; avoids connection pool exhaustion during hot-reload in dev.

### 4e. Auth middleware stub (`src/middleware/auth.middleware.ts`)

```typescript
// Verifies Bearer JWT; attaches decoded userId to req.user
// Used by all protected routes from AB-1002 onward
```

---

## 5. Initial Prisma Schema

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id           String   @id @default(uuid())
  name         String
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  refreshTokens RefreshToken[]

  @@map("users")
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
}
```

Tables for `notes`, `tags`, `note_tags`, `share_links`, `note_versions`, and `password_reset_otps` are added by subsequent tickets.

---

## 6. Tooling Configuration

| Tool | Config | Purpose |
|------|--------|---------|
| TypeScript | `tsconfig.json` (root, extended) | Strict mode, ES2022, CommonJS |
| ESLint | `apps/backend/.eslintrc.json` | `@typescript-eslint` rules |
| Vitest | `apps/backend/vitest.config.ts` | Unit + integration test runner |
| pnpm | `pnpm-workspace.yaml` | Workspace package resolution |

---

## 7. Out of Scope

- Frontend scaffold (`apps/frontend`) — completed as part of the login/logout flow (concurrent with AB-1002)
- Any API endpoint implementation — deferred to AB-1002 through AB-1009
- Database migration run — `prisma migrate dev` is run as part of AB-1002 bootstrap

---

## 8. Open Questions (resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | Shared package compiled or source? | **Source** (`main` → `./src/index.ts`) — no build step in dev; avoids stale dist |
| 2 | Frontend scaffold in AB-1001 or later? | **Later** — bundled with auth UI (AB-1010 area); backend-first approach |
| 3 | Preserve symlinks in root tsconfig? | **No** — `preserveSymlinks: true` breaks pnpm symlink resolution for Prisma and shared package |
