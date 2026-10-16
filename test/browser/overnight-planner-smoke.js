// Isolated auth/AI/DB/Maps boundaries; real form, draft and constraint services.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  const dates = ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
  const legacy = { dailyData: dates.map((date, index) => ({
    day: index + 1, date, startTime: '09:00', endTime: '18:00',
    startLocation: '서울역', endLocation: index === 3 ? '인천공항 T2' : '인천공항 T1', anchors: [],
  })) };
  await page.evaluate(legacy => {
    const db = JSON.parse(sessionStorage.getItem('__smoke_db'));
    db.itineraries ||= {};
    db.itineraries.legacyStay = { userId: 'smokeOwner', itineraryPlan: { request: legacy,
      days: legacy.dailyData.map(day => ({ day: day.day, date: day.date, scheduleItems: [
        { type: 'departure', title: day.startLocation, location: day.startLocation, time: day.startTime },
        { type: 'arrival', title: day.endLocation, location: day.endLocation, time: day.endTime },
      ] })) } };
    sessionStorage.setItem('__smoke_db', JSON.stringify(db));
    window.navigate('/view/legacyStay');
  }, legacy);
  await page.waitForFunction(() => document.querySelector('itinerary-view').currentItinerary?.request?.dailyData?.length === 4);
  await page.locator('#edit-itinerary-btn').click();
  await page.locator('travel-form #overnight-notice').waitFor({ state: 'visible' });
  const read = () => page.evaluate(() => {
    const view = document.querySelector('travel-form');
    return view.getFormData();
  });
  let request = await read();
  check(request.startLocation === '서울역' && request.endLocation === '인천공항 T2', 'Preserve first departure and final destination');
  check(request.overnightLocations.join('|') === '||', 'Do not infer hotels from legacy airport endpoints');
  check((await page.locator('travel-form label[for="start-location"]').innerText()) === '여행 첫날 출발지', 'Explain first-day departure');
  check((await page.locator('travel-form label[for="end-location"]').innerText()) === '여행 마지막 날 도착지', 'Explain final-day destination');
  const timeToggle = page.locator('travel-form #daily-times-toggle');
  await timeToggle.focus();
  if (await timeToggle.isChecked()) await timeToggle.press('Space');
  await timeToggle.press('Space');
  check(await timeToggle.isChecked(), 'Daily time toggle must work with the keyboard');
  check(await page.locator('travel-form .daily-time-row').count() === 4, 'Show one time row per day');
  check(await page.locator('travel-form #start-time').isHidden(), 'Hide shared times in daily mode');
  await timeToggle.press('Space');
  check(await page.locator('travel-form #start-time').isVisible(), 'Restore shared times when daily mode is off');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(() => document.querySelector('travel-form').shadowRoot.querySelector('.time-settings').getAnimations({ subtree: true }).length === 0);
    const positions = await page.locator('travel-form').evaluate(form => {
      const root = form.shadowRoot;
      const toggle = root.querySelector('.toggle-container').getBoundingClientRect();
      const times = root.querySelector('#start-time').getBoundingClientRect();
      const end = root.querySelector('#end-time').getBoundingClientRect();
      const date = root.querySelector('#schedule-date').getBoundingClientRect();
      const location = root.querySelector('#start-location').getBoundingClientRect();
      return { toggle: { top: toggle.top, bottom: toggle.bottom, left: toggle.left, right: toggle.right },
        timesTop: times.top, locationTop: location.top, startWidth: times.width, endWidth: end.width,
        endTop: end.top, endLeft: end.left, dateRight: date.right, dateTop: date.top, dateBottom: date.bottom };
    });
    check(positions.toggle.bottom <= positions.timesTop && positions.timesTop < positions.locationTop,
      'Time toggle must sit above time inputs, separate from locations');
    if (width === 1280) {
      check(positions.toggle.left >= positions.dateRight && positions.toggle.top < positions.dateBottom
        && positions.toggle.bottom > positions.dateTop, 'Disabled toggle must stay beside the date');
      check(Math.abs(positions.timesTop - positions.endTop) < 1 && positions.startWidth > 250
        && Math.abs(positions.startWidth - positions.endWidth) < 1, 'Shared times must be two equal wide columns below the date');
    }
    check(positions.toggle.left >= 0 && positions.toggle.right <= width, 'Time toggle must fit the viewport');
    await page.screenshot({ path: page.smokeOutputDir + `/time-toggle-${width}.png`, fullPage: true });
    await timeToggle.press('Space');
    await page.waitForFunction(() => document.querySelector('travel-form').shadowRoot.querySelector('.time-settings').getAnimations({ subtree: true }).length === 0);
    const enabled = await page.locator('travel-form').evaluate(form => {
      const root = form.shadowRoot;
      const toggle = root.querySelector('.toggle-container').getBoundingClientRect();
      const date = root.querySelector('#schedule-date').getBoundingClientRect();
      return { left: toggle.left, right: toggle.right, top: toggle.top, bottom: toggle.bottom,
        dateRight: date.right, dateTop: date.top, dateBottom: date.bottom };
    });
    check(enabled.left >= 0 && enabled.right <= width, 'Enabled toggle must fit the viewport');
    if (width === 1280) check(enabled.left >= enabled.dateRight && enabled.top < enabled.dateBottom
      && enabled.bottom > enabled.dateTop, 'Enabled toggle must move beside the date');
    await page.screenshot({ path: page.smokeOutputDir + `/time-toggle-enabled-${width}.png`, fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await timeToggle.press('Space');
    check(await timeToggle.evaluate(input => input.closest('.time-settings').getAnimations({ subtree: true }).filter(animation => animation.effect instanceof KeyframeEffect && animation.effect.getTiming().duration === 240).length === 0),
      'Reduced-motion preference must skip the movement animation');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

  }
  results.push('PASS time toggle placement at mobile/desktop widths and keyboard operation');
  await page.locator('travel-form .primary-btn').click();
  await page.locator('travel-form #overnight-location-1[aria-invalid="true"]').waitFor();
  check(await page.evaluate(() => window.__smoke.requests.length === 0), 'Missing lodging must block generation');
  results.push('PASS legacy edit preserves endpoints, requires lodging and blocks incomplete generation');

  const hotel = { placeId: 'hotel-a', displayName: '연박 호텔', formattedAddress: '서울 중구', lat: 37.55, lng: 126.98 };
  await page.locator('travel-form #same-overnight-toggle').check();
  check(await page.locator('travel-form #overnight-location-2').isHidden(), 'Only one lodging input for consecutive nights');
  await page.locator('travel-form #overnight-location-1').evaluate((element, hotel) => {
    element.dispatchEvent(Object.assign(new Event('gmp-select'), { placePrediction: { toPlace: () => ({
      ...hotel, fetchFields: async () => {},
    }) } }));
  }, hotel);
  await page.waitForFunction(() => document.querySelector('travel-form').draft.overnightLocations.every(place => place.placeId === 'hotel-a'));
  await page.locator('travel-form #overnight-notice').waitFor({ state: 'hidden' });
  request = await read();
  check(request.sameOvernightLocation && request.overnightLocations.every(place => place.placeId === hotel.placeId), 'Repeat selected identity, not just text');
  await page.reload();
  await page.locator('travel-form #overnight-location-1').waitFor();
  check(await page.locator('travel-form #same-overnight-toggle').isChecked(), 'Restore consecutive-night mode after reload');
  check((await read()).overnightLocations.every(place => place.placeId === hotel.placeId), 'Restore all lodging identities');
  await page.screenshot({ path: page.smokeOutputDir + '/consecutive-nights.png', fullPage: true });
  results.push('PASS one selected hotel covers all nights and survives reload');

  await page.locator('travel-form #same-overnight-toggle').uncheck();
  await page.locator('travel-form #overnight-location-3').waitFor();
  check((await read()).overnightLocations.every(place => place.placeId === hotel.placeId), 'Turning off consecutive nights keeps selected hotels');
  await page.locator('travel-form #overnight-location-2 input').fill('둘째 숙소');
  await page.locator('travel-form #overnight-location-3 input').fill('셋째 숙소');
  const locationToggle = page.locator('travel-form #daily-locations-toggle');
  await locationToggle.focus();
  await locationToggle.press('Space');
  await page.locator('travel-form #daily-locations-panel').waitFor({state:'visible'});
  check(await page.locator('travel-form .daily-location-row').count() === 4, 'One location override row per day');
  await page.locator('travel-form #daily-start-location-2 input').fill('부산역');
  await page.locator('travel-form #daily-locations-notice').waitFor({state:'visible'});
  check((await page.locator('travel-form #daily-locations-notice').innerText()).includes('부산역'), 'Explain the transfer between different day boundaries');
  await locationToggle.uncheck();
  check((await read()).dailyLocations === null, 'Turning off overrides restores lodging defaults');
  await locationToggle.check();
  check((await read()).dailyLocations.every(day => !day.startLocation && !day.endLocation), 'Turning off clears hidden overrides');
  const departure = {...hotel, placeId:'station-b', displayName:'둘째 날 출발역'};
  await page.locator('travel-form #daily-start-location-2').evaluate((element, place) => {
    element.dispatchEvent(Object.assign(new Event('gmp-select'), {placePrediction:{toPlace:() => ({...place, fetchFields:async()=>{}})}}));
  }, departure);
  await page.waitForFunction(() => document.querySelector('travel-form').draft.dailyLocations?.[1].startLocation?.placeId === 'station-b');
  await page.reload();
  await page.locator('travel-form #daily-locations-panel').waitFor({state:'visible'});
  check((await read()).dailyLocations[1].startLocation.placeId === 'station-b', 'Restore selected override identity after reload');
  for (const width of [390,1280]) {
    await page.setViewportSize({width,height:900});
    const bounds = await page.locator('travel-form #daily-start-location-2').boundingBox();
    check(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Daily override inputs fit mobile and desktop');
    await page.locator('travel-form #daily-start-location-2').scrollIntoViewIfNeeded();
    await page.screenshot({path:page.smokeOutputDir + `/daily-locations-${width}.png`,fullPage:true});
  }
  results.push('PASS daily location overrides, defaults, keyboard, transfer warning, reload and responsive layout');
  request = await read();
  check(request.overnightLocations[0].placeId === hotel.placeId && request.overnightLocations[1] === '둘째 숙소'
    && request.overnightLocations[2] === '셋째 숙소', 'Different lodging each night');
  await page.locator('travel-form .primary-btn').click();
  await page.waitForFunction(() => window.__smoke.requests.length === 1);
  const boundaries = await page.evaluate(async () => {
    const { normalizePlannerRequest, enforcePlannerConstraints } = await import('/src/domains/planner/services/planner-constraints.mjs');
    const request = window.__smoke.requests[0];
    const generated = enforcePlannerConstraints(request.date.map((date, index) => ({ day: index + 1, date, scheduleItems: [] })), request);
    window.__smoke.pending[0].resolve({ request: normalizePlannerRequest(request), days: generated });
    return generated.map(day => [day.scheduleItems[0].location, day.scheduleItems.at(-1).location]);
  });
  check(JSON.stringify(boundaries) === JSON.stringify([
    ['서울역', '연박 호텔'], ['둘째 날 출발역', '둘째 숙소'], ['둘째 숙소', '셋째 숙소'], ['셋째 숙소', '인천공항 T2'],
  ]), 'Generated day boundaries connect each selected night');
  await page.locator('#show-results-btn').click();
  await page.locator('#save-itinerary-btn').waitFor();
  await page.locator('#save-itinerary-btn').click();
  await page.waitForFunction(() => document.querySelector('itinerary-view').state.snapshot()?.source.kind === 'private');
  await page.locator('#edit-itinerary-btn').click();
  await page.locator('travel-form #overnight-location-3').waitFor();
  request = await read();
  check(request.dailyLocations[1].startLocation.placeId === 'station-b', 'Save/edit preserves explicit daily overrides');
  check(request.overnightLocations[1] === '둘째 숙소' && request.overnightLocations[2] === '셋째 숙소', 'Save/edit restores different hotels');
  check(await page.evaluate(legacy => JSON.stringify(JSON.parse(sessionStorage.getItem('__smoke_db')).itineraries.legacyStay.itineraryPlan.request)
    === JSON.stringify(legacy), legacy), 'Editing/regeneration must not rewrite the legacy snapshot');
  results.push('PASS different hotels connect through submit, regeneration, save and edit; legacy snapshot unchanged');

  // Reuse preference navigation to exercise duration changes, not a direct draft mutation.
  const duration = async count => {
    await page.locator('travel-form #reselect-preference-btn').click();
    await page.locator('preference-view #prev-step-btn').click();
    await page.locator(`preference-view [data-duration="${count}"]`).click();
    await page.locator('preference-view #next-step-btn').click();
    await page.locator('preference-view #skip-btn').click();
    await page.waitForFunction(count => document.querySelector('travel-form').draft.date.length === count, count);
  };
  await duration(2);
  check((await read()).overnightLocations.length === 1, 'Shrinking to two days keeps one night');
  await duration(4);
  request = await read();
  check(request.overnightLocations[0].placeId === hotel.placeId && request.overnightLocations[1] === '' && request.overnightLocations[2] === '',
    'Expanding dates must not resurrect removed hotels');
  await page.locator('travel-form #same-overnight-toggle').check();
  await duration(2);
  await duration(4);
  check((await read()).overnightLocations.every(place => place.placeId === hotel.placeId), 'Consecutive-night mode follows duration expansion');
  await duration(1);
  await page.locator('travel-form #overnight-wrapper').waitFor({ state: 'hidden' });
  request = await read();
  check(request.dailyLocations === null, 'Day trip clears daily location overrides');
  check(request.overnightLocations.length === 0 && !request.sameOvernightLocation, 'Day trip has no nights');
  check((await page.locator('travel-form label[for="start-location"]').innerText()) === '시작 장소 (호텔, 공항 등)', 'Restore day-trip label');
  results.push('PASS duration changes resize lodging, preserve consecutive stays and restore day-trip form');
  check(page.smokeErrors.length === 0, 'No page errors: ' + page.smokeErrors.join(', '));
  return { results, errors: page.smokeErrors };
}
