# Note Taking Application

A secure, full-stack note-taking platform where authenticated users can create, organize, search, share, and manage notes with full version history.

---

## Features

- **Secure authentication** — JWT access tokens, opaque refresh tokens with rotation, rate-limited auth endpoints
- **Notes CRUD** — rich-text editing via TipTap, full create/read/update/soft-delete lifecycle
- **Tag-based organization** — user-scoped, color-coded tags with note count display
- **Full-text search** — PostgreSQL `tsvector` search with `ts_headline` keyword highlights
- **Public share links** — shareable URLs with optional expiry, view count tracking, and revocation
- **Version history** — automatic snapshot on every save, full version list, and one-click restore
- **Soft-delete with recovery** — deleted notes retained for 30 days before automated purge

---

## Tech Stack

| Layer      | Technology                                                              |
|------------|-------------------------------------------------------------------------|
| Frontend   | React 19, TypeScript, Vite, TanStack Query, Zustand, TipTap, shadcn/ui |
| Backend    | Node.js 22, Express 5, TypeScript                                       |
| Database   | PostgreSQL 16, Prisma ORM                                               |
| Testing    | Vitest, Supertest, Playwright                                           |
| Monorepo   | pnpm workspaces                                                         |

---

## Architecture

```mermaid
flowchart TD
    A[Browser] --> B[React SPA<br/>Vite · TanStack Query · Zustand · TipTap]
    B --> C[Express 5 REST API<br/>Node.js 22 · TypeScript]
    C --> D[Controller Layer<br/>Zod validation]
    D --> E[Service Layer<br/>Business logic]
    E --> F[Repository Layer<br/>Prisma queries]
    F --> G[(PostgreSQL 16<br/>Full-text search · Soft deletes)]
```

The backend follows a strict layered architecture — no layer may be skipped:

```
Request → Controller → Service → Repository → Prisma → PostgreSQL
```

- **Controller** — parses and validates input (Zod), calls service, returns HTTP response
- **Service** — business logic only; never calls Prisma directly
- **Repository** — all Prisma queries; no business logic

---

## Repository Structure

```
/apps
  /frontend        React 19 + Vite SPA
  /backend         Express 5 REST API
  /e2e             Playwright E2E test suite
/packages
  /shared          Zod schemas, DTOs, API types, enums, constants — single source of truth
/openspec          OpenAPI specification and change proposals
/docs              FRS.md (requirements), SDS.md (design spec)
```

> `packages/shared` is the single source of truth for anything used by more than one app. No type duplication between apps is permitted.

---

## Prerequisites

- **Node.js** 22+
- **pnpm** 9+
- **PostgreSQL** 16+ (must be running locally before migrations)

---

## Getting Started

```bash
# 1. Clone the repository
git clone <repo-url>
cd note-taking-app

# 2. Install all dependencies
pnpm install

# 3. Create the backend environment file
cp apps/backend/.env.example apps/backend/.env
# Edit apps/backend/.env and set DATABASE_URL and ACCESS_TOKEN_SECRET

# 4. Run database migrations
pnpm --filter backend exec prisma migrate dev

# 5. Generate the Prisma client
pnpm --filter backend exec prisma generate

# 6. Start the dev servers (two separate terminals)
pnpm --filter backend dev    # API server → http://localhost:3000
pnpm --filter frontend dev   # React SPA  → http://localhost:5173
```

---

## Environment Variables

### Backend (`apps/backend/.env`)

A template is provided at `apps/backend/.env.example`.

| Variable              | Required | Description                                                        |
|-----------------------|----------|--------------------------------------------------------------------|
| `DATABASE_URL`        | Yes      | PostgreSQL connection string — `postgresql://user:password@localhost:5432/note_taking_dev` |
| `ACCESS_TOKEN_SECRET` | Yes      | Secret for signing JWT access tokens — use a long random string in production |
| `PORT`                | No       | API server port (default: `3000`)                                  |
| `NODE_ENV`            | No       | Runtime environment: `development`, `production`, or `test`        |

> Refresh tokens are opaque random hex strings (`crypto.randomBytes(32)`) stored in the database — no separate refresh token secret is required.

### Frontend (`apps/frontend/.env`)

| Variable       | Required | Description                           |
|----------------|----------|---------------------------------------|
| `VITE_API_URL` | Yes      | Backend API base URL — `http://localhost:3000/api` |

---

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Start backend dev server | `pnpm --filter backend dev` | tsx watch on `src/server.ts`, port 3000 |
| Start frontend dev server | `pnpm --filter frontend dev` | Vite HMR, port 5173 |
| Build shared package + backend | `pnpm build` | Compiles `@note-app/shared` then backend |
| Type-check all packages | `pnpm tsc` | `tsc --noEmit` across the monorepo |
| Lint backend | `pnpm --filter backend lint` | ESLint on `src/` |
| Lint frontend | `pnpm --filter frontend lint` | ESLint on `src/` |
| Unit + integration tests | `pnpm --filter backend test` | Vitest + Supertest against test DB |
| Frontend unit tests | `pnpm --filter frontend test` | Vitest |
| E2E tests | `pnpm test:e2e` | Playwright (requires both servers running) |
| Backend test coverage | `pnpm --filter backend test:coverage` | Vitest with v8 coverage |

---

## API Reference

All routes are prefixed with `/api`. Authenticated routes require `Authorization: Bearer <accessToken>`.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | No | Register with name, email, and password |
| `POST` | `/api/auth/login` | No | Login; returns `accessToken` (15 min) + `refreshToken` (7 days) |
| `POST` | `/api/auth/logout` | Yes | Invalidate and delete the refresh token |
| `POST` | `/api/auth/refresh` | No | Exchange a valid refresh token for a new token pair (old token invalidated) |

### Notes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/notes` | Yes | List notes with `page`, `limit`, `sort`, and `filter` query params |
| `GET` | `/api/notes/:id` | Yes | Get a single note by ID |
| `POST` | `/api/notes` | Yes | Create a note; writes an initial version snapshot |
| `PATCH` | `/api/notes/:id` | Yes | Update a note; writes a new version snapshot |
| `DELETE` | `/api/notes/:id` | Yes | Soft-delete a note (sets `deletedAt`; retained 30 days) |

### Tags

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/tags` | Yes | List the authenticated user's tags with per-tag note counts |
| `POST` | `/api/tags` | Yes | Create a tag with a name and hex color |
| `PATCH` | `/api/tags/:id` | Yes | Update a tag's name or color |
| `DELETE` | `/api/tags/:id` | Yes | Delete a tag |

### Search

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/search?q=&page=&limit=` | Yes | Full-text search across note title and content; returns results with `ts_headline` highlights |

### Sharing

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/notes/:id/share` | Yes | Generate a public share link with an optional `expiresAt` |
| `GET` | `/api/public/:token` | No | Read-only public note view; increments `viewCount` atomically |
| `DELETE` | `/api/share/:id` | Yes | Revoke a share link |

### Version History

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/notes/:id/versions` | Yes | List all version snapshots for a note |
| `GET` | `/api/notes/:id/versions/:versionId` | Yes | Get a single historical version |
| `POST` | `/api/notes/:id/versions/:versionId/restore` | Yes | Restore a version; writes a new snapshot (original versions unchanged) |

#### Response Envelopes

Success:
```json
{ "data": { ... } }
```

Error:
```json
{ "error": { "message": "...", "code": "..." } }
```

Standard status codes: `200` OK · `201` Created · `400` Validation · `401` Unauthenticated · `403` Forbidden · `404` Not found · `409` Conflict

---

## Database Schema

| Table           | Key Columns                                                    | Notes                              |
|-----------------|----------------------------------------------------------------|------------------------------------|
| `users`         | id, name, email, passwordHash, createdAt, updatedAt            |                                    |
| `refresh_tokens`| id, userId, token, expiresAt, createdAt                        | Deleted on logout or rotation      |
| `notes`         | id, userId, title, content, deletedAt, createdAt, updatedAt    | `deletedAt` = soft delete          |
| `tags`          | id, userId, name, color, createdAt                             | User-scoped                        |
| `note_tags`     | noteId, tagId                                                  | Implicit Prisma many-to-many join  |
| `share_links`   | id, noteId, token, expiresAt, revokedAt, viewCount, createdAt  | `viewCount` incremented atomically |
| `note_versions` | id, noteId, title, content, versionNumber, createdAt           | Immutable snapshot on every save   |

**Full-text search index:** `GIN` index on `tsvector(title || content)` using `to_tsvector()`, `plainto_tsquery()`, and `ts_headline()`.

---

## Auth Flow

| Token | Type | TTL | Storage |
|-------|------|-----|---------|
| Access token | JWT (signed with `ACCESS_TOKEN_SECRET`) | 15 minutes | Client memory / localStorage |
| Refresh token | Opaque hex (`crypto.randomBytes(32)`) | 7 days | `refresh_tokens` table |

**Registration / Login** — bcrypt-hashed password stored; both return an access + refresh token pair.

**Token rotation** — on every `/auth/refresh` call the old refresh token is deleted and a new pair is issued. Replaying an old refresh token returns `401`.

**Logout** — deletes the refresh token row; the access token expires naturally after 15 minutes.

**Authorization** — all note, tag, version, and share link queries are scoped by `userId`. Users can only access their own resources.

---

## Testing

| Type | Tool | Scope |
|------|------|-------|
| Unit | Vitest | Service layer in isolation — repositories mocked |
| Integration | Vitest + Supertest | Controllers + repositories against a real test database |
| E2E | Playwright | Full user journeys from a real browser (Chromium) |

**Coverage target:** ≥ 80%

```bash
# Unit + integration (backend)
pnpm --filter backend test

# Unit (frontend)
pnpm --filter frontend test

# E2E (requires backend :3000 + frontend :5173 running)
pnpm test:e2e
```

E2E tests cover: auth flows, notes CRUD, search with highlights, share link generation and revocation, tag assignment, and version restore.

---

## Quality Gates

Run in this order before every commit. Do not commit if any step fails.

```bash
pnpm tsc --noEmit               # 1. type-check — fix all errors first
pnpm --filter backend lint      # 2. lint backend
pnpm --filter frontend lint     # 3. lint frontend
pnpm --filter backend test      # 4. unit + integration tests
pnpm --filter frontend test     # 5. frontend unit tests
pnpm --filter backend build     # 6. build check
```

---

## Non-Functional Requirements

| Category    | Requirements |
|-------------|--------------|
| Security    | JWT authentication, bcrypt password hashing, refresh token rotation, rate limiting on auth endpoints, Zod input validation on all routes |
| Performance | Search response < 500 ms · CRUD response < 300 ms · pagination on all list endpoints |
| Reliability | 30-day soft-delete recovery window · transactional operations where required |

---

## Out of Scope

- Real-time collaboration (no WebSockets, no SSE)
- File uploads (text content only)
- Mobile application
- OAuth / social login (email + password only)
- Nested folders (tags are flat)
- Email delivery (OTP is logged to console only)

---

## Contributing

### Branch Naming

```
<type>/<ticket-id>-<short-slug>
```

Examples:
```
feat/AB-1002-auth-login
fix/AB-1004-note-soft-delete
chore/AB-1001-monorepo-setup
docs/AB-1017-generate-readme
```

### Commit Message Format

```
<type>(<scope>): <short imperative summary>

[optional body — what and why, not how]
```

**Types:** `feat` · `fix` · `refactor` · `test` · `chore` · `docs`

**Scopes:** `auth` · `notes` · `tags` · `search` · `sharing` · `versions` · `shared` · `infra`

Examples:
```
feat(notes): add soft-delete with 30-day retention
fix(auth): invalidate refresh token on logout
test(tags): add integration tests for tag CRUD
docs(infra): add comprehensive README
```
