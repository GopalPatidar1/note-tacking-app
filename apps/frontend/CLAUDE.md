# Frontend CLAUDE.md

@../../CLAUDE.md

---

## Commands

```bash
pnpm dev            # Vite dev server
pnpm build          # production build to /dist
pnpm preview        # serve production build locally
pnpm test           # Vitest unit tests
pnpm lint           # ESLint
pnpm tsc --noEmit   # type-check only
```

---

## Component Patterns

**File structure per feature:**
```
/src/features/<feature>/
  components/     # UI components for this feature only
  hooks/          # TanStack Query hooks (useNotes, useCreateNote…)
  types.ts        # local types not shared cross-app
```

**TanStack Query — one hook per operation:**
```ts
export function useCreateNote() {
  return useMutation({
    mutationFn: (body: CreateNoteDto) => api.post('/notes', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  });
}
```

**Zustand — UI state only (auth session, modals, sidebar):**
```ts
// Good: auth token, open/close state, active filters
// Bad: server data that TanStack Query already owns
```

**shadcn/ui** — use existing components before building custom ones.
**TipTap** — rich text editor for note content only; do not use for tag/title inputs.

**Form validation** — use Zod schemas from `packages/shared` with `react-hook-form`:
```ts
const form = useForm({ resolver: zodResolver(createNoteSchema) });
```

---

## Anti-Patterns

- Never fetch data directly in a component — always go through a TanStack Query hook
- Never store server data in Zustand — that's TanStack Query's job
- Never define Zod schemas in the frontend — import from `packages/shared`
- Never use `useEffect` to sync server state — use query invalidation instead
- Never hardcode API base URLs — use `import.meta.env.VITE_API_URL`
- Never use `any` or cast with `as unknown as T` to silence type errors — fix the type
- Never import from `apps/backend` directly — use shared types from `packages/shared`
