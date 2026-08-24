import { defineConfig } from '@playwright/test'

const integrationPort = Number(process.env.INTEGRATION_E2E_PORT || 18781)
const integrationOrigin = `http://127.0.0.1:${integrationPort}`
const buildCommand = process.env.INTEGRATION_E2E_SKIP_BUILD === '1' ? '' : 'pnpm build:single-origin && '

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /integration\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: integrationOrigin,
    browserName: 'chromium',
    actionTimeout: 10_000,
    permissions: ['clipboard-read', 'clipboard-write'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 375, height: 812 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 900 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'wide', use: { viewport: { width: 1440, height: 900 } } }
  ],
  webServer: {
    command: `${buildCommand}node scripts/serve-single-origin.mjs --port ${integrationPort}`,
    url: `${integrationOrigin}/`,
    reuseExistingServer: false,
    timeout: 300_000
  }
})
