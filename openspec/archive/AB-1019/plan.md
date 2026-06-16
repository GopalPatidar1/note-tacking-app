# Technical Plan — AB-1019: Frontend README

**Date:** 2026-06-16
**Author:** gopalp@mindfiresolutions.com
**Branch:** docs/AB-1019-generate-comprehensive-readme
**Scope:** Documentation only — one file created, no source code changed

---

## 1. Overview

One deliverable:

| File | Action | Notes |
|------|--------|-------|
| `apps/frontend/README.md` | **CREATE** | Primary deliverable — 14 sections |

No source code, API contracts, database schema, or TypeScript interfaces are changed.

---

## 2. Codebase Scan Findings

Verified against actual source files before writing.

### 2a. Routing

`src/router.tsx` defines exactly these routes:

| Path | Guard | Page |
|------|-------|------|
| `/login` | GuestRoute | LoginPage |
| `/register` | GuestRoute | RegisterPage |
| `/forgot-password` | GuestRoute | ForgotPasswordPage |
| `/reset-password` | GuestRoute | ResetPasswordPage |
| `/notes` | ProtectedRoute | NotesListPage |
| `/notes/new` | ProtectedRoute | NoteEditorPage |
| `/notes/:id` | ProtectedRoute | NoteEditorPage |
| `/search` | ProtectedRoute | SearchPage |
| `/public/:token` | None (open) | PublicNotePage |
| `/` | — | Redirect → /notes |

### 2b. Auth store

`src/stores/auth.store.ts` uses:
- `localStorage` keys: `auth.accessToken`, `auth.refreshToken`
- State shape: `{ accessToken, refreshToken, user: UserPublic | null, isAuthenticated }`
- Actions: `setTokens`, `setUser`, `clearAuth`

### 2c. HTTP client

Two Axios instances:
- `src/lib/http.ts` — authenticated; request interceptor attaches Bearer token; response interceptor handles 401 → POST /auth/refresh → retry; on failure clears auth + redirects to /login
- `src/lib/public-http.ts` — no auth headers; used for public note endpoint only

### 2d. Vite config

`vite.config.ts`:
- `@` alias resolves to `./src`
- test environment: `jsdom`
- setup file: `./src/test/setup.ts`
- coverage threshold: `{ lines: 80 }` via v8

### 2e. Environment

`apps/frontend/.env`:
```
VITE_API_URL=http://localhost:3000/api
```

Only one env variable. Vite dev server default port: `5173`.

### 2f. Package versions (from package.json)

| Package | Version |
|---------|---------|
| react | ^19.0.0 |
| @tanstack/react-query | ^5.56.0 |
| zustand | ^5.0.0 |
| @tiptap/react | ^3.26.0 |
| vite | ^5.4.0 |
| typescript | ^5.5.0 |
| vitest | ^2.1.0 |
| msw | ^2.4.0 |

---

## 3. File Changes

### 3a. `apps/frontend/README.md` — 14 sections

| # | Section | Key content |
|---|---------|-------------|
| 1 | Title + one-liner | "React 19 SPA for the Note Taking platform" |
| 2 | Tech stack table | All packages with versions from §2f |
| 3 | Project structure | Annotated tree: components / hooks / lib / pages / stores / __tests__ |
| 4 | Getting Started | Prerequisites (Node 22, pnpm 9+, React/TS experience, backend running); dev server command |
| 5 | Environment variables | `VITE_API_URL` — default + anti-pattern rule |
| 6 | Available scripts | dev, build, preview, test, test:watch, test:coverage, lint, tsc |
| 7 | Routing | Route table (path · guard · page) from §2a |
| 8 | State management | TanStack Query = server state; Zustand = client session; split rule stated |
| 9 | HTTP client | Two instances; auth interceptor behavior in prose; no step list |
| 10 | Component patterns | One-hook-per-operation; TipTap for note content only; shadcn/ui first |
| 11 | Form validation | zodResolver from shared schemas |
| 12 | Features table | Product feature → implementation files mapping |
| 13 | Testing | Tools + commands + coverage threshold; what is tested (one bullet each type) |
| 14 | Coding standards | 7 anti-patterns from frontend CLAUDE.md as positive rules |

---

## 4. Accuracy Verification (before commit)

```bash
# Confirm routes
grep 'path:' apps/frontend/src/router.tsx

# Confirm localStorage keys
grep 'KEY' apps/frontend/src/stores/auth.store.ts

# Confirm VITE_API_URL default
cat apps/frontend/.env

# Confirm scripts match package.json
grep -A 10 '"scripts"' apps/frontend/package.json

# Confirm coverage threshold
grep -A 5 'coverage' apps/frontend/vite.config.ts

# Confirm @tiptap version
grep 'tiptap' apps/frontend/package.json
```

---

## 5. Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Audience: frontend contributors only | Assumes React/TypeScript familiarity; does not explain framework basics |
| No Mermaid diagram | Root README has the system architecture diagram; repeating it adds noise |
| No MSW handler examples in testing section | Pattern visible in `src/__tests__/`; duplicating creates maintenance burden |
| Prose-only token refresh description | Numbered step list adds length without clarity gain for the target audience |
| No shared-package import table | Full shared docs belong in `packages/shared/README.md`; cross-referencing creates drift |

---

## 6. No Code Quality Gates Required

Documentation-only ticket — TypeScript, linting, and test gates do not apply.

---

## 7. Out of Scope

| Item | Reason |
|------|--------|
| MSW handler code examples | Already in source; duplication creates maintenance burden |
| Numbered token refresh steps | Prose is sufficient |
| `@note-app/shared` import table | Belongs in packages/shared |
| Mermaid diagram | Root README covers it |
| Docker / deployment | Not in FRS |
| CI/CD badges | No pipeline |

---

## 8. Task Checklist

- [x] **T01** Create `apps/frontend/README.md` — 14 sections per §3a
- [x] **T02** Accuracy verification — all 6 commands in §4 confirmed
- [ ] **T03** Commit
  ```
  docs(infra): add frontend README
  ```
