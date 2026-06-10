# Spec Proposal — AB-1010: Frontend — Auth Pages

**Date:** 2026-06-09  
**Author:** gopalp@mindfiresolutions.com  
**Scope:** Frontend SPA — auth pages, routing, store, HTTP client  
**Status:** DRAFT

---

## 1. Summary

Implement the React 19 + Vite SPA frontend for the full authentication flow:

| Page | Route | Auth state |
|------|-------|------------|
| Register | `/register` | Public only (redirect to `/notes` if already authenticated) |
| Login | `/login` | Public only |
| Forgot Password | `/forgot-password` | Public only |
| Reset Password | `/reset-password` | Public only |
| Protected guard | wraps all future app routes | Redirect to `/login` if unauthenticated |

No new API endpoints. All calls target the existing `POST /auth/*` contract defined in `openapi.yaml`.

---

## 2. OpenAPI Contract Delta

None. AB-1010 is purely frontend. All API shapes are already specified under `/auth/*` in `openapi.yaml`.

---

## 3. Architecture Decisions

### 3a. Token storage — localStorage

Both `accessToken` and `refreshToken` stored in `localStorage` under keys:
- `auth.accessToken`
- `auth.refreshToken`

Zustand auth store is the **in-memory source of truth** and seeds from localStorage on app boot. All token reads go through the store, never directly from localStorage elsewhere in the app.

### 3b. Zustand auth store shape

```typescript
// apps/frontend/src/stores/auth.store.ts
interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: UserPublic | null
  isAuthenticated: boolean

  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void
  setUser: (user: UserPublic) => void
  clearAuth: () => void
}
```

On `setTokens`: writes to localStorage + updates state.  
On `clearAuth`: removes both localStorage keys + resets state to null.  
On app boot (`main.tsx`): read from localStorage → hydrate store if both tokens present.

### 3c. Axios HTTP client + interceptors

```typescript
// apps/frontend/src/lib/http.ts
```

Single Axios instance shared across the app:

**Request interceptor** — attach `Authorization: Bearer <accessToken>` from store on every request.

**Response interceptor (silent refresh)**:
1. On `401` response AND `refreshToken` present in store:
   - Call `POST /auth/refresh` with current `refreshToken`
   - On success: call `store.setTokens(newTokens)`, retry original request once
   - On failure (refresh also 401): call `store.clearAuth()`, redirect to `/login`
2. On `401` AND no `refreshToken`: call `store.clearAuth()`, redirect to `/login`

Use a `_retry` flag on the request config to prevent infinite refresh loops.

### 3d. TanStack Query — auth mutations

Auth mutations are thin wrappers over Axios calls. No query caching needed for auth itself; only mutations.

```typescript
// apps/frontend/src/hooks/auth/use-register.ts
// apps/frontend/src/hooks/auth/use-login.ts
// apps/frontend/src/hooks/auth/use-logout.ts
// apps/frontend/src/hooks/auth/use-forgot-password.ts
// apps/frontend/src/hooks/auth/use-reset-password.ts
```

Each hook uses `useMutation` and calls the appropriate Axios endpoint. On success the register/login hooks call `store.setTokens` + `store.setUser` then navigate to `/notes`.

### 3e. Form validation — react-hook-form + zod

All forms use `useForm` with `zodResolver` from `@hookform/resolvers/zod`. Schemas imported directly from `packages/shared`:

| Form | Schema |
|------|--------|
| Register | `RegisterRequestSchema` |
| Login | `LoginRequestSchema` |
| Forgot Password | `ForgotPasswordRequestSchema` *(new — see §4)* |
| Reset Password | `ResetPasswordRequestSchema` *(new — see §4)* |

### 3f. Protected routes

```typescript
// apps/frontend/src/components/auth/protected-route.tsx
```

Wrapper component: if `!isAuthenticated` → `<Navigate to="/login" replace />`.  
Inverse guest guard: if `isAuthenticated` on `/login` or `/register` → `<Navigate to="/notes" replace />`.

### 3g. Post-auth redirect

Both register and login always redirect to `/notes` on success. No "return to attempted URL" logic.

---

## 4. Shared Package Additions (`packages/shared`)

Two Zod schemas are missing from `packages/shared/src/schemas/auth.ts` and must be added:

```typescript
// ADD to packages/shared/src/schemas/auth.ts

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email(),
})

export const ResetPasswordRequestSchema = z.object({
  email:       z.string().email(),
  otp:         z.string().min(1),
  newPassword: passwordSchema,   // reuse existing passwordSchema
})

export type ForgotPasswordRequestDTO = z.infer<typeof ForgotPasswordRequestSchema>
export type ResetPasswordRequestDTO  = z.infer<typeof ResetPasswordRequestSchema>
```

Export them from `packages/shared/src/index.ts`.

---

## 5. Frontend File Layout

```
apps/frontend/src/
  lib/
    http.ts                          # Axios instance + request/response interceptors
    query-client.ts                  # TanStack QueryClient config
  stores/
    auth.store.ts                    # Zustand auth store (tokens + user)
  hooks/
    auth/
      use-register.ts                # useMutation → POST /auth/register
      use-login.ts                   # useMutation → POST /auth/login
      use-logout.ts                  # useMutation → POST /auth/logout
      use-forgot-password.ts         # useMutation → POST /auth/forgot-password
      use-reset-password.ts          # useMutation → POST /auth/reset-password
  components/
    auth/
      protected-route.tsx            # Guards authenticated routes
      guest-route.tsx                # Guards public-only routes (login, register)
  pages/
    auth/
      login.page.tsx
      register.page.tsx
      forgot-password.page.tsx
      reset-password.page.tsx
  router.tsx                         # React Router v6 route definitions
  main.tsx                           # App boot: hydrate auth store from localStorage
```

---

## 6. Page Designs

### 6a. Login page (`/login`)

Fields: `email`, `password`  
Submit: calls `useLogin` mutation  
Links: "Don't have an account? Register" → `/register`, "Forgot password?" → `/forgot-password`  
Error display: inline field errors from react-hook-form + toast for API errors (e.g. 401)

### 6b. Register page (`/register`)

Fields: `name`, `email`, `password`  
Password rules shown below input: ≥8 chars, ≥1 uppercase, ≥1 digit, ≥1 special char  
Submit: calls `useRegister` mutation  
Link: "Already have an account? Login" → `/login`

### 6c. Forgot Password page (`/forgot-password`)

Fields: `email`  
Submit: calls `useForgotPassword` mutation  
Success state: show message "If that email exists, an OTP has been sent" (always 200 per spec)  
Link: "Back to login" → `/login`

### 6d. Reset Password page (`/reset-password`)

Fields: `email`, `otp` (6-digit), `newPassword`  
Submit: calls `useResetPassword` mutation  
On success: redirect to `/login` with a success toast  
Link: "Back to login" → `/login`

---

## 7. Router Configuration

```typescript
// apps/frontend/src/router.tsx  (React Router v6)
const router = createBrowserRouter([
  // Public-only routes (redirect to /notes if authenticated)
  { element: <GuestRoute />, children: [
    { path: '/login',           element: <LoginPage /> },
    { path: '/register',        element: <RegisterPage /> },
    { path: '/forgot-password', element: <ForgotPasswordPage /> },
    { path: '/reset-password',  element: <ResetPasswordPage /> },
  ]},
  // Protected routes (redirect to /login if unauthenticated)
  { element: <ProtectedRoute />, children: [
    { path: '/notes',  element: <NotesListPage /> },   // AB-1011
    // ... future routes
  ]},
  { path: '/', element: <Navigate to="/notes" replace /> },
])
```

---

## 8. New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react-hook-form` | `^7.x` | Form state management |
| `@hookform/resolvers` | `^3.x` | Zod resolver for react-hook-form |
| `axios` | `^1.x` | HTTP client + interceptors |
| `react-router-dom` | `^6.x` | Client-side routing |
| `zustand` | `^5.x` | Auth state store |
| `@tanstack/react-query` | `^5.x` | Server-state mutations |

> shadcn/ui (already in tech stack) provides form inputs, buttons, toasts.

---

## 9. Out of Scope for This Ticket

- Notes list page UI → AB-1011
- Note editor → AB-1012
- `GET /auth/me` profile endpoint — not in FRS; deferred
- OAuth — explicitly out of scope per FRS
- Remember-me / stay-logged-in toggle

---

## 10. Open Questions (Resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | Token storage? | **localStorage** — simple, persists across tabs |
| 2 | Form library? | **react-hook-form + zod resolver** — reuse shared schemas |
| 3 | Silent refresh? | **Yes — Axios interceptor** retries on 401 with single-retry guard |
| 4 | Post-auth redirect? | **Always `/notes`** — no return-URL logic |
| 5 | ForgotPassword / ResetPassword schemas missing from shared? | **Add them** in this ticket under packages/shared |
