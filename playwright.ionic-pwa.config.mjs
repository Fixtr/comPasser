import { defineConfig } from '@playwright/test';

export default defineConfig({
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
    command: 'npm run build:release && npx vite preview --outDir dist --host 127.0.0.1 --port 4185 --strictPort',
    url: 'http://127.0.0.1:4185',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
