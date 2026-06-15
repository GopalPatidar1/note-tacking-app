# Technical Plan — AB-1016: Playwright E2E Tests

**Date:** 2026-06-15
**Author:** gopalp@mindfiresolutions.com
**Branch:** feat/AB-1016-playwright-e2e
**Scope:** Greenfield E2E suite — new `apps/e2e` pnpm workspace package

---

## 1. Overview

Install Playwright and build an E2E test suite covering six user journeys:
Auth, Notes CRUD, Search, Sharing, Tags (assignment only), and Version History.

**Setup strategy:** `globalSetup.ts` provisions a dedicated test user via API, saves
`auth.accessToken` + `auth.refreshToken` to a Playwright `storageState.json` file.
All tests start pre-authenticated by consuming that state; auth tests override it to
start unauthenticated.

---

## 2. Key Findings from Codebase Scan

| Finding | Impact on plan |
|---------|----------------|
| Playwright not in any `package.json` | Fresh install in `apps/e2e` only |
| Auth store hydrates from `localStorage['auth.accessToken']` + `localStorage['auth.refreshToken']` in `main.tsx:11-15` | `globalSetup` must write exactly these two keys via `page.evaluate` before calling `context.storageState()` |
| Login submit button text is **"Sign in"** | `getByRole('button', { name: 'Sign in' })` |
| Register submit button text is **"Create account"** | `getByRole('button', { name: 'Create account' })` |
| Note title input uses `aria-label="Note title"` | `getByLabel('Note title')` — not `getByPlaceholder` |
| Note card delete button uses `aria-label="Delete note"`, **opacity-0 until hover** | Tests must `hover()` the card before clicking delete |
| New Note button text is **"+ New Note"** | `getByRole('button', { name: /\+ New Note/i })` |
| Autosave triggers 1500ms after last change | Tests that rely on a saved note must `waitForTimeout(2000)` after typing or wait for the "Saved" indicator |
| Search highlights use **`<b>` tags** (PostgreSQL `ts_headline`) — not `<mark>` | Highlight assertion: `page.locator('[dangerouslySetInnerHTML] b').first()` or `locator('p b').first()` |
| TagSelector only toggles existing tags — **no Create/Delete tag UI** in frontend | Tag tests create/delete tags via API calls in `beforeEach`/`afterEach`; UI test covers assignment only |
| Share modal shows link in `<code>` element inside a Dialog | Selector: `page.locator('code')` after Generate Link; copy button has `aria-label="Copy link"` |
| Version history sheet title is "Version History" | `getByRole('dialog', { name: 'Version History' })` or `getByText('Version History')` |
| Restore button text is `Restore version N` (dynamic N) | `getByRole('button', { name: /Restore version/i })` |
| AlertDialog confirm button text is **"Restore"** | `getByRole('button', { name: 'Restore' })` (within AlertDialogAction) |
| `pnpm-workspace.yaml` includes `apps/*` | `apps/e2e` is auto-picked up — no yaml change needed |
| Root `package.json` has `"test:e2e": "playwright test"` (wrong path) | Must update to `pnpm --filter '@note-app/e2e' test` |

---

## 3. Exact File Changes

| File | Action | Notes |
|------|--------|-------|
| `apps/e2e/package.json` | CREATE | `@note-app/e2e` workspace package |
| `apps/e2e/playwright.config.ts` | CREATE | Chromium, baseURL :5173, globalSetup, webServer |
| `apps/e2e/global-setup.ts` | CREATE | Register/login test user → localStorage → storageState |
| `apps/e2e/fixtures/test-user.ts` | CREATE | Shared test credentials constant |
| `apps/e2e/.gitignore` | CREATE | Ignore generated `auth-state.json`, reports |
| `apps/e2e/pages/auth.page.ts` | CREATE | POM: login + register pages |
| `apps/e2e/pages/notes-list.page.ts` | CREATE | POM: notes list page |
| `apps/e2e/pages/note-editor.page.ts` | CREATE | POM: note editor page |
| `apps/e2e/tests/auth.spec.ts` | CREATE | 4 scenarios |
| `apps/e2e/tests/notes.spec.ts` | CREATE | 3 scenarios |
| `apps/e2e/tests/search.spec.ts` | CREATE | 3 scenarios |
| `apps/e2e/tests/sharing.spec.ts` | CREATE | 3 scenarios |
| `apps/e2e/tests/tags.spec.ts` | CREATE | 3 scenarios (API setup + UI assignment) |
| `apps/e2e/tests/versions.spec.ts` | CREATE | 3 scenarios |
| `package.json` (root) | MODIFY | `test:e2e` script → `pnpm --filter '@note-app/e2e' test` |

**Total: 14 new files, 1 modified.**

---

## 4. Configuration Details

### 4a. `apps/e2e/package.json`

```json
{
  "name": "@note-app/e2e",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "test":         "playwright test",
    "test:ui":      "playwright test --ui",
    "test:headed":  "playwright test --headed",
    "test:report":  "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "^1.45.0"
  }
}
```

### 4b. `apps/e2e/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir:       './tests',
  globalSetup:   './global-setup.ts',
  fullyParallel: false,           // sequential — tests share one DB user
  retries:       process.env.CI ? 2 : 0,
  reporter:      process.env.CI ? 'github' : 'html',

  use: {
    baseURL:      'http://localhost:5173',
    storageState: 'fixtures/auth-state.json',
    trace:        'on-first-retry',
    screenshot:   'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: [
    {
      command:             'pnpm --filter backend dev',
      url:                 'http://localhost:3000/api/auth/login',
      reuseExistingServer: !process.env.CI,
      timeout:             30_000,
    },
    {
      command:             'pnpm --filter frontend dev',
      url:                 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout:             30_000,
    },
  ],
})
```

> `fullyParallel: false` — tests share one DB user; parallel execution risks data race
> (e.g. notes.spec creates/deletes notes that tags.spec tries to read).
> Each spec file still runs its own tests sequentially, which is fast enough for 19 scenarios.

### 4c. `apps/e2e/global-setup.ts`

```typescript
import { chromium } from '@playwright/test'
import { TEST_USER } from './fixtures/test-user'
import * as fs from 'fs'
import * as path from 'path'

const API = 'http://localhost:3000/api'

export default async function globalSetup() {
  // Ensure fixtures directory exists
  const fixturesDir = path.resolve(__dirname, 'fixtures')
  if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true })

  // Register; fall back to login on duplicate (409)
  let res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_USER),
  })
  if (res.status === 409) {
    res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    })
  }
  if (!res.ok) throw new Error(`globalSetup: auth failed with ${res.status}`)

  const json = await res.json() as { data: { accessToken: string; refreshToken: string } }
  const { accessToken, refreshToken } = json.data

  // Hydrate localStorage to match main.tsx:11-15 bootstrap
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page    = await context.newPage()
  await page.goto('http://localhost:5173')
  await page.evaluate(
    ({ at, rt }) => {
      localStorage.setItem('auth.accessToken',  at)
      localStorage.setItem('auth.refreshToken', rt)
    },
    { at: accessToken, rt: refreshToken },
  )
  await context.storageState({ path: path.resolve(fixturesDir, 'auth-state.json') })
  await browser.close()
}
```

### 4d. `apps/e2e/.gitignore`

```
fixtures/auth-state.json
playwright-report/
test-results/
```

---

## 5. Page Object Model

### `pages/auth.page.ts`

Selectors derived from `login.page.tsx` and `register.page.tsx`:
- Email label → `getByLabel('Email')`
- Password label → `getByLabel('Password')`
- Name label → `getByLabel('Name')`
- Login submit → `getByRole('button', { name: 'Sign in' })`
- Register submit → `getByRole('button', { name: 'Create account' })`

```typescript
import type { Page } from '@playwright/test'

export class AuthPage {
  constructor(private page: Page) {}

  async gotoLogin()    { await this.page.goto('/login') }
  async gotoRegister() { await this.page.goto('/register') }

  nameInput()       { return this.page.getByLabel('Name') }
  emailInput()      { return this.page.getByLabel('Email') }
  passwordInput()   { return this.page.getByLabel('Password') }
  signInButton()    { return this.page.getByRole('button', { name: 'Sign in' }) }
  createAcctButton(){ return this.page.getByRole('button', { name: 'Create account' }) }
  errorMessage()    { return this.page.getByRole('alert') }
}
```

### `pages/notes-list.page.ts`

Selectors derived from `notes-list.page.tsx`, `notes-toolbar.tsx`, `app-layout.tsx`, `note-card.tsx`:
- New note → `getByRole('button', { name: /\+ New Note/i })`
- Logout → `getByRole('button', { name: 'Logout' })`
- Delete note card → hover card, then `getByLabel('Delete note')` (first match or filtered)

```typescript
import type { Page } from '@playwright/test'

export class NotesListPage {
  constructor(private page: Page) {}

  async goto() { await this.page.goto('/notes') }

  newNoteButton() { return this.page.getByRole('button', { name: /\+ New Note/i }) }
  logoutButton()  { return this.page.getByRole('button', { name: 'Logout' }) }
  noteCard(title: string) {
    return this.page.locator('[data-slot="card"]').filter({ hasText: title })
  }

  async deleteNote(title: string) {
    const card = this.noteCard(title)
    await card.hover()
    await card.getByLabel('Delete note').click()
  }
}
```

### `pages/note-editor.page.ts`

Selectors derived from `note-editor.page.tsx`:
- Title → `getByLabel('Note title')`
- TipTap body → `.ProseMirror`
- Create button → `getByRole('button', { name: 'Create Note' })`
- History button → `getByRole('button', { name: 'History' })`
- Share button → `getByRole('button', { name: /^Share$/ })`
- Saved indicator → `getByText('Saved')` (visible 3s after autosave)

```typescript
import type { Page } from '@playwright/test'

export class NoteEditorPage {
  constructor(private page: Page) {}

  async gotoNew()         { await this.page.goto('/notes/new') }

  titleInput()    { return this.page.getByLabel('Note title') }
  editor()        { return this.page.locator('.ProseMirror') }
  createButton()  { return this.page.getByRole('button', { name: 'Create Note' }) }
  historyButton() { return this.page.getByRole('button', { name: 'History' }) }
  shareButton()   { return this.page.getByRole('button', { name: /^Share$/ }) }
  savedText()     { return this.page.getByText('Saved') }

  async fillAndCreate(title: string, content: string) {
    await this.titleInput().fill(title)
    await this.editor().click()
    await this.editor().fill(content)
    await this.createButton().click()
  }
}
```

---

## 6. Test Scenarios (Detailed)

### `tests/auth.spec.ts`

```typescript
test.use({ storageState: { cookies: [], origins: [] } })
```

| ID | Description | Steps | Assertion |
|----|-------------|-------|-----------|
| E01 | Register with unique email | goto /register → fill Name/Email/Password → click "Create account" | URL = /notes |
| E02 | Login with valid credentials | goto /login → fill Email/Password → click "Sign in" | URL = /notes |
| E03 | Login with wrong password | goto /login → fill Email/wrong password → click "Sign in" | Error alert visible; URL stays /login |
| E04 | Logout | goto /notes (storageState from fixture) → click "Logout" | URL = /login |

> E01 uses a unique email per run: `e2e-register-${Date.now()}@example.com`
> E04 loads storageState manually: `test.use({ storageState: 'fixtures/auth-state.json' })` in a nested describe

### `tests/notes.spec.ts`

| ID | Description | Steps | Assertion |
|----|-------------|-------|-----------|
| E01 | Create note → appears in list | goto /notes/new → fill title+content → click "Create Note" → goto /notes | Note card with matching title visible |
| E02 | Edit note → content persists | Create note via API → goto /notes/:id → change title → wait for autosave ("Saved" text) → reload | Updated title in title input |
| E03 | Delete note → removed from list | Create note via API → goto /notes → hover card → click "Delete note" | Note card no longer visible |

> Notes E02/E03 create notes via `fetch(API + '/notes', { method: 'POST', ... })` with the access token from `storageState` to avoid UI-based setup. Token extracted in `beforeEach` via `page.evaluate(() => localStorage.getItem('auth.accessToken'))`.

### `tests/search.spec.ts`

> `beforeEach`: create a note via API with title "SearchTestNote" and unique content keyword.

| ID | Description | Steps | Assertion |
|----|-------------|-------|-----------|
| E01 | Search returns matching results | goto /search → type keyword in search input → wait for results | At least 1 result card visible containing keyword |
| E02 | Highlights appear in results | Same as E01 | `<b>` element inside result card's headline `<p>` exists |
| E03 | Too-short query shows idle state | goto /search → type "a" (1 char) | "Type at least 2 characters" message visible |

### `tests/sharing.spec.ts`

> `beforeEach`: create a note via API; keep its `id` for use in tests.

| ID | Description | Steps | Assertion |
|----|-------------|-------|-----------|
| E01 | Generate share link | goto /notes/:id → click "Share" → click "Generate Link" | `<code>` element visible containing `/public/` |
| E02 | Visit public link as anonymous user | Copy link token from `<code>` → open new unauthenticated browser context → goto public URL | Note title visible; no "Share" or "History" buttons |
| E03 | Revoke link → public URL inaccessible | Generate link → note link token → click "Revoke" → revisit public URL in new context | "Note not found" or 404 error message visible |

### `tests/tags.spec.ts`

> Tag CREATE/DELETE UI does not exist in frontend. Strategy:
> - `beforeEach`: create a tag via API (`POST /api/tags`)
> - `afterEach`: delete the tag via API (`DELETE /api/tags/:id`)
> - UI tests cover: tag visible in sidebar, tag assignable in editor, tag badge on note card

| ID | Description | Steps | Assertion |
|----|-------------|-------|-----------|
| E01 | Tag appears in sidebar after API creation | Create tag via API → goto /notes | Tag name visible in sidebar nav |
| E02 | Assign tag to note in editor | Create note via API → goto /notes/:id → wait for TagSelector → click tag button | Tag button shows `aria-pressed="true"` |
| E03 | Tag filter shows only tagged notes | Create 2 notes via API (one tagged, one not) → goto /notes → click tag in sidebar | Only tagged note card visible |

### `tests/versions.spec.ts`

> `beforeEach`: create a note via API; then update it once via API to have 2 versions.

| ID | Description | Steps | Assertion |
|----|-------------|-------|-----------|
| E01 | Version list shows all versions | goto /notes/:id → click "History" | Sheet opens; 2+ version rows visible |
| E02 | Select older version → preview updates | Click non-current version row | Preview pane shows that version's title (h2) |
| E03 | Restore version → editor content updates | Click "Restore version N" → click "Restore" in AlertDialog → sheet closes | Editor title input shows restored title; success toast visible |

---

## 7. API Helper Pattern

Several tests need to create/delete data via API. A shared helper module avoids repetition:

**`apps/e2e/fixtures/api-helpers.ts`**

```typescript
const API = 'http://localhost:3000/api'

export async function getToken(page: import('@playwright/test').Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('auth.accessToken'))
  if (!token) throw new Error('No access token in localStorage')
  return token
}

export async function createNote(token: string, title: string, content = '<p></p>'): Promise<{ id: string }> {
  const res = await fetch(`${API}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title, content, tagIds: [] }),
  })
  const json = await res.json() as { data: { id: string } }
  return json.data
}

export async function updateNote(token: string, id: string, title: string, content: string): Promise<void> {
  await fetch(`${API}/notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title, content }),
  })
}

export async function createTag(token: string, name: string, color = '#3b82f6'): Promise<{ id: string }> {
  const res = await fetch(`${API}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, color }),
  })
  const json = await res.json() as { data: { id: string } }
  return json.data
}

export async function deleteTag(token: string, id: string): Promise<void> {
  await fetch(`${API}/tags/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}
```

---

## 8. Install Command

After creating `apps/e2e/package.json`, run:

```bash
pnpm install
pnpm --filter '@note-app/e2e' exec playwright install --with-deps chromium
```

---

## 9. Quality Gate Sequence

```bash
# 1. Install and install browser
pnpm install
pnpm --filter '@note-app/e2e' exec playwright install chromium

# 2. Ensure backend + frontend are running (or let webServer start them)
pnpm --filter backend dev &
pnpm --filter frontend dev &

# 3. Run E2E suite
pnpm test:e2e

# 4. View report on failure
pnpm --filter '@note-app/e2e' test:report
```

---

## 10. Out of Scope

| Item | Reason |
|------|--------|
| Forgot/reset password E2E | OTP is console-logged — no mechanism to intercept in browser test |
| Tag create/delete via UI | Tag management UI not implemented in frontend |
| Firefox / WebKit | Chromium only per decision; add later |
| Pagination E2E | Requires large data volume; covered by unit tests |
| Visual regression | Not in FRS |
| CI GitHub Actions setup | Separate infra concern; tests written to work in CI when DATABASE_URL is set |
