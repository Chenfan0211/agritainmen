import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /supplier\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    viewport: { width: 375, height: 812 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'pnpm --filter @agritainment/supplier dev:h5',
    url: 'http://127.0.0.1:5178/',
    reuseExistingServer: true,
    timeout: 30_000,
    env: { ...process.env, VITE_E2E: '1' }
  }
})
