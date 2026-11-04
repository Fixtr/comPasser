async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  // The Ionic planner replaces per-night overnight fields (and their Booking.com search dialog) with
  // optional trip stays that each carry check-in and check-out dates.
  const form = page.locator('travel-form');
  await form.evaluate(element => element.populateForm({ date: ['2026-10-08', '2026-10-09', '2026-10-10'],
    startTime: '09:00', endTime: '18:00', startLocation: '서울역', endLocation: '인천공항',
    stays: [{ location: '첫 숙소', checkin: '2026-10-08', checkout: '2026-10-09' }],
    anchorSchedules: [{ name: '공연', day: 1, time: '15:00', endTime: '16:00', location: '공연장' }] }));
  const read = () => form.evaluate(element => element.getFormData());
  const original = await read();
  check(original.overnightLocations.join() === '첫 숙소,', 'Only the first night has a stay');
  await form.locator('#add-trip-stay').click();
  const second = form.locator('.trip-stay').nth(1);
  check(await second.locator('.stay-checkin').inputValue() === '2026-10-09' && await second.locator('.stay-checkout').inputValue() === '2026-10-10',
    'A new stay covers the first night without one');
  const hotel = { placeId: 'selected-hotel', displayName: '선택한 호텔', formattedAddress: '서울 중구', lat: 37.55, lng: 126.98 };
  const choose = stay => stay.locator('.stay-location').evaluate((element, hotel) => {
    element.dispatchEvent(Object.assign(new Event('gmp-select'), { placePrediction: { toPlace: () => ({ ...hotel, fetchFields: async () => {} }) } }));
  }, hotel);
  await choose(second);
  await page.waitForFunction(() => document.querySelector('travel-form').getFormData().overnightLocations[1]?.placeId === 'selected-hotel');
  let draft = await read();
  check(draft.overnightLocations[0] === '첫 숙소' && draft.overnightLocations[1].placeId === hotel.placeId, 'Apply only to the selected night, preserving place identity');
  check(draft.startLocation === original.startLocation && draft.endLocation === original.endLocation
    && JSON.stringify(draft.anchorSchedules) === JSON.stringify(original.anchorSchedules), 'Keep endpoints and bookings');
  // One stay over both nights is the consecutive stay: remove the first and move the hotel's check-in.
  await form.locator('.trip-stay').first().getByRole('button', { name: '삭제', exact: true }).click();
  await form.locator('.trip-stay .stay-checkin').fill('2026-10-08');
  await page.waitForFunction(() => document.querySelector('travel-form').getFormData().stays[0]?.checkin === '2026-10-08');
  draft = await read();
  check(draft.stays.length === 1 && draft.stays[0].checkout === '2026-10-10', 'One stay spans all nights');
  check(draft.overnightLocations.length === 2 && draft.overnightLocations.every(place => place.placeId === hotel.placeId), 'Apply consecutive stays to all nights');
  check(draft.startLocation === original.startLocation && JSON.stringify(draft.anchorSchedules) === JSON.stringify(original.anchorSchedules), 'Stay edits keep the other inputs');
  await page.reload();
  await form.locator('.trip-stay .stay-location').waitFor();
  check((await read()).overnightLocations.every(place => place.placeId === hotel.placeId), 'Preserve hotel identity after reload');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    check(await form.locator('#trip-stays').evaluate(element => element.scrollWidth <= element.clientWidth), 'Stays must fit narrow screens');
    await page.screenshot({ path: page.smokeOutputDir + `/stay-search-${width}.png`, fullPage: true });
  }
  check(page.smokeErrors.length === 0, 'No browser errors');
  return { errors: page.smokeErrors };
}
