import type { Page } from '@playwright/test'

export class NotesListPage {
  constructor(private page: Page) {}

  async goto() { await this.page.goto('/notes') }

  newNoteButton() { return this.page.getByRole('button', { name: /\+ New Note/i }) }
  logoutButton()  { return this.page.getByRole('button', { name: 'Logout' }) }

  noteCard(title: string) {
    return this.page.locator('[class*="card"]').filter({ hasText: title })
  }

  async deleteNote(title: string) {
    const card = this.noteCard(title)
    await card.hover()
    await card.getByLabel('Delete note').click()
  }

  tagInSidebar(name: string) {
    return this.page.locator('aside').getByRole('button', { name })
  }
}
