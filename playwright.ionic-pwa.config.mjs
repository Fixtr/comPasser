import { defineConfig } from '@playwright/test';

export default defineConfig({
  outputDir: './test-results/pwa',
  testDir: './test/browser',
  testMatch: 'ionic-pwa.spec.mjs',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4185',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'node scripts/test-browser-server.mjs --build && npx vite preview --outDir test-results/pwa-build --host 127.0.0.1 --port 4185 --strictPort',
    url: 'http://127.0.0.1:4185',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
