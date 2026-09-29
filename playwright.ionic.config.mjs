import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  testMatch: 'ionic-shell.spec.mjs',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4184', browserName: 'chromium', serviceWorkers: 'block' },
  webServer: {
    command: 'npm run dev:ionic -- --host 127.0.0.1 --port 4184',
    url: 'http://127.0.0.1:4184',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
