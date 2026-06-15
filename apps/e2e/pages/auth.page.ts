import type { Page } from '@playwright/test'

export class AuthPage {
  constructor(private page: Page) {}

  async gotoLogin()    { await this.page.goto('/login') }
  async gotoRegister() { await this.page.goto('/register') }

  nameInput()        { return this.page.getByLabel('Name') }
  emailInput()       { return this.page.getByLabel('Email') }
  passwordInput()    { return this.page.getByLabel('Password') }
  signInButton()     { return this.page.getByRole('button', { name: 'Sign in' }) }
  createAcctButton() { return this.page.getByRole('button', { name: 'Create account' }) }
  errorMessage()     { return this.page.getByRole('alert') }
}
