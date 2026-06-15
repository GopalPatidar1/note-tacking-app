import { test, expect } from '@playwright/test'
import { NotesListPage } from '../pages/notes-list.page'
import { NoteEditorPage } from '../pages/note-editor.page'
import { getToken, createNote } from '../fixtures/api-helpers'

test.describe('Notes CRUD', () => {
  test('E01: create note via UI → appears in list', async ({ page }) => {
    const editor = new NoteEditorPage(page)
    const list   = new NotesListPage(page)
    const title  = `E2E-Create-${Date.now()}`

    await editor.gotoNew()
    await editor.fillAndCreate(title, 'Some test content')

    // After create, the page navigates to /notes/:id (edit mode)
    await expect(page).toHaveURL(/\/notes\/[a-z0-9-]+/, { timeout: 8000 })

    await list.goto()
    await expect(list.noteCard(title)).toBeVisible({ timeout: 8000 })
  })

  test('E02: edit note title → persists after reload', async ({ page }) => {
    const token  = await getToken(page)
    const note   = await createNote(token, `E2E-Edit-${Date.now()}`)
    const editor = new NoteEditorPage(page)

    await page.goto(`/notes/${note.id}`)
    await page.waitForLoadState('networkidle')

    // Wait for the initial autosave that fires 1500ms after note loads
    await page.waitForTimeout(3000)

    const newTitle = `Edited-${Date.now()}`

    // Race the PATCH save response against the fill action
    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/notes/${note.id}`) && r.request().method() === 'PATCH',
        { timeout: 15000 },
      ),
      editor.titleInput().fill(newTitle),
    ])
    expect(saveResponse.ok()).toBe(true)
    await editor.waitForSaved()

    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(editor.titleInput()).toHaveValue(newTitle, { timeout: 8000 })
  })

  test('E03: delete note → removed from list', async ({ page }) => {
    const token = await getToken(page)
    const note  = await createNote(token, `E2E-Delete-${Date.now()}`)
    const list  = new NotesListPage(page)

    await list.goto()
    await expect(list.noteCard(note.title)).toBeVisible({ timeout: 8000 })

    await list.deleteNote(note.title)

    await expect(list.noteCard(note.title)).not.toBeVisible({ timeout: 8000 })
  })
})
