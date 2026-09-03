import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5292/',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'pnpm exec uni build -p h5 && python -m http.server 5292 --bind 127.0.0.1 --directory dist/build/h5',
    url: 'http://127.0.0.1:5292/',
    reuseExistingServer: false,
    timeout: 60_000
  }
})
