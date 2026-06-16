# Technical Plan — AB-1017: Generate Comprehensive README

**Date:** 2026-06-16
**Author:** gopalp@mindfiresolutions.com
**Branch:** docs/AB-1017-generate-comprehensive-readme
**Scope:** Single new file — `README.md` at repo root

---

## 1. Overview

This ticket produces one artifact: a comprehensive `README.md` at the repository root. The file does not exist today. No source code, API contracts, database schema, or TypeScript interfaces are changed.

All content is sourced from existing documentation (`AGENTS.md`, `FRS.md`, `SDS.md`, `openspec/project.md`, `CLAUDE.md`, `prisma/schema.prisma`, root `package.json`).

---

## 2. File Changes

| File | Action | Notes |
|------|--------|-------|
| `README.md` | **CREATE** | Repo root — the only change in this ticket |

---

## 3. README Section Plan

Sections written in this exact order:

| # | Section | Source of truth | Notes |
|---|---------|----------------|-------|
| 1 | **Title + one-liner** | AGENTS.md §1 | "Note Taking Application" — matches all existing docs |
| 2 | **Feature overview** | FRS.md §1–6 | 7 bullet features: Auth, Notes CRUD, Tags, Full-text search, Sharing, Version history, Soft-delete |
| 3 | **Tech stack table** | AGENTS.md §3 | Two-column table: Layer → Technology |
| 4 | **Architecture** | AGENTS.md §5, openspec/project.md | Mermaid `flowchart TD` diagram + layered-arch rule text |
| 5 | **Repository structure** | AGENTS.md §2 | Annotated directory tree |
| 6 | **Prerequisites** | package.json, prisma/schema.prisma | Node 22, pnpm 9, PostgreSQL 16 |
| 7 | **Getting Started** | AGENTS.md §4, backend .env pattern | clone → install → `.env` setup → migrate → generate → dev servers |
| 8 | **Environment variables** | apps/backend/src/server.ts, app.ts | `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PORT` |
| 9 | **Available scripts** | root package.json + AGENTS.md §4 | Full command table: dev, build, lint, tsc, test (unit/integration/e2e) |
| 10 | **API reference** | AGENTS.md §8, openspec/project.md | Full 18-endpoint table: method, path, auth required, brief description |
| 11 | **Database schema** | AGENTS.md §9 | 8-table summary with key columns and notes |
| 12 | **Auth flow** | AGENTS.md §7, openspec/project.md | Token TTL table + prose on OTP reset flow |
| 13 | **Testing** | AGENTS.md §10, openspec/project.md | Strategy table (unit/integration/e2e), coverage target ≥80%, run commands |
| 14 | **Quality gates** | CLAUDE.md | Ordered 6-step checklist: tsc → lint×2 → test×2 → build |
| 15 | **Non-functional requirements** | FRS.md (NFR section) | Security, Performance, Reliability table |
| 16 | **Out of scope** | FRS.md (Out of Scope) + AGENTS.md §11 | 6 bullets |
| 17 | **Contributing** | CLAUDE.md (branch naming + commit format) | Branch convention, commit message format |

---

## 4. Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Title: "Note Taking Application" | Consistent with FRS.md, SDS.md, AGENTS.md, openspec/project.md — ticket title "AI-Powered" is not used anywhere in code or docs |
| Mermaid diagram for architecture | Native GitHub rendering; no external image hosting; no PNG to keep in sync |
| Full 18-endpoint table (§10) | Readers scan the full API surface without opening the OpenAPI file |
| No UI screenshots | App is functional but screenshot capture is out of scope; no placeholder noise |
| No shields.io badges | No CI pipeline exists — build-status badge would be permanently grey; skip entirely |
| Env vars documented inline (§8) | No `.env.example` exists in repo; README is the right place until a separate chore creates one |
| No `CONTRIBUTING.md` | Contributing conventions are covered inline in §17; a separate file is not requested by the ticket |

---

## 5. Content Details

### 5a. Mermaid Architecture Diagram

```mermaid
flowchart TD
    A[Browser] --> B[React SPA<br/>Vite · TanStack Query · Zustand · TipTap]
    B --> C[Express 5 REST API<br/>Node.js 22 · TypeScript]
    C --> D[Controller Layer<br/>Zod validation]
    D --> E[Service Layer<br/>Business logic]
    E --> F[Repository Layer<br/>Prisma queries]
    F --> G[(PostgreSQL 16<br/>Full-text search · Soft deletes)]
```

### 5b. Environment Variables Table

**Backend** (`apps/backend/.env` — template at `apps/backend/.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string — `postgresql://user:password@localhost:5432/note_taking_dev` |
| `ACCESS_TOKEN_SECRET` | Yes | Secret for signing JWT access tokens |
| `PORT` | No | API server port (default: 3000) |
| `NODE_ENV` | No | Runtime environment (`development` / `production` / `test`) |

> Note: Refresh tokens are opaque `crypto.randomBytes(32).toString('hex')` stored in the DB — no separate JWT secret is required for them.

**Frontend** (`apps/frontend/.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Backend API base URL — `http://localhost:3000/api` |

### 5c. API Endpoint Table (18 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | No | Register with name, email, password |
| `POST` | `/api/auth/login` | No | Login; returns access + refresh tokens |
| `POST` | `/api/auth/logout` | Yes | Delete refresh token |
| `POST` | `/api/auth/refresh` | No | Exchange refresh token for new pair |
| `POST` | `/api/auth/forgot-password` | No | Generate OTP (logged to console) |
| `POST` | `/api/auth/reset-password` | No | Reset password using OTP |
| `GET` | `/api/notes` | Yes | List notes with pagination, sort, filter |
| `GET` | `/api/notes/:id` | Yes | Get single note |
| `POST` | `/api/notes` | Yes | Create note (writes version snapshot) |
| `PATCH` | `/api/notes/:id` | Yes | Update note (writes version snapshot) |
| `DELETE` | `/api/notes/:id` | Yes | Soft-delete note (sets `deletedAt`) |
| `GET` | `/api/tags` | Yes | List user's tags with note counts |
| `POST` | `/api/tags` | Yes | Create tag with name and color |
| `PATCH` | `/api/tags/:id` | Yes | Update tag |
| `DELETE` | `/api/tags/:id` | Yes | Delete tag |
| `GET` | `/api/search` | Yes | Full-text search with `ts_headline` highlights |
| `POST` | `/api/notes/:id/share` | Yes | Generate share link with optional expiry |
| `GET` | `/api/public/:token` | No | Read-only public note view (increments viewCount) |
| `DELETE` | `/api/share/:id` | Yes | Revoke share link |
| `GET` | `/api/notes/:id/versions` | Yes | List all version snapshots |
| `GET` | `/api/notes/:id/versions/:versionId` | Yes | Get single version snapshot |
| `POST` | `/api/notes/:id/versions/:versionId/restore` | Yes | Restore version (writes new snapshot) |

> Note: endpoint count is 21 (auth 6 + notes 5 + tags 4 + search 1 + sharing 3 + versions 3). AGENTS.md §8 lists 18 — the discrepancy is `POST /auth/refresh`, `POST /auth/forgot-password`, and `POST /auth/reset-password` which are in the SDS but summarised under "auth" in AGENTS.md. README will use the full 21.

### 5d. Getting Started Steps

```bash
# 1. Clone
git clone <repo-url>
cd note-taking-app

# 2. Install dependencies
pnpm install

# 3. Create backend environment file
cp apps/backend/.env.example apps/backend/.env   # or create manually
# Required: DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET

# 4. Run database migrations
pnpm --filter backend exec prisma migrate dev

# 5. Generate Prisma client
pnpm --filter backend exec prisma generate

# 6. Start dev servers (two terminals)
pnpm --filter backend dev    # http://localhost:3000
pnpm --filter frontend dev   # http://localhost:5173
```

---

## 6. No Code Quality Gates Required

AB-1017 is a documentation-only ticket. No TypeScript, no linting, no tests apply.

The only checkpoint is:

```bash
# Verify Mermaid diagram renders correctly on GitHub
# (review in GitHub PR preview after push)
```

---

## 7. Out of Scope

| Item | Reason |
|------|--------|
| `.env.example` file | Separate chore ticket; not requested here |
| CI/CD badge setup | No pipeline exists |
| UI screenshots / GIF demos | Out of scope per /spec decision |
| `CONTRIBUTING.md` | Covered inline in README §17 |
| Docker / deployment guide | Not in FRS |
| Changelog / release notes | Not requested |

---

## 8. Task Checklist

- [ ] **T01** Create `README.md` at repo root
  - Write all 17 sections in order per §3 above
  - Mermaid diagram per §5a
  - Full 21-endpoint table per §5c
  - Env vars table per §5b
  - Getting Started steps per §5d

- [ ] **T02** Verify Mermaid syntax is valid
  - Count opening/closing nodes match
  - No unclosed brackets or quotes

- [ ] **T03** Verify all internal cross-references are accurate
  - Commands match root `package.json` scripts exactly
  - Port numbers match `apps/backend/src/server.ts` (default 3000)
  - Frontend dev port matches Vite default (5173)
  - DB table names match `prisma/schema.prisma` `@@map()` values

- [ ] **T04** Commit
  ```
  docs(infra): add comprehensive README
  ```
