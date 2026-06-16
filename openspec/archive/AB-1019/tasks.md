# Tasks — AB-1019: Frontend README

**Ticket:** AB-1019 — Generate Comprehensive README Documentation for the Frontend
**Branch:** `docs/AB-1019-generate-comprehensive-readme`
**Type:** Documentation only — no shared types, no DB migrations, no API changes
**Standard code quality checkpoints (build / lint / test) do not apply.**

---

## Phase 1 — Foundation

> Shared types, DB migrations, env setup.
> **N/A** — documentation-only ticket. No TypeScript interfaces, no Prisma migrations, no new env variables.

---

## Phase 2 — Core Implementation

| ID | Task | Parallel? | Status |
|----|------|-----------|--------|
| T01-A | Write sections 1–6: Title, Tech stack, Project structure, Getting Started, Env vars, Scripts | — | ✅ DONE |
| T01-B | Write sections 7–11: Routing table, State management, HTTP client, Component patterns, Form validation | PARALLEL with T01-A | ✅ DONE |
| T01-C | Write sections 12–14: Features table, Testing summary, Coding standards | PARALLEL with T01-A/B | ✅ DONE |

**Checkpoint — Phase 2**
> Documentation-only: no build/lint/test gate.
> Gate: README renders without broken Markdown (visual check). ✅

---

## Phase 3 — Integration (Accuracy Verification)

Verify every factual claim in `apps/frontend/README.md` against its source file.

| ID | Task | Source file | Verified value | Status |
|----|------|-------------|----------------|--------|
| T02-A | Route paths and guard components | `src/router.tsx` | 10 routes; GuestRoute / ProtectedRoute / open ✅ | ✅ DONE |
| T02-B | localStorage key names | `src/stores/auth.store.ts` | `auth.accessToken`, `auth.refreshToken` ✅ | ✅ DONE |
| T02-C | `VITE_API_URL` default value | `apps/frontend/.env` | `http://localhost:3000/api` ✅ | ✅ DONE |
| T02-D | Script names and commands | `apps/frontend/package.json` | dev · build · preview · test · test:watch · test:coverage · lint · tsc ✅ | ✅ DONE |
| T02-E | Coverage threshold | `vite.config.ts` | `{ lines: 80 }` via v8 ✅ | ✅ DONE |
| T02-F | Package dependency versions | `apps/frontend/package.json` | React 19 · TanStack Query 5.56 · Zustand 5.0 · TipTap 3.26 · Vite 5.4 ✅ | ✅ DONE |
| T02-G | `@` alias path | `vite.config.ts` | `path.resolve(__dirname, './src')` ✅ | ✅ DONE |

**Checkpoint — Phase 3**
> All 7 accuracy checks pass. ✅

---

## Phase 4 — Tests

> **N/A** — documentation-only ticket. No unit, integration, or E2E tests are added.
> The accuracy verification in Phase 3 is the equivalent quality gate for documentation.

---

## Phase 5 — Commit

| ID | Task | Status |
|----|------|--------|
| T03 | Stage `apps/frontend/README.md` and commit | ⏳ PENDING APPROVAL |

**Commit message:**
```
docs(infra): add frontend README

Comprehensive reference for frontend contributors covering tech stack,
project structure, routing, state management (TanStack Query vs Zustand),
HTTP client with token refresh, component patterns, testing, and coding
standards.
```

**Files to stage:**
```bash
git add apps/frontend/README.md
git add openspec/proposals/AB-1019-frontend-readme.md
git add openspec/changes/AB-1019/plan.md
git add openspec/changes/AB-1019/tasks.md
```

---

## Summary

| Phase | Tasks | Done | Pending |
|-------|-------|------|---------|
| 1 — Foundation | N/A | — | — |
| 2 — Core Implementation | 3 | 3 | 0 |
| 3 — Integration (Accuracy) | 7 | 7 | 0 |
| 4 — Tests | N/A | — | — |
| 5 — Commit | 1 | 0 | **1** |

**All implementation complete. Awaiting approval to commit.**
