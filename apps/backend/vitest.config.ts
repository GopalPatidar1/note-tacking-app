import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      ACCESS_TOKEN_SECRET: 'test-secret-do-not-use-in-production',
    },
  },
})
