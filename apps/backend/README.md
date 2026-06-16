# Backend — Note Taking Application

Express 5 REST API for the note-taking platform. Handles authentication, notes, tags, full-text search, public share links, and version history.

---

## Tech Stack

| Concern         | Technology                              |
|-----------------|-----------------------------------------|
| Runtime         | Node.js 22                              |
| Framework       | Express 5                               |
| Language        | TypeScript (strict mode)                |
| Database        | PostgreSQL 16 via Prisma ORM            |
| Auth            | JWT (access) + opaque refresh tokens    |
| Validation      | Zod schemas from `@note-app/shared`     |
| Testing         | Vitest + Supertest                      |

---

## Architecture

Strict layered architecture — no layer may skip another:

```
Request → Controller → Service → Repository → Prisma → PostgreSQL
```

| Layer       | Responsibility                                                        |
|-------------|-----------------------------------------------------------------------|
| Controller  | Parse/validate input (Zod), call service, return HTTP response        |
| Service     | Business logic only — throws domain errors, never calls Prisma        |
| Repository  | All Prisma queries — no business logic, no HTTP concepts              |

---

## Project Structure

```
apps/backend/
├── src/
│   ├── app.ts                  # Express app factory (middleware + route registration)
│   ├── server.ts               # Entry point (binds to PORT)
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── note.controller.ts
│   │   ├── note-version.controller.ts
│   │   ├── search.controller.ts
│   │   ├── share-link.controller.ts
│   │   └── tag.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── note.service.ts
│   │   ├── note-version.service.ts
│   │   ├── search.service.ts
│   │   ├── share-link.service.ts
│   │   └── tag.service.ts
│   ├── repositories/
│   │   ├── note.repository.ts
│   │   ├── note-version.repository.ts
│   │   ├── refresh-token.repository.ts
│   │   ├── search.repository.ts
│   │   ├── share-link.repository.ts
│   │   ├── tag.repository.ts
│   │   └── user.repository.ts
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── note.routes.ts
│   │   ├── search.routes.ts
│   │   ├── share-link.routes.ts
│   │   ├── tag.routes.ts
│   │   └── version.routes.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts   # Verifies JWT; injects req.user.id
│   │   └── error.middleware.ts  # Maps domain errors to HTTP responses
│   ├── errors/
│   │   └── domain-errors.ts    # AppError subclasses (NotFoundError, etc.)
│   ├── lib/
│   │   └── prisma.ts           # Singleton Prisma client
│   └── types/
│       └── express.d.ts        # Augments req.user: { id: string }
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL 16 running locally

### Setup

```bash
# From the monorepo root
pnpm install

# Copy environment file and fill in values
cp apps/backend/.env.example apps/backend/.env

# Run migrations and generate Prisma client
pnpm --filter backend exec prisma migrate dev
pnpm --filter backend exec prisma generate

# Start the dev server (hot reload via tsx watch)
pnpm --filter backend dev
# → http://localhost:3000
```

---

## Environment Variables

| Variable              | Required | Description                                                                  |
|-----------------------|----------|------------------------------------------------------------------------------|
| `DATABASE_URL`        | Yes      | PostgreSQL connection string — `postgresql://user:password@localhost:5432/db` |
| `ACCESS_TOKEN_SECRET` | Yes      | Secret for signing JWT access tokens — use a long random string in production |
| `PORT`                | No       | API server port (default: `3000`)                                            |
| `NODE_ENV`            | No       | `development`, `production`, or `test`                                       |

> Refresh tokens are opaque hex strings (`crypto.randomBytes(32)`) stored in the database — no refresh token secret is needed.

---

## Available Scripts

```bash
pnpm dev             # tsx watch — hot reload dev server
pnpm build           # compile TypeScript to /dist
pnpm start           # run compiled output (node dist/server.js)
pnpm test            # Vitest unit + Supertest integration tests
pnpm test:coverage   # tests with v8 coverage report (target ≥ 80%)
pnpm lint            # ESLint on src/
pnpm tsc             # type-check only (no emit)
```

Prisma:

```bash
npx prisma migrate dev    # create + apply migration, regenerate client
npx prisma migrate deploy # apply migrations in production (confirm first)
npx prisma generate       # regenerate client after schema edit without migration
npx prisma studio         # browser GUI to inspect the database (dev only)
```

---

## API Reference

All routes are prefixed with `/api`. Authenticated routes require:

```
Authorization: Bearer <accessToken>
```

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | No | Register with `name`, `email`, `password` |
| `POST` | `/api/auth/login` | No | Login; returns `accessToken` (15 min) + `refreshToken` (7 days) |
| `POST` | `/api/auth/logout` | Yes | Delete the refresh token row |
| `POST` | `/api/auth/refresh` | No | Exchange a valid refresh token for a new token pair (old token invalidated) |
| `POST` | `/api/auth/forgot-password` | No | Generate and log an OTP to console (10 min TTL) |
| `POST` | `/api/auth/reset-password` | No | Validate OTP and update password hash |

### Notes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/notes` | Yes | Paginated list — accepts `page`, `limit`, `sort`, `filter` |
| `GET` | `/api/notes/:id` | Yes | Single note by ID |
| `POST` | `/api/notes` | Yes | Create note; writes initial version snapshot |
| `PATCH` | `/api/notes/:id` | Yes | Update note; writes new version snapshot |
| `DELETE` | `/api/notes/:id` | Yes | Soft-delete — sets `deletedAt`, retains for 30 days |

### Tags

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/tags` | Yes | List user's tags with per-tag note count |
| `POST` | `/api/tags` | Yes | Create tag with `name` and hex `color` |
| `PATCH` | `/api/tags/:id` | Yes | Update tag name or color |
| `DELETE` | `/api/tags/:id` | Yes | Delete tag |

### Search

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/search?q=&page=&limit=` | Yes | PostgreSQL full-text search; results include `ts_headline` highlights |

### Sharing

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/notes/:id/share` | Yes | Generate a public share link with optional `expiresAt` |
| `GET` | `/api/public/:token` | No | Read-only public note view; increments `viewCount` atomically |
| `DELETE` | `/api/share/:id` | Yes | Revoke a share link |

### Version History

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/notes/:id/versions` | Yes | List all version snapshots for a note |
| `GET` | `/api/notes/:id/versions/:versionId` | Yes | Inspect a single historical version |
| `POST` | `/api/notes/:id/versions/:versionId/restore` | Yes | Restore a version — writes a new snapshot, original versions unchanged |

### Response Envelopes

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

Managed by Prisma. Schema lives at `prisma/schema.prisma`.

| Table                 | Key Columns                                               | Notes                                |
|-----------------------|-----------------------------------------------------------|--------------------------------------|
| `users`               | id, name, email, passwordHash, createdAt, updatedAt       |                                      |
| `refresh_tokens`      | id, userId, token, expiresAt, createdAt                   | Deleted on logout or rotation        |
| `password_reset_otps` | id, userId, otp, expiresAt, usedAt                        | 10-min TTL, `usedAt` set on consume  |
| `notes`               | id, userId, title, content, deletedAt, createdAt, updatedAt | `deletedAt` = soft delete           |
| `tags`                | id, userId, name, color, createdAt                        | User-scoped, flat (no nesting)       |
| `note_tags`           | noteId, tagId                                             | Prisma implicit many-to-many join    |
| `share_links`         | id, noteId, token, expiresAt, revokedAt, viewCount        | `viewCount` incremented atomically   |
| `note_versions`       | id, noteId, title, content, versionNumber, createdAt      | Immutable snapshot on every save     |

**Full-text search:** `GIN` index on `tsvector(title || content)` using `to_tsvector()`, `plainto_tsquery()`, and `ts_headline()`.

---

## Auth Design

| Token | Type | TTL | Storage |
|-------|------|-----|---------|
| Access token | JWT signed with `ACCESS_TOKEN_SECRET` | 15 minutes | Client (memory / localStorage) |
| Refresh token | Opaque hex (`crypto.randomBytes(32)`) | 7 days | `refresh_tokens` table |

- **Registration / Login** — password hashed with bcrypt; both return an access + refresh token pair.
- **Token rotation** — every `/auth/refresh` call deletes the old refresh token and issues a new pair. Replaying a used token returns `401`.
- **Logout** — deletes the refresh token row; access token expires naturally after 15 minutes.
- **Rate limiting** — applied on all `/auth/*` endpoints.
- **Authorization** — every note, tag, version, and share link query is scoped by `userId`. Users can only access their own resources.

---

## Error Handling

Domain errors are thrown in services and mapped to HTTP responses by the `errorHandler` middleware.

| Class | Status | Code |
|-------|--------|------|
| `EmailConflictError` | 409 | `EMAIL_CONFLICT` |
| `InvalidCredentialsError` | 401 | `INVALID_CREDENTIALS` |
| `InvalidRefreshTokenError` | 401 | `INVALID_REFRESH_TOKEN` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `ShareLinkInvalidError` | 404 | `SHARE_LINK_INVALID` |

Raw Prisma errors are never exposed to the client.

---

## Middleware Stack

Applied in this order on every request:

```
helmet → cors → express.json() → routes → errorHandler
```

Rate limiting is applied per router on `/api/auth/*` routes only.

The `authenticate` middleware validates the `Authorization: Bearer <token>` header and injects `req.user: { id: string }` on protected routes.

---

## Testing

| Type | Tool | Scope |
|------|------|-------|
| Unit | Vitest | Service layer in isolation — repositories mocked |
| Integration | Vitest + Supertest | Controllers + repositories against a real test database |

**Coverage target:** ≥ 80%

```bash
# Run all tests
pnpm --filter backend test

# With coverage report
pnpm --filter backend test:coverage
```

Tests live alongside source under `src/__tests__/`. Naming convention:
- `*.service.test.ts` — unit tests (mocked repositories)
- `*.integration.test.ts` — integration tests (real DB via Supertest)
- `*.repository.test.ts` — repository-level tests against the test DB

---

## Coding Conventions

- No `any` types — TypeScript strict mode throughout.
- Zod schemas imported from `@note-app/shared` — never defined inline in controllers.
- `res.json()` with `{ data }` / `{ error }` envelopes — never `res.send()`.
- No hard-deletes on notes — set `deletedAt` only.
- Every note save (create, update, restore) writes a `note_versions` snapshot.
- No direct `prisma.*` calls outside repository files.
- No raw Prisma errors returned to clients — catch and throw a domain error.
- All note/tag/version queries include `userId` filter — no IDOR risk.
