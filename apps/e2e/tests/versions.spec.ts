import { test, expect } from '@playwright/test'
import { getToken, createNote, updateNote } from '../fixtures/api-helpers'
import { NoteEditorPage } from '../pages/note-editor.page'

test.describe('Version History', () => {
  let token: string
  let noteId: string
  const titleV1 = `VersionV1-${Date.now()}`
  const titleV2 = `VersionV2-${Date.now()}`

  test.beforeEach(async ({ page }) => {
    token = await getToken(page)

    // Create note (version 1) then update it (version 2)
    const note = await createNote(token, titleV1, '<p>Original content</p>')
    noteId = note.id
    await updateNote(token, noteId, titleV2, '<p>Updated content</p>')
  })

  test('E01: open version history → sheet shows ≥ 2 versions', async ({ page }) => {
    const editor = new NoteEditorPage(page)

    await page.goto(`/notes/${noteId}`)
    await page.waitForLoadState('networkidle')

    await editor.historyButton().click()

    // Sheet title visible
    await expect(page.getByText('Version History')).toBeVisible({ timeout: 8000 })

    // At least 2 version rows rendered (buttons with aria-selected attribute)
    const versionRows = page.locator('[aria-selected]')
    const rowCount = await versionRows.count()
    expect(rowCount).toBeGreaterThanOrEqual(2)
  })

  test('E02: click older version → preview pane shows V1 title', async ({ page }) => {
    const editor = new NoteEditorPage(page)

    await page.goto(`/notes/${noteId}`)
    await page.waitForLoadState('networkidle')

    await editor.historyButton().click()
    await expect(page.getByText('Version History')).toBeVisible({ timeout: 8000 })

    // The second row (index 1) is the older version (list ordered newest-first)
    const rows = page.locator('[aria-selected]')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(2)
    await rows.nth(1).click()

    // Preview pane h2 should show titleV1
    await expect(page.locator('h2').filter({ hasText: titleV1 })).toBeVisible({ timeout: 8000 })
  })

  test('E03: restore older version → toast shown, editor reflects restored title after reload', async ({ page }) => {
    const editor = new NoteEditorPage(page)

    await page.goto(`/notes/${noteId}`)
    await page.waitForLoadState('networkidle')

    await editor.historyButton().click()
    await expect(page.getByText('Version History')).toBeVisible({ timeout: 8000 })

    // Select older version (index 1 = v1, oldest)
    const rows = page.locator('[aria-selected]')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(2)
    await rows.nth(1).click()

    // Click Restore version button in preview pane
    await page.getByRole('button', { name: /Restore version/i }).click()

    // Confirm in AlertDialog
    await page.getByRole('button', { name: 'Restore' }).click()

    // Success toast appears
    await expect(page.getByText(/restored to version/i)).toBeVisible({ timeout: 8000 })

    // Sheet closes after restore
    await expect(page.getByText('Version History')).not.toBeVisible({ timeout: 8000 })

    // Editor's local state does not auto-update after restore (initialised=true prevents
    // re-hydration from cache). Reload to verify the persisted restore.
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(editor.titleInput()).toHaveValue(titleV1, { timeout: 8000 })
  })
})
