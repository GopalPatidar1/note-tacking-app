import { chromium } from '@playwright/test'
import { TEST_USER } from './fixtures/test-user'
import * as fs from 'fs'
import * as path from 'path'

const API = 'http://localhost:3000/api'

export default async function globalSetup() {
  const fixturesDir = path.resolve(__dirname, 'fixtures')
  if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true })

  // Register test user; fall back to login on duplicate (409)
  let res = await fetch(`${API}/auth/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(TEST_USER),
  })
  if (res.status === 409) {
    res = await fetch(`${API}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    })
  }
  if (!res.ok) throw new Error(`globalSetup: auth failed with status ${res.status}`)

  const json = await res.json() as { data: { accessToken: string; refreshToken: string } }
  const { accessToken, refreshToken } = json.data

  // Hydrate localStorage to match main.tsx:11-15 bootstrap pattern
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page    = await context.newPage()
  await page.goto('http://localhost:5173')
  await page.evaluate(
    ({ at, rt }) => {
      localStorage.setItem('auth.accessToken',  at)
      localStorage.setItem('auth.refreshToken', rt)
    },
    { at: accessToken, rt: refreshToken },
  )
  await context.storageState({ path: path.resolve(fixturesDir, 'auth-state.json') })
  await browser.close()
}
