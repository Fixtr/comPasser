import { test, expect } from '@playwright/test';

test('course screen reports a failed UI module and recovers after reload', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/domains/planner/ui/home-courses.js', route => route.abort());
  await page.goto('/courses');
  await page.locator('[data-course-country=JPN]').click();
  await page.locator('[data-course-city=tokyo]').click();
  await expect(page.getByRole('alert')).toContainText('화면을 불러오지 못했습니다');
  await page.unroute('**/src/domains/planner/ui/home-courses.js');
  await page.getByRole('button', { name: '화면 다시 불러오기' }).click();
  await expect(page.locator('home-courses:visible')).toHaveAttribute('city', 'tokyo');
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await page.locator('[data-course-city=kyoto]').click();
  await expect(page.locator('home-courses article')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('delayed domestic map setup keeps the list usable and ignores the previous city', async ({ page }) => {
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    customElements.define('gmp-place-autocomplete', class extends HTMLElement {});
    const ready = new Promise(resolve => { window.releaseMaps = () => resolve({Place: class { static async searchByText(){return {places:[]};} }}); });
    export const getMapsLoader=()=>({importLibrary:()=>ready});
  ` }));
  await page.goto('/recommend');
  await page.locator('[data-recommend-country=KOR]').click();
  await page.locator('[data-recommend-city=busan]').click();
  await expect(page.locator('.flow-place-row')).toHaveCount(6);
  await expect(page.getByRole('button',{name:'장소 선택 없이 다음',exact:true})).toBeEnabled();
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await page.locator('[data-recommend-city=jeju]').click();
  await page.evaluate(()=>window.releaseMaps());
  await expect(page.locator('.flow-place-row')).toHaveCount(6);
  await expect(page.locator('.flow-place-list')).toContainText('용두암');
  await expect(page.locator('.flow-place-list')).not.toContainText('해운대해수욕장');
  await expect.poll(()=>page.locator('gmp-place-autocomplete').evaluate(element=>element.includedRegionCodes?.[0])).toBe('KR');
});

test('failed map setup keeps international places visible and selection recoverable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export function getMapsLoader(){throw new Error("Map initialization failed")}' }));
  await page.goto('/recommend');
  await page.locator('[data-recommend-country=FRA]').click();
  await page.locator('[data-recommend-city=paris]').click();
  await expect(page.locator('.flow-place-row')).toHaveCount(3);
  await expect(page.getByRole('alert')).toContainText('지금은 장소 검색을 쓸 수 없습니다');
  await page.locator('.flow-place-row button').first().click();
  await expect(page.locator('.flow-place-row button').first()).toBeEnabled();
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await expect(page.locator('[data-recommend-city=paris]')).toBeVisible();
});

test('Japan city changes preserve the Ionic page and work through cached home navigation', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/home');
  await page.getByRole('button', { name: '일정 만들기', exact: true }).click();
  await page.getByRole('heading', { name: '어느 나라로 떠날까요?' }).evaluate(heading => {
    window.originalRecommendPage = heading.closest('.ion-page');
    window.originalRecommendContent = heading.closest('ion-content');
  });
  await page.locator('[data-recommend-country=JPN]').click();
  for (const city of ['tokyo', 'kyoto']) {
    await page.locator(`[data-recommend-city=${city}]`).click();
    const heading = page.getByRole('heading', { name: '꼭 갈 장소', exact: true });
    await expect(heading).toBeVisible();
    expect(await heading.evaluate(node => node.closest('.ion-page') === window.originalRecommendPage
      && node.closest('ion-content') === window.originalRecommendContent)).toBe(true);
    await expect(page.locator('.flow-place-row')).toHaveCount(3);
    await page.getByRole('button', { name: '뒤로', exact: true }).click();
  }
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await page.getByRole('button', { name: '코스 둘러보기', exact: true }).click();
  await page.locator('[data-course-country=JPN]').click();
  for (const city of ['tokyo', 'kyoto']) {
    await page.locator(`[data-course-city=${city}]`).click();
    await expect(page.locator('home-courses article')).toHaveCount(3);
    await page.getByRole('button', { name: '뒤로', exact: true }).click();
  }
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await page.getByRole('button', { name: '일정 만들기', exact: true }).click();
  await page.locator('[data-recommend-country=JPN]').click();
  await page.locator('[data-recommend-city=tokyo]').click();
  await expect(page.locator('.flow-place-row')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: '꼭 갈 장소', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('tokyo-after-cached-navigation.png') });
  expect(errors).toEqual([]);
});

async function recordScreenMotion(page) {
  await page.addInitScript(() => {
    window.screenMotions = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (options?.id === 'compasser-screen') window.screenMotions.push({ page: this.classList.contains('ion-page'), tag: this.tagName, duration: options.duration });
      return animate.call(this, frames, options);
    };
  });
}

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`page and discovery steps share motion policy: ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await recordScreenMotion(page);
    await page.goto('/home');
    await page.getByRole('button', { name: '코스 둘러보기', exact: true }).click();
    await page.locator('[data-course-country=JPN]').click();
    await page.locator('[data-course-city=tokyo]').click();
    await expect(page.locator('home-courses article')).toHaveCount(3);
    await page.getByRole('button', { name: '뒤로', exact: true }).click();
    await page.getByRole('button', { name: '뒤로', exact: true }).click();
    await page.getByRole('button', { name: '뒤로', exact: true }).click();
    await page.getByRole('button', { name: '일정 만들기', exact: true }).click();
    await page.locator('[data-recommend-country=JPN]').click();
    await page.locator('[data-recommend-city=kyoto]').click();
    await expect(page.locator('.flow-place-row')).toHaveCount(3);
    const motions = await page.evaluate(() => window.screenMotions);
    if (reducedMotion === 'reduce') expect(motions).toEqual([]);
    else {
      expect(motions.filter(motion => motion.page).length).toBeGreaterThanOrEqual(3);
      expect(motions.filter(motion => motion.tag === 'SECTION').length).toBeGreaterThanOrEqual(7);
      expect(motions.every(motion => motion.duration === 220)).toBe(true);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.id === 'compasser-screen').length)).toBe(0);
      await page.getByRole('button', { name: '뒤로', exact: true }).click();
      expect(await page.evaluate(() => window.screenMotions.length)).toBe(motions.length);
    }
  });
}

test('destination step animations preserve the draft and page identity on back', async ({ page }) => {
  await recordScreenMotion(page);
  await page.goto('/destination');
  await page.locator('[data-destination-country=FRA]').click();
  await page.getByRole('button', { name: '파리', exact: true }).click();
  await expect(page.locator('.flow-place-row')).toHaveCount(3);
  const content = page.locator('ion-content').first();
  await content.evaluate(element => { window.destinationContent = element; });
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await expect(page.getByRole('button', { name: '파리', exact: true })).toBeVisible();
  expect(await content.evaluate(element => element === window.destinationContent)).toBe(true);
  expect(await page.evaluate(() => window.screenMotions.filter(motion => motion.tag === 'SECTION').length)).toBeGreaterThanOrEqual(3);
});
