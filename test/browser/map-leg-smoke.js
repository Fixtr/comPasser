// 스펙 7: the itinerary opens an already drawn leg on the map through one window event. The first half runs against the
// harness's placeholder map; the last part loads the real <map-view> over a fake Maps library (no Google request).
async page => {
  // The harness clock is 2026-09-13 12:00 in Seoul.
  await page.evaluate(() => {
    const trip = JSON.parse(sessionStorage.getItem('__smoke_db'));
    const stop = (type, title, time, endTime, index) => ({
      type, title, time, endTime, location: title,
      selectedPlace: { placeId: 'leg-' + index, displayName: title, formattedAddress: title + ' 주소', lat: 37 + index * 0.02, lng: 127 },
    });
    trip.itineraries = { legs: { userId: 'smokeOwner', itineraryPlan: { days: [{ day: 1, date: '2026-09-13', scheduleItems: [
      stop('departure', '호텔', '09:00', '', 0),
      stop('attraction', '해변', '10:00', '11:00', 1),
      stop('AnchorSchedule', '해변열차 탑승', '14:00', '14:40', 2),
      stop('cafe', '카페', '15:30', '16:30', 3),
      stop('arrival', '역', '18:00', '', 4),
    ] }] } } };
    // Same day for the real map: its geocoder trusts a saved place only on fixed stops and ones the traveler added.
    const mapped = structuredClone(trip.itineraries.legs);
    mapped.itineraryPlan.days[0].scheduleItems.forEach(item => { item.addedByUser = true; });
    trip.itineraries.legmap = mapped;
    sessionStorage.setItem('__smoke_db', JSON.stringify(trip));
  });
  // `samePlaceLeg` is the leg whose two ends are one spot: the map draws no line for it.
  const legs = samePlaceLeg => page.evaluate(samePlaceLeg => {
    const view = document.querySelector('itinerary-view');
    window.dispatchEvent(new CustomEvent('transit-info-ready', { detail: { context: view._mapRequest,
      routes: [0, 1, 2, 3].map(fromIndex => fromIndex === samePlaceLeg
        ? { fromIndex, toIndex: fromIndex + 1, durationMinutes: 0, mode: 'SAME_PLACE', samePlace: true, steps: [] }
        : { fromIndex, toIndex: fromIndex + 1, durationMinutes: 18, displayMinutes: 18, mode: 'WALKING',
          directionsUrl: 'https://www.google.com/maps/dir/?api=1' }) } }));
  }, samePlaceLeg);
  const events = () => page.evaluate(() => window.__legEvents.splice(0).join());
  const expectEvents = async (expected, what) => {
    const got = await events();
    if (got !== expected) throw Error(`${what}: expected show-map-leg [${expected}], got [${got}]`);
  };
  const stops = page.locator('itinerary-view .schedule-card');
  const mapButton = index => page.locator(`itinerary-view #transit-info-${index} .transit-map-btn`);

  await page.goto(page.smokeOrigin + '/view/legs');
  await stops.filter({ hasText: '카페' }).waitFor();
  await page.evaluate(() => {
    window.__legEvents = [];
    window.__opened = [];
    window.__events = []; window.gtag = (...args) => { window.__events.push(args); };
    window.addEventListener('show-map-leg', event => window.__legEvents.push(event.detail.fromIndex));
    window.open = url => { window.__opened.push(url); };
  });
  await legs(3);

  // 이동 줄의 '지도에서 보기': a real button, at least 44px, that opens its own leg and not Google Maps.
  await mapButton(2).waitFor();
  if (await mapButton(2).innerText() !== '지도에서 보기') throw Error('The leg button has no label');
  if ((await mapButton(2).boundingBox()).height < 44) throw Error('The leg button is shorter than 44px');
  await mapButton(2).click();
  await expectEvents('2', 'Leg button');
  await mapButton(0).focus();
  await page.keyboard.press('Enter');
  await expectEvents('0', 'Leg button by keyboard');
  if (await page.evaluate(() => window.__opened.length)) throw Error('The leg button also opened Google Maps');
  if (await mapButton(3).count()) throw Error('A same-place leg has no line to show');

  // 출발 카드: pressing it opens the leg into the reservation (2번 → 3번).
  const cardButton = page.locator('itinerary-view #departure-leg-btn');
  await page.locator('itinerary-view #departure-card').filter({ hasText: '13:32 출발' }).waitFor({ timeout: 5000 });
  if (await cardButton.getAttribute('aria-label') !== '지도에서 보기') throw Error('The card button has no accessible name');
  await page.locator('itinerary-view #departure-card').click();
  await expectEvents('1', 'Departure card');
  await cardButton.focus();
  await page.keyboard.press('Enter');
  await expectEvents('1', 'Departure card by keyboard');
  // 스펙 9: each opening says where it came from and nothing about the leg.
  const opened = () => page.evaluate(() => JSON.stringify(window.__events.splice(0).filter(args => args[1] === 'leg_focus_open').map(args => args[2])));
  const from = (...names) => JSON.stringify(names.map(opened_from => ({ opened_from })));
  if (await opened() !== from('timeline', 'timeline', 'departure_card', 'departure_card')) throw Error('leg_focus_open tracking wrong');

  // No line into the reservation: the card stays read-only.
  await legs(1);
  await page.locator('itinerary-view #transit-info-1').filter({ hasText: '같은 장소' }).waitFor();
  if (await cardButton.isVisible()) throw Error('The card opens a leg the map did not draw');

  // Phone: the advice sits inside the next-stop panel, and that panel opens the same leg.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.reload();
  await stops.filter({ hasText: '카페' }).waitFor();
  await page.evaluate(() => {
    document.querySelector('itinerary-view').setAttribute('mobile-summary', '');
    window.__legEvents = [];
    window.addEventListener('show-map-leg', event => window.__legEvents.push(event.detail.fromIndex));
  });
  // Mark the earlier visit done so the panel's next stop is the reservation.
  await stops.filter({ hasText: '해변' }).first().locator('.visited-btn').click();
  await legs(3);
  const nextStop = page.locator('itinerary-view #next-stop');
  await nextStop.filter({ hasText: '13:32 출발' }).waitFor({ timeout: 5000 });
  if (await cardButton.isVisible()) throw Error('The hidden card still takes presses on the phone');
  // The transparent button lies over the text (not in a grid cell above it) and stops short of the directions button.
  const legButton = page.locator('itinerary-view #next-stop-leg-btn');
  await legButton.click({ trial: true }); // wait until the sheet has stopped sliding up before measuring
  const box = id => page.locator('itinerary-view #' + id).boundingBox();
  const [legBox, titleBox, directionsBox] = [await box('next-stop-leg-btn'), await box('next-stop-title'), await box('next-stop-directions')];
  const titleMiddle = titleBox.y + titleBox.height / 2;
  if (titleMiddle < legBox.y || titleMiddle > legBox.y + legBox.height) throw Error('The panel button does not cover the panel text');
  if (legBox.x + legBox.width > directionsBox.x) throw Error('The panel button covers the directions button');
  if (legBox.height < 44) throw Error('The panel button is shorter than 44px');
  // Press where the title is (its left end: the sheet handle can sit over the middle of the row).
  await legButton.click({ position: { x: titleBox.x - legBox.x + 12, y: titleMiddle - legBox.y } });
  await expectEvents('1', 'Merged next-stop panel');
  await page.locator('itinerary-view #next-stop-directions').click();
  await expectEvents('', 'Directions button must keep its own job');
  await page.setViewportSize({ width: 1280, height: 720 });

  // The real <map-view> with a fake Maps library: the stepper, the leg button and the sheet in an actual browser.
  await page.route(/\/src\/domains\/map\/services\/google-maps-loader\.js/, route => route.fulfill({ contentType: 'text/javascript', body: `
    const calls = window.__mapCalls = { directions: 0 };
    class Layer { constructor(options) { Object.assign(this, options); } setMap(map) { this.map = map; } setOptions(options) { Object.assign(this, options); } setDirections() {} }
    class FakeMap extends Layer { constructor() { super(); } fitBounds() {} getZoom() { return 12; } setZoom() {} setCenter() {} panBy() {} }
    window.google = { maps: { TravelMode: { TRANSIT: 'TRANSIT', WALKING: 'WALKING', DRIVING: 'DRIVING' },
      LatLngBounds: class { extend() {} }, event: { addListenerOnce() {}, trigger() {} } } };
    const library = { Map: FakeMap, Polyline: Layer, DirectionsRenderer: Layer, AdvancedMarkerElement: Layer, PinElement: Layer, SymbolPath: { CIRCLE: 0 },
      DirectionsService: class { async route() { calls.directions++; return { routes: [{ legs: [{ duration: { value: 900, text: '15분' }, distance: { text: '1.2 km' }, steps: [] }] }] }; } },
      Place: class { constructor(options) { Object.assign(this, options); } async fetchFields() {} static async searchByText() { return { places: [] }; } } };
    export const getMapsLoader = () => ({ importLibrary: async () => library });
  ` }));
  // The isolated server has no Maps key, and without one the map never starts.
  await page.route(/\/src\/domains\/map\/ui\/map-view\.js/, async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('import.meta.env.VITE_MAPS_API_KEY', '"fixture-only"');
    await route.fulfill({ response, body });
  });
  const inMap = id => page.locator('map-view #' + id);
  const expectText = async (id, expected) => {
    for (let tries = 0; tries < 100 && await inMap(id).textContent() !== expected; tries++) await page.waitForTimeout(50);
    const got = await inMap(id).textContent();
    if (got !== expected) throw Error(`#${id}: expected "${expected}", got "${got}"`);
  };
  await page.goto(page.smokeOrigin + '/view/legmap');
  await inMap('leg-stepper').waitFor();
  await page.evaluate(() => { window.__events = []; window.gtag = (...args) => { window.__events.push(args); }; });
  await expectText('leg-label', '전체 경로');
  if (await inMap('leg-prev').isVisible() || await inMap('leg-overview').isVisible()) throw Error('The whole-route view offers Previous or Whole day');
  const asked = await page.evaluate(() => window.__mapCalls.directions);
  if (asked !== 4) throw Error(`Expected one Directions request per leg, got ${asked}`);

  await inMap('leg-next').click();
  await expectText('leg-label', '1 → 2');
  await expectText('leg-description', '호텔 → 해변 · 도보 15분');
  if (await inMap('leg-prev').isVisible()) throw Error('The first leg has nothing before it');
  await inMap('leg-next').focus();
  await page.keyboard.press('Enter');
  await expectText('leg-label', '2 → 3');
  for (const id of ['leg-prev', 'leg-next', 'leg-overview']) {
    const size = await inMap(id).boundingBox();
    if (!size || size.height < 44 || size.width < 44) throw Error(`#${id} is hidden or smaller than 44px`);
  }
  if (await inMap('leg-description').getAttribute('aria-live') !== 'polite') throw Error('The description is not announced');
  if (await inMap('leg-prev').getAttribute('aria-label') !== '이전 구간') throw Error('The Previous button has no name');

  // 이동 줄의 '지도에서 보기' opens the same leg the stepper would.
  await mapButton(3).click();
  await expectText('leg-label', '4 → 5');
  if (await inMap('leg-next').isVisible()) throw Error('The last leg has nothing after it');
  // The stepper counts once, when it leaves the whole-day view; stepping on to the next leg does not.
  const fromMap = await opened();
  if (fromMap !== from('map_stepper', 'timeline')) throw Error('leg_focus_open from the map wrong: ' + fromMap);

  // A language switch re-renders the schedule without a new map request; the stepper follows on its own.
  const setLang = lang => page.evaluate(async lang => (await import('/src/utils/i18n.js')).setLang(lang), lang);
  await setLang('en');
  await expectText('leg-overview', 'Whole day');
  if (await inMap('leg-prev').getAttribute('aria-label') !== 'Previous leg') throw Error('The stepper kept the old language');
  await setLang('ko');
  await expectText('leg-overview', '전체 보기');

  await inMap('leg-overview').click();
  await expectText('leg-label', '전체 경로');
  await expectText('leg-description', '');
  if (!await inMap('leg-next').evaluate(button => button.getRootNode().activeElement === button)) throw Error('Focus was left on the hidden button');
  if (await page.evaluate(() => window.__mapCalls.directions) !== asked) throw Error('Browsing legs asked Directions again');

  // Phone: the stepper sits below the Back row, and a full-height sheet comes down so the opened leg is visible.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.reload();
  await inMap('leg-stepper').waitFor();
  const bar = await inMap('leg-stepper').boundingBox();
  const back = await page.locator('.ionic-result-back').boundingBox();
  if (bar.y < back.y + back.height) throw Error('The stepper overlaps the Back row');
  if (bar.x < 0 || bar.x + bar.width > 390) throw Error('The stepper is wider than the phone');
  const sheet = page.locator('ion-modal.ionic-result-sheet');
  const sheetAt = async expected => {
    for (let tries = 0; tries < 100 && await sheet.evaluate(modal => modal.getCurrentBreakpoint()) !== expected; tries++) await page.waitForTimeout(50);
    return await sheet.evaluate(modal => modal.getCurrentBreakpoint()) === expected;
  };
  await sheet.evaluate(modal => modal.setCurrentBreakpoint(1));
  if (!await sheetAt(1)) throw Error('The sheet did not open to full height');
  await mapButton(0).click();
  if (!await sheetAt(0.62)) throw Error('The full-height sheet still hides the map');
  await expectText('leg-label', '1 → 2');
  await page.setViewportSize({ width: 1280, height: 720 });
  return { errors: page.smokeErrors, findings: [] };
}
