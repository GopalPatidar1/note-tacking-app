import type { Page } from '@playwright/test'

export class NoteEditorPage {
  constructor(private page: Page) {}

  async gotoNew() { await this.page.goto('/notes/new') }

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

  async waitForSaved() {
    await this.savedText().waitFor({ state: 'visible', timeout: 8000 })
  }
}
