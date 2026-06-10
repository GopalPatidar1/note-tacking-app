# Task Checklist — AB-1010: Frontend Auth Pages

**Ticket:** AB-1010  
**Date:** 2026-06-10  
**Branch:** `feat/AB-1010-frontend-auth-pages`  
**Status:** AWAITING APPROVAL

---

## Phase 1 — Foundation (Shared Package + Frontend Scaffold)

> Goal: shared types in place, frontend project boots with `pnpm dev`.

- [ ] **T01** — Create `packages/shared/src/types/user.ts` with `UserPublic` interface (`id`, `name`, `email`, `createdAt`, `updatedAt`)
- [ ] **T02** — Append `ForgotPasswordRequestSchema` + `ResetPasswordRequestSchema` + their inferred DTO types to `packages/shared/src/schemas/auth.ts`
- [ ] **T03** — Append `AuthResponseDTO` and `RefreshResponseDTO` interfaces to `packages/shared/src/schemas/auth.ts` (import `UserPublic` from `../types/user`)
- [ ] **T04** — Update `packages/shared/src/index.ts` to export `'./types/user'`
- [ ] **T05** — Create `apps/frontend/package.json` with all runtime + dev dependencies listed in plan §2b
- [ ] **T06** — Create `apps/frontend/tsconfig.json` (strict mode, `jsx: "react-jsx"`, path alias `@/*` → `src/*`)
- [ ] **T07** — Create `apps/frontend/vite.config.ts` (React plugin + `@/*` path alias resolving to `src/`)
- [ ] **T08** — Create `apps/frontend/index.html` (HTML entry point with `<div id="root">` and `src/main.tsx` script)
- [ ] **T09** — Create `apps/frontend/.env.example` documenting `VITE_API_URL=http://localhost:3000/api`
- [ ] **T10** — Run `pnpm install` to install all workspace dependencies
- [ ] **T11** — Run `npx shadcn@latest init` inside `apps/frontend/` to generate `tailwind.config.js`, `postcss.config.js`, `src/index.css`, and `components.json`
- [ ] **T12** — Run `npx shadcn@latest add button input label card form` to scaffold `src/components/ui/`

**Checkpoint 1:**
```bash
pnpm tsc --noEmit          # 0 type errors
pnpm --filter frontend lint --max-warnings 0
pnpm --filter frontend build  # compiles cleanly
```

---

## Phase 2 — Core Implementation

> Files within each group are independent and can be implemented in parallel.

### 2a — Infrastructure (PARALLEL)

- [ ] **T13** — Create `apps/frontend/src/lib/http.ts`: single Axios instance with `baseURL` from `VITE_API_URL`; request interceptor attaches `Authorization: Bearer <accessToken>` from store; response interceptor handles silent refresh on 401 with `_retry` guard and `window.location.href = '/login'` fallback (see plan §5a)
- [ ] **T14** — Create `apps/frontend/src/lib/query-client.ts`: export a singleton `QueryClient` with `defaultOptions.queries.retry: false`

### 2b — Auth Store (prerequisite for hooks)

- [ ] **T15** — Create `apps/frontend/src/stores/auth.store.ts`: Zustand store matching `AuthState` interface from plan §4; `setTokens` writes both localStorage keys; `clearAuth` removes both keys + resets state; `isAuthenticated` derived from `accessToken !== null`

### 2c — Auth Mutation Hooks (PARALLEL — depend on T15)

- [ ] **T16** — Create `apps/frontend/src/hooks/auth/use-register.ts`: `useMutation` → `POST /auth/register`; on success call `setTokens`, `setUser`, navigate to `/notes`
- [ ] **T17** — Create `apps/frontend/src/hooks/auth/use-login.ts`: `useMutation` → `POST /auth/login`; on success call `setTokens`, `setUser`, navigate to `/notes`
- [ ] **T18** — Create `apps/frontend/src/hooks/auth/use-logout.ts`: `useMutation` → `POST /auth/logout`; on success call `clearAuth`, navigate to `/login`
- [ ] **T19** — Create `apps/frontend/src/hooks/auth/use-forgot-password.ts`: `useMutation` → `POST /auth/forgot-password`; no token side-effects; mutation result used by page to show success message
- [ ] **T20** — Create `apps/frontend/src/hooks/auth/use-reset-password.ts`: `useMutation` → `POST /auth/reset-password`; on success `toast.success('Password reset — please log in')` + navigate to `/login`

### 2d — Route Guards (PARALLEL — depend on T15)

- [ ] **T21** — Create `apps/frontend/src/components/auth/protected-route.tsx`: reads `isAuthenticated` from store; renders `<Outlet />` or `<Navigate to="/login" replace />`
- [ ] **T22** — Create `apps/frontend/src/components/auth/guest-route.tsx`: reads `isAuthenticated` from store; renders `<Navigate to="/notes" replace />` or `<Outlet />`

**Checkpoint 2:**
```bash
pnpm tsc --noEmit                              # 0 type errors
pnpm --filter frontend lint --max-warnings 0
```

---

## Phase 3 — Integration (Pages + Router + Entry Point)

> Pages depend on hooks and guards; router depends on pages; main.tsx depends on router.

### 3a — Auth Pages (PARALLEL — depend on T16–T22)

- [ ] **T23** — Create `apps/frontend/src/pages/auth/login.page.tsx`: fields `email` + `password`; form with `zodResolver(LoginRequestSchema)`; inline field errors; API errors via `toast.error`; links to `/register` and `/forgot-password`
- [ ] **T24** — Create `apps/frontend/src/pages/auth/register.page.tsx`: fields `name` + `email` + `password`; password rules hint below input; form with `zodResolver(RegisterRequestSchema)`; link to `/login`
- [ ] **T25** — Create `apps/frontend/src/pages/auth/forgot-password.page.tsx`: field `email`; on submit success render "If that email exists, an OTP has been sent" message (do not hide form — show static message); link to `/login`
- [ ] **T26** — Create `apps/frontend/src/pages/auth/reset-password.page.tsx`: fields `email` + `otp` + `newPassword`; form with `zodResolver(ResetPasswordRequestSchema)`; on success navigates to `/login`; link to `/login`

### 3b — Stub Page (can be done in parallel with 3a)

- [ ] **T27** — Create `apps/frontend/src/pages/notes/notes-list.page.tsx`: minimal stub (`<div>Notes — coming in AB-1011</div>`) so router compiles

### 3c — Router + Entry Point (depend on 3a + 3b)

- [ ] **T28** — Create `apps/frontend/src/router.tsx`: `createBrowserRouter` with `GuestRoute` wrapping auth pages, `ProtectedRoute` wrapping `/notes`, and root `'/'` redirect to `/notes` (see proposal §7)
- [ ] **T29** — Create `apps/frontend/src/main.tsx`: hydrate auth store from localStorage on boot (read `auth.accessToken` + `auth.refreshToken`, call `setTokens` if both present); render `<QueryClientProvider>` + `<RouterProvider>` + `<Toaster />` (sonner)

**Checkpoint 3:**
```bash
pnpm tsc --noEmit                              # 0 type errors
pnpm --filter frontend lint --max-warnings 0
pnpm --filter frontend build                   # dist/ produced, 0 errors
```

---

## Phase 4 — Tests

> One test file per logical concern; each maps to a scenario from the spec/plan.

- [ ] **T30** — `auth.store.test.ts` — Scenario: `setTokens` writes `auth.accessToken` + `auth.refreshToken` to `localStorage` and sets `isAuthenticated: true`
- [ ] **T31** — `auth.store.test.ts` — Scenario: `clearAuth` removes both localStorage keys and resets all state to `null` / `false`
- [ ] **T32** — `auth.store.test.ts` — Scenario: boot-time hydration — if both keys exist in localStorage, calling `setTokens` in `main.tsx` results in `isAuthenticated: true` without requiring `setUser`
- [ ] **T33** — `protected-route.test.tsx` — Scenario: unauthenticated user visiting a protected path is redirected to `/login`
- [ ] **T34** — `protected-route.test.tsx` — Scenario: authenticated user visiting a protected path sees `<Outlet />` rendered
- [ ] **T35** — `guest-route.test.tsx` — Scenario: authenticated user visiting `/login` is redirected to `/notes`
- [ ] **T36** — `guest-route.test.tsx` — Scenario: unauthenticated user visiting `/login` sees the login page rendered
- [ ] **T37** — `use-login.test.ts` — Scenario: successful login calls `setTokens` + `setUser` and navigates to `/notes`
- [ ] **T38** — `use-login.test.ts` — Scenario: 401 response from login does NOT call `setTokens` and does NOT navigate
- [ ] **T39** — `use-register.test.ts` — Scenario: successful registration calls `setTokens` + `setUser` and navigates to `/notes`
- [ ] **T40** — `use-logout.test.ts` — Scenario: successful logout calls `clearAuth` and navigates to `/login`
- [ ] **T41** — `use-forgot-password.test.ts` — Scenario: mutation resolves on success (200); no tokens set
- [ ] **T42** — `use-reset-password.test.ts` — Scenario: successful reset shows success toast and navigates to `/login`
- [ ] **T43** — `http.test.ts` — Scenario: request interceptor attaches `Authorization: Bearer <token>` header when `accessToken` is present in store
- [ ] **T44** — `http.test.ts` — Scenario: 401 response with a valid `refreshToken` triggers `POST /auth/refresh`, retries original request, and updates store tokens
- [ ] **T45** — `http.test.ts` — Scenario: 401 response with no `refreshToken` calls `clearAuth` and redirects to `/login` without retrying
- [ ] **T46** — `http.test.ts` — Scenario: 401 on the retry itself (refresh fails) calls `clearAuth` and redirects — `_retry` flag prevents infinite loop
- [ ] **T47** — `schemas/auth.test.ts` (shared package) — Scenario: `ForgotPasswordRequestSchema` accepts valid email, rejects non-email string
- [ ] **T48** — `schemas/auth.test.ts` (shared package) — Scenario: `ResetPasswordRequestSchema` enforces password rules (≥8 chars, uppercase, digit, special char)

**Checkpoint 4 (Final):**
```bash
pnpm tsc --noEmit                              # 0 type errors
pnpm --filter frontend lint --max-warnings 0
pnpm --filter frontend test                    # all green, ≥80% coverage
pnpm --filter frontend build                   # clean build
```

---

## Summary

| Phase | Tasks | Parallel groups |
|-------|-------|-----------------|
| 1 — Foundation | T01–T12 | Sequential (scaffold must complete before Phase 2) |
| 2 — Core impl | T13–T22 | T13–T14 parallel; T16–T20 parallel; T21–T22 parallel |
| 3 — Integration | T23–T29 | T23–T27 parallel; T28–T29 sequential after |
| 4 — Tests | T30–T48 | All parallel once implementation is done |

**Total tasks:** 48  
**Estimated test count:** 19 test cases across 7 test files
