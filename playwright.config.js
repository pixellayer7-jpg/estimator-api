import { defineConfig } from '@playwright/test'
import { join } from 'node:path'
import { E2E_TOKEN } from './e2e/constants.js'

const PORT = Number(process.env.E2E_PORT || 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`
const DATA_DIR = join(process.cwd(), 'data-e2e')

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.js',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      Accept: 'application/json',
    },
    trace: 'off',
  },
  // API-only: no browser project — uses Playwright request context.
  projects: [{ name: 'api' }],
  webServer: {
    command: 'node src/server.js',
    url: `${BASE_URL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATA_DIR,
      LIST_QUOTES_TOKEN: E2E_TOKEN,
      CORS_ORIGIN: 'http://localhost:5174',
      // Force SQLite path for deterministic backup assertions.
      DATABASE_URL: '',
    },
  },
})
