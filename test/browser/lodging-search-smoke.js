async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.evaluate(() => window.navigate('/plan'));
  const form = page.locator('travel-form');
  await form.evaluate(element => element.populateForm({ date: ['2026-10-08', '2026-10-09', '2026-10-10'],
    startTime: '09:00', endTime: '18:00', startLocation: '서울역', endLocation: '인천공항',
    overnightLocations: ['첫 숙소', '둘째 숙소'], anchorSchedules: [{ name: '공연', day: 1, time: '15:00', endTime: '16:00', location: '공연장' }] }));
  const read = () => form.evaluate(element => element.getFormData());
  const original = await read();
  const dialog = form.locator('#stay-dialog');
  await form.locator('[data-find-stay="1"]').click();
  await dialog.locator('#stay-region').fill('서울 중구 & 조용한 숙소');
  await dialog.locator('#stay-search-form button').click();
  const url = new URL(await dialog.locator('#stay-booking-link').getAttribute('href'));
  check(url.hostname === 'www.booking.com' && url.searchParams.get('ss') === '서울 중구 & 조용한 숙소'
    && url.searchParams.get('checkin') === '2026-10-09' && url.searchParams.get('checkout') === '2026-10-10', 'Encode area and dates for the selected night');
  await page.keyboard.press('Escape');
  check(JSON.stringify(await read()) === JSON.stringify(original), 'Search and cancel must not change the itinerary');
  await form.locator('[data-find-stay="1"]').click();
  const hotel = { placeId: 'selected-hotel', displayName: '선택한 호텔', formattedAddress: '서울 중구', lat: 37.55, lng: 126.98 };
  const choose = () => dialog.locator('#stay-chosen').evaluate((element, hotel) => {
    element.dispatchEvent(Object.assign(new Event('gmp-select'), { placePrediction: { toPlace: () => ({ ...hotel, fetchFields: async () => {} }) } }));
  }, hotel);
  await choose();
  await dialog.locator('#apply-stay').click();
  await dialog.waitFor({ state: 'hidden' });
  let draft = await read();
  check(draft.overnightLocations[0] === '첫 숙소' && draft.overnightLocations[1].placeId === hotel.placeId, 'Apply only to the selected night, preserving place identity');
  check(draft.startLocation === original.startLocation && draft.endLocation === original.endLocation
    && JSON.stringify(draft.anchorSchedules) === JSON.stringify(original.anchorSchedules), 'Keep endpoints and bookings');
  await form.locator('#same-overnight-toggle').check();
  await form.locator('[data-find-stay="0"]').click();
  await dialog.locator('#stay-region').fill('서울');
  await dialog.locator('#stay-search-form button').click();
  const consecutive = new URL(await dialog.locator('#stay-booking-link').getAttribute('href'));
  check(consecutive.searchParams.get('checkin') === '2026-10-08' && consecutive.searchParams.get('checkout') === '2026-10-10', 'Search all nights for consecutive stays');
  await choose();
  await dialog.locator('#apply-stay').click();
  await dialog.waitFor({ state: 'hidden' });
  check((await read()).overnightLocations.every(place => place.placeId === hotel.placeId), 'Apply consecutive stays to all nights');
  await page.reload();
  await form.locator('[data-find-stay="0"]').waitFor();
  check((await read()).overnightLocations.every(place => place.placeId === hotel.placeId), 'Preserve hotel identity after reload');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await form.locator('[data-find-stay="0"]').click();
    check(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), 'Dialog must fit narrow screens');
    await page.screenshot({ path: page.smokeOutputDir + `/stay-search-${width}.png`, fullPage: true });
    await dialog.locator('#close-stay').click();
  }
  await form.evaluate(element => element.populateForm({ date: ['2026-09-13', '2026-09-14'], startLocation: '서울역', endLocation: '서울역' }));
  await form.locator('[data-find-stay="0"]').click();
  check(await dialog.locator('#stay-tonight').isVisible(), 'Explain check-in today for urgent stays');
  await dialog.locator('#close-stay').click();
  check(page.smokeErrors.length === 0, 'No browser errors');
  return { errors: page.smokeErrors };
}
