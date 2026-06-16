# Frontend — Note Taking Application

React 19 single-page application for the Note Taking platform. Provides authentication, note management, full-text search, public sharing, and version history through a rich-text editing experience.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Architecture](#architecture)
  - [Routing](#routing)
  - [State Management](#state-management)
  - [HTTP Client](#http-client)
  - [Component Patterns](#component-patterns)
  - [Form Validation](#form-validation)
- [Features](#features)
- [Testing](#testing)
- [Coding Standards](#coding-standards)

---

## Tech Stack

| Concern           | Library / Tool                          | Version |
|-------------------|-----------------------------------------|---------|
| UI framework      | React                                   | 19      |
| Language          | TypeScript                              | 5.5     |
| Build tool        | Vite                                    | 5.4     |
| Routing           | React Router DOM                        | 6.26    |
| Server state      | TanStack Query                          | 5.56    |
| Client/UI state   | Zustand                                 | 5.0     |
| Rich text editor  | TipTap                                  | 3.26    |
| Component library | shadcn/ui + Radix UI primitives         | —       |
| Styling           | Tailwind CSS + PostCSS                  | 3.4     |
| HTTP              | Axios                                   | 1.7     |
| Forms             | React Hook Form + Zod resolvers         | 7.53    |
| Icons             | Lucide React                            | 0.462   |
| Toasts            | Sonner                                  | 1.5     |
| Testing           | Vitest + Testing Library + jsdom + MSW  | 2.1     |

---

## Project Structure

```
apps/frontend/
├── src/
│   ├── components/
│   │   ├── auth/               # Route guards
│   │   │   ├── guest-route.tsx     # Redirects authenticated users away from auth pages
│   │   │   └── protected-route.tsx # Redirects unauthenticated users to /login
│   │   ├── layout/
│   │   │   └── app-layout.tsx      # Shell with sidebar navigation
│   │   ├── notes/              # Note-domain UI components
│   │   │   ├── note-card.tsx
│   │   │   ├── notes-pagination.tsx
│   │   │   ├── notes-sidebar.tsx
│   │   │   ├── notes-toolbar.tsx
│   │   │   ├── search-result-card.tsx
│   │   │   ├── tag-selector.tsx
│   │   │   └── tiptap-editor.tsx   # Rich text editor (TipTap)
│   │   ├── sharing/
│   │   │   └── share-modal.tsx     # Generate / revoke public share links
│   │   ├── ui/                 # shadcn/ui primitives
│   │   │   ├── alert-dialog.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── form.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   └── sheet.tsx
│   │   └── versions/
│   │       └── version-history-sheet.tsx
│   ├── hooks/
│   │   ├── auth/               # TanStack Query mutations for auth flows
│   │   │   ├── use-forgot-password.ts
│   │   │   ├── use-login.ts
│   │   │   ├── use-logout.ts
│   │   │   ├── use-register.ts
│   │   │   └── use-reset-password.ts
│   │   ├── notes/              # Queries + mutations for notes and tags
│   │   │   ├── use-create-note.ts
│   │   │   ├── use-delete-note.ts
│   │   │   ├── use-note.ts
│   │   │   ├── use-notes.ts
│   │   │   ├── use-search.ts
│   │   │   ├── use-tags.ts
│   │   │   └── use-update-note.ts
│   │   ├── sharing/
│   │   │   ├── use-create-share-link.ts
│   │   │   ├── use-public-note.ts
│   │   │   └── use-revoke-share-link.ts
│   │   └── versions/
│   │       ├── use-note-version.ts
│   │       ├── use-note-versions.ts
│   │       └── use-restore-version.ts
│   ├── lib/
│   │   ├── http.ts             # Authenticated Axios instance + token refresh interceptor
│   │   ├── public-http.ts      # Unauthenticated Axios instance (public note endpoint)
│   │   ├── query-client.ts     # TanStack Query client configuration
│   │   └── utils.ts            # Tailwind cn() helper
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── forgot-password.page.tsx
│   │   │   ├── login.page.tsx
│   │   │   ├── register.page.tsx
│   │   │   └── reset-password.page.tsx
│   │   ├── notes/
│   │   │   ├── note-editor.page.tsx  # Create / edit note with TipTap
│   │   │   ├── notes-list.page.tsx   # Paginated note list with filters
│   │   │   └── search.page.tsx       # Full-text search with highlights
│   │   └── public/
│   │       └── public-note.page.tsx  # Unauthenticated read-only note view
│   ├── stores/
│   │   └── auth.store.ts       # Zustand store: tokens + user session
│   ├── test/
│   │   └── setup.ts            # Vitest global setup (Testing Library + MSW)
│   ├── __tests__/              # Unit and component tests
│   │   ├── notes/
│   │   ├── public/
│   │   ├── sharing/
│   │   └── versions/
│   ├── router.tsx              # React Router browser router definition
│   ├── main.tsx                # Application entry point
│   └── index.css               # Tailwind base + global styles
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── package.json
```

---

## Getting Started

**Prerequisites:** Node.js 22, pnpm 9+, backend running on `http://localhost:3000`. Assumes React 19 and TypeScript familiarity — this README focuses on project-specific patterns, not framework basics.

```bash
# From the monorepo root — install all dependencies
pnpm install

# Start the Vite dev server
pnpm --filter frontend dev
```

The app is available at `http://localhost:5173` by default.

---

## Environment Variables

Create `.env` in `apps/frontend/` (already present in the repo):

| Variable       | Default                          | Description                       |
|----------------|----------------------------------|-----------------------------------|
| `VITE_API_URL` | `http://localhost:3000/api`      | Base URL for all authenticated API calls |

Never hardcode this URL in source files. Always use `import.meta.env.VITE_API_URL`.

---

## Available Scripts

Run from `apps/frontend/` or prefix with `pnpm --filter frontend` from the monorepo root.

```bash
pnpm dev              # Start Vite dev server (hot reload)
pnpm build            # Type-check then produce a production build to /dist
pnpm preview          # Serve the production build locally
pnpm test             # Run all unit tests once (Vitest)
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with v8 coverage report (≥ 80% lines required)
pnpm lint             # ESLint over src/**/*.{ts,tsx}
pnpm tsc              # Type-check only (no output)
```

---

## Architecture

### Routing

Routes are defined in `src/router.tsx` using React Router DOM v6 `createBrowserRouter`.

| Path                  | Guard       | Page component          |
|-----------------------|-------------|-------------------------|
| `/login`              | Guest only  | `LoginPage`             |
| `/register`           | Guest only  | `RegisterPage`          |
| `/forgot-password`    | Guest only  | `ForgotPasswordPage`    |
| `/reset-password`     | Guest only  | `ResetPasswordPage`     |
| `/notes`              | Protected   | `NotesListPage`         |
| `/notes/new`          | Protected   | `NoteEditorPage`        |
| `/notes/:id`          | Protected   | `NoteEditorPage`        |
| `/search`             | Protected   | `SearchPage`            |
| `/public/:token`      | Open        | `PublicNotePage`        |
| `/`                   | —           | Redirect → `/notes`     |

**`GuestRoute`** redirects authenticated users to `/notes`.  
**`ProtectedRoute`** redirects unauthenticated users to `/login`.

---

### State Management

Two separate layers handle different concerns:

**TanStack Query** — all server state (notes, tags, versions, search results, share links). Every fetch or mutation has its own hook in `src/hooks/`. Cache invalidation is triggered on mutation success; no server data is duplicated in Zustand.

**Zustand** (`src/stores/auth.store.ts`) — client-only session state:
- `accessToken` / `refreshToken` — mirrored from `localStorage`
- `user` — the authenticated `UserPublic` object
- `isAuthenticated` — derived boolean flag
- Actions: `setTokens`, `setUser`, `clearAuth`

Tokens are persisted in `localStorage` under the keys `auth.accessToken` and `auth.refreshToken` so sessions survive page reloads.

---

### HTTP Client

**`src/lib/http.ts`** — authenticated Axios instance used by all protected endpoints.

- **Request interceptor**: attaches `Authorization: Bearer <accessToken>` from the Zustand store.
- **Response interceptor**: on a `401` from a non-auth endpoint, attempts a silent token refresh via `POST /auth/refresh`. On success, retries the original request with the new token. On failure, clears auth state and redirects to `/login`.

**`src/lib/public-http.ts`** — separate unauthenticated Axios instance for `GET /public/:token`. No auth headers or refresh logic.

---

### Component Patterns

**One hook per operation** — every TanStack Query hook encapsulates one `useQuery` or `useMutation`:

```ts
export function useCreateNote() {
  return useMutation({
    mutationFn: (body: CreateNoteDto) => api.post('/notes', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  })
}
```

**Rich text editing** — `TipTapEditor` component wraps TipTap's `useEditor` with `StarterKit`. Used only for note content; title and tag inputs are plain text.

**shadcn/ui** — use existing UI primitives (`Button`, `Dialog`, `Sheet`, `Card`, `Form`, `Input`, `Label`, `AlertDialog`) before building custom ones.

**Layout** — `AppLayout` provides the sidebar + main area shell. All protected pages render inside it.

---

### Form Validation

Forms use `react-hook-form` with `zodResolver`. Schemas are imported from `@note-app/shared` — never defined in the frontend:

```ts
import { loginSchema } from '@note-app/shared'

const form = useForm({ resolver: zodResolver(loginSchema) })
```

---

## Features

| Feature               | Pages / Components                                  |
|-----------------------|-----------------------------------------------------|
| Register / Login      | `RegisterPage`, `LoginPage`                         |
| Password reset (OTP)  | `ForgotPasswordPage`, `ResetPasswordPage`           |
| Auto token refresh    | `src/lib/http.ts` response interceptor              |
| Notes list            | `NotesListPage`, `NoteCard`, `NotesSidebar`, `NotesToolbar`, `NotesPagination` |
| Create / edit notes   | `NoteEditorPage`, `TipTapEditor`, `TagSelector`     |
| Soft delete           | `useDeleteNote` — sets `deletedAt` via API          |
| Full-text search      | `SearchPage`, `SearchResultCard`, `useSearch`       |
| Share links           | `ShareModal`, `useCreateShareLink`, `useRevokeShareLink` |
| Public note view      | `PublicNotePage`, `public-http.ts`                  |
| Version history       | `VersionHistorySheet`, `useNoteVersions`, `useRestoreVersion` |

---

## Testing

Tests live in `src/__tests__/` mirroring the feature structure. The setup file is `src/test/setup.ts`.

```bash
pnpm test             # single run
pnpm test:watch       # watch mode
pnpm test:coverage    # coverage report — must meet ≥ 80% lines
```

**Tools:**
- **Vitest** with `jsdom` environment
- **@testing-library/react** + `@testing-library/user-event` for component tests
- **MSW v2** for API mocking in hook tests

**What is tested:**
- Hook behaviour (queries and mutations) via MSW-intercepted requests
- Component rendering and user interactions
- Page-level integration (search flow, share modal, version restore)

---

## Coding Standards

- **No `any` types** — TypeScript strict mode is enforced.
- **No Zod schemas in the frontend** — import from `@note-app/shared`.
- **No server data in Zustand** — TanStack Query owns all server state.
- **No direct `useEffect` for server sync** — use query invalidation instead.
- **No hardcoded API URLs** — always `import.meta.env.VITE_API_URL`.
- **No imports from `apps/backend`** — use shared types from `packages/shared`.
- **Naming**: `camelCase` variables/functions · `PascalCase` components/types · `kebab-case` filenames.
- **File organisation**: components, hooks, and types grouped by feature domain.
