// Local fake auth/DB only; real home screen, card element and trip selection. The clock is fixed at 2026-09-13.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  await page.evaluate(() => {
    const days = dates => dates.map((date, index) => ({ day: index + 1, date, scheduleItems: [
      { type: 'attraction', title: '경복궁', location: '서울', time: '10:00', endTime: '11:00' },
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
  check(await page.locator('upcoming-trip').count() === 0, 'Guests must not get the upcoming trip card');
  results.push('PASS guest home has no upcoming trip card');

  await page.evaluate(() => window.__smoke.setUser({ uid: 'smokeOwner', displayName: '검증 계정', emailVerified: true, providerData: [] }));
  const card = page.locator('upcoming-trip');
  await card.locator('.status').filter({ hasText: '다가오는 여행 · D-2' }).waitFor();
  check((await card.locator('h2').textContent()).includes('2박 3일'), 'Untitled trip must show its built title');
  check(await card.locator('.dates').textContent() === '9월 15일~9월 17일', 'Card must show the trip date range');
  results.push('PASS nearest future trip with D-2, built title and date range');
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Home with the card must not overflow on a phone');
  if (page.smokeOutputDir) await page.screenshot({ path: page.smokeOutputDir + '/home-upcoming-trip.png' });

  await page.getByRole('button', { name: 'English', exact: true }).first().click();
  await card.locator('.status').filter({ hasText: 'Upcoming trip · D-2' }).waitFor();
  check(await card.locator('.dates').textContent() === '09/15–09/17', 'Date range must follow the language');
  await page.getByRole('button', { name: '한국어', exact: true }).first().click();
  await card.locator('.status').filter({ hasText: '다가오는 여행' }).waitFor();
  results.push('PASS card text follows the language switch');

  await card.getByRole('button', { name: /^보기: / }).click();
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
  results.push('PASS ongoing trip shows its day number, one card after / then /home');
  await page.getByRole('button', { name: 'English', exact: true }).first().click();
  await card.locator('.status').filter({ hasText: 'On your trip · Day 2' }).waitFor();
  results.push('PASS ongoing status follows the language switch');
  return { results, errors: page.smokeErrors };
}
