import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir:       './tests',
  globalSetup:   './global-setup.ts',
  fullyParallel: false,
  retries:       process.env.CI ? 2 : 0,
  reporter:      process.env.CI ? 'github' : 'html',

  use: {
    baseURL:      'http://localhost:5173',
    storageState: 'fixtures/auth-state.json',
    trace:        'on-first-retry',
    screenshot:   'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: [
    {
      command:             'pnpm --filter backend dev',
      port:                3000,
      reuseExistingServer: !process.env.CI,
      timeout:             30_000,
    },
    {
      command:             'pnpm --filter frontend dev',
      port:                5173,
      reuseExistingServer: !process.env.CI,
      timeout:             30_000,
    },
  ],
})
