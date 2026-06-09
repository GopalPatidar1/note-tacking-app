# AGENTS.md — Note Taking Application

## 1. Project Overview

A secure, full-stack note-taking platform where authenticated users can create, organize, search, share, and manage notes with full version history. The system supports tag-based organization, PostgreSQL full-text search, public share links with expiry, and per-save version snapshots with restore capability.

---

## 2. Repository Structure

```
/apps
  /frontend        React 19 + Vite SPA
  /backend         Express 5 REST API
/packages
  /shared          Zod schemas, DTOs, API types, enums, constants — single source of truth
/openspec          OpenAPI specification
/docs              FRS.md (requirements), SDS.md (design spec)
```

---

## 3. Tech Stack

| Layer      | Technology                                        |
|------------|---------------------------------------------------|
| Frontend   | React 19, TypeScript, Vite, TanStack Query, Zustand, TipTap, shadcn/ui |
| Backend    | Node.js 22, Express 5, TypeScript                 |
| Database   | PostgreSQL 16, Prisma ORM                         |
| Testing    | Vitest, Supertest, Playwright                     |
| Monorepo   | pnpm workspaces                                   |

---

## 4. Key Commands

```bash
# Install all dependencies
pnpm install

# Dev servers
pnpm --filter frontend dev
pnpm --filter backend dev

# Build
pnpm --filter frontend build
pnpm --filter backend build

# Tests
pnpm --filter backend test          # unit + integration (Vitest + Supertest)
pnpm --filter frontend test         # unit (Vitest)
pnpm test:e2e                       # Playwright E2E

# Lint / type-check
pnpm --filter backend lint
pnpm --filter frontend lint
pnpm tsc --noEmit
```

---

## 5. Architecture Patterns

Strict layered architecture on the backend:

```
Request → Controller → Service → Repository → Prisma → PostgreSQL
```

- **Controller**: parse/validate request (Zod), call service, return response
- **Service**: business logic, no DB calls directly
- **Repository**: all Prisma queries, no business logic
- **No layer skipping** — controllers never call Prisma directly

---

## 6. Coding Standards

- **Language**: TypeScript throughout (no `any`, no implicit types)
- **Validation**: Zod schemas from `packages/shared` — never duplicate types
- **Naming**: camelCase for variables/functions, PascalCase for classes/types, kebab-case for files
- **Error handling**: throw domain errors in services; controllers catch and map to HTTP status
- **Response shape** (success):
  ```json
  { "data": { ... } }
  ```
- **Response shape** (error):
  ```json
  { "error": { "message": "...", "code": "..." } }
  ```
- **Soft deletes**: set `deletedAt` timestamp — never hard-delete notes
- **Pagination**: all list endpoints accept `page` + `limit` query params

---

## 7. Auth Approach

- **Registration/Login**: bcrypt-hashed passwords; returns `accessToken` (15 min JWT) + `refreshToken` (7 days, stored in `refresh_tokens` table)
- **Token rotation**: refresh token is invalidated on use and replaced
- **Logout**: deletes refresh token row from DB
- **Password reset**: OTP flow — generate OTP → log to console → validate → update hash (OTP expires in 10 min, stored in `password_reset_otps`)
- **Authorization**: all note/tag/version endpoints are user-scoped — queries always filter by `userId`
- **Rate limiting**: applied on auth endpoints

---

## 8. API Design Conventions

- REST, JSON only, all routes prefixed with `/api` (assumed)
- HTTP methods: `POST` create, `GET` read, `PATCH` partial update, `DELETE` remove
- Standard status codes: `200` OK, `201` Created, `400` Validation error, `401` Unauthenticated, `403` Forbidden, `404` Not found, `409` Conflict (duplicate email)
- Search endpoint: `GET /search?q=&page=&limit=` — returns results with `ts_headline` highlights
- Public share: `GET /public/:token` — unauthenticated, read-only

**Endpoints summary:**
```
POST   /auth/register
POST   /auth/login
POST   /auth/logout
POST   /auth/forgot-password
POST   /auth/reset-password

GET    /notes               ?page&limit&sort&filter
GET    /notes/:id
POST   /notes
PATCH  /notes/:id
DELETE /notes/:id

GET    /tags
POST   /tags
PATCH  /tags/:id
DELETE /tags/:id

GET    /search?q=&page=&limit=

POST   /notes/:id/share
GET    /public/:token
DELETE /share/:id

GET    /notes/:id/versions
GET    /notes/:id/versions/:versionId
POST   /notes/:id/versions/:versionId/restore
```

---

## 9. DB Schema Summary

| Table                  | Key Columns                                                    | Notes                        |
|------------------------|----------------------------------------------------------------|------------------------------|
| `users`                | id, name, email, passwordHash, createdAt, updatedAt            |                              |
| `refresh_tokens`       | id, userId, token, expiresAt, createdAt                        | Deleted on logout/rotation   |
| `password_reset_otps`  | id, userId, otp, expiresAt, usedAt                             | 10-min TTL                   |
| `notes`                | id, userId, title, content, deletedAt, createdAt, updatedAt    | `deletedAt` = soft delete    |
| `tags`                 | id, userId, name, color                                        | User-scoped                  |
| `note_tags`            | noteId, tagId                                                  | Join table                   |
| `share_links`          | id, noteId, token, expiresAt, revokedAt, viewCount             | Atomic view count            |
| `note_versions`        | id, noteId, title, content, versionNumber, createdAt           | Snapshot on every save       |

**Search index**: `tsvector(title || content)` using `to_tsvector()` / `plainto_tsquery()` / `ts_headline()`

---

## 10. Testing Approach

- **Unit tests** (Vitest): service layer in isolation — mock repositories
- **Integration tests** (Vitest + Supertest): controllers + repositories against a real test DB
- **E2E tests** (Playwright): full user journeys from browser
- **Coverage target**: ≥ 80%
- Tests live alongside source: `*.test.ts` co-located or in `__tests__/` directories
- Run all backend tests: `pnpm --filter backend test`
- Run E2E: `pnpm test:e2e`

---

## 11. Do NOT Do

- **No type duplication** — all shared types, schemas, and enums live in `packages/shared` only
- **No hard deletes on notes** — always set `deletedAt`; purge logic is automated, not manual
- **No direct Prisma calls from controllers** — must go through service → repository
- **No `any` types** — TypeScript strict mode throughout
- **No email delivery** — OTP is logged to console only (out of scope)
- **No real-time features** — no WebSockets, no SSE (out of scope)
- **No OAuth** — email/password only (out of scope)
- **No nested folders** — tags are flat (out of scope)
- **No file uploads** — text content only (out of scope)
- **Do not skip version snapshots** — every note save (create + update + restore) must write to `note_versions`
- **Do not expose raw Prisma errors** to the client — map to domain errors in the service layer

---

## 12. Shared Package (`packages/shared`)

Single source of truth for cross-cutting concerns shared between frontend and backend:

- **Zod schemas** — request/response validation (used by both controller and frontend forms)
- **DTOs** — typed request/response shapes inferred from Zod schemas
- **API types** — shared TypeScript interfaces for API contracts
- **Enums** — e.g. sort directions, filter types
- **Constants** — token expiry values, pagination defaults, retention windows

> Rule: if a type or constant is used by more than one app, it belongs in `packages/shared`.
