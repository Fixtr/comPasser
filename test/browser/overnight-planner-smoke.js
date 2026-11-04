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
  // Leaving /plan with inputs asks first; opening the saved trip means moving on.
  await page.locator('[role="alertdialog"] .confirm-ok').click();
  await page.waitForURL('**/view/legacyStay');
  // <itinerary-view> mounts only once /view/:id loads its screen.
  await page.waitForFunction(() => document.querySelector('itinerary-view')?.currentItinerary?.request?.dailyData?.length === 4);
  await page.locator('.ionic-result-edit:visible').click();
  await page.locator('travel-form #trip-stays').waitFor({ state: 'visible' });
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
    // The Ionic planner lays out dates, then the two shared times, then the toggle on its own row (travel-form-style handoff-flow).
    check(positions.dateBottom <= positions.timesTop && positions.timesTop < positions.toggle.top && positions.toggle.bottom <= positions.locationTop,
      'Time toggle must sit below the shared times, separate from locations: ' + JSON.stringify(positions));
    check(Math.abs(positions.timesTop - positions.endTop) < 1 && Math.abs(positions.startWidth - positions.endWidth) < 1,
      'Shared times must be two equal columns below the date');
    check(positions.toggle.left >= 0 && positions.toggle.right <= width, 'Time toggle must fit the viewport');
    await page.screenshot({ path: page.smokeOutputDir + `/time-toggle-${width}.png`, fullPage: true });
    await timeToggle.press('Space');
    await page.waitForFunction(() => document.querySelector('travel-form').shadowRoot.querySelector('.time-settings').getAnimations({ subtree: true }).length === 0);
    const enabled = await page.locator('travel-form').evaluate(form => {
      const root = form.shadowRoot;
      const toggle = root.querySelector('.toggle-container').getBoundingClientRect();
      const rows = root.querySelector('#daily-times-accordion').getBoundingClientRect();
      return { left: toggle.left, right: toggle.right, bottom: toggle.bottom, rowsTop: rows.top };
    });
    check(enabled.left >= 0 && enabled.right <= width, 'Enabled toggle must fit the viewport');
    check(enabled.bottom <= enabled.rowsTop, 'Enabled toggle must stay above the per-day rows');
    await page.screenshot({ path: page.smokeOutputDir + `/time-toggle-enabled-${width}.png`, fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await timeToggle.press('Space');
    check(await timeToggle.evaluate(input => input.closest('.time-settings').getAnimations({ subtree: true }).filter(animation => animation.effect instanceof KeyframeEffect && animation.effect.getTiming().duration === 240).length === 0),
      'Reduced-motion preference must skip the movement animation');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

  }
  results.push('PASS time toggle placement at mobile/desktop widths and keyboard operation');
  // The Ionic planner (handoff-flow) books lodging as optional dated stays, not one required input per night.
  check(await page.locator('travel-form .trip-stay').count() === 0, 'Do not infer stays from legacy airport endpoints');
  check((await page.locator('travel-form #trip-stay-status').innerText()).includes('숙소 미정'), 'Say that lodging is still unset');
  results.push('PASS legacy edit preserves endpoints and leaves lodging unset');

  const pick = (locator, place) => locator.evaluate((element, place) => {
    element.dispatchEvent(Object.assign(new Event('gmp-select'), { placePrediction: { toPlace: () => ({
      ...place, fetchFields: async () => {},
    }) } }));
  }, place);
  const placeAt = (placeId, displayName, lng) => ({ placeId, displayName, formattedAddress: '서울', lat: 37.55, lng });
  // Generation needs searched places, so the legacy text endpoints are picked again under the same names.
  await pick(page.locator('travel-form #start-location'), placeAt('station-a', '서울역', 126.97));
  await pick(page.locator('travel-form #end-location'), placeAt('airport-t2', '인천공항 T2', 126.45));
  const hotel = { placeId: 'hotel-a', displayName: '연박 호텔', formattedAddress: '서울 중구', lat: 37.55, lng: 126.98 };
  await page.locator('travel-form #add-trip-stay').click();
  check(await page.locator('travel-form .trip-stay').count() === 1, 'One stay covers consecutive nights');
  check(await page.locator('travel-form .stay-checkin').inputValue() === dates[0] && await page.locator('travel-form .stay-checkout').inputValue() === dates[3],
    'The first stay spans the whole trip');
  await pick(page.locator('travel-form .stay-location'), hotel);
  await page.waitForFunction(() => document.querySelector('travel-form').getFormData().overnightLocations.every(place => place.placeId === 'hotel-a'));
  // Reloading a signed-in /plan discards its inputs on the Ionic shell (plan-exit-guard pagehide), so re-render from the stored draft.
  const restore = () => page.locator('travel-form').evaluate(form => form.refreshFromStorage());
  await restore();
  await page.locator('travel-form .stay-location').waitFor();
  check(await page.locator('travel-form .trip-stay').count() === 1, 'Restore the consecutive-night stay from the saved draft');
  check((await read()).overnightLocations.every(place => place.placeId === hotel.placeId), 'Restore all lodging identities');
  await page.screenshot({ path: page.smokeOutputDir + '/consecutive-nights.png', fullPage: true });
  results.push('PASS one selected hotel covers all nights and is restored from the saved draft');

  // Adding a stay splits the last night off the longest one, keeping the hotel already chosen.
  await page.locator('travel-form #add-trip-stay').click();
  await page.locator('travel-form .trip-stay').nth(1).waitFor();
  request = await read();
  check(request.overnightLocations[0].placeId === hotel.placeId && request.overnightLocations[1].placeId === hotel.placeId
    && request.overnightLocations[2] === '', 'Splitting a stay keeps the selected hotel on its remaining nights');
  await pick(page.locator('travel-form .stay-location').nth(1), placeAt('hotel-c', '셋째 숙소', 126.99));
  await page.locator('travel-form #add-trip-stay').click();
  await page.locator('travel-form .trip-stay').nth(2).waitFor();
  await pick(page.locator('travel-form .stay-location').nth(2), placeAt('hotel-b', '둘째 숙소', 126.988));
  await page.waitForFunction(() => document.querySelector('travel-form').getFormData().overnightLocations.map(place => place.placeId).join() === 'hotel-a,hotel-b,hotel-c');
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
  await pick(page.locator('travel-form #daily-start-location-2'), departure);
  await page.waitForFunction(() => document.querySelector('travel-form').draft.dailyLocations?.[1].startLocation?.placeId === 'station-b');
  await restore();
  await page.locator('travel-form #daily-locations-panel').waitFor({state:'visible'});
  check((await read()).dailyLocations[1].startLocation.placeId === 'station-b', 'Restore selected override identity from the saved draft');
  for (const width of [390,1280]) {
    await page.setViewportSize({width,height:900});
    const bounds = await page.locator('travel-form #daily-start-location-2').boundingBox();
    check(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Daily override inputs fit mobile and desktop');
    await page.locator('travel-form #daily-start-location-2').scrollIntoViewIfNeeded();
    await page.screenshot({path:page.smokeOutputDir + `/daily-locations-${width}.png`,fullPage:true});
  }
  results.push('PASS daily location overrides, defaults, keyboard, transfer warning, draft restore and responsive layout');
  request = await read();
  check(request.overnightLocations.map(place => place.displayName).join() === '연박 호텔,둘째 숙소,셋째 숙소', 'Different lodging each night');
  // The Ionic planner reviews the inputs before it generates.
  await page.locator('travel-form .primary-btn').click();
  await page.locator('travel-form #final-generate').click();
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
  ]), 'Generated day boundaries connect each selected night: ' + JSON.stringify(boundaries));
  // The Ionic shell opens /view by itself once generation succeeds.
  // Ionic keeps the earlier /view/legacyStay page (and its itinerary-view) hidden in the DOM.
  await page.locator('itinerary-view:visible #save-itinerary-btn').click();
  await page.waitForFunction(() => [...document.querySelectorAll('itinerary-view')].find(view => view.checkVisibility())?.state.snapshot()?.source.kind === 'private'
    && window.location.pathname !== '/view/legacyStay' && window.location.pathname !== '/view');
  await page.locator('.ionic-result-edit:visible').click();
  // Editing reopens the last review, so the form rows are present but behind the review panel.
  await page.locator('travel-form .trip-stay').nth(2).waitFor({ state: 'attached' });
  request = await read();
  check(request.dailyLocations[1].startLocation.placeId === 'station-b', 'Save/edit preserves explicit daily overrides');
  check(request.overnightLocations.map(place => place.placeId).join() === 'hotel-a,hotel-b,hotel-c', 'Save/edit restores different hotels');
  check(await page.evaluate(legacy => JSON.stringify(JSON.parse(sessionStorage.getItem('__smoke_db')).itineraries.legacyStay.itineraryPlan.request)
    === JSON.stringify(legacy), legacy), 'Editing/regeneration must not rewrite the legacy snapshot');
  results.push('PASS different hotels connect through submit, regeneration, save and edit; legacy snapshot unchanged');

  // Reuse preference navigation to exercise duration changes, not a direct draft mutation.
  const duration = async count => {
    await page.locator('travel-form #reselect-preference-btn').click();
    // Each preference step is its own Ionic page, so only the shown one counts.
    await page.locator('preference-view #prev-step-btn:visible').click();
    await page.locator(`preference-view [data-duration="${count}"]:visible`).click();
    await page.locator('preference-view #next-step-btn:visible').click();
    await page.locator('preference-view #skip-btn:visible').click();
    await page.waitForFunction(count => document.querySelector('travel-form').draft.date.length === count, count);
  };
  await page.locator('travel-form #review-panel [data-review-edit="details"]').first().click();
  await duration(2);
  request = await read();
  check(request.overnightLocations.length === 1, 'Shrinking to two days keeps one night');
  // Stays are dated on the Ionic planner: ones that no longer fit are flagged, not silently applied or dropped.
  check(request.overnightLocations[0] === '', 'Stays that no longer fit must not be applied: ' + JSON.stringify(request.overnightLocations));
  await page.locator('travel-form .primary-btn').click();
  check((await page.locator('travel-form #review-issues').innerText()).includes('여행 기간 밖'), 'Review must flag stays outside the shortened trip');
  await page.locator('travel-form #review-panel [data-review-edit="details"]').first().click();
  await duration(4);
  request = await read();
  check(request.overnightLocations.map(place => place.placeId).join() === 'hotel-a,hotel-b,hotel-c',
    'Expanding back to the stays\' dates applies them again: ' + JSON.stringify(request.overnightLocations));
  await duration(1);
  await page.locator('travel-form #overnight-wrapper').waitFor({ state: 'hidden' });
  request = await read();
  check(request.dailyLocations === null, 'Day trip clears daily location overrides');
  check(request.overnightLocations.length === 0 && !request.sameOvernightLocation, 'Day trip has no nights');
  results.push('PASS duration changes resize lodging and restore the day-trip form');
  check(page.smokeErrors.length === 0, 'No page errors: ' + page.smokeErrors.join(', '));
  return { results, errors: page.smokeErrors };
}
