// Reuses the local-only auth/Maps fixtures from refactor-smoke-setup.js.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    window.navigate('/');
    window.__smoke.setUser(null);
    const { plannerDraftStore } = await import('/src/domains/planner/services/planner-draft.mjs');
    plannerDraftStore.save({ date: ['2030-10-01'], startLocation: '이전 출발지', endLocation: '서울역',
      startTime: '09:00', endTime: '18:00',
      anchorSchedules: [{ name: '공연', day: 1, time: '15:00', endTime: '16:00', location: '공연장' }] });
  });
  check(await page.locator('#go-to-login-btn').isVisible(), 'Direct planning must remain available');
  await page.locator('home-preview a[href="/recommend"]').click();
  await page.waitForURL('**/recommend');
  const cards = page.locator('home-recommendations');
  await cards.locator('button[data-place=forest]').waitFor({ state: 'visible' });
  check(await cards.locator('button[data-city]').count() === 6, 'All six cities must be available');
  check(await cards.locator('article').count() === 6, 'Guests must see six places');
  check(await cards.locator('.photo img').count() === 3, 'Existing licensed place photos must remain available');
  await cards.locator('article').first().locator('details.place-details summary').click();
  await cards.locator('.photo img').first().scrollIntoViewIfNeeded();
  await cards.locator('article').first().locator('details.place-details summary').click();
    check(await cards.locator('.photo img').first().evaluate(image => image.decode().then(() => image.naturalWidth > 0)), 'Place photos must load');
  check(await cards.locator('.photo img').first().evaluate(image => {
    const { width, height } = image.getBoundingClientRect();
    return width / height > 1.5 && width / height < 1.7;
  }), 'Place photos must fit the card without stretching its height');
  check((await cards.locator('.photo figcaption').first().textContent()).includes('CC BY-SA 4.0'), 'Photo author and license must be visible');
  check((await cards.locator('article').first().locator('.kind').textContent()) === '대표 장소', 'Cards must explain their discovery theme');
  check((await cards.locator('.provenance').first().textContent()).includes('방문객 수 순위가 아닙니다'),
    'Editorial picks must not claim measured visitor popularity');
  check(await cards.locator('.crowd').isVisible(), 'The Seoul crowd signal must name its coverage separately from place cards');
  check((await cards.locator('article').first().locator('.stay').textContent()).includes('60–120분'), 'Cards must show approximate visit time');
  await cards.locator('button[data-city=busan]').click();
  check(await cards.locator('#haeundae-name').textContent() === '해운대해수욕장', 'City selection must show Busan');
  await page.locator('#lang-toggle').click();
  check(await cards.locator('#haeundae-name').textContent() === 'Haeundae Beach', 'Busan cards must translate');
  await page.locator('#lang-toggle').click();
  await cards.locator('button[data-city=jeju]').click();
  check(await cards.locator('#yongduam-name').textContent() === '용두암', 'Visitors must be able to choose Jeju');
  await cards.locator('button[data-place=yongduam]').click();
  check(await cards.locator('button[data-city=jeju]').getAttribute('aria-pressed') === 'true', 'Place selection must preserve the chosen city');
  await cards.locator('button[data-city=seoul]').click();
  check(await cards.locator('button[data-place=yongduam]').count() === 0, 'Manual city switch must clear the previous selection');
  await page.locator('#lang-toggle').click();
  check(await cards.locator('#discover-title').textContent() === 'Choose places for your route', 'Card heading must translate');
  check(await cards.locator('#forest-name').textContent() === 'Seoul Forest', 'Place names must translate');
  await cards.evaluate(el => {
    el.crowd = { area: '광화문·덕수궁', level: '보통', observedAt: '2026-09-13 11:30', source: 'https://data.seoul.go.kr/dataVisual/seoul/guide.do' };
    el.renderCrowd();
  });
  check((await cards.locator('.crowd').textContent()).includes('Gwanghwamun–Deoksugung')
    && (await cards.locator('.crowd').textContent()).includes('Update delayed'),
  'English crowd details must name the area and warn after 20 minutes');
  await cards.evaluate(el => { el.crowd.observedAt = '2026-09-13 10:50'; el.renderCrowd(); });
  check((await cards.locator('.crowd').textContent()).includes('unavailable'),
    'Crowd observations older than 60 minutes must disappear even on an open page');
  await cards.evaluate(el => { el.crowd = null; el.renderCrowd(); });
  await cards.locator('button[data-filter=discoverFind]').click();
  check(await cards.locator('article').count() === 2 && await cards.locator('#island-name').count() === 1,
    'Discovery filters must show only the chosen place type');
  check(await cards.locator('button[data-filter=discoverFind]').getAttribute('aria-pressed') === 'true', 'The active filter must be announced');
  check((await cards.locator('#island-name').locator('..').locator('.description').textContent()).includes('Why visit'),
    'Editorial discovery cards must explain the reason to visit');
  await cards.locator('button[data-filter=all]').click();
  check((await cards.locator('.photo figcaption').first().textContent()).includes('Photo:'), 'Photo credits must translate');
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
  await cards.locator('button[data-filter=discoverLandmark]').click();
  check(await cards.locator('.selected-list button').count() === 2, 'Selected places must stay visible when a filter hides their cards');
  await cards.locator('.selected-list button[data-remove=island]').click();
  check(await cards.locator('.selected-list button').count() === 1, 'A hidden selected place must be removable from the summary');
  await cards.locator('button[data-filter=all]').click();
  await cards.locator('button[data-place=island]').click();
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
  check(form.anchorSchedules.slice(1).every(anchor => anchor.day === 1 && anchor.flexible && anchor.stayMinutes > 0 && !anchor.time && !anchor.endTime),
    'Home picks must remain untimed required visits in the draft');
  check(form.selectedWaypoints.length === 0, 'Home picks must not be stored as optional waypoints');
  await page.locator('travel-form .primary-btn').click();
  await page.waitForFunction(() => window.__smoke.requests.length > 0);
  const submitted = await page.evaluate(() => window.__smoke.requests.at(-1));
  check(submitted.anchorSchedules.length === 4 && submitted.anchorSchedules.every(anchor => anchor.time && anchor.endTime),
    'Generation must assign times to every required visit');
  check(submitted.anchorSchedules[0].time === '15:00' && submitted.anchorSchedules[0].endTime === '16:00',
    'Automatic placement must preserve the existing reservation time');
  check(submitted.anchorSchedules.slice(1).every(anchor => anchor.flexible && anchor.stayMinutes > 0),
    'Generated visits must retain their flexible status for later editing');
  await page.evaluate(() => window.navigate('/recommend'));
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
  await page.evaluate(() => window.navigate('/recommend'));
  await cards.locator('button[data-city=busan]').click();
  for (const id of ['haeundae', 'dongbaek', 'gwangalli']) await cards.locator(`button[data-place=${id}]`).click();
  await cards.locator('#discover-plan').click();
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('currentFormData')).anchorSchedules.at(-1)?.name === '광안리해수욕장');
  const busan = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  check(busan.startLocation === '이전 출발지' && busan.endLocation === '서울역', 'Busan picks must not replace endpoints');
  check(busan.anchorSchedules.slice(-3).map(anchor => anchor.name).join() === '해운대해수욕장,동백섬,광안리해수욕장',
    'Three Busan picks must reach the required schedule rows');
  await page.evaluate(async () => {
    window.navigate('/recommend');
    const { plannerDraftStore } = await import('/src/domains/planner/services/planner-draft.mjs');
    plannerDraftStore.save({ ...plannerDraftStore.read(), anchorSchedules: [] });
  });
  await cards.locator('button[data-city=seoul]').click();
  check(await cards.locator('.pair, #discover-pair').count() === 0, 'Recommendations must not show the nearby pair card');
  await cards.locator('button[data-place=palace]').click();
  await cards.locator('button[data-place=palace]').click();
  check(await cards.locator('#discover-plan').isEnabled(), 'Removing the only selection must still allow continuation');
  check((await cards.locator('#discover-plan').textContent()).includes('장소 선택 없이 다음'), 'Empty selections must offer continuation without places');
  for (const id of ['palace', 'forest', 'island']) await cards.locator(`button[data-place=${id}]`).click();
  await cards.locator('#discover-plan').click();
  const selectedDraft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  check(selectedDraft.anchorSchedules.map(anchor => anchor.name).join() === '경복궁,서울숲,선유도공원',
    'Individual selections must become required visits');
  check(selectedDraft.anchorSchedules.every(anchor => anchor.day === 1 && anchor.flexible && !anchor.time && !anchor.endTime),
    'Individual selections must remain untimed visits for automatic placement');
  await page.evaluate(async () => {
    window.navigate('/recommend');
    const { plannerDraftStore } = await import('/src/domains/planner/services/planner-draft.mjs');
    plannerDraftStore.save({ ...plannerDraftStore.read(), anchorSchedules: [] });
  });
  for (const [city, firstPlace] of [['incheon', 'chinatown'], ['daegu', 'seomun'], ['daejeon', 'hanbat']]) {
    await cards.locator(`button[data-city=${city}]`).click();
    check(await cards.locator('article').count() === 6, `${city} must show six places`);
    check(await cards.locator(`#${firstPlace}-name`).textContent() !== firstPlace, `${city} places must be translated`);
    await cards.locator('article').first().locator('details.place-details summary').click();
    check(await cards.locator('.photo img').first().evaluate(image => image.decode().then(() => image.naturalWidth > 0)),
      `${city} photos must load`);
  }
  await cards.locator('button[data-place=hanbat]').click();
  await cards.locator('button[data-place=expo]').click();
  await cards.locator('#discover-plan').click();
  await page.waitForURL('**/preference/1');
  const daejeon = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  check(daejeon.anchorSchedules.map(anchor => anchor.name).join() === '한밭수목원,엑스포과학공원',
    'Two individual city selections must become required visits');
  await page.evaluate(async () => {
    window.navigate('/courses');
    const { plannerDraftStore } = await import('/src/domains/planner/services/planner-draft.mjs');
    plannerDraftStore.save({ ...plannerDraftStore.read(), anchorSchedules: [] });
  });
  const courses = page.locator('home-courses');
  await courses.locator('button[data-course=curated-busan]').waitFor({ state: 'visible' });
  check(await courses.locator('article').count() === 18, 'Curated route browsing must show three courses per domestic city');
  await courses.locator('button[data-course=curated-busan]').click();
  await page.waitForURL('**/preference/1');
  const copiedCourse = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  check(copiedCourse.startLocation === '이전 출발지' && copiedCourse.endLocation === '서울역',
    'Copying a course must preserve the traveler’s own endpoints');
  check(copiedCourse.anchorSchedules.map(anchor => anchor.name).join() === '해운대해수욕장,동백섬'
    && copiedCourse.anchorSchedules.every(anchor => anchor.flexible && !anchor.time),
  'A curated route must become untimed required visits in order');
  return { errors: page.smokeErrors, findings: [] };
}
