import { test, expect } from '@playwright/test'
import { getToken, createNote, createTag, deleteTag, assignTagToNote } from '../fixtures/api-helpers'
import { NotesListPage } from '../pages/notes-list.page'

test.describe('Tags', () => {
  let token: string
  let tagId: string
  let tagName: string

  test.beforeEach(async ({ page }) => {
    token   = await getToken(page)
    tagName = `tag-${Date.now()}`
    const tag = await createTag(token, tagName, '#6366f1')
    tagId   = tag.id
  })

  test.afterEach(async () => {
    if (token && tagId) {
      await deleteTag(token, tagId).catch(() => undefined)
    }
  })

  test('E01: tag created via API → visible in sidebar', async ({ page }) => {
    const list = new NotesListPage(page)
    await list.goto()

    const tagBtn = list.tagInSidebar(tagName)
    await expect(tagBtn).toBeVisible({ timeout: 8000 })
  })

  test('E02: assign tag to note via TagSelector → tag shows as pressed', async ({ page }) => {
    const note = await createNote(token, `TagAssign-${Date.now()}`)

    await page.goto(`/notes/${note.id}`)
    await page.waitForLoadState('networkidle')

    // Tag selector renders existing tags as buttons with aria-pressed
    const tagButton = page.getByRole('button', { name: tagName })
    await expect(tagButton).toBeVisible({ timeout: 8000 })

    await tagButton.click()

    await expect(tagButton).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 })
  })

  test('E03: filter by tag → only tagged note visible in list', async ({ page }) => {
    // Create two notes: one with tag, one without
    const taggedNote   = await createNote(token, `Tagged-${Date.now()}`)
    const untaggedNote = await createNote(token, `Untagged-${Date.now()}`)

    // Assign tag to first note via API
    await assignTagToNote(token, taggedNote.id, [tagId])

    const list = new NotesListPage(page)
    await list.goto()

    // Click tag in sidebar to filter
    await list.tagInSidebar(tagName).click()

    await expect(list.noteCard(taggedNote.title)).toBeVisible({ timeout: 8000 })
    await expect(list.noteCard(untaggedNote.title)).not.toBeVisible()
  })
})
