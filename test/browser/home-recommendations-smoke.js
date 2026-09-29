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
  check(await cards.locator('article').count() === 3, 'Guests must see three places');
  check((await cards.locator('article').first().locator('.kind').textContent()) === '대표 장소', 'Cards must explain their discovery theme');
  check((await cards.locator('article').first().locator('.stay').textContent()).includes('60–120분'), 'Cards must show approximate visit time');
  check(await page.locator('#go-to-login-btn').isVisible(), 'Direct planning must remain available');
  await page.waitForFunction(() => document.querySelector('home-recommendations')?.shadowRoot
    .querySelector('button[data-city=busan][aria-pressed=true]'), null, { timeout: 15000 });
  check(await cards.locator('#haeundae-name').textContent() === '해운대해수욕장', 'City cards must rotate to Busan');
  await page.locator('#lang-toggle').click();
  check(await cards.locator('#haeundae-name').textContent() === 'Haeundae Beach', 'Busan cards must translate');
  await page.locator('#lang-toggle').click();
  await cards.locator('button[data-city=jeju]').click();
  check(await cards.locator('#yongduam-name').textContent() === '용두암', 'Visitors must be able to choose Jeju');
  await cards.locator('button[data-place=yongduam]').click();
  await page.waitForTimeout(10500);
  check(await cards.locator('button[data-city=jeju]').getAttribute('aria-pressed') === 'true', 'Selection must pause rotation');
  await cards.locator('button[data-city=seoul]').click();
  check(await cards.locator('button[data-place=yongduam]').count() === 0, 'Manual city switch must clear the previous selection');
  await page.locator('#lang-toggle').click();
  check(await cards.locator('#discover-title').textContent() === 'Choose places for your route', 'Card heading must translate');
  check(await cards.locator('#forest-name').textContent() === 'Seoul Forest', 'Place names must translate');
  check((await cards.locator('article').first().locator('.stay').textContent()).includes('min'), 'Visit time must translate');
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
  check(await cards.locator('button[data-place=forest]').getAttribute('aria-pressed') === 'true', 'First place must be selected');
  await cards.locator('button[data-place=island]').click();
  check(await cards.locator('button[data-place=island]').getAttribute('aria-pressed') === 'true', 'Second place must be selected');
  check((await cards.locator('button[data-place=forest]').textContent()).includes('필수 방문지로 선택됨'), 'First place must be a required visit');
  check((await cards.locator('button[data-place=island]').textContent()).includes('필수 방문지로 선택됨'), 'Second place must be a required visit');
  await cards.locator('button[data-place=palace]').click();
  check((await cards.locator('button[data-place=palace]').textContent()).includes('필수 방문지로 선택됨'), 'Third place must also be a required visit');
  await cards.locator('#discover-plan').click();
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
  await page.waitForFunction(() => document.querySelector('travel-form')?.getFormData().anchorSchedules.length === 4);
  const form = await page.locator('travel-form').evaluate(el => el.getFormData());
  check(form.startLocation === '이전 출발지' && form.endLocation === '서울역', 'Home picks must not change departure or destination');
  check(form.anchorSchedules.map(anchor => anchor.name).join() === '공연,서울숲,선유도공원,경복궁', 'All three picks must appear as required schedule rows');
  check(form.anchorSchedules.slice(1).every(anchor => anchor.day === 1 && !anchor.time && !anchor.endTime), 'Visitors must set the fixed visit times themselves');
  check(form.selectedWaypoints.length === 0, 'Home picks must not be stored as optional waypoints');
  await page.locator('travel-form .primary-btn').click();
  check(await page.locator('travel-form .anchor-item').nth(1).locator('.anchor-time').getAttribute('aria-invalid') === 'true',
    'Generation must request a time for a required visit');
  await page.evaluate(() => window.navigate('/'));
  for (const id of ['forest', 'island', 'palace']) {
    const button = cards.locator(`button[data-place=${id}]`);
    if (await button.getAttribute('aria-pressed') === 'true') await button.click();
  }
  await cards.locator('button[data-place=island]').click();
  await cards.locator('#discover-plan').click();
  await page.waitForURL('**/preference/1');
  const one = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  check(one.startLocation === '이전 출발지' && one.endLocation === '서울역', 'Another pick must still leave endpoints unchanged');
  check(one.anchorSchedules.filter(anchor => anchor.name === '선유도공원').length === 1, 'Repeating a pick must not duplicate a required visit');
  await page.evaluate(() => window.navigate('/'));
  await cards.locator('button[data-city=busan]').click();
  for (const id of ['haeundae', 'dongbaek', 'gwangalli']) await cards.locator(`button[data-place=${id}]`).click();
  await cards.locator('#discover-plan').click();
  const busan = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  check(busan.startLocation === '이전 출발지' && busan.endLocation === '서울역', 'Busan picks must not replace endpoints');
  check(busan.anchorSchedules.slice(-3).map(anchor => anchor.name).join() === '해운대해수욕장,동백섬,광안리해수욕장',
    'Three Busan picks must reach the required schedule rows');
  return { errors: page.smokeErrors, findings: [] };
}
