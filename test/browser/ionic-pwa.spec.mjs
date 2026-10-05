import { test, expect } from '@playwright/test';

test('설치한 모바일 PWA는 모든 자체 JS/CSS와 공유 화면을 오프라인에서 다시 연다', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '고정 일정에서 시작하는 여행' })).toBeVisible();
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === 'activated');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const name = names.find(value => value.startsWith('compasser-shell-'));
    const cache = await caches.open(name);
    return (await cache.keys()).map(request => new URL(request.url).pathname);
  });
  expect(cached).toContain('/index.html');
  const assets = cached.filter(path => /^\/assets\/.*\.(?:js|css)$/.test(path));
  expect(assets.length).toBeGreaterThan(20);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '고정 일정에서 시작하는 여행' })).toBeVisible();
  await page.goto('/share/abc123');
  await expect(page.locator('ion-modal.ionic-result-sheet')).toBeVisible();
  // Public pages must not display a cached copy after the owner unpublishes.
  await expect(page.goto('/en/routes/curated-seoul')).rejects.toThrow();
});
