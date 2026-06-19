# Specification — AB-1010: Frontend Auth Pages

**Ticket:** AB-1010
**Type:** Frontend Feature + Scaffold
**Status:** COMPLETED
**Branch:** `feat/AB-1010-frontend-auth-pages`

---

## 1. Requirements

| ID | Requirement |
|----|-------------|
| R-01 | `apps/frontend` MUST be scaffolded as a React 19 + Vite SPA with TypeScript strict mode |
| R-02 | The frontend MUST include a Login page at `/login` |
| R-03 | The frontend MUST include a Register page at `/register` |
| R-04 | The frontend MUST include a Forgot Password page at `/forgot-password` |
| R-05 | The frontend MUST include a Reset Password page at `/reset-password` |
| R-06 | A Zustand auth store MUST persist `accessToken` and `refreshToken` in `localStorage` |
| R-07 | An Axios instance MUST silently refresh access tokens on 401 responses and redirect to `/login` on refresh failure |
| R-08 | `ProtectedRoute` MUST redirect unauthenticated users to `/login` |
| R-09 | `GuestRoute` MUST redirect already-authenticated users to `/notes` |
| R-10 | Form validation MUST use `react-hook-form` + Zod schemas from `packages/shared` |
| R-11 | API errors MUST be shown as toast notifications (via `sonner`) |
| R-12 | `ForgotPasswordRequestSchema` and `ResetPasswordRequestSchema` MUST be added to `packages/shared/src/schemas/auth.ts` |
| R-13 | `UserPublic` type MUST be created in `packages/shared/src/types/user.ts` |
| R-14 | `AuthResponseDTO` and `RefreshResponseDTO` MUST be defined in `packages/shared/src/schemas/auth.ts` |
| R-15 | shadcn/ui components (button, input, label, card, form) MUST be initialised |

---

## 2. Acceptance Criteria

- [ ] `pnpm --filter frontend dev` starts the Vite dev server without errors
- [ ] `pnpm --filter frontend build` compiles without TypeScript or lint errors
- [ ] Login page renders email + password fields; successful login navigates to `/notes`
- [ ] Login with wrong password shows toast error; URL stays `/login`
- [ ] Register page renders name + email + password fields; successful register navigates to `/notes`
- [ ] Forgot Password page submits email and shows success toast
- [ ] Reset Password page submits email + OTP + new password and navigates to `/login` on success
- [ ] `ProtectedRoute` redirects unauthenticated visits to `/login`
- [ ] `GuestRoute` redirects authenticated visits to `/notes`
- [ ] Tokens are persisted in `localStorage['auth.accessToken']` and `localStorage['auth.refreshToken']`
- [ ] 401 response triggers silent refresh; retry original request with new token
- [ ] `pnpm tsc --noEmit` passes across the full monorepo

---

## 3. Affected Capabilities

| Capability | Impact |
|-----------|--------|
| Frontend scaffold | New — `apps/frontend` package created |
| Authentication UI | New — Login, Register, Forgot Password, Reset Password pages |
| Auth state management | New — Zustand `useAuthStore` with localStorage persistence |
| HTTP client | New — Axios instance with Bearer interceptor + silent refresh |
| Route guards | New — `ProtectedRoute` and `GuestRoute` components |
| Shared package | Extended — `ForgotPasswordRequestSchema`, `ResetPasswordRequestSchema`, `AuthResponseDTO`, `RefreshResponseDTO`, `UserPublic` |
| React Router | New — router with auth-gated route structure |

---

## 4. Functional Behavior

### Auth Store (`useAuthStore`)
- State: `accessToken`, `refreshToken`, `user`, `isAuthenticated`
- `setTokens`: write both tokens to localStorage + state
- `clearAuth`: remove tokens from localStorage + reset state
- Boot hydration: restore tokens from localStorage (user not persisted — no `GET /auth/me` endpoint)

### Axios Interceptors
- Request: attach `Authorization: Bearer <accessToken>` from store
- Response 401: if not retried → call `POST /auth/refresh` with stored `refreshToken` → update tokens → retry original request; on failure → `clearAuth` + redirect `window.location.href = '/login'`

### Route Structure
```
GuestRoute  → /login, /register, /forgot-password, /reset-password
ProtectedRoute → /notes, /notes/new, /notes/:id
```

### Post-auth navigation
- Login / Register success → navigate to `/notes` (replace)
- Reset Password success → navigate to `/login` + toast success
- Logout → navigate to `/login`

---

## 5. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| AB-1001 | Prerequisite | `packages/shared` workspace resolution |
| AB-1002 | Prerequisite | Backend auth endpoints (login, register, logout, refresh) |
| `packages/shared` | Internal | Auth Zod schemas, DTOs, `UserPublic` |
| React 19, Vite, TanStack Query | External | Frontend runtime |
| Zustand | External | Auth state management |
| react-hook-form, @hookform/resolvers | External | Form handling + Zod integration |
| sonner | External | Toast notifications |
| shadcn/ui | External | UI component library |
| AB-1011 | Consumer | Notes list page is the post-login destination |
