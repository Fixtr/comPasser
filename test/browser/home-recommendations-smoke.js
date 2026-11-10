// Reuses the local-only auth/Maps fixtures from refactor-smoke-setup.js.
// Ionic shell: /recommend picks a country and city, then lists that city's catalogue places (DestinationScreen).
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const draft = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  const saveDraft = value => page.evaluate(async value => {
    const { plannerDraftStore } = await import('/src/domains/planner/services/planner-draft.mjs');
    plannerDraftStore.save(value);
  }, value);
  const button = name => page.getByRole('button', { name, exact: true });
  const rows = page.locator('.flow-place-row:visible');
  const row = name => rows.filter({ has: page.locator('summary', { hasText: name }) });
  // A catalogue pick resolves through the Places fake first, so wait for it to be marked.
  const toggle = async name => {
    const pressed = await row(name).locator('[data-place-pick]').getAttribute('aria-pressed');
    await row(name).locator('[data-place-pick]').click();
    await row(name).locator(`[data-place-pick][aria-pressed="${pressed === 'true' ? 'false' : 'true'}"]`).waitFor();
  };
  const chooseCity = async (path, city) => {
    // navigate() ignores the current address, which already shows the country picker.
    await page.evaluate(path => window.navigate(path), path);
    await page.locator('[data-recommend-country=KOR]:visible, [data-course-country=KOR]:visible').first().click();
    await page.locator(`[data-recommend-city=${city}]:visible, [data-course-city=${city}]:visible`).first().click();
  };
  const pick = (locator, place) => locator.evaluate((element, place) => {
    element.dispatchEvent(Object.assign(new Event('gmp-select'), { placePrediction: { toPlace: () => ({ ...place, fetchFields: async () => {} }) } }));
  }, place);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.navigate('/'));
  // Leaving the signed-in /plan asks first; moving on to the home page means yes.
  await page.locator('[role="alertdialog"] .confirm-ok').click();
  await page.waitForURL(url => url.pathname === '/');
  await page.evaluate(() => window.__smoke.setUser(null));
  await saveDraft({ date: ['2030-10-01'], startLocation: '이전 출발지', endLocation: '서울역',
    startTime: '09:00', endTime: '18:00',
    anchorSchedules: [{ name: '공연', day: 1, time: '15:00', endTime: '16:00', location: '공연장' }] });
  check(await button('일정 만들기').isVisible() && await button('코스 둘러보기').isVisible(), 'Home must offer recommendations and courses');
  await button('일정 만들기').click();
  await page.waitForURL('**/recommend');
  await page.locator('[data-recommend-country=KOR]').click();
  check(await page.locator('[data-recommend-city]:visible').count() === 6, 'All six cities must be available');
  await page.locator('[data-recommend-city=seoul]').click();
  await row('서울숲').waitFor();
  check(await rows.count() === 6, 'Guests must see six places');
  await row('경복궁').locator('summary').click();
  check((await row('경복궁').locator('details p').innerText()).length > 0, 'Cards must explain the place');
  check(await row('경복궁').getByRole('link').isVisible(), 'Cards must link the official guide');
  await button('English').click();
  await row('Seoul Forest').waitFor();
  check(await row('Seoul Forest').locator('[data-place-pick]').getAttribute('aria-label') === 'Add to must-visit places: Seoul Forest', 'Place names must translate');
  await button('한국어').click();
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await page.locator('[data-recommend-city=busan]').click();
  await row('해운대해수욕장').waitFor();
  await button('English').click();
  await row('Haeundae Beach').waitFor();
  await button('한국어').click();
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await page.locator('[data-recommend-city=seoul]').click();
  await row('서울숲').waitFor();
  await button('다크 모드').click();
  check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Dark mode must apply');
  await page.screenshot({ path: `${page.smokeOutputDir}/home-recommendations-ko-dark.png`, fullPage: true });
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.flow-place-row, .flow-place-row button')]
    .filter(node => node.checkVisibility()).some(node => { const rect = node.getBoundingClientRect(); return rect.left < 0 || rect.right > innerWidth; }));
  check(!overflow, 'Cards must fit the mobile viewport');
  await button('라이트 모드').click();

  // Keyboard selection of the first place, then two more by pointer.
  await row('서울숲').locator('[data-place-pick]').focus();
  await page.keyboard.press('Enter');
  await row('서울숲').locator('[data-place-pick][aria-pressed="true"]').waitFor();
  await toggle('선유도공원');
  await page.locator('.flow-place-chip', { hasText: '선유도공원' }).click();
  await row('선유도공원').locator('[data-place-pick][aria-pressed="false"]').waitFor();
  check(!(await page.locator('.flow-place-chip').allInnerTexts()).some(text => text.includes('선유도공원')), 'A selected place must be removable from the summary');
  await toggle('선유도공원');
  await toggle('경복궁');
  check((await page.locator('.flow-place-chip').allInnerTexts()).join() === '공연 ×,서울숲 ×,선유도공원 ×,경복궁 ×', 'Picks must join the existing booking');
  await page.locator('.flow-primary:visible').click();
  await page.waitForURL('**/login?next=%2Fpreference%2F1');
  check((await page.locator('.ionic-auth-reason:visible').innerText()).includes('서울에서 고른 장소 4곳'), 'The login wall must say the picks are kept');
  await page.reload();
  await page.locator('login-view #email-input:visible').fill('smoke@example.invalid');
  await page.locator('login-view #password-input:visible').fill('test-password');
  await page.locator('login-view #email-login-btn:visible').click();
  await page.waitForURL('**/preference/1');
  await page.locator('preference-view #next-step-btn:visible').click();
  await page.waitForURL('**/preference/2');
  await page.locator('preference-view #skip-btn:visible').click();
  await page.waitForURL('**/plan');
  await page.waitForFunction(() => document.querySelector('travel-form')?.getFormData?.().anchorSchedules.length === 4);
  const form = await page.locator('travel-form').evaluate(el => el.getFormData());
  check(form.startLocation === '이전 출발지' && form.endLocation === '서울역', 'Home picks must not change departure or destination');
  check(form.anchorSchedules.map(anchor => anchor.name).join() === '공연,서울숲,선유도공원,경복궁', 'All three picks must appear as required schedule rows');
  check(form.anchorSchedules.slice(1).every(anchor => anchor.day === 1 && anchor.flexible && anchor.stayMinutes > 0 && !anchor.time && !anchor.endTime
    && anchor.location?.placeId), 'Home picks must remain untimed required visits with their searched place');
  check(form.selectedWaypoints.length === 0, 'Home picks must not be stored as optional waypoints');
  // The Ionic planner only generates from searched places, so the typed draft endpoints and venue are picked again.
  const place = (placeId, displayName, lng) => ({ placeId, displayName, formattedAddress: '서울', lat: 37.55, lng });
  await pick(page.locator('travel-form #start-location'), place('start', '이전 출발지', 126.97));
  await pick(page.locator('travel-form #end-location'), place('end', '서울역', 126.972));
  await pick(page.locator('travel-form .anchor-location').first(), place('venue', '공연장', 126.98));
  await page.locator('travel-form .primary-btn').click();
  await page.locator('travel-form #final-generate').click();
  await page.waitForFunction(() => window.__smoke.requests.length > 0);
  const submitted = await page.evaluate(() => window.__smoke.requests.at(-1));
  check(submitted.anchorSchedules.length === 4 && submitted.anchorSchedules.every(anchor => anchor.time && anchor.endTime),
    'Generation must assign times to every required visit');
  check(submitted.anchorSchedules[0].time === '15:00' && submitted.anchorSchedules[0].endTime === '16:00',
    'Automatic placement must preserve the existing reservation time');
  check(submitted.anchorSchedules.slice(1).every(anchor => anchor.flexible && anchor.stayMinutes > 0),
    'Generated visits must retain their flexible status for later editing');
  await page.evaluate(() => window.__smoke.pending.at(-1).reject(new Error('TEST: stop after the request')));
  await page.getByRole('alert').filter({ hasText: 'TEST: stop after the request' }).waitFor();

  // Signed in now: each pick below starts from a fresh draft that keeps the traveler's own endpoints.
  const endpoints = { date: ['2030-10-01'], startLocation: '이전 출발지', endLocation: '서울역', startTime: '09:00', endTime: '18:00', anchorSchedules: [] };
  await page.evaluate(() => window.navigate('/recommend'));
  await page.locator('[role="alertdialog"] .confirm-ok').click();
  await page.waitForURL('**/recommend');
  await saveDraft(endpoints);
  await chooseCity('/recommend', 'busan');
  for (const name of ['해운대해수욕장', '동백섬', '광안리해수욕장']) await toggle(name);
  await page.locator('.flow-primary:visible').click();
  await page.waitForURL('**/preference/1');
  const busan = await draft();
  check(busan.startLocation === '이전 출발지' && busan.endLocation === '서울역', 'Busan picks must not replace endpoints');
  check(busan.anchorSchedules.map(anchor => anchor.name).join() === '해운대해수욕장,동백섬,광안리해수욕장',
    'Three Busan picks must reach the required schedule rows');

  await saveDraft(endpoints);
  await chooseCity('/recommend', 'seoul');
  await row('경복궁').waitFor();
  check(await page.locator('.flow-place-chip').count() === 0, 'Switching city must not carry the previous city’s picks');
  await toggle('경복궁');
  await toggle('경복궁');
  check(await page.locator('.flow-primary:visible').isEnabled(), 'Removing the only selection must still allow continuation');
  check((await page.locator('.flow-primary:visible').innerText()).includes('장소 선택 없이 다음'), 'Empty selections must offer continuation without places');
  for (const name of ['경복궁', '서울숲', '선유도공원']) await toggle(name);
  check((await page.locator('.flow-primary:visible').innerText()).includes('선택한 장소 3개'), 'The continue button must count the picks');
  await page.locator('.flow-primary:visible').click();
  await page.waitForURL('**/preference/1');
  const selectedDraft = await draft();
  check(selectedDraft.anchorSchedules.map(anchor => anchor.name).join() === '경복궁,서울숲,선유도공원',
    'Individual selections must become required visits');
  check(selectedDraft.anchorSchedules.every(anchor => anchor.flexible && !anchor.time && !anchor.endTime),
    'Individual selections must remain untimed visits for automatic placement');
  // Returning with the picks still in the draft: they show as chosen, and picking one again keeps a single visit.
  await chooseCity('/recommend', 'seoul');
  for (const name of ['서울숲', '선유도공원', '경복궁']) await row(name).locator('[data-place-pick][aria-pressed="true"]').waitFor();
  check((await page.locator('.flow-place-chip').allInnerTexts()).join() === '경복궁 ×,서울숲 ×,선유도공원 ×', 'Returning must show the draft’s picks');
  await toggle('선유도공원');
  await toggle('선유도공원');
  await page.locator('.flow-primary:visible').click();
  await page.waitForURL('**/preference/1');
  const repeated = await draft();
  check(repeated.startLocation === '이전 출발지' && repeated.endLocation === '서울역', 'Another pick must still leave endpoints unchanged');
  check(repeated.anchorSchedules.filter(anchor => anchor.name === '선유도공원').length === 1, 'Repeating a pick must not duplicate a required visit');

  await saveDraft(endpoints);
  for (const city of ['incheon', 'daegu', 'daejeon']) {
    await chooseCity('/recommend', city);
    await rows.first().waitFor();
    check(await rows.count() === 6, `${city} must show six places`);
    check((await rows.locator('summary').allInnerTexts()).every(text => /[가-힣]/.test(text)), `${city} places must be translated`);
  }
  await toggle('한밭수목원');
  await toggle('엑스포과학공원');
  await page.locator('.flow-primary:visible').click();
  await page.waitForURL('**/preference/1');
  const daejeon = await draft();
  // The stored name is the searched place's own name (Places fixture), not the catalogue label.
  check(daejeon.anchorSchedules.map(anchor => anchor.name).join() === '한밭수목원,대전 엑스포 과학공원',
    'Two individual city selections must become required visits');

  await saveDraft(endpoints);
  await chooseCity('/courses', 'busan');
  const courses = page.locator('home-courses:visible');
  await courses.locator('button[data-course=curated-busan]').waitFor({ state: 'visible' });
  check(await courses.locator('article').count() === 3, 'Curated route browsing must show three courses per domestic city');
  await courses.locator('button[data-course=curated-busan]').click();
  await page.waitForURL('**/preference/1');
  const copiedCourse = await draft();
  check(copiedCourse.startLocation === '이전 출발지' && copiedCourse.endLocation === '서울역',
    'Copying a course must preserve the traveler’s own endpoints');
  check(copiedCourse.anchorSchedules.map(anchor => anchor.name).join() === '해운대해수욕장,동백섬'
    && copiedCourse.anchorSchedules.every(anchor => anchor.flexible && !anchor.time),
  'A curated route must become untimed required visits in order');
  return { errors: page.smokeErrors, findings: [] };
}
