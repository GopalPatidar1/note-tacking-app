# Note Taking Application — Project Reference

## Purpose

A secure, full-stack note-taking platform where authenticated users can create, organize, search, share, and manage notes with full version history. Tag-based organization, PostgreSQL full-text search, public share links with optional expiry, and per-save version snapshots with restore capability.

---

## Tech Stack

| Layer      | Technology                                                         |
|------------|--------------------------------------------------------------------|
| Frontend   | React 19, TypeScript, Vite, TanStack Query, Zustand, TipTap, shadcn/ui |
| Backend    | Node.js 22, Express 5, TypeScript                                  |
| Database   | PostgreSQL 16, Prisma ORM                                          |
| Testing    | Vitest, Supertest, Playwright                                      |
| Monorepo   | pnpm workspaces                                                    |

---

## Repository Layout

```
/apps
  /frontend      React 19 + Vite SPA
  /backend       Express 5 REST API
/packages
  /shared        Zod schemas, DTOs, API types, enums, constants
/openspec        OpenAPI specification
/docs            FRS.md (requirements), SDS.md (design spec)
```

---

## Architecture

### Backend layering (strict — no layer skipping)

```
Request → Controller → Service → Repository → Prisma → PostgreSQL
```

- **Controller** — parse/validate input (Zod), call service, return HTTP response
- **Service** — business logic only; no Prisma calls
- **Repository** — all Prisma queries; no business logic
- Controllers never call Prisma directly.

### Shared package

`packages/shared` is the single source of truth for anything used by more than one app:
Zod schemas, inferred DTOs, API types, enums, and constants (token TTLs, pagination defaults, retention window).
No type duplication between apps.

---

## API Conventions

- Base path: `/api`
- Format: REST, JSON only
- Methods: `POST` create · `GET` read · `PATCH` partial update · `DELETE` remove
- Success envelope: `{ "data": { ... } }`
- Error envelope: `{ "error": { "message": "...", "code": "..." } }`
- All list endpoints accept `page` + `limit` query params
- Standard status codes: `200` OK · `201` Created · `400` Validation · `401` Unauthenticated · `403` Forbidden · `404` Not found · `409` Conflict

---

## Auth Design

| Concern         | Detail                                                                 |
|-----------------|------------------------------------------------------------------------|
| Registration    | bcrypt-hashed password; returns access + refresh tokens                |
| Access token    | JWT, 15-minute TTL                                                     |
| Refresh token   | Opaque, 7-day TTL, stored in `refresh_tokens` table                    |
| Token rotation  | Refresh token invalidated on use; new pair issued                      |
| Logout          | Deletes refresh token row                                              |
| Password reset  | OTP flow: generate → log to console → validate → update hash (10 min TTL, stored in `password_reset_otps`) |
| Authorization   | All note/tag/version queries filter by `userId`                        |
| Rate limiting   | Applied on auth endpoints                                              |

---

## Database Schema (summary)

| Table                 | Key columns                                               | Notes                      |
|-----------------------|-----------------------------------------------------------|----------------------------|
| `users`               | id, name, email, passwordHash, createdAt, updatedAt       |                            |
| `refresh_tokens`      | id, userId, token, expiresAt, createdAt                   | Deleted on logout/rotation |
| `password_reset_otps` | id, userId, otp, expiresAt, usedAt                        | 10-min TTL                 |
| `notes`               | id, userId, title, content, deletedAt, createdAt, updatedAt | `deletedAt` = soft delete |
| `tags`                | id, userId, name, color                                   | User-scoped                |
| `note_tags`           | noteId, tagId                                             | Join table                 |
| `share_links`         | id, noteId, token, expiresAt, revokedAt, viewCount        | View count incremented atomically |
| `note_versions`       | id, noteId, title, content, versionNumber, createdAt      | Snapshot on every save     |

**Full-text search index:** `tsvector(title || content)` via `to_tsvector()` / `plainto_tsquery()` / `ts_headline()`

---

## Domain Rules

- **Soft deletes only** — notes are never hard-deleted; `deletedAt` is set. Purge is automated after 30 days.
- **Version on every save** — create, update, and restore all write a new `note_versions` snapshot. Original snapshots are immutable.
- **User-scoped resources** — notes, tags, versions, and share links always query-filtered by `userId`.
- **No raw Prisma errors to client** — services throw domain errors; controllers map them to HTTP status + error envelope.
- **View count** — `share_links.viewCount` incremented atomically on every public read.

---

## Coding Standards

- TypeScript strict mode throughout — no `any`, no implicit types.
- Zod schemas from `packages/shared` — never define the same type in two places.
- Naming: `camelCase` variables/functions · `PascalCase` classes/types · `kebab-case` files.
- Error handling: throw domain errors in services; controllers catch and map to HTTP.
- No email delivery — OTP is logged to console only.
- No real-time features (no WebSockets, no SSE).
- No OAuth — email/password only.
- Tags are flat — no nested folders.
- Text content only — no file uploads.

---

## Quality Standards

Coverage target: **≥ 80%**

| Test type        | Tool              | Scope                                        |
|------------------|-------------------|----------------------------------------------|
| Unit             | Vitest            | Service layer in isolation (mock repositories) |
| Integration      | Vitest + Supertest| Controllers + repositories against real test DB |
| E2E              | Playwright        | Full user journeys from browser               |

### Quality gates (run in order before every commit)

```bash
pnpm tsc --noEmit               # 1. type-check — fix all errors first
pnpm --filter backend lint      # 2. lint backend
pnpm --filter frontend lint     # 3. lint frontend
pnpm --filter backend test      # 4. unit + integration tests
pnpm --filter frontend test     # 5. frontend unit tests
pnpm --filter backend build     # 6. build check
```

Do not commit if any gate fails. Do not use `--no-verify`.

---

## Non-Functional Requirements

| Category    | Requirement                                    |
|-------------|------------------------------------------------|
| Security    | JWT auth, bcrypt passwords, refresh token rotation, rate limiting, Zod input validation |
| Performance | Search < 500 ms · CRUD < 300 ms · pagination on all list endpoints |
| Reliability | 30-day soft-delete recovery window · transactional operations where required |
| Deployment  | Node.js 22, PostgreSQL 16, environment-based config, no external search service |

---

## Out of Scope

- Real-time collaboration
- File uploads
- Mobile application
- OAuth / social login
- Nested folders
- Email delivery service
