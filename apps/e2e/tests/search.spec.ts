import { test, expect } from '@playwright/test'
import { getToken, createNote } from '../fixtures/api-helpers'

test.describe('Search', () => {
  let token: string
  let noteId: string
  const keyword = `uniquekw${Date.now()}`

  test.beforeEach(async ({ page }) => {
    token = await getToken(page)
    const note = await createNote(token, `Search-Test-${Date.now()}`, `<p>${keyword} content here</p>`)
    noteId = note.id
  })

  test.afterEach(async () => {
    if (token && noteId) {
      await fetch(`http://localhost:3000/api/notes/${noteId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined)
    }
  })

  test('E01: search returns notes matching the keyword', async ({ page }) => {
    await page.goto(`/search?q=${keyword}`)

    // At least 1 result card visible
    await expect(page.locator('[class*="card"]').first()).toBeVisible({ timeout: 8000 })

    // Keyword present somewhere on the page (strict: false avoids multi-match error)
    await expect(page.getByText(keyword).first()).toBeVisible()
  })

  test('E02: search results contain <b> highlights from ts_headline', async ({ page }) => {
    await page.goto(`/search?q=${keyword}`)

    // ts_headline wraps matches in <b> tags rendered via dangerouslySetInnerHTML
    const highlight = page.locator('p b').first()
    await expect(highlight).toBeVisible({ timeout: 8000 })
  })

  test('E03: query shorter than 2 chars shows idle prompt', async ({ page }) => {
    await page.goto('/search')

    await page.getByPlaceholder('Search notes…').fill('a')

    await expect(
      page.getByText('Type at least 2 characters')
    ).toBeVisible({ timeout: 5000 })
  })
})
