import { defineConfig } from '@playwright/test';

export default defineConfig({
  outputDir: './test-results/ionic',
  testDir: './test/browser',
  testMatch: ['ionic-shell.spec.mjs', 'ui-handoff.spec.mjs', 'discovery-transitions.spec.mjs'],
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4184', browserName: 'chromium', serviceWorkers: 'block' },
  webServer: {
    command: 'node scripts/test-browser-server.mjs --ionic',
    url: 'http://127.0.0.1:4184',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
