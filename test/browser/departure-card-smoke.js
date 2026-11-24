async page => {
  // The harness clock is 2026-09-13 12:00 in Seoul.
  await page.evaluate(() => {
    const trip = JSON.parse(sessionStorage.getItem('__smoke_db'));
    const stop = (type, title, time, endTime, index) => ({
      type, title, time, endTime, location: title,
      selectedPlace: { placeId: 'depart-' + index, displayName: title,
        formattedAddress: title + ' 주소', lat: 37 + index * 0.02, lng: 127 },
    });
    const days = date => [{ day: 1, date, scheduleItems: [
      stop('departure', '호텔', '09:00', '', 0),
      stop('attraction', '<b>해변</b>', '10:00', '11:00', 1),
      stop('AnchorSchedule', '해변열차 탑승', '14:00', '14:40', 2),
      stop('cafe', '카페', '15:30', '16:30', 3),
      stop('arrival', '역', '18:00', '', 4),
    ] }];
    trip.itineraries = {
      depart: { userId: 'smokeOwner', itineraryPlan: { days: days('2026-09-13') } },
      later: { userId: 'smokeOwner', itineraryPlan: { days: days('2026-09-14') } },
    };
    sessionStorage.setItem('__smoke_db', JSON.stringify(trip));
  });
  const card = page.locator('itinerary-view #departure-card').filter({ visible: true });
  const text = async () => (await card.innerText()).replace(/\s+/g, ' ').trim();
  const expectCard = async expected => card.filter({ hasText: expected }).waitFor({ timeout: 5000 })
    .catch(async () => { throw Error(`Expected "${expected}", got: ${await text().catch(() => 'no card')}`); });
  const legs = minutes => page.evaluate(minutes => {
    const view = document.querySelector('itinerary-view');
    window.dispatchEvent(new CustomEvent('transit-info-ready', { detail: { context: view._mapRequest,
      routes: minutes === null ? [] : [10, minutes, 10, 10].map((durationMinutes, fromIndex) =>
        ({ fromIndex, toIndex: fromIndex + 1, durationMinutes, displayMinutes: durationMinutes, mode: 'WALKING' })) } }));
  }, minutes);
  const stops = page.locator('itinerary-view .schedule-card');

  await page.goto(page.smokeOrigin + '/view/depart');
  await stops.filter({ hasText: '카페' }).waitFor();
  await page.evaluate(() => { window.__events = []; window.gtag = (...args) => { window.__events.push(args); }; });
  await legs(18);
  await expectCard('13:32 출발');
  const ok = await text();
  if (ok !== '14:00 해변열차 탑승 13:32 출발 <b>해변</b>에서 도보 18분 · 10분 전 도착') throw Error(`Unexpected card: ${ok}`);
  if (await page.locator('itinerary-view #departure-card b').count()) throw Error('Stop title became markup');
  if (await card.getAttribute('aria-label') !== '출발 안내') throw Error('The card has no accessible name');

  // The text names the mode the map measured, as the transit rows word it; an unknown mode keeps "이동".
  const leg = route => page.evaluate(route => {
    const view = document.querySelector('itinerary-view');
    window.dispatchEvent(new CustomEvent('transit-info-ready', { detail: { context: view._mapRequest,
      routes: [{ fromIndex: 1, toIndex: 2, durationMinutes: 18, displayMinutes: 18, ...route }] } }));
  }, route);
  for (const [route, wording] of [
    [{ mode: 'TRANSIT', vehicleType: 'BUS', lineName: '142' }, '<b>해변</b>에서 142번 버스 18분 · 10분 전 도착'],
    [{ mode: 'TRANSIT', vehicleType: 'SUBWAY', lineName: '2호선' }, '<b>해변</b>에서 2호선 18분 · 10분 전 도착'],
    [{ mode: 'TRANSIT', vehicleType: 'BUS' }, '<b>해변</b>에서 버스 18분 · 10분 전 도착'],
    [{ mode: 'TRANSIT' }, '<b>해변</b>에서 대중교통 18분 · 10분 전 도착'],
    [{ mode: 'WALKING', estimated: true }, '<b>해변</b>에서 도보 약 18분 (직선거리 추정) · 10분 전 도착'],
    [{}, '<b>해변</b>에서 이동 18분 · 10분 전 도착'],
  ]) {
    await leg(route);
    await expectCard(wording);
  }
  await legs(18);
  await expectCard('도보 18분');

  // Nothing is tapped: coming back to the screen at 13:40 is enough to change the advice.
  await page.clock.setFixedTime(new Date('2026-09-13T04:40:00.000Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expectCard('지금 출발하세요');
  await expectCard('여유 2분');
  await page.clock.setFixedTime(new Date('2026-09-13T03:00:00.000Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expectCard('13:32 출발');

  // 12:00 + 115 min is past the 13:50 leave time but still reaches the 14:00 reservation.
  await legs(115);
  await expectCard('지금 출발하세요');
  await expectCard('여유 5분');
  await legs(130);
  await expectCard('지금 출발해도 14:00에 늦어요');
  await expectCard('남은 일정 맞추기');
  if (!await page.locator('itinerary-view #replan-trip-btn').isVisible()) throw Error('The late card points at a hidden button');

  await legs(null);
  await expectCard('이동시간 확인 필요');
  if (/\d{2}:\d{2} 출발/.test(await text())) throw Error('Leave time shown without a measured leg');

  // A visited reservation leaves no booking: the card names the next visit, once.
  await stops.filter({ hasText: '해변열차 탑승' }).locator('.visited-btn').click();
  await expectCard('다음 방문');
  await expectCard('15:30 카페');
  // 스펙 9: one event per state change with the state only, however often the card was refreshed in between.
  const states = await page.evaluate(() => JSON.stringify(window.__events.filter(args => args[1] === 'departure_card_shown').map(args => args[2])));
  if (states !== JSON.stringify(['ok', 'go', 'ok', 'go', 'late', 'unknown', 'next'].map(state => ({ state })))) throw Error('departure_card_shown tracking wrong: ' + states);
  const shown = () => page.evaluate(() => {
    const root = document.querySelector('itinerary-view').shadowRoot;
    return ['departure-card', 'next-stop'].map(id => getComputedStyle(root.getElementById(id)).display !== 'none');
  });
  await page.setViewportSize({ width: 390, height: 800 });
  // The phone layout mounts the view again; reload so the attribute lands on the view that stays.
  await page.reload();
  await stops.filter({ hasText: '카페' }).waitFor();
  await page.evaluate(() => document.querySelector('itinerary-view').setAttribute('mobile-summary', ''));
  await stops.filter({ hasText: '해변열차 탑승' }).locator('.visited-btn').click();
  await stops.filter({ hasText: '해변열차 탑승' }).locator('.visited-btn').click();
  if ((await shown()).join() !== 'false,true') throw Error(`Next visit shown twice or not at all: ${await shown()}`);
  // The phone's next-stop panel already names the reservation, so the advice moves into it: one box, not two.
  await stops.filter({ hasText: '해변열차 탑승' }).locator('.visited-btn').click();
  await legs(18);
  const nextStop = page.locator('itinerary-view #next-stop');
  await nextStop.filter({ hasText: '13:32 출발' }).waitFor({ timeout: 5000 });
  const merged = (await nextStop.innerText()).replace(/\s+/g, ' ');
  for (const part of ['해변열차 탑승', '14:00', '<b>해변</b>에서 도보 18분', '10분 전 도착']) if (!merged.includes(part)) throw Error(`Merged panel misses ${part}: ${merged}`);
  // The leave time is the panel's headline (the title's size and weight); the detail is the small line under it.
  const lines = await nextStop.evaluate(panel => ['next-stop-title', 'next-stop-departure', 'next-stop-departure-detail', 'next-stop-time'].map(id => {
    const line = panel.querySelector('#' + id), style = getComputedStyle(line);
    return { text: line.textContent, size: parseFloat(style.fontSize), weight: style.fontWeight, top: line.getBoundingClientRect().top };
  }));
  const [title, leave, detail, time] = lines;
  if (leave.text !== '13:32 출발' || detail.text !== '<b>해변</b>에서 도보 18분 · 10분 전 도착') throw Error('Merged lines wrong: ' + JSON.stringify(lines));
  if (leave.size !== title.size || leave.weight !== title.weight || !(detail.size < leave.size) || detail.size !== time.size || !(detail.top > leave.top)) throw Error('Leave time is not the headline: ' + JSON.stringify(lines));
  if ((await shown()).join() !== 'false,true') throw Error(`Reservation shown twice on the phone layout: ${await shown()}`);
  // A different next stop keeps the two apart: the panel names the visit, the card the reservation.
  await page.clock.setFixedTime(new Date('2026-09-13T00:30:00.000Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.evaluate(() => { const view = document.querySelector('itinerary-view'); view.renderCurrentState(); });
  await stops.filter({ hasText: '카페' }).waitFor();
  await legs(18);
  await card.filter({ hasText: '13:32 출발' }).waitFor({ timeout: 5000 });
  if ((await shown()).join() !== 'true,true' || (await nextStop.innerText()).includes('13:32')) throw Error('The card must stay when the next stop is not the reservation');
  await page.clock.setFixedTime(new Date('2026-09-13T03:00:00.000Z'));
  await page.setViewportSize({ width: 1280, height: 720 });

  // Another day's trip shows no card.
  await page.goto(page.smokeOrigin + '/view/later');
  await stops.filter({ hasText: '카페' }).waitFor();
  await legs(18);
  await page.waitForTimeout(400);
  if (await card.count()) throw Error('Card shown on a day that is not today');
  return { errors: page.smokeErrors, findings: [] };
}
