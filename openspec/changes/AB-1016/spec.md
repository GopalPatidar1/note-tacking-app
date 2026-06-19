# Specification — AB-1016: Playwright E2E Tests

**Ticket:** AB-1016
**Type:** Testing / Infrastructure
**Status:** COMPLETED
**Branch:** `feat/AB-1016-playwright-e2e`

---

## 1. Requirements

| ID | Requirement |
|----|-------------|
| R-01 | A new `apps/e2e` pnpm workspace package MUST be created for Playwright tests |
| R-02 | Playwright MUST be configured for Chromium only; sequential execution (shared test DB user) |
| R-03 | A `globalSetup.ts` MUST provision a test user via API and persist tokens to `fixtures/auth-state.json` |
| R-04 | All tests MUST start pre-authenticated by loading `auth-state.json` as `storageState` |
| R-05 | Auth tests MUST override `storageState` to start unauthenticated |
| R-06 | E2E tests MUST cover six user journeys: Auth, Notes CRUD, Search, Sharing, Tags (UI assignment), Version History |
| R-07 | Tag create/delete operations MUST use API helpers (no tag management UI exists in frontend) |
| R-08 | Page Object Model (POM) classes MUST be used for auth page, notes list page, and note editor page |
| R-09 | Tests that need pre-existing data MUST create it via API using `fetch` with the access token from `localStorage` |
| R-10 | Root `package.json` `test:e2e` script MUST be updated to `pnpm --filter '@note-app/e2e' test` |
| R-11 | `.gitignore` in `apps/e2e` MUST exclude `fixtures/auth-state.json`, `playwright-report/`, `test-results/` |
| R-12 | Playwright `webServer` config MUST start both backend and frontend if not already running |

---

## 2. Acceptance Criteria

- [ ] `pnpm test:e2e` runs the full E2E suite
- [ ] **Auth:** register with unique email → `/notes`; login → `/notes`; wrong password → error on `/login`; logout → `/login`
- [ ] **Notes:** create note → appears in list; edit + autosave → persists on reload; delete → removed from list
- [ ] **Search:** keyword search returns matching results; `<b>` highlight tags present in results; 1-char query shows idle state
- [ ] **Sharing:** generate link → `<code>` element contains `/public/`; public URL accessible without auth; revoke → public URL returns error
- [ ] **Tags:** API-created tag appears in sidebar; tag assignable to note in editor; tag filter shows only tagged notes
- [ ] **Versions:** version list shows all versions; selecting version updates preview; restore updates editor content and shows toast
- [ ] `fixtures/auth-state.json` is excluded from git

---

## 3. Affected Capabilities

| Capability | Impact |
|-----------|--------|
| E2E test suite | New — `apps/e2e` workspace package |
| globalSetup | New — test user provisioning + localStorage hydration |
| Auth spec | New — 4 scenarios |
| Notes spec | New — 3 scenarios |
| Search spec | New — 3 scenarios |
| Sharing spec | New — 3 scenarios |
| Tags spec | New — 3 scenarios (API setup + UI assertions) |
| Versions spec | New — 3 scenarios |
| Page Object Models | New — `AuthPage`, `NotesListPage`, `NoteEditorPage` |
| API helpers | New — `createNote`, `updateNote`, `createTag`, `deleteTag`, `getToken` |
| Root package.json | Modified — `test:e2e` script updated |

---

## 4. Functional Behavior

### Global Setup
1. `POST /api/auth/register` with test credentials; fall back to `POST /api/auth/login` on 409
2. Launch Chromium, navigate to `http://localhost:5173`
3. Write `localStorage['auth.accessToken']` + `localStorage['auth.refreshToken']`
4. Save context state to `fixtures/auth-state.json`

### Test Data Strategy
- Pre-authenticated tests load `storageState: 'fixtures/auth-state.json'`
- Auth tests: `test.use({ storageState: { cookies: [], origins: [] } })`
- Data setup: `beforeEach` creates notes/tags via fetch API using token from `localStorage`
- Data teardown: `afterEach` deletes API-created tags; notes auto-cleaned by test DB isolation

### Key UI Selectors
| Element | Selector |
|---------|---------|
| Login submit | `getByRole('button', { name: 'Sign in' })` |
| Register submit | `getByRole('button', { name: 'Create account' })` |
| Note title input | `getByLabel('Note title')` |
| TipTap body | `.ProseMirror` |
| Delete note | hover card → `getByLabel('Delete note')` |
| History button | `getByRole('button', { name: 'History' })` |
| Share button | `getByRole('button', { name: /^Share$/ })` |
| Restore confirm | `getByRole('button', { name: 'Restore' })` |

---

## 5. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| AB-1010 | Prerequisite | Auth pages and localStorage token storage |
| AB-1011 | Prerequisite | Notes list page with card selectors |
| AB-1012 | Prerequisite | Note editor page with aria labels |
| AB-1013 | Prerequisite | Search page |
| AB-1014 | Prerequisite | Share modal + public note page |
| AB-1015 | Prerequisite | Version history sheet |
| AB-1006 | Prerequisite | Tag API (tag management UI absent) |
| `@playwright/test` | External | Test runner and browser automation |
| Backend + Frontend dev servers | Runtime | Both must be running during test execution |
