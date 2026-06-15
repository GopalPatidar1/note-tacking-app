import { test, expect } from '@playwright/test'
import { getToken, createNote } from '../fixtures/api-helpers'

test.describe('Sharing', () => {
  let token: string
  let noteId: string
  let noteTitle: string

  test.beforeEach(async ({ page }) => {
    token  = await getToken(page)
    const note = await createNote(token, `Share-Test-${Date.now()}`, '<p>Content for sharing test</p>')
    noteId = note.id
    noteTitle = note.title
  })

  test('E01: generate share link → link with /public/ token displayed', async ({ page }) => {
    await page.goto(`/notes/${noteId}`)

    await page.getByRole('button', { name: /^Share$/ }).click()
    await page.getByRole('button', { name: 'Generate Link' }).click()

    const codeEl = page.locator('code').first()
    await expect(codeEl).toBeVisible({ timeout: 8000 })
    await expect(codeEl).toContainText('/public/')
  })

  test('E02: public link accessible as anonymous user → note content visible', async ({ page, browser }) => {
    // Generate link
    await page.goto(`/notes/${noteId}`)
    await page.getByRole('button', { name: /^Share$/ }).click()
    await page.getByRole('button', { name: 'Generate Link' }).click()

    const codeEl = page.locator('code').first()
    await expect(codeEl).toBeVisible({ timeout: 8000 })
    const publicUrl = await codeEl.innerText()

    // Open in fresh unauthenticated browser context
    const anonCtx  = await browser.newContext()
    const anonPage = await anonCtx.newPage()
    await anonPage.goto(publicUrl.trim())

    // Note title visible; Share/History buttons absent (they only appear in edit mode)
    await expect(anonPage.getByText(noteTitle)).toBeVisible({ timeout: 8000 })
    await expect(anonPage.getByRole('button', { name: /^Share$/ })).not.toBeVisible()
    await expect(anonPage.getByRole('button', { name: 'History' })).not.toBeVisible()

    await anonCtx.close()
  })

  test('E03: revoke share link → public URL no longer accessible', async ({ page, browser }) => {
    // Generate link
    await page.goto(`/notes/${noteId}`)
    await page.getByRole('button', { name: /^Share$/ }).click()
    await page.getByRole('button', { name: 'Generate Link' }).click()

    const codeEl = page.locator('code').first()
    await expect(codeEl).toBeVisible({ timeout: 8000 })
    const publicUrl = await codeEl.innerText()

    // Revoke
    await page.getByRole('button', { name: 'Revoke' }).click()
    await expect(codeEl).not.toBeVisible({ timeout: 5000 })

    // Confirm public URL is now inaccessible
    const anonCtx  = await browser.newContext()
    const anonPage = await anonCtx.newPage()
    await anonPage.goto(publicUrl.trim())

    await expect(
      anonPage.getByText(/not found|expired|revoked|no longer/i).first()
    ).toBeVisible({ timeout: 8000 })

    await anonCtx.close()
  })
})
