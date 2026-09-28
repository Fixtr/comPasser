// Reuses the local-only auth/Maps fixtures from refactor-smoke-setup.js.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    window.navigate('/');
    window.__smoke.setUser(null);
    const { plannerDraftStore } = await import('/src/domains/planner/services/planner-draft.mjs');
    plannerDraftStore.save({ date: ['2026-10-01'], startLocation: '이전 출발지', endLocation: '서울역',
      startTime: '09:00', endTime: '18:00',
      anchorSchedules: [{ name: '공연', day: 1, time: '15:00', endTime: '16:00', location: '공연장' }] });
  });
  const cards = page.locator('home-recommendations');
  await cards.locator('button[data-place=forest]').waitFor({ state: 'visible' });
  check(await cards.locator('article').count() === 3, 'Guests must see three starting places');
  check(await page.locator('#go-to-login-btn').isVisible(), 'Direct planning must remain available');
  await page.locator('#lang-toggle').click();
  check(await cards.locator('#discover-title').textContent() === 'Find your starting point', 'Card heading must translate');
  check(await cards.locator('#forest-name').textContent() === 'Seoul Forest', 'Place names must translate');
  await page.screenshot({ path: `${page.smokeOutputDir}/home-recommendations-en-mobile.png`, fullPage: true });
  await page.locator('#lang-toggle').click();
  const overflow = await cards.evaluate(el => [...el.shadowRoot.querySelectorAll('article, button')].some(node => {
    const rect = node.getBoundingClientRect();
    return rect.left < 0 || rect.right > innerWidth;
  }));
  check(!overflow, 'Cards must fit the mobile viewport');
  await page.locator('#theme-toggle').click();
  await page.screenshot({ path: `${page.smokeOutputDir}/home-recommendations-ko-dark.png`, fullPage: true });
  await cards.locator('button[data-place=forest]').focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/login?next=%2Fpreference%2F1');
  await page.reload();
  await page.locator('login-view #email-input').fill('smoke@example.invalid');
  await page.locator('login-view #password-input').fill('test-password');
  await page.locator('login-view #email-login-btn').click();
  await page.waitForURL('**/preference/1');
  await page.locator('preference-view #next-step-btn').click();
  await page.waitForURL('**/preference/2');
  await page.locator('preference-view #skip-btn').click();
  await page.waitForURL('**/plan');
  await page.waitForFunction(() => document.querySelector('travel-form')?.getFormData().startLocation.includes('서울숲'));
  const form = await page.locator('travel-form').evaluate(el => el.getFormData());
  check(form.startLocation === '서울숲, 서울 성동구 뚝섬로 273', 'Selected departure must reach the real form');
  check(form.endLocation === '서울역' && form.anchorSchedules[0]?.name === '공연', 'Choosing a departure must preserve other inputs');
  await page.evaluate(() => window.navigate('/'));
  await cards.locator('button[data-place=island]').click();
  await page.waitForURL('**/preference/1');
  check((await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')))).startLocation.includes('선유도공원'),
    'Logged-in users can choose a different starting place');
  return { errors: page.smokeErrors, findings: [] };
}
