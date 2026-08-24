import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /user\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 375, height: 812 } } },
    { name: 'narrow-desktop', use: { viewport: { width: 768, height: 900 } } }
  ],
  webServer: {
    command: 'pnpm --filter @agritainment/user dev:h5:e2e',
    url: 'http://127.0.0.1:5179/',
    reuseExistingServer: true,
    timeout: 30_000
  }
})
