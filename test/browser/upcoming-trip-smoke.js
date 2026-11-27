// Local fake auth/DB only; real home screen, card element and trip selection. The clock is fixed at 2026-09-13.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  await page.evaluate(() => {
    const days = dates => dates.map((date, index) => ({ day: index + 1, date, scheduleItems: [
      { type: 'departure', title: '서울역', time: '09:00' },
      { type: 'attraction', title: '경복궁', location: '서울', time: '10:00', endTime: '11:00' },
      ...(index === 1 ? [{ type: 'AnchorSchedule', title: '궁중 만찬', time: '18:00', endTime: '19:30' },
        { type: 'AnchorSchedule', title: '자유 방문', flexible: true }] : []),
    ] }));
    const request = { destination: { id: 'seoul', country: 'KOR' } };
    const db = JSON.parse(sessionStorage.getItem('__smoke_db'));
    db.itineraries = {
      pastTrip: { userId: 'smokeOwner', title: '지난 여행', itineraryPlan: { request, days: days(['2026-09-01']) } },
      laterTrip: { userId: 'smokeOwner', title: '나중 여행', itineraryPlan: { request, days: days(['2026-10-01']) } },
      soonTrip: { userId: 'smokeOwner', itineraryPlan: { request, days: days(['2026-09-15', '2026-09-16', '2026-09-17']) } },
      otherOwner: { userId: 'someoneElse', title: '남의 여행', itineraryPlan: { request, days: days(['2026-09-13']) } },
    };
    sessionStorage.setItem('__smoke_db', JSON.stringify(db));
    window.__smoke.setUser(null);
    window.navigate('/');
  });
  await page.locator('.ionic-home h1:visible').waitFor();
  // Which of home's two candidates is filled: a filled button's background is its border colour, an outlined one's is not.
  const filled = () => page.evaluate(() => {
    const isFilled = button => getComputedStyle(button).backgroundColor === getComputedStyle(button).borderTopColor;
    const card = [...document.querySelectorAll('upcoming-trip')].find(element => element.getClientRects().length > 0);
    // Read 일정 만들기 from the card's own page: during a route change the leaving home page is still drawn.
    const create = card?.parentElement.querySelector('.ionic-home-links button:first-child')
      ?? [...document.querySelectorAll('.ionic-home-links button:first-child')].find(button => button.getClientRects().length > 0);
    const open = card?.shadowRoot.querySelector('button');
    return { create: isFilled(create), card: open ? isFilled(open) : null };
  });
  const sameFilled = (actual, create, card) => actual.create === create && actual.card === card;
  check(await page.locator('upcoming-trip').count() === 0, 'Guests must not get the upcoming trip card');
  check(sameFilled(await filled(), true, null), 'Without a card 일정 만들기 must be the filled button');
  results.push('PASS guest home has no upcoming trip card');

  await page.evaluate(() => window.__smoke.setUser({ uid: 'smokeOwner', displayName: '검증 계정', emailVerified: true, providerData: [] }));
  const card = page.locator('upcoming-trip');
  await card.locator('.status').filter({ hasText: '다가오는 여행 · D-2' }).waitFor();
  check((await card.locator('h2').textContent()).includes('2박 3일'), 'Untitled trip must show its built title');
  // Places leave out the day's start; only the booked dinner is a reservation, not the must-visit with no time.
  check(await card.locator('.dates').textContent() === '9월 15일~9월 17일 · 장소 5곳 · 예약 1건', 'Card must show the date range, places and bookings');
  check(await card.locator('.first').textContent() === '첫 예약 2일차 18:00 궁중 만찬', 'Card must name the first booking');
  check(sameFilled(await filled(), false, true), 'While a trip shows, its button is the one filled button and 일정 만들기 is outlined');
  results.push('PASS nearest future trip with D-2, built title, dates, counts and first booking');
  for (const [width, height] of [[390, 844], [360, 640]]) {
    await page.setViewportSize({ width, height });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Home with the card must not overflow at ${width}px`);
    // Both entries must stay above the tab bar without scrolling, so the card cannot push them off a small phone.
    check(await page.evaluate(() => {
      const shown = element => element.getClientRects().length > 0;
      const tabs = [...document.querySelectorAll('ion-tab-bar')].find(shown).getBoundingClientRect().top;
      return [...document.querySelectorAll('.ionic-home-links button')].filter(shown).every(button => button.getBoundingClientRect().bottom <= tabs);
    }), `Home entries must stay above the tab bar at ${width}x${height}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (page.smokeOutputDir) await page.screenshot({ path: page.smokeOutputDir + '/home-upcoming-trip.png' });

  await page.getByRole('button', { name: 'English', exact: true }).first().click();
  await card.locator('.status').filter({ hasText: 'Upcoming trip · D-2' }).waitFor();
  check(await card.locator('.dates').textContent() === '09/15–09/17 · 5 places · 1 booked', 'Date range and counts must follow the language');
  await page.getByRole('button', { name: '한국어', exact: true }).first().click();
  await card.locator('.status').filter({ hasText: '다가오는 여행' }).waitFor();
  results.push('PASS card text follows the language switch');

  await card.getByRole('button', { name: /^일정 열기: / }).click();
  await page.waitForURL('**/view/soonTrip');
  results.push('PASS view button opens the saved trip');

  await page.evaluate(() => {
    const db = JSON.parse(sessionStorage.getItem('__smoke_db'));
    db.itineraries.nowTrip = { ...db.itineraries.soonTrip, title: '진행 중 여행', itineraryPlan: { ...db.itineraries.soonTrip.itineraryPlan, days: db.itineraries.soonTrip.itineraryPlan.days.map((day, index) => ({ ...day, date: `2026-09-1${2 + index}` })) } };
    sessionStorage.setItem('__smoke_db', JSON.stringify(db));
    // Ionic keeps the '/' and '/home' pages mounted together; only the shown one may read the trips.
    window.navigate('/');
    window.navigate('/home');
  });
  await page.waitForURL('**/home');
  await card.locator('.status').filter({ hasText: '여행 중 · 2일차' }).waitFor();
  check(await card.count() === 1, 'Only the shown home page may mount the card');
  // On a trip day the button names today's plan; before the trip it says 일정 열기 (clicked above).
  check(await card.getByRole('button', { name: /^오늘 일정 열기: 진행 중 여행$/ }).textContent() === '오늘 일정 열기', 'A trip day must label the button 오늘 일정 열기');
  check(sameFilled(await filled(), false, true), 'On a trip day the card button is the one filled button and 일정 만들기 is outlined');
  results.push('PASS ongoing trip shows its day number, one card after / then /home');
  // Slow CI can leave both mounted home pages stacked, so their language buttons cover each other; a reload leaves one page.
  await page.reload();
  await card.locator('.status').filter({ hasText: '여행 중 · 2일차' }).waitFor();
  await page.getByRole('button', { name: 'English', exact: true }).first().click();
  await card.locator('.status').filter({ hasText: 'On your trip · Day 2' }).waitFor();
  check(await card.getByRole('button').textContent() === "Open today's plan", 'The trip-day label must follow the language');
  results.push('PASS ongoing status follows the language switch');
  return { results, errors: page.smokeErrors };
}
