import { test, expect } from '@playwright/test'
import { AuthPage } from '../pages/auth.page'
import { TEST_USER } from '../fixtures/test-user'

// All tests in this file start unauthenticated
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Auth — unauthenticated journeys', () => {
  test('E01: register with new email → lands on /notes', async ({ page }) => {
    const auth = new AuthPage(page)
    const uniqueEmail = `e2e-register-${Date.now()}@example.com`

    await auth.gotoRegister()
    await auth.nameInput().fill('E2E Reg User')
    await auth.emailInput().fill(uniqueEmail)
    await auth.passwordInput().fill('Test1234!')
    await auth.createAcctButton().click()

    await expect(page).toHaveURL('/notes', { timeout: 8000 })
  })

  test('E02: login with valid credentials → lands on /notes', async ({ page }) => {
    const auth = new AuthPage(page)

    await auth.gotoLogin()
    await auth.emailInput().fill(TEST_USER.email)
    await auth.passwordInput().fill(TEST_USER.password)
    await auth.signInButton().click()

    await expect(page).toHaveURL('/notes', { timeout: 8000 })
  })

  test('E03: login with wrong password → error shown, stays on /login', async ({ page }) => {
    const auth = new AuthPage(page)

    await auth.gotoLogin()
    await auth.emailInput().fill(TEST_USER.email)
    await auth.passwordInput().fill('WrongPassword!')
    await auth.signInButton().click()

    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeVisible({ timeout: 5000 })
    await expect(page).toHaveURL('/login')
  })
})

// E04 needs auth — use storageState fixture explicitly
test.describe('Auth — authenticated logout', () => {
  test.use({ storageState: 'fixtures/auth-state.json' })

  test('E04: logout from /notes → redirected to /login', async ({ page }) => {
    await page.goto('/notes')
    await page.getByRole('button', { name: 'Logout' }).click()

    await expect(page).toHaveURL('/login', { timeout: 8000 })
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })
})
