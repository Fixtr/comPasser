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
  check((await cards.locator('button[data-place=forest]').textContent()).includes('출발지로 선택됨'), 'Departure role must be visible');
  check((await cards.locator('button[data-place=island]').textContent()).includes('도착지로 선택됨'), 'Destination role must be visible');
  await cards.locator('button[data-place=palace]').click();
  check((await cards.locator('button[data-place=island]').textContent()).includes('방문지로 선택됨'), 'Middle place must become a stop');
  check((await cards.locator('button[data-place=palace]').textContent()).includes('도착지로 선택됨'), 'Third place must become destination');
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
  await page.waitForFunction(() => document.querySelector('travel-form')?.getFormData().startLocation.includes('서울숲'));
  const form = await page.locator('travel-form').evaluate(el => el.getFormData());
  check(form.startLocation === '서울숲, 서울 성동구 뚝섬로 273', 'Selected departure must reach the real form');
  check(form.endLocation === '경복궁, 서울 종로구 사직로 161' && form.anchorSchedules[0]?.name === '공연', 'Selected destination must reach the real form without losing appointments');
  check(form.selectedWaypoints[0]?.name === '선유도공원', 'Selected stop must reach the real form');
  check(await page.locator('travel-form #selected-waypoint').isVisible(), 'Selected stop must be visible and removable');
  await page.locator('travel-form #remove-waypoint').click();
  check((await page.locator('travel-form').evaluate(el => el.getFormData())).selectedWaypoints.length === 0,
    'Removing the stop must update the submitted request');
  await page.evaluate(() => window.navigate('/'));
  for (const id of ['forest', 'island', 'palace']) {
    const button = cards.locator(`button[data-place=${id}]`);
    if (await button.getAttribute('aria-pressed') === 'true') await button.click();
  }
  await cards.locator('button[data-place=island]').click();
  await cards.locator('#discover-plan').click();
  await page.waitForURL('**/preference/1');
  check((await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')))).startLocation.includes('선유도공원'),
    'Logged-in users can choose a different starting place');
  check((await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')))).selectedWaypoints.length === 0,
    'Choosing one place must clear the prior stop');
  await page.evaluate(() => window.navigate('/'));
  await cards.locator('button[data-city=busan]').click();
  for (const id of ['haeundae', 'dongbaek', 'gwangalli']) await cards.locator(`button[data-place=${id}]`).click();
  await cards.locator('#discover-plan').click();
  const busan = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  check(busan.startLocation.includes('해운대') && busan.endLocation.includes('광안리') && busan.selectedWaypoints[0]?.name === '동백섬',
    'A three-stop Busan route must reach the same planner draft');
  return { errors: page.smokeErrors, findings: [] };
}
