import { defineConfig } from '@playwright/test';

// SMOKE_PORT lets several smoke runs share one checkout without fighting over the port or the results folder.
const port = Number(process.env.SMOKE_PORT || 4183);

export default defineConfig({
  testDir: './test/browser',
  testMatch: 'smoke.spec.mjs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: process.env.SMOKE_PORT ? `test-results/browser-${port}` : 'test-results/browser',
  use: {
    browserName: 'chromium',
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    serviceWorkers: 'block',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node scripts/test-browser-server.mjs --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
