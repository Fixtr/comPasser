// Run after refactor-smoke-setup.js. The must-visit section's two add buttons, through to the final review.
async page => {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const results = [];
  const place = (placeId, displayName) => ({ placeId, displayName, formattedAddress: '서울', lat: 37.55, lng: 126.97 });
  const request = { date: ['2026-10-20'], startTime: '09:00', endTime: '18:00',
    startLocation: place('seoul-station', '서울역'), endLocation: place('hotel', '호텔'), anchorSchedules: [] };
  const form = page.locator('travel-form');
  const reviewPanel = form.locator('#review-panel');
  await page.evaluate(async () => { const { setLang } = await import('/src/utils/i18n.js'); setLang('ko'); });
  const populate = () => page.evaluate(data => {
    const view = document.querySelector('travel-form');
    if (view.reviewing) view.hideReview();
    view.populateForm(data);
  }, request);
  const review = async () => {
    await form.locator('.primary-btn').click();
    await form.locator('#final-generate').waitFor({ state: 'visible' });
  };
  const pick = (locator, place) => locator.evaluate((element, place) => {
    element.dispatchEvent(Object.assign(new Event('gmp-select'), { placePrediction: { toPlace: () => ({ ...place, fetchFields: async () => {} }) } }));
  }, place);
  const focusedClass = () => page.evaluate(() => document.querySelector('travel-form').shadowRoot.activeElement?.className);

  // Nothing added: 다음 alone reaches the review.
  await populate();
  const section = form.locator('.form-section:has(#anchors-container)');
  check((await section.innerText()).includes('이미 시간을 정해 둔 식사나 티켓이 있나요? 없으면 그냥 넘어가세요.'), 'The section must ask the reservation question');
  const reservationBtn = form.getByRole('button', { name: '예약한 일정 추가하기', exact: true });
  const visitBtn = form.getByRole('button', { name: '꼭 갈 장소 추가하기', exact: true });
  for (const button of [reservationBtn, visitBtn]) {
    check((await button.boundingBox()).height >= 44, 'Add buttons must be at least 44px tall');
    check(await button.evaluate(el => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)'), 'Add buttons must stay secondary (not filled)');
  }
  await review();
  check(await reviewPanel.locator('.step-badge').innerText() === '7 / 7', 'The empty path must reach the final review');
  check(!(await reviewPanel.innerText()).includes('방문 시간 자동 배치'), 'The empty path must list no visit');
  results.push('PASS nothing added reaches the final review');

  // Reservation: time inputs open and enabled at once.
  await populate();
  await reservationBtn.click();
  const booked = form.locator('.anchor-item').first();
  check(!await booked.locator('.anchor-flexible').isChecked(), 'A reservation must start with auto-placement off');
  for (const [selector, label] of [['.anchor-time', '시작 시간'], ['.anchor-end-time', '종료 시간']]) {
    const input = booked.locator(selector);
    check(await input.isVisible() && await input.isEnabled(), `${selector} must open enabled`);
    // The accessible name, not a nearby label: a screen reader must tell start from end.
    const named = booked.getByLabel(label);
    check(await named.count() === 1 && await named.evaluate((el, selector) => el.matches(selector), selector), `${selector} must be named "${label}"`);
  }
  check(await form.locator('#add-anchor-btn').innerText() === '꼭 갈 장소 추가하기', 'A reservation alone must not read as a must-visit place already added');
  check(await focusedClass() === 'anchor-name', 'Focus must move into the new reservation');
  await booked.locator('.anchor-name').fill('저녁 예약');
  await booked.locator('.anchor-time').fill('12:00');
  await booked.locator('.anchor-end-time').fill('13:00');
  // A name autocomplete misses: 더 찾기 lists text-search results and picks one into this reservation.
  await page.evaluate(() => { window.__namedPlacesFixtures = { 해변열차: { id: 'blue-mipo', displayName: '해운대블루라인파크 미포정거장', formattedAddress: '부산광역시 해운대구', location: { lat: 35.15, lng: 129.17 }, addressComponents: [{ types: ['country'], shortText: 'KR' }] } }; });
  await booked.locator('.anchor-location input').fill('해변열차');
  await booked.getByRole('button', { name: '찾는 곳이 없나요? 더 찾기', exact: true }).click();
  await booked.getByRole('button', { name: /해운대블루라인파크 미포정거장/ }).click();
  check(await booked.locator('.anchor-location').evaluate(el => el.selectedPlace?.placeId) === 'blue-mipo', 'Search more must select the picked place into the reservation');
  await page.evaluate(() => { delete window.__namedPlacesFixtures; });
  await pick(booked.locator('.anchor-location'), place('restaurant', '식당'));
  results.push('PASS reservation button opens enabled start/end time inputs');

  // Must-visit: auto-placement on, as before.
  await form.locator('#add-anchor-btn').click();
  const visit = form.locator('.anchor-item').nth(1);
  check(await visit.locator('.anchor-flexible').isChecked(), 'A must-visit place must start with auto-placement on');
  check(await visit.locator('.anchor-time').isDisabled() && await visit.locator('.anchor-end-time').isDisabled(), 'Auto-placed times must stay disabled');
  check(await focusedClass() === 'anchor-name', 'Focus must move into the new must-visit place');
  await visit.locator('.anchor-name').fill('경복궁');
  await pick(visit.locator('.anchor-location'), place('palace', '경복궁'));
  check(await form.locator('#add-anchor-btn').innerText() === '꼭 갈 장소 더 추가하기', 'The must-visit button must offer one more after an auto-placed item');
  check(await visit.getByLabel('시작 시간').count() === 1 && await booked.getByLabel('시작 시간').count() === 1, 'Each item must name its own time inputs');
  // The per-item checkbox still switches the choice after adding.
  await visit.locator('.anchor-flexible').uncheck();
  check(await visit.locator('.anchor-time').isEnabled(), 'Unchecking auto-placement must open the times');
  await visit.locator('.anchor-flexible').check();
  results.push('PASS must-visit button creates an auto-placement item');

  await review();
  check(await reviewPanel.locator('.step-badge').innerText() === '7 / 7', 'The reservation path must reach the final review');
  check(await reviewPanel.locator('#review-issues').isHidden() && await form.locator('#final-generate').isEnabled(), 'The reservation path must reach an unblocked review: ' + await reviewPanel.locator('#review-issues').innerText());
  const lines = await reviewPanel.locator('section p').allInnerTexts();
  check(lines.some(line => line.includes('저녁 예약') && line.includes('12:00 – 13:00')), 'The review must show the reservation as start – end: ' + lines.join(' | '));
  check(lines.some(line => line.includes('경복궁') && line.includes('방문 시간 자동 배치')), 'The review must show the auto-placement label: ' + lines.join(' | '));
  results.push('PASS review shows the reservation time and the auto-placement label');

  // Leave a clean form for whatever runs next.
  await page.evaluate(() => document.querySelector('travel-form').hideReview());
  check(page.smokeErrors.length === 0, 'Unexpected page errors: ' + page.smokeErrors.join(', '));
  return { results, errors: page.smokeErrors };
}
