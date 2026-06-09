# Backend CLAUDE.md

@../../CLAUDE.md

---

## Commands

```bash
pnpm dev                        # dev server with hot reload
pnpm build                      # compile TypeScript to /dist
pnpm test                       # Vitest unit + Supertest integration
pnpm test --coverage            # with coverage report (target ≥ 80%)
pnpm lint                       # ESLint
pnpm tsc --noEmit               # type-check only
npx prisma migrate dev          # apply + generate migration (dev)
npx prisma migrate deploy       # apply migrations (prod — ask first)
npx prisma generate             # regenerate client after schema change
npx prisma studio               # GUI to inspect DB (dev only)
```

---

## Framework Patterns

**Layer responsibilities — never cross them:**
```
Controller  → validate (Zod from shared), call service, return response shape
Service     → business logic, throw domain errors, no Prisma
Repository  → Prisma queries only, no business logic, no HTTP concepts
```

**Controller shape:**
```ts
router.post('/notes', authenticate, async (req, res) => {
  const body = createNoteSchema.parse(req.body);   // throws on invalid
  const note = await noteService.create(req.user.id, body);
  res.status(201).json({ data: note });
});
```

**Service error pattern — throw, never return null for failures:**
```ts
if (!note) throw new NotFoundError('Note not found');
```

**Repository pattern — always scope to userId:**
```ts
findById(id: string, userId: string) {
  return prisma.note.findFirst({ where: { id, userId, deletedAt: null } });
}
```

**Middleware order:** `helmet → cors → rateLimit → json → routes → errorHandler`

**Auth middleware** injects `req.user: { id: string }` — always present on protected routes.

---

## Anti-Patterns

- Never call `prisma.*` outside a repository file
- Never return raw Prisma errors — catch and throw domain errors (`NotFoundError`, `ConflictError`, etc.)
- Never skip `userId` filter on any note/tag/version query — IDOR risk
- Never define Zod schemas inline in controllers — import from `packages/shared`
- Never use `res.send()` — use `res.json()` with the standard `{ data }` / `{ error }` shape
- Never hard-delete notes — set `deletedAt` only
- Never write migrations by hand — use `prisma migrate dev`
