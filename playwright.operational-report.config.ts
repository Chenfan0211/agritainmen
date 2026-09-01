import { defineConfig } from '@playwright/test'

const reportPort = Number(process.env.OPERATIONAL_REPORT_E2E_PORT || 18783)
const reportOrigin = `http://127.0.0.1:${reportPort}`
const buildCommand = process.env.OPERATIONAL_REPORT_E2E_SKIP_BUILD === '1' ? '' : 'pnpm build:single-origin && '

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /operational-report\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    baseURL: reportOrigin,
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `${buildCommand}node scripts/serve-single-origin.mjs --port ${reportPort}`,
    url: `${reportOrigin}/`,
    reuseExistingServer: true,
    timeout: 300_000
  }
})
