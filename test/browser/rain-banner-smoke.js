async page => {
  // The harness clock is 2026-09-13 12:00 in Seoul.
  const place = (id, name, lng) => ({ placeId: id, displayName: name, formattedAddress: '서울', lat: 37.5, lng });
  const plan = date => ({ request: { startTime: '09:00', endTime: '18:00', destination: { id: 'seoul', country: 'KOR', name: '서울' } },
    days: [{ day: 1, date, scheduleItems: [
      { type: 'departure', title: '출발', time: '09:00', selectedPlace: place('start', '출발', 127.001) },
      { type: 'attraction', title: '박물관', time: '13:00', endTime: '14:00', placeIntent: { category: 'museum', purpose: '박물관' }, selectedPlace: place('museum', '박물관', 127.002) },
      { type: 'attraction', title: '한강 공원', time: '14:30', endTime: '15:30', placeIntent: { category: 'park', purpose: '산책' }, selectedPlace: place('park', '한강 공원', 127.003) },
      { type: 'arrival', title: '도착', time: '18:00', selectedPlace: place('end', '도착', 127.004) },
    ] }] });
  const rain = Array.from({ length: 12 }, (_, i) => ({ hour: 12 + i, rainPercent: [14, 15, 16].includes(12 + i) ? 80 : 10 }));
  const open = (trip, weather) => page.evaluate(async ([trip, weather]) => {
    window.__weatherFixture = weather;
    window.__placesFixtures = [];
    window.__smoke.weatherRequests = [];
    await window.__smoke.openPlan(trip);
  }, [trip, weather]);
  const banner = page.locator('itinerary-view #rain-banner');
  const requests = () => page.evaluate(() => window.__smoke.weatherRequests);
  const settle = () => page.waitForTimeout(400);

  await open(plan('2026-09-13'), { status: 'forecast', date: '2026-09-13', hours: rain });
  await banner.waitFor();
  if ((await banner.innerText()).replace(/\s+/g, ' ').trim() !== '오후 2시 ~ 5시 비 예보 실내 대안 보기') throw Error(`Unexpected banner: ${await banner.innerText()}`);
  const [request] = await requests();
  if (request.cityId !== 'seoul' || request.country !== 'KOR' || request.date !== '2026-09-13' || request.lng !== 127.003) throw Error('Weather asked for the wrong day or place');
  await banner.getByRole('button', { name: '실내 대안 보기' }).click();
  const park = page.locator('itinerary-view .schedule-card').filter({ hasText: '한강 공원' });
  await park.locator('.indoor-alternatives').waitFor();
  if (await page.locator('itinerary-view .indoor-alternatives').count() !== 1) throw Error('Indoor alternatives opened on the wrong stop');

  for (const [label, trip, weather] of [
    ['missing forecast', plan('2026-09-13'), { status: 'unavailable' }],
    ['dry forecast', plan('2026-09-13'), { status: 'forecast', date: '2026-09-13', hours: rain.map(hour => ({ ...hour, rainPercent: 10 })) }],
    ['unknown percent', plan('2026-09-13'), { status: 'forecast', date: '2026-09-13', hours: rain.map(hour => ({ ...hour, rainPercent: null })) }],
  ]) {
    await open(trip, weather);
    await settle();
    if (await banner.count()) throw Error(`Banner shown for ${label}`);
  }
  await open(plan('2026-09-16'), { status: 'forecast', date: '2026-09-16', hours: rain });
  await settle();
  if (await banner.count() || (await requests()).length) throw Error('A day beyond tomorrow asked for weather');

  // Going offline swaps the screen for the offline reader; nothing there may ask for weather.
  await open(plan('2026-09-14'), { status: 'unavailable' });
  await page.evaluate(([hours]) => {
    window.__weatherFixture = { status: 'forecast', date: '2026-09-14', hours };
    window.__smoke.weatherRequests = [];
  }, [rain]);
  await page.context().setOffline(true);
  await settle();
  if (await banner.count() || (await requests()).length) throw Error('Offline view asked for weather');
  await page.context().setOffline(false);
  await open(plan('2026-09-14'), { status: 'forecast', date: '2026-09-14', hours: rain });
  await banner.waitFor();

  // A shared read-only copy never shows the banner.
  await page.locator('itinerary-view #share-itinerary-btn').click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.getElementById('share-itinerary-btn').disabled);
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(shared);
  await page.locator('itinerary-view .schedule-title').filter({ hasText: '한강 공원' }).waitFor();
  await page.evaluate(() => { window.__weatherFixture = { status: 'forecast', date: '2026-09-14', hours: [{ hour: 14, rainPercent: 90 }] }; });
  await page.evaluate(() => document.querySelector('itinerary-view').renderCurrentState());
  await settle();
  if (await banner.count()) throw Error('Shared copy shows the rain banner');
  return { errors: page.smokeErrors, findings: [] };
}
