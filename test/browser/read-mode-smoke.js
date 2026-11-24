async page => {
  // The harness clock is 2026-09-13 12:00 in Seoul.
  const place = (id, name, lng) => ({ placeId: id, displayName: name, formattedAddress: '서울', lat: 37.5, lng });
  const day = (n, date, title) => ({ day: n, date, scheduleItems: [
    { type: 'departure', title: '출발', time: '09:00', selectedPlace: place('start', '출발', 127.001) },
    { type: 'attraction', title, location: '서울 성동구 뚝섬로 273', time: '14:30', endTime: '15:30', selectedPlace: place('park' + n, title, 127.003),
      practicalInfo: { estimatedCost: '입장료 3,000원', operatingHours: '09:00-18:00', localTip: '정문 매표소가 한산해요' } },
    { type: 'arrival', title: '도착', time: '18:00', selectedPlace: place('end', '도착', 127.004) },
  ] });
  const open = (plan, weather) => page.evaluate(async ([plan, weather]) => {
    window.__weatherFixture = weather;
    window.__placesFixtures = [];
    await window.__smoke.openPlan(plan);
  }, [plan, weather]);
  const shown = selector => page.locator('itinerary-view ' + selector).filter({ visible: true });
  const title = text => page.locator('itinerary-view .schedule-title').filter({ hasText: text });
  const toggle = page.locator('itinerary-view #edit-mode-btn');
  const SIX = { '.item-edit-btn': 3, '.visit-time-btn': 1, '.replace-place-btn': 1, '.indoor-alternatives-btn': 1 };
  const expectEdit = async (on, when) => {
    if (await toggle.getAttribute('aria-pressed') !== String(on)) throw Error(`Toggle state wrong ${when}`);
    for (const [selector, count] of Object.entries(SIX)) {
      // Read mode only hides: the buttons stay in the DOM with their handlers.
      if (await page.locator('itinerary-view ' + selector).count() !== count) throw Error(`${selector} was removed ${when}`);
      if (await shown(selector).count() !== (on ? count : 0)) throw Error(`${selector} visibility wrong ${when}`);
    }
    if (!await page.locator('itinerary-view .insert-slot-btn').count()) throw Error(`Insert slots were removed ${when}`);
    if (Boolean(await shown('.insert-slot-btn').count()) !== on) throw Error(`Insert slot visibility wrong ${when}`);
  };

  await open({ days: [day(1, '2026-10-20', '한강 공원'), day(2, '2026-10-21', '서울숲')] }, undefined);
  await title('한강 공원').waitFor();
  await toggle.waitFor();
  await expectEdit(false, 'on open');
  // Read mode keeps the title, address, stay and directions.
  const meta = await shown('.schedule-meta').nth(1).innerText();
  if (await shown('.nav-btn').count() !== 3 || !meta.includes('서울 성동구 뚝섬로 273') || !meta.includes('1시간')) throw Error('Read mode lost directions, the address or the stay');

  // Details are folded and open from the keyboard with the same content as before.
  const details = page.locator('itinerary-view .schedule-details');
  if (await details.count() !== 1 || await details.evaluate(el => el.open)) throw Error('Details must start folded');
  if (await shown('.quick-info-box').count()) throw Error('Folded details are visible');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  const info = await shown('.quick-info-box').innerText();
  for (const text of ['입장료 3,000원', '09:00-18:00', '정문 매표소가 한산해요']) if (!info.includes(text)) throw Error(`Opened details miss ${text}`);

  // One keyboard-operable toggle reveals all six, and it survives a day switch and a re-render.
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expectEdit(true, 'after the toggle');
  await page.locator('itinerary-view .day-tab-btn').nth(1).click();
  await title('서울숲').waitFor();
  await expectEdit(true, 'after a day switch');
  await page.evaluate(() => document.querySelector('itinerary-view').renderCurrentState());
  await title('서울숲').waitFor();
  await expectEdit(true, 'after a re-render');
  // Editing still works from the revealed buttons.
  await shown('.item-edit-btn[data-edit="remove"]').click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await title('서울숲').waitFor({ state: 'detached' });
  await toggle.focus();
  await page.keyboard.press('Space');
  if (await toggle.getAttribute('aria-pressed') !== 'false' || await shown('.insert-slot-btn').count()) throw Error('Toggle did not return to read mode');

  // Edit mode belongs to the trip it was switched on for: another trip opens in read mode.
  await toggle.click();
  if (await toggle.getAttribute('aria-pressed') !== 'true') throw Error('Toggle did not switch on again');

  // Rain: the banner's feature stays reachable in read mode, the other five stay hidden.
  const rain = Array.from({ length: 12 }, (_, i) => ({ hour: 12 + i, rainPercent: [14, 15, 16].includes(12 + i) ? 80 : 10 }));
  await open({ request: { startTime: '09:00', endTime: '18:00', destination: { id: 'seoul', country: 'KOR', name: '서울' } },
    days: [day(1, '2026-09-13', '한강 공원')] }, { status: 'forecast', date: '2026-09-13', hours: rain });
  await shown('#rain-banner').waitFor();
  await title('한강 공원').waitFor();
  if (await toggle.getAttribute('aria-pressed') !== 'false') throw Error('Another trip opened in edit mode');
  if (await shown('.indoor-alternatives-btn').count() !== 1) throw Error('Indoor alternatives hidden in read mode while it rains');
  if (await shown('.item-edit-btn').count() || await shown('.visit-time-btn').count() || await shown('.replace-place-btn').count()) throw Error('Rain revealed other edit buttons');

  // A shared copy cannot be edited, so it gets no toggle.
  // Saving keeps the same trip, so edit mode follows it to /view/:id.
  await toggle.click();
  await page.locator('itinerary-view #save-itinerary-btn').click();
  await page.waitForURL('**/view/smoke1');
  await page.waitForFunction(() => [...document.querySelectorAll('itinerary-view')].some(view => view.state.current?.source.id === 'smoke1'
    && view.shadowRoot.querySelector('.schedule-title')));
  if (await shown('#edit-mode-btn').getAttribute('aria-pressed') !== 'true') throw Error('Saving switched edit mode off');
  await shown('.item-edit-btn').first().waitFor();
  await shown('#share-itinerary-btn').click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(() => [...document.querySelectorAll('itinerary-view')].some(view => view.sharedId === null
    && view.currentItinerary && !view.shadowRoot.getElementById('share-itinerary-btn').disabled));
  await page.goto(await page.evaluate(() => navigator.clipboard.readText()));
  await title('한강 공원').waitFor();
  if (await shown('#edit-mode-btn').count() || await page.locator('itinerary-view .item-edit-btn').count()) throw Error('Shared view shows the edit toggle');
  return { errors: page.smokeErrors, findings: [] };
}
