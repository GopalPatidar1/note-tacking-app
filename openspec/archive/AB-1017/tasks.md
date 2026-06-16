# Task Checklist — AB-1017: Generate Comprehensive README

**Date:** 2026-06-16
**Branch:** docs/AB-1017-generate-comprehensive-readme
**Total files:** 1 new — `README.md` at repo root
**Total sections:** 17

> **Plan correction (verified against source):**
> The plan listed `JWT_SECRET` and `JWT_REFRESH_SECRET` — these are wrong.
> Actual backend env vars: `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `PORT`, `NODE_ENV`.
> Refresh tokens are opaque `crypto.randomBytes(32).toString('hex')` — no JWT secret needed.
> Frontend also requires: `VITE_API_URL=http://localhost:3000/api`.
> `.env.example` already exists at `apps/backend/.env.example` — reference it directly.

---

## Phase 1 — Foundation: Verify Source Facts

These tasks verify all facts that will appear in the README before a single line is written.
Run through sequentially — do not write any README content yet.

- [ ] **T01** Confirm backend env vars
  - Source: `apps/backend/.env.example`
  - Expected vars: `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `PORT`, `NODE_ENV`
  - Confirm: no `JWT_SECRET`, no `JWT_REFRESH_SECRET` (refresh tokens are opaque hex, not JWTs)
  - Frontend var: `VITE_API_URL=http://localhost:3000/api` (source: `apps/frontend/.env`)

- [ ] **T02** Confirm backend port
  - Source: `apps/backend/src/server.ts:4` → `process.env.PORT ?? 3000`
  - Expected default: **3000**

- [ ] **T03** Confirm frontend dev port
  - Source: Vite default; `apps/e2e/playwright.config.ts` → `baseURL: 'http://localhost:5173'`
  - Expected: **5173**

- [ ] **T04** Confirm DB table names from Prisma `@@map()`
  - Source: `apps/backend/prisma/schema.prisma`
  - Expected: `users`, `refresh_tokens`, `password_reset_otps`, `notes`, `tags`, `note_tags` (join), `share_links`, `note_versions`
  - Note: `note_tags` and `password_reset_otps` may not have explicit `@@map` — verify model names

- [ ] **T05** Confirm all root scripts
  - Source: root `package.json`
  - Expected scripts: `dev:backend`, `dev:frontend`, `build`, `tsc`, `test:e2e`
  - Per-filter commands come from `AGENTS.md §4` — confirm they match actual package names (`backend`, `frontend`, `@note-app/shared`, `@note-app/e2e`)

- [ ] **T06** Confirm full API route list
  - Source: `apps/backend/src/app.ts` (router mounts) + route files under `apps/backend/src/routes/`
  - Confirm all 21 endpoints are registered:
    - Auth: register, login, logout, refresh, forgot-password, reset-password
    - Notes: GET list, GET one, POST, PATCH, DELETE
    - Tags: GET, POST, PATCH, DELETE
    - Search: GET
    - Share: POST generate, GET public, DELETE revoke
    - Versions: GET list, GET one, POST restore

### Phase 1 Checkpoint
All source facts confirmed — no writing until this phase is done.

---

## Phase 2 — Core: Write README Sections

Sections are grouped into independent blocks that can be written in any order.
**Sections within each group are PARALLEL** — no cross-dependencies.
Write `README.md` incrementally; all sections must be present before Phase 3.

### Group A — Identity + Overview `[PARALLEL]`

- [ ] **T07** `[PARALLEL]` Write §1 — Title + one-liner
  - `# Note Taking Application`
  - One-sentence project description from `AGENTS.md §1`

- [ ] **T08** `[PARALLEL]` Write §2 — Feature overview
  - 7 bullets sourced from `FRS.md §1–6`:
    1. Secure JWT authentication with refresh token rotation
    2. Notes CRUD with rich-text editor (TipTap)
    3. Tag-based organization (user-scoped, color-coded)
    4. PostgreSQL full-text search with keyword highlights
    5. Public share links with optional expiry and view tracking
    6. Per-save version snapshots with restore capability
    7. Soft-delete with 30-day recovery window

- [ ] **T09** `[PARALLEL]` Write §3 — Tech stack table
  - 5 rows: Frontend / Backend / Database / Testing / Monorepo
  - Source: `AGENTS.md §3`

### Group B — Architecture + Structure `[PARALLEL]`

- [ ] **T10** `[PARALLEL]` Write §4 — Architecture
  - Mermaid `flowchart TD` diagram (exact nodes from plan §5a):
    ```
    Browser → React SPA → Express 5 REST API → Controller → Service → Repository → PostgreSQL
    ```
  - Two sentences on layered-arch rule: no layer skipping, controllers never call Prisma

- [ ] **T11** `[PARALLEL]` Write §5 — Repository structure
  - Annotated directory tree from `AGENTS.md §2`:
    ```
    /apps/frontend   /apps/backend   /packages/shared   /openspec   /docs
    ```

### Group C — Setup `[SEQUENTIAL within group]`

These build on each other — write in order.

- [ ] **T12** Write §6 — Prerequisites
  - Node.js 22, pnpm 9, PostgreSQL 16
  - Brief note: PostgreSQL must be running locally before migrations

- [ ] **T13** Write §7 — Getting Started _(depends on T12 for prereq context)_
  - 6-step shell block (from plan §5d):
    1. Clone
    2. `pnpm install`
    3. `cp apps/backend/.env.example apps/backend/.env` (file exists — reference it)
    4. `pnpm --filter backend exec prisma migrate dev`
    5. `pnpm --filter backend exec prisma generate`
    6. Start both dev servers
  - Note: two terminal windows required for step 6

- [ ] **T14** Write §8 — Environment variables _(depends on T01 fact verification)_
  - **Backend** table (4 rows): `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `PORT`, `NODE_ENV`
  - **Frontend** table (1 row): `VITE_API_URL`
  - Mark which are required vs optional
  - Reference `apps/backend/.env.example` for the backend template

- [ ] **T15** Write §9 — Available scripts _(depends on T05 fact verification)_
  - Table format: Script → Command → Description
  - Include: dev (×2), build, tsc, lint (×2), test:unit (×2), test:e2e
  - Commands must match root `package.json` scripts exactly

### Group D — Reference `[PARALLEL]`

- [ ] **T16** `[PARALLEL]` Write §10 — API reference _(depends on T06 fact verification)_
  - Full 21-endpoint table: Method | Path | Auth | Description
  - Group visually by domain: Auth (6), Notes (5), Tags (4), Search (1), Sharing (3), Versions (3)

- [ ] **T17** `[PARALLEL]` Write §11 — Database schema _(depends on T04 fact verification)_
  - 8-table summary from `AGENTS.md §9`: table name, key columns, notes
  - Add full-text search index note at bottom

- [ ] **T18** `[PARALLEL]` Write §12 — Auth flow
  - Token TTL table: Access (15 min JWT) / Refresh (7 days, opaque hex, stored in DB)
  - Prose: registration → login → rotation → logout
  - OTP reset flow: generate → console log → validate → update hash (10-min TTL)
  - **Correct**: refresh tokens are `crypto.randomBytes(32)` hex — not JWTs; no `REFRESH_TOKEN_SECRET`

### Group E — Quality + Contribution `[PARALLEL]`

- [ ] **T19** `[PARALLEL]` Write §13 — Testing
  - Strategy table: Unit (Vitest, service layer, mock repos) / Integration (Supertest, real test DB) / E2E (Playwright, full browser)
  - Coverage target: ≥80%
  - Run commands: `pnpm --filter backend test`, `pnpm --filter frontend test`, `pnpm test:e2e`

- [ ] **T20** `[PARALLEL]` Write §14 — Quality gates
  - Ordered 6-step checklist from `CLAUDE.md`:
    1. `pnpm tsc --noEmit`
    2. `pnpm --filter backend lint`
    3. `pnpm --filter frontend lint`
    4. `pnpm --filter backend test`
    5. `pnpm --filter frontend test`
    6. `pnpm --filter backend build`

- [ ] **T21** `[PARALLEL]` Write §15 — Non-functional requirements
  - 3-row table from `FRS.md (NFR)`: Security / Performance / Reliability
  - Security: JWT auth, bcrypt, token rotation, rate limiting, Zod validation
  - Performance: search < 500ms, CRUD < 300ms, pagination on all list endpoints
  - Reliability: 30-day soft-delete window, transactional operations

- [ ] **T22** `[PARALLEL]` Write §16 — Out of scope
  - 6 bullets from `FRS.md` + `AGENTS.md §11`:
    real-time, file uploads, mobile, OAuth, nested folders, email delivery

- [ ] **T23** `[PARALLEL]` Write §17 — Contributing
  - Branch naming convention from `CLAUDE.md`: `<type>/<ticket-id>-<short-slug>`
  - Commit message format from `CLAUDE.md`: `<type>(<scope>): <short summary>`
  - Types: feat, fix, refactor, test, chore, docs
  - Scopes: auth, notes, tags, search, sharing, versions, shared, infra

### Phase 2 Checkpoint
All 17 sections present in `README.md`. File is complete but not yet cross-checked.

---

## Phase 3 — Integration: Assemble + Cross-Check

- [ ] **T24** Read through the complete README top-to-bottom
  - Confirm all 17 sections are present and in the correct order
  - Confirm no section references another section that contradicts it
  - Confirm tense and voice are consistent throughout

- [ ] **T25** Cross-check §7 Getting Started commands against `package.json`
  - Every shell command in §7 must be a valid pnpm command
  - Prisma commands: `pnpm --filter backend exec prisma migrate dev` must match how CLAUDE.md documents them

- [ ] **T26** Cross-check §10 API endpoints against `apps/backend/src/app.ts` route mounts
  - Every path prefix in the table must match a `app.use('/api/...')` call
  - Method + path combinations must match individual route file registrations

- [ ] **T27** Cross-check §11 DB table names against `prisma/schema.prisma` `@@map()` values
  - `users` ✓, `refresh_tokens` ✓, `notes` ✓, `tags` ✓, `share_links` ✓, `note_versions` ✓
  - Confirm `password_reset_otps` and `note_tags` model names

### Phase 3 Checkpoint
README is internally consistent. All cross-references verified against source.

---

## Phase 4 — Verification: Syntax + Accuracy

- [ ] **T28** Verify Mermaid diagram syntax
  - Count: every `-->` has a valid source and target node identifier
  - No unclosed brackets `[` or `(` or quotes
  - `<br/>` tags inside node labels are valid Mermaid syntax (they are)
  - Diagram renders in a local Mermaid preview or browser extension before commit

- [ ] **T29** Verify markdown formatting
  - All tables have correct `|---|` separator rows
  - All code blocks have a language tag (` ```bash `, ` ```mermaid `, ` ```json `)
  - No broken links (internal anchors use `#section-name` GitHub format if referenced)
  - Heading hierarchy: single `#` title, `##` sections, `###` subsections only

- [ ] **T30** Final read-through as a new developer
  - Can a developer clone, set up, and run the app using only this README?
  - Is every command copy-pasteable without modification (except placeholder values)?

### Phase 4 Checkpoint (Final Gate)
README is complete, accurate, and well-formed. Ready to commit.

---

## Phase 5 — Commit

- [ ] **T31** Stage and commit
  ```bash
  git add README.md
  git commit -m "docs(infra): add comprehensive README"
  ```

---

## Summary

| Phase | Tasks | Description | Sequential? |
|-------|-------|-------------|-------------|
| 1 — Verify facts | T01–T06 | Confirm env vars, ports, routes, scripts from source | Sequential |
| 2 — Write sections | T07–T23 | Author all 17 README sections | Groups A–E, parallel within groups |
| 3 — Cross-check | T24–T27 | Verify commands + routes + table names against actual source | Sequential |
| 4 — Syntax check | T28–T30 | Mermaid syntax, markdown formatting, developer UX read-through | Sequential |
| 5 — Commit | T31 | Single commit on docs branch | — |

**Total tasks:** 31 · **New files:** 1 (`README.md`) · **Modified files:** 0
