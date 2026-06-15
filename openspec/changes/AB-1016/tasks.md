# Task Checklist — AB-1016: Playwright E2E Tests

**Date:** 2026-06-15
**Branch:** feat/AB-1016-playwright-e2e
**Total scenarios:** 19 across 6 spec files
**Total files:** 14 new · 1 modified

---

## Phase 1 — Foundation (package + config)

These tasks must be done sequentially — each depends on the previous.

- [ ] **T01** Create directory skeleton
  ```
  apps/e2e/
  apps/e2e/fixtures/
  apps/e2e/pages/
  apps/e2e/tests/
  ```

- [ ] **T02** Create `apps/e2e/package.json`
  - name `@note-app/e2e`, scripts: `test`, `test:ui`, `test:headed`, `test:report`
  - devDependency: `@playwright/test ^1.45.0`

- [ ] **T03** Create `apps/e2e/.gitignore`
  - Entries: `fixtures/auth-state.json`, `playwright-report/`, `test-results/`

- [ ] **T04** Create `apps/e2e/playwright.config.ts`
  - `testDir: './tests'`
  - `globalSetup: './global-setup.ts'`
  - `fullyParallel: false` (tests share one DB user — sequential avoids data races)
  - `use.baseURL: 'http://localhost:5173'`
  - `use.storageState: 'fixtures/auth-state.json'`
  - `use.trace: 'on-first-retry'`, `use.screenshot: 'only-on-failure'`
  - `projects`: one entry — `{ name: 'chromium', use: devices['Desktop Chrome'] }`
  - `webServer`: two entries — backend `:3000` and frontend `:5173` with `reuseExistingServer: !process.env.CI`

- [ ] **T05** Run `pnpm install` from repo root to register the new workspace package

- [ ] **T06** Install Playwright browser binary
  ```bash
  pnpm --filter '@note-app/e2e' exec playwright install --with-deps chromium
  ```

- [ ] **T07** Update root `package.json` — change `test:e2e` script
  - From: `"playwright test"`
  - To: `"pnpm --filter '@note-app/e2e' test"`

### Phase 1 Checkpoint
```bash
pnpm tsc --noEmit                         # 0 type errors
pnpm --filter '@note-app/e2e' exec playwright --version   # confirms binary installed
```

---

## Phase 2 — Core Infrastructure (fixtures + page objects)

**T08–T10 can be written in parallel** (no cross-dependencies).
**T11 depends on T08** (imports `test-user.ts`).
**T12–T14 can be written in parallel** (no cross-dependencies, import only Playwright types).

- [ ] **T08** `[PARALLEL]` Create `apps/e2e/fixtures/test-user.ts`
  - Export `TEST_USER` constant: `{ name, email: 'e2e-test@example.com', password: 'Test1234!' }`

- [ ] **T09** `[PARALLEL]` Create `apps/e2e/fixtures/api-helpers.ts`
  - `getToken(page)` — reads `auth.accessToken` from localStorage
  - `createNote(token, title, content?)` — POST `/api/notes`, returns `{ id }`
  - `updateNote(token, id, title, content)` — PATCH `/api/notes/:id`
  - `createTag(token, name, color?)` — POST `/api/tags`, returns `{ id }`
  - `deleteTag(token, id)` — DELETE `/api/tags/:id`
  - All functions typed with no `any`; fetch responses cast to narrow interfaces

- [ ] **T10** `[PARALLEL]` Create `apps/e2e/pages/auth.page.ts`
  - `gotoLogin()`, `gotoRegister()`
  - Locators: `nameInput()`, `emailInput()`, `passwordInput()`
  - Locators: `signInButton()` ("Sign in"), `createAcctButton()` ("Create account")
  - Locator: `errorMessage()` (`getByRole('alert')`)

- [ ] **T11** `[PARALLEL]` Create `apps/e2e/pages/notes-list.page.ts`
  - `goto()` → `/notes`
  - Locators: `newNoteButton()` (`/\+ New Note/i`), `logoutButton()` ("Logout")
  - `noteCard(title)` → `locator('[data-slot="card"]').filter({ hasText: title })`
  - `deleteNote(title)` → hover card → `getByLabel('Delete note')` click

- [ ] **T12** `[PARALLEL]` Create `apps/e2e/pages/note-editor.page.ts`
  - Locators: `titleInput()` (`getByLabel('Note title')`), `editor()` (`.ProseMirror`)
  - Locators: `createButton()`, `historyButton()`, `shareButton()`, `savedText()`
  - Helper: `fillAndCreate(title, content)` — fill title + editor content + click Create Note

- [ ] **T13** Create `apps/e2e/global-setup.ts` _(depends on T08 — imports test-user.ts)_
  - `POST /api/auth/register` with `TEST_USER`; on 409 fall back to `POST /api/auth/login`
  - Throw if response is not ok
  - Launch Chromium → navigate to `:5173` → `page.evaluate` to set `auth.accessToken` + `auth.refreshToken` in localStorage
  - `context.storageState({ path: 'fixtures/auth-state.json' })` → close browser

### Phase 2 Checkpoint
```bash
pnpm tsc --noEmit          # 0 errors across all packages including apps/e2e
```

---

## Phase 3 — Test Specs (19 scenarios)

All spec files depend on Phase 2 (page objects + fixtures).
**T14–T19 can be written in parallel** — no cross-spec dependencies.

- [ ] **T14** `[PARALLEL]` Create `apps/e2e/tests/auth.spec.ts`

  File-level override: `test.use({ storageState: { cookies: [], origins: [] } })`

  | Scenario | ID |
  |----------|----|
  | Register with unique email (`e2e-register-${Date.now()}@example.com`) → URL becomes `/notes` | E01 |
  | Login with valid TEST_USER credentials → URL becomes `/notes` | E02 |
  | Login with wrong password → `getByRole('alert')` visible; URL stays `/login` | E03 |
  | Logout from `/notes` (load storageState manually via nested `test.use`) → URL becomes `/login` | E04 |

  > E04: nested `describe` block with `test.use({ storageState: 'fixtures/auth-state.json' })` to re-enable auth for just that test.

- [ ] **T15** `[PARALLEL]` Create `apps/e2e/tests/notes.spec.ts`

  `beforeEach`: call `getToken(page)` to capture token for API helpers.

  | Scenario | ID |
  |----------|----|
  | goto `/notes/new` → `fillAndCreate()` → goto `/notes` → `noteCard(title)` is visible | E01 |
  | `createNote()` via API → goto `/notes/:id` → change title → wait for `savedText()` → reload → `titleInput()` value matches new title | E02 |
  | `createNote()` via API → goto `/notes` → `deleteNote(title)` → `noteCard(title)` not visible | E03 |

- [ ] **T16** `[PARALLEL]` Create `apps/e2e/tests/search.spec.ts`

  `beforeEach`: create note via API with unique keyword in content (e.g. `unique-kw-${Date.now()}`).
  `afterEach`: delete note via API (optional — test user data cleanup).

  | Scenario | ID |
  |----------|----|
  | goto `/search` → type keyword → wait for result card containing keyword | E01 |
  | Same as E01 → assert `page.locator('p b').first()` is visible (ts_headline `<b>` tag) | E02 |
  | goto `/search` → type 1 character → assert "Type at least 2 characters" text visible | E03 |

- [ ] **T17** `[PARALLEL]` Create `apps/e2e/tests/sharing.spec.ts`

  `beforeEach`: `createNote()` via API → store `noteId`.

  | Scenario | ID |
  |----------|----|
  | goto `/notes/:noteId` → click "Share" button → click "Generate Link" → `page.locator('code')` contains `/public/` | E01 |
  | After E01 → extract token from `<code>` text → `browser.newContext({ storageState: undefined })` → goto `/public/:token` → note title visible, no "Share"/"History" buttons | E02 |
  | After E01 → click "Revoke" → new unauthenticated context → goto `/public/:token` → error/not-found message visible | E03 |

  > E02 and E03 open a new browser context with no auth to simulate anonymous visitor.

- [ ] **T18** `[PARALLEL]` Create `apps/e2e/tests/tags.spec.ts`

  `beforeEach`: `createTag()` via API → store `tagId` + `tagName`.
  `afterEach`: `deleteTag()` via API.

  | Scenario | ID |
  |----------|----|
  | goto `/notes` → sidebar `nav` contains button with `tagName` text | E01 |
  | `createNote()` via API → goto `/notes/:id` → wait for TagSelector → click tag button by name → `getByRole('button', { name: tagName, pressed: true })` visible | E02 |
  | `createNote()` via API, assign `tagId` via `PATCH /notes/:id` (tagIds) → create second note without tag → goto `/notes` → click tag in sidebar → only tagged note card visible | E03 |

- [ ] **T19** `[PARALLEL]` Create `apps/e2e/tests/versions.spec.ts`

  `beforeEach`:
  - `createNote()` via API → store `noteId`, keep original `title` as `titleV1`
  - `updateNote()` via API with new title `titleV2` → note now has 2 versions

  | Scenario | ID |
  |----------|----|
  | goto `/notes/:noteId` → click "History" → `getByText('Version History')` visible → version rows count ≥ 2 | E01 |
  | Click the second version row (v1) → preview pane `h2` text becomes `titleV1` | E02 |
  | Click second version row → click `getByRole('button', { name: /Restore version/i })` → click "Restore" in AlertDialog → sheet closes → `titleInput()` value becomes `titleV1` → success toast visible | E03 |

### Phase 3 Checkpoint
```bash
pnpm tsc --noEmit          # 0 errors — spec files type-check cleanly
```

---

## Phase 4 — Verification (run + fix)

- [ ] **T20** Start backend and frontend dev servers (or rely on `webServer` in playwright.config.ts)
  ```bash
  # Only needed if reuseExistingServer is in use (local dev)
  pnpm --filter backend dev &
  pnpm --filter frontend dev &
  ```

- [ ] **T21** Run full E2E suite
  ```bash
  pnpm test:e2e
  ```
  Expected: all 19 scenarios pass on first run.

- [ ] **T22** If any scenario fails: fix selector mismatches, timing issues, or assertion errors.
  Common failure modes:
  - Autosave timing → increase `waitFor` timeout for "Saved" text
  - Delete button invisible → confirm `.hover()` is called on card, not on a child element
  - Share modal link not yet rendered → add `waitFor(page.locator('code'))` before asserting
  - Version sheet animation → add `waitForSelector` on sheet content before clicking rows

- [ ] **T23** Run HTML report to review any screenshot/trace evidence of failures
  ```bash
  pnpm --filter '@note-app/e2e' test:report
  ```

### Phase 4 Checkpoint (Final gate)
```bash
pnpm tsc --noEmit          # 0 type errors
pnpm test:e2e              # 19 passing, 0 failing
```

---

## Summary

| Phase | Tasks | Files | Parallelizable? |
|-------|-------|-------|-----------------|
| 1 — Foundation | T01–T07 | 3 new + 1 modified | Sequential |
| 2 — Infrastructure | T08–T13 | 5 new | T08–T12 in parallel; T13 after T08 |
| 3 — Specs | T14–T19 | 6 new | All in parallel |
| 4 — Verify | T20–T23 | — (run + fix) | Sequential |

**Total new files:** 14 · **Modified:** 1 · **Scenarios:** 19
