# Spec Proposal — AB-1019: Frontend README

**Date:** 2026-06-16
**Author:** gopalp@mindfiresolutions.com
**Scope:** Documentation only — `apps/frontend/README.md`
**Status:** APPROVED

---

## 1. Summary

Create a comprehensive `README.md` inside `apps/frontend/` that serves as the authoritative reference for frontend engineers working on the React 19 / Vite / TanStack Query / TipTap SPA.

The README targets **frontend contributors only** — engineers who know React and TypeScript and need to understand the project-specific patterns, conventions, and structure. It does not repeat general React/TypeScript concepts.

One file is produced by this ticket:

| File | Action |
|------|--------|
| `apps/frontend/README.md` | **CREATE** |

No source code, API contracts, database schema, or TypeScript interfaces are changed.

---

## 2. OpenAPI Contract Delta

None. This is a documentation-only ticket.

---

## 3. Clarifying Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Primary audience | Frontend contributors only | Assumes React 19 + TypeScript familiarity; focuses on project-specific patterns, not general framework explanation |
| Testing section depth | Summary only — tools, coverage threshold, command block | MSW handler patterns are already visible in `src/__tests__/` files; full guide would duplicate what the code shows |
| Token refresh flow | Prose only (no numbered step list) | The HTTP Client section prose is sufficient; a step list adds length without adding clarity for the target audience |
| `@note-app/shared` import table | Rule only — "never define Zod schemas in the frontend" | Full shared-package documentation belongs in `packages/shared/README.md`; repeating it here creates drift risk |

---

## 4. README Section Plan

Sections in this order:

| # | Section | Source of truth |
|---|---------|----------------|
| 1 | Title + one-liner | Ticket title + AGENTS.md §1 |
| 2 | Tech stack table (with versions) | `apps/frontend/package.json` |
| 3 | Project structure (annotated file tree) | `apps/frontend/src/` directory scan |
| 4 | Getting Started (prerequisites + dev server) | AGENTS.md §4, `apps/frontend/.env` |
| 5 | Environment variables table | `apps/frontend/.env`, `src/lib/http.ts` |
| 6 | Available scripts | `apps/frontend/package.json` scripts |
| 7 | Architecture: Routing (route table with guards) | `src/router.tsx` |
| 8 | Architecture: State Management (TanStack Query vs Zustand) | `src/stores/auth.store.ts`, frontend CLAUDE.md |
| 9 | Architecture: HTTP Client (auth interceptor + refresh) | `src/lib/http.ts`, `src/lib/public-http.ts` |
| 10 | Architecture: Component Patterns (one-hook-per-op, TipTap, shadcn/ui) | frontend CLAUDE.md |
| 11 | Architecture: Form Validation | frontend CLAUDE.md |
| 12 | Features table | `src/pages/`, `src/hooks/`, `src/components/` scan |
| 13 | Testing (summary only) | `vite.config.ts` test block, `src/test/setup.ts` |
| 14 | Coding Standards (anti-patterns) | frontend CLAUDE.md anti-patterns |

---

## 5. Content Decisions

### 5a. Audience framing

Prerequisites in the Getting Started section must note that the reader is expected to know React and TypeScript. The README assumes this and does not explain framework concepts.

### 5b. Architecture section

Text-based descriptions only — no Mermaid diagrams. The root `README.md` already contains the full system architecture diagram. Frontend routing is represented as a table (path · guard · component).

### 5c. State management split

One paragraph each for TanStack Query and Zustand, with clear rule stated:
- TanStack Query: all server state — notes, tags, search results, share links, versions
- Zustand: client-only session — tokens (mirrored to localStorage), user object, `isAuthenticated` flag
- Anti-pattern stated explicitly: never store server data in Zustand

### 5d. HTTP client

Two Axios instances documented:
- `src/lib/http.ts` — authenticated; request interceptor attaches `Authorization: Bearer <token>`; response interceptor handles 401 → silent refresh → retry
- `src/lib/public-http.ts` — unauthenticated; used only for `GET /public/:token`

Refresh flow in prose only (no step list).

### 5e. Testing section

Concise summary:
- Tools: Vitest + jsdom + Testing Library + MSW v2
- Coverage threshold: ≥ 80% lines (`vitest.config.ts`)
- Command block: `test`, `test:watch`, `test:coverage`
- What is tested: one bullet each for hooks, components, pages

No MSW handler code examples — the pattern is visible in `src/__tests__/`.

### 5f. Coding standards

Pull directly from frontend `CLAUDE.md` anti-patterns list (7 rules), stated as positive rules with a short rationale where non-obvious.

---

## 6. Accuracy Constraints

All facts in the README are verified against these source files before commit:

| Fact | Source file | Expected value |
|------|------------|----------------|
| Route paths and guards | `src/router.tsx` | See §7 in plan |
| localStorage keys | `src/stores/auth.store.ts` | `auth.accessToken`, `auth.refreshToken` |
| `VITE_API_URL` default | `apps/frontend/.env` | `http://localhost:3000/api` |
| `@` alias | `vite.config.ts` | `path.resolve(__dirname, './src')` |
| Coverage threshold | `vite.config.ts` test block | `{ lines: 80 }` |
| Package dependency versions | `package.json` | React 19, TanStack Query 5.56, Zustand 5.0, TipTap 3.26, Vite 5.4 |
| Dev port | Vite default | `5173` |

---

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Mermaid / ASCII architecture diagram | Root README has it; audience doesn't need it repeated |
| MSW handler code examples | Visible in `src/__tests__/`; duplicating creates maintenance burden |
| Numbered token refresh step list | Prose is sufficient for the target audience |
| `@note-app/shared` import table | Belongs in `packages/shared/README.md` |
| Docker / deployment guide | Not in FRS |
| CI/CD badges | No pipeline exists |
| TipTap extension configuration | Project-specific detail belongs in the component file |

---

## 8. Task Checklist

- [ ] **T01** Create `apps/frontend/README.md` — 14 sections per §4
  - Prerequisites note: "Requires React 19 + TypeScript familiarity"
  - Tech stack table with actual versions from `package.json`
  - Annotated file tree (components, hooks, lib, pages, stores, tests)
  - Route table: path · guard · page component (from `src/router.tsx`)
  - State management: TanStack Query vs Zustand split explained
  - HTTP client: both instances documented; refresh flow in prose
  - Features table mapping product features to implementation files
  - Testing: tools + commands only; no MSW examples
  - Anti-patterns: 7 rules from frontend `CLAUDE.md`

- [ ] **T02** Accuracy verification
  - Route paths match `src/router.tsx`
  - localStorage key names match `src/stores/auth.store.ts`
  - `VITE_API_URL` default matches `apps/frontend/.env`
  - Script commands match `apps/frontend/package.json`
  - Coverage threshold matches `vite.config.ts`

- [ ] **T03** Commit
  ```
  docs(infra): add frontend README
  ```
