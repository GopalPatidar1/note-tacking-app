# Technical Plan — AB-1010: Frontend Auth Pages

**Date:** 2026-06-09  
**Ticket:** AB-1010  
**Status:** AWAITING APPROVAL

---

## 0. Codebase Baseline

| Location | Current State |
|----------|--------------|
| `apps/frontend/` | Only `CLAUDE.md` exists — no `package.json`, no `src/` |
| `packages/shared/src/schemas/auth.ts` | Has `Register`, `Login`, `Logout`, `Refresh` schemas; **missing** `ForgotPassword`, `ResetPassword` |
| `packages/shared/src/types/` | Does not exist — `UserPublic` type is missing |
| `apps/backend/src/routes/auth.routes.ts` | Only `/register`, `/login`, `/logout`, `/refresh` wired — **`/forgot-password` and `/reset-password` not yet implemented** |

> **Dependency risk:** `useForgotPassword` and `useResetPassword` hooks will return 404 until the backend implements those routes. The frontend can build and compile cleanly; the endpoints just won't work at runtime until a backend ticket addresses them.

---

## 1. Shared Package Changes

### 1a. New file: `packages/shared/src/types/user.ts`

```typescript
export interface UserPublic {
  id: string
  name: string
  email: string
  createdAt: string  // ISO 8601 date-time string
  updatedAt: string
}
```

`UserPublic` will be reused by notes, tags, and sharing features — it does not belong in `schemas/auth.ts`.

### 1b. Additions to `packages/shared/src/schemas/auth.ts`

```typescript
// append after existing schemas

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email(),
})

export const ResetPasswordRequestSchema = z.object({
  email:       z.string().email(),
  otp:         z.string().min(1),
  newPassword: passwordSchema,  // reuse existing passwordSchema (already in file)
})

export type ForgotPasswordRequestDTO = z.infer<typeof ForgotPasswordRequestSchema>
export type ResetPasswordRequestDTO  = z.infer<typeof ResetPasswordRequestSchema>
```

> Note: `passwordSchema` is currently `const` (not exported). No change needed — `ResetPasswordRequestSchema` is defined in the same file and can reference it directly.

### 1c. Add auth response types to `packages/shared/src/schemas/auth.ts`

The backend `authService.register` and `authService.login` return this shape; the frontend needs typed responses:

```typescript
import type { UserPublic } from '../types/user'

export interface AuthResponseDTO {
  accessToken: string
  refreshToken: string
  user: UserPublic
}

export interface RefreshResponseDTO {
  accessToken: string
  refreshToken: string
}
```

### 1d. Update `packages/shared/src/index.ts`

```typescript
export * from './schemas/auth'
export * from './constants/auth'
export * from './types/user'     // ADD
export { ZodError } from 'zod'
```

---

## 2. Frontend App Scaffold (Phase 0 — no src/ exists yet)

### 2a. Files to create

| File | Purpose |
|------|---------|
| `apps/frontend/package.json` | Declare all dependencies + scripts |
| `apps/frontend/vite.config.ts` | Vite + React plugin + path aliases |
| `apps/frontend/tsconfig.json` | TypeScript config (strict mode, JSX react-jsx) |
| `apps/frontend/index.html` | HTML entry point with `<div id="root">` |
| `apps/frontend/.env.example` | Document `VITE_API_URL=http://localhost:3000/api` |

### 2b. `apps/frontend/package.json` — dependency list

```json
{
  "name": "frontend",
  "dependencies": {
    "@hookform/resolvers": "^3.x",
    "@note-app/shared": "workspace:*",
    "@radix-ui/react-label": "^2.x",
    "@radix-ui/react-slot": "^1.x",
    "@tanstack/react-query": "^5.x",
    "axios": "^1.x",
    "class-variance-authority": "^0.7.x",
    "clsx": "^2.x",
    "lucide-react": "^0.x",
    "react": "^19.x",
    "react-dom": "^19.x",
    "react-hook-form": "^7.x",
    "react-router-dom": "^6.x",
    "sonner": "^1.x",
    "tailwind-merge": "^2.x",
    "zustand": "^5.x"
  },
  "devDependencies": {
    "@types/react": "^19.x",
    "@types/react-dom": "^19.x",
    "@vitejs/plugin-react": "^4.x",
    "autoprefixer": "^10.x",
    "eslint": "^8.x",
    "postcss": "^8.x",
    "tailwindcss": "^3.x",
    "typescript": "^5.x",
    "vite": "^5.x",
    "vitest": "^1.x"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "lint": "eslint src --ext .tsx,.ts",
    "tsc": "tsc --noEmit"
  }
}
```

> **Toast library:** Using `sonner` (lightweight, shadcn-compatible) instead of the heavier shadcn toast primitive. One `<Toaster />` in `main.tsx`; call `toast.error()` / `toast.success()` from hooks.

### 2c. shadcn/ui initialization

Run `npx shadcn@latest init` to generate `components.json`, `tailwind.config.js`, and base CSS. Then add components:

```bash
npx shadcn@latest add button input label card form
```

This creates `apps/frontend/src/components/ui/` with the component primitives.

---

## 3. All Files to Create (complete list)

### Shared package

| File | Action |
|------|--------|
| `packages/shared/src/types/user.ts` | **CREATE** |
| `packages/shared/src/schemas/auth.ts` | **MODIFY** — append ForgotPassword/ResetPassword schemas + auth response types |
| `packages/shared/src/index.ts` | **MODIFY** — add `types/user` export |

### Frontend scaffold

| File | Action |
|------|--------|
| `apps/frontend/package.json` | **CREATE** |
| `apps/frontend/vite.config.ts` | **CREATE** |
| `apps/frontend/tsconfig.json` | **CREATE** |
| `apps/frontend/index.html` | **CREATE** |
| `apps/frontend/.env.example` | **CREATE** |
| `apps/frontend/tailwind.config.js` | **CREATE** (via shadcn init) |
| `apps/frontend/postcss.config.js` | **CREATE** (via shadcn init) |
| `apps/frontend/src/index.css` | **CREATE** (via shadcn init) |
| `apps/frontend/src/components/ui/` | **CREATE** (via shadcn add) |

### Frontend feature files

| File | Action |
|------|--------|
| `apps/frontend/src/lib/http.ts` | **CREATE** |
| `apps/frontend/src/lib/query-client.ts` | **CREATE** |
| `apps/frontend/src/stores/auth.store.ts` | **CREATE** |
| `apps/frontend/src/hooks/auth/use-register.ts` | **CREATE** |
| `apps/frontend/src/hooks/auth/use-login.ts` | **CREATE** |
| `apps/frontend/src/hooks/auth/use-logout.ts` | **CREATE** |
| `apps/frontend/src/hooks/auth/use-forgot-password.ts` | **CREATE** |
| `apps/frontend/src/hooks/auth/use-reset-password.ts` | **CREATE** |
| `apps/frontend/src/components/auth/protected-route.tsx` | **CREATE** |
| `apps/frontend/src/components/auth/guest-route.tsx` | **CREATE** |
| `apps/frontend/src/pages/auth/login.page.tsx` | **CREATE** |
| `apps/frontend/src/pages/auth/register.page.tsx` | **CREATE** |
| `apps/frontend/src/pages/auth/forgot-password.page.tsx` | **CREATE** |
| `apps/frontend/src/pages/auth/reset-password.page.tsx` | **CREATE** |
| `apps/frontend/src/pages/notes/notes-list.page.tsx` | **CREATE** (stub for AB-1011) |
| `apps/frontend/src/router.tsx` | **CREATE** |
| `apps/frontend/src/main.tsx` | **CREATE** |

---

## 4. Interface Shapes

### `AuthState` (Zustand store — `auth.store.ts`)

```typescript
import type { UserPublic } from '@note-app/shared'

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

Storage keys: `auth.accessToken`, `auth.refreshToken` in `localStorage`.

On `setTokens` → write both keys to localStorage, update state.  
On `clearAuth` → remove both keys, reset state to `null`.  
On app boot (`main.tsx`) → read both keys from localStorage, call `setTokens` + `setUser` if present (user is not persisted in localStorage — omit `setUser` on boot; user will re-hydrate on next protected API response).

> **Decision on boot-time user hydration:** The backend has no `GET /auth/me` endpoint (out of scope per FRS). On boot we can only restore tokens, not the user object. `isAuthenticated` is derived from `accessToken !== null`, so protected routes stay gated correctly. The user object populates when login/register succeeds in the current session.

### `AxiosRequestConfig` extension (`lib/http.ts`)

```typescript
// Extend Axios config to carry retry flag
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean
  }
}
```

---

## 5. Key Implementation Details

### 5a. Axios interceptors (`lib/http.ts`)

```typescript
// Request interceptor — attach access token
instance.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken  // store read outside React
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response interceptor — silent refresh on 401
instance.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const { refreshToken } = useAuthStore.getState()
      if (!refreshToken) {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        return Promise.reject(error)
      }
      try {
        const { data } = await axios.post('/auth/refresh', { refreshToken })
        useAuthStore.getState().setTokens(data.data)
        original.headers.Authorization = `Bearer ${data.data.accessToken}`
        return instance(original)
      } catch {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }
    return Promise.reject(error)
  }
)
```

> **Why `window.location.href` instead of React Router `navigate`?** The interceptor lives outside the React tree and has no access to router context. Using `window.location.href` is the standard pattern for this case. One alternative is a broadcast channel or an event emitter, but that's unnecessary complexity for this scope.

### 5b. Each auth mutation hook shape

```typescript
// Example: use-login.ts
export function useLogin() {
  const { setTokens, setUser } = useAuthStore()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (body: LoginRequestDTO) =>
      http.post<{ data: AuthResponseDTO }>('/auth/login', body).then(r => r.data.data),
    onSuccess: ({ accessToken, refreshToken, user }) => {
      setTokens({ accessToken, refreshToken })
      setUser(user)
      navigate('/notes', { replace: true })
    },
  })
}
```

`useForgotPassword` and `useResetPassword` do NOT call `setTokens`/`setUser`.  
`useResetPassword.onSuccess` → `navigate('/login')` + `toast.success('Password reset — please log in')`.

### 5c. Route guard shapes

```typescript
// protected-route.tsx — redirect to /login if not authenticated
export function ProtectedRoute() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

// guest-route.tsx — redirect to /notes if already authenticated
export function GuestRoute() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  return isAuthenticated ? <Navigate to="/notes" replace /> : <Outlet />
}
```

### 5d. Form error display pattern

Each page:
- Inline field errors via `<p className="text-destructive text-sm">{errors.email?.message}</p>`
- API errors via `toast.error(apiError.message)` in the mutation's `onError` handler (extract `error.response?.data?.error?.message ?? 'Something went wrong'`)

---

## 6. Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Token storage | `localStorage` | Persists across tabs; simpler than cookie/httpOnly for this scope |
| Toast library | `sonner` | Lighter than shadcn's radix toast; first-class shadcn support |
| Post-auth redirect | Always `/notes` | No return-URL logic per proposal §3g |
| `UserPublic` placement | `packages/shared/src/types/user.ts` | Reused across future feature tickets (notes, sharing) |
| boot-time user hydration | Tokens only (no user) | No `GET /auth/me` endpoint; `isAuthenticated` sufficient for route guards |
| `window.location.href` on 401 | Accepted | Interceptor has no router context; broadcast-channel pattern is over-engineered here |

---

## 7. No DB Changes

AB-1010 is frontend-only. No migrations, no schema changes.

---

## 8. Quality Gates

Run in this exact order after implementation:

```bash
# 1. Type-check entire monorepo
pnpm tsc --noEmit

# 2. Lint frontend
pnpm --filter frontend lint

# 3. Frontend unit tests
pnpm --filter frontend test

# 4. Frontend build check
pnpm --filter frontend build
```

Shared package has no test suite but must type-check cleanly via step 1.

---

## 9. Open Questions for Approval

| # | Question | Default if not answered |
|---|----------|------------------------|
| 1 | OTP field: `z.string().min(1)` (proposal) vs `z.string().length(6)` (page design says "6-digit")? | Follow proposal: `min(1)` |
| 2 | On boot, attempt `GET /auth/me` with stored token to re-hydrate user object? | No — endpoint out of scope per FRS; hydrate on next login |
| 3 | Should `forgot-password`/`reset-password` hooks be marked as stubs pending backend ticket, or built out fully? | Build fully — 404 is acceptable until backend delivers |
