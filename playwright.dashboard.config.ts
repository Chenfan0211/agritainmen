import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /dashboard\.spec\.ts/,
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
    { name: 'full-hd', use: { viewport: { width: 1920, height: 1080 } } },
    { name: 'laptop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'compact', use: { viewport: { width: 1366, height: 768 } } }
  ],
  webServer: {
    command: 'pnpm --filter @agritainment/dashboard dev:h5',
    url: 'http://127.0.0.1:5182/',
    reuseExistingServer: true,
    timeout: 30_000
  }
})
