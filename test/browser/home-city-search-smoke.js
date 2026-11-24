// Local fake auth only; real home screen, city catalogue, planner draft and destination screen.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  const draft = () => page.evaluate(() => sessionStorage.getItem('currentFormData'));
  const home = async () => {
    await page.evaluate(() => window.navigate('/'));
    await page.waitForURL(url => url.pathname === '/');
    await page.locator('.ionic-home h1:visible').waitFor();
  };
  const search = page.getByRole('searchbox', { name: '지원 도시 검색' }).locator('visible=true');
  const box = page.locator('.ionic-home-search:visible');
  const aboveTabBar = () => page.evaluate(() => {
    const visible = element => element.getClientRects().length > 0;
    const bar = [...document.querySelectorAll('ion-tab-bar')].find(visible).getBoundingClientRect().top;
    const buttons = [...document.querySelectorAll('.ionic-home-links button')].filter(visible);
    return buttons.length === 2 && buttons.every(button => button.getBoundingClientRect().bottom <= bar);
  });

  await page.evaluate(() => window.__smoke.setUser(null));
  await page.setViewportSize({ width: 360, height: 640 });
  await home();
  check(await aboveTabBar(), 'Both entries must stay above the tab bar on a 360x640 phone');
  await search.fill('부');
  const busan = box.getByRole('button', { name: '부산 · 대한민국', exact: true });
  await busan.waitFor();
  check(await box.getByRole('button').count() === 1, "'부' must offer Busan only");
  check(await aboveTabBar(), 'Search results must not push the entries under the tab bar');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Home with results must not overflow sideways');
  if (page.smokeOutputDir) await page.screenshot({ path: page.smokeOutputDir + '/home-city-search.png' });
  // Half-typed syllables on the way to 부산 keep it listed.
  for (const typed of ['ㅂ', '붓', '부사']) { await search.fill(typed); await busan.waitFor(); }
  results.push('PASS a Korean prefix, including half-composed syllables, lists the city with its country');

  // Enter that only ends a Korean composition must not choose.
  await search.fill('부');
  await search.evaluate(input => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true })));
  await page.waitForTimeout(200);
  check(new URL(page.url()).pathname === '/', 'Enter during composition must stay on home');
  await busan.click();
  await page.waitForURL('**/destination');
  await page.locator('.flow-page:visible h1').filter({ hasText: '꼭 갈 장소' }).waitFor();
  await page.locator('.flow-page:visible p').filter({ hasText: '부산 · 대한민국' }).waitFor();
  let saved = JSON.parse(await draft());
  check(saved.destination?.id === 'busan' && saved.country === 'KOR' && saved.destinationStage === 'places' && saved.step === '/destination', 'The pick must be saved like the city step saves it');
  results.push('PASS choosing the result opens the /destination places step for Busan');

  await home();
  check(await search.inputValue() === '', 'The search must be empty again after a pick');
  await search.fill('평양');
  await box.getByRole('status').filter({ hasText: '지원하는 도시가 없어요' }).waitFor();
  check(await search.inputValue() === '평양', 'A query without a match must stay in the field');
  check(await box.getByRole('listitem').count() === 0, 'No results may show without a match');
  await box.getByRole('button', { name: '전체 지원 도시 보기', exact: true }).click();
  await page.waitForURL('**/recommend');
  await page.getByRole('heading', { name: '어느 나라로 떠날까요?' }).locator('visible=true').waitFor();
  results.push('PASS no match keeps the query, says so and opens the country list');

  // Keyboard: Enter with one match chooses it; with several, Enter or ArrowDown moves to the first result.
  await home();
  await search.fill('');
  await page.getByRole('button', { name: 'English', exact: true }).locator('visible=true').first().click();
  const english = page.getByRole('searchbox', { name: 'Search supported cities' }).locator('visible=true');
  await english.fill('s');
  await box.getByRole('listitem').nth(1).waitFor();
  await english.press('ArrowDown');
  check(await box.getByRole('button').first().evaluate(button => button === document.activeElement), 'ArrowDown must move focus to the first result');
  await english.fill('york');
  await box.getByRole('button', { name: 'New York · United States', exact: true }).waitFor();
  await english.press('Enter');
  await page.waitForURL('**/destination');
  saved = JSON.parse(await draft());
  check(saved.destination?.id === 'newyork' && saved.destination.name === 'New York, United States', 'Enter on a single match must save that city');
  // Other screens stay mounted but hidden in the stack, so pick the language button of the screen that shows this heading.
  const placesHeading = page.getByRole('heading', { name: 'Must-visit places', exact: true }).locator('visible=true');
  await placesHeading.waitFor();
  await page.locator('.ion-page').filter({ has: placesHeading }).last().getByRole('button', { name: '한국어', exact: true }).click();
  results.push('PASS English names match from any word; Enter chooses a single match');

  // A signed-in traveler's draft survives opening home and typing; only a pick changes it.
  await page.evaluate(async () => {
    window.__smoke.setUser({ uid: 'smokeOwner', displayName: '검증 계정', emailVerified: true, providerData: [] });
    const { plannerDraftStore } = await import('/src/domains/planner/services/planner-draft.mjs');
    plannerDraftStore.save({ date: ['2030-10-01'], startLocation: '서울역', destination: { id: 'seoul', country: 'KOR', name: 'Seoul, South Korea' }, country: 'KOR', destinationStage: 'places',
      anchorSchedules: [{ name: '공연', day: 1, time: '15:00', endTime: '16:00', location: '공연장' }] });
  });
  const before = await draft();
  await home();
  await search.fill('부');
  await busan.waitFor();
  check(await draft() === before, 'Opening home and searching must not touch the saved draft');
  // Another city would drop the Seoul visit, so the pick asks first; cancelling changes nothing and returns to the field.
  await busan.click();
  const dialog = page.getByRole('alertdialog', { name: '도시를 바꿀까요?' });
  check(await dialog.locator('.confirm-message').textContent() === '서울 여행에 담아 둔 내용이 지워져요: 꼭 갈 장소', 'The dialog must name the city and what the pick removes');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  check(new URL(page.url()).pathname === '/' && await draft() === before, 'Cancelling must stay on home with the draft untouched');
  check(await search.inputValue() === '부' && await search.evaluate(input => input === document.activeElement), 'Cancelling must keep the query and return focus to the search field');
  // Enter on the single match asks too, and Escape cancels the same way.
  await search.press('Enter');
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  check(await draft() === before && await search.evaluate(input => input === document.activeElement), 'Enter on a single match must ask before dropping the draft');
  // Leaving home with the question open closes it unanswered, so nothing can be confirmed from another screen.
  await busan.click();
  await dialog.waitFor();
  await page.goBack();
  await dialog.waitFor({ state: 'detached' });
  check(new URL(page.url()).pathname !== '/' && await draft() === before, 'Leaving home must close the question without saving');
  await home();
  await busan.click();
  await dialog.getByRole('button', { name: '바꾸기', exact: true }).click();
  await page.waitForURL('**/destination');
  saved = JSON.parse(await draft());
  check(saved.destination?.id === 'busan' && saved.anchorSchedules.length === 0 && saved.startLocation === '서울역' && saved.date[0] === '2030-10-01',
    'A pick for another city follows the one-city draft rule: visits dropped, dates and start kept');
  results.push('PASS a signed-in draft is unchanged until a pick for another city is confirmed');
  // The same city, and a draft with nothing to drop, never ask.
  for (const [typed, name, id] of [['부', '부산', 'busan'], ['서울', '서울', 'seoul'], ['부', '부산', 'busan']]) {
    await home();
    await search.fill(typed);
    await box.getByRole('button', { name: `${name} · 대한민국`, exact: true }).click();
    await page.waitForURL('**/destination');
    check(await dialog.count() === 0 && JSON.parse(await draft()).destination?.id === id, 'A pick that drops nothing must not ask');
  }
  results.push('PASS no question when the pick drops nothing');

  // A pick made before auth settles waits, then lands on the draft that sign-in restores instead of being overwritten by it.
  await page.evaluate(() => { sessionStorage.removeItem('currentFormData'); sessionStorage.setItem('__smoke_auth_hold', '1'); });
  await page.goto(page.smokeOrigin + '/');
  await page.locator('.ionic-home h1:visible').waitFor();
  await search.fill('서울');
  await box.getByRole('button', { name: '서울 · 대한민국', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '불러오는 중' }).locator('visible=true').first().waitFor();
  await page.waitForTimeout(300);
  check(new URL(page.url()).pathname === '/' && !(await draft())?.includes('seoul'), 'A pick before auth settles must wait on home without saving');
  await page.evaluate(() => { sessionStorage.removeItem('__smoke_auth_hold'); window.__smoke.setUser(window.__smoke.user); });
  await page.waitForURL('**/destination');
  saved = JSON.parse(await draft());
  check(saved.destination?.id === 'seoul' && saved.startLocation === '서울역' && saved.date[0] === '2030-10-01', 'The waiting pick must be saved on top of the restored draft');
  results.push('PASS a pick before auth settles is saved onto the restored draft');
  return { results, errors: page.smokeErrors };
}
