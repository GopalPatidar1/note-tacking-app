# CLAUDE.md

@AGENTS.md

---

## Claude Code-Specific Rules

### Permission Model

Proceed without asking:
- Read any file, grep, find, list directories
- Edit/create files inside `/apps` or `/packages`
- Run `pnpm install`, `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm tsc`
- Run `prisma generate`, `prisma migrate dev` (dev only)

Always ask before proceeding:
- `git push` (any remote write)
- `git reset --hard`, `git rebase`, `git branch -D`
- `prisma migrate deploy` (production migration)
- `DROP TABLE`, raw destructive SQL
- Deleting any file not created in the current session
- Any command with `--force` or `-f`

---

### Context Management

- If the task requires reading more than 10 files, spawn an Explore subagent; do not flood main context.
- When context approaches limit, summarize completed work and continue — do not restart or lose decisions already made.
- Never re-read a file you already read in the same turn.

---

### Thinking Depth

| Task type                              | Depth    |
|----------------------------------------|----------|
| Rename / trivial edit                  | None     |
| Single-file bug fix                    | Brief    |
| Cross-layer feature (controller → DB)  | Extended |
| Architecture decision / new module     | Deep     |

---

### Commit Message Format

```
<type>(<scope>): <short imperative summary>

[optional body — what and why, not how]
```

Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`
Scope: `auth`, `notes`, `tags`, `search`, `sharing`, `versions`, `shared`, `infra`

Examples:
```
feat(notes): add soft-delete with 30-day retention
fix(auth): invalidate refresh token on logout
test(tags): add integration tests for tag CRUD
```

---

### Branch Naming

```
<type>/<ticket-id>-<short-slug>
```

Examples:
```
feat/AB-1002-auth-login
fix/AB-1004-note-soft-delete
chore/AB-1001-monorepo-setup
```

---

### Quality Gates (run in this order before committing)

```bash
pnpm tsc --noEmit          # 1. type-check — fix all errors first
pnpm --filter backend lint # 2. lint backend
pnpm --filter frontend lint# 3. lint frontend
pnpm --filter backend test # 4. unit + integration tests
pnpm --filter frontend test# 5. frontend unit tests
pnpm --filter backend build# 6. build check
```

Do not commit if any gate fails. Do not use `--no-verify`.
