async page => {
  await page.evaluate(() => {
    const trip = JSON.parse(sessionStorage.getItem('__smoke_db'));
    const stop = (type, title, time, endTime, index) => ({
      type, title, time, endTime, location: title,
      selectedPlace: { placeId: 'replan-' + index, displayName: title,
        formattedAddress: title + ' 주소', lat: 37 + index * 0.02, lng: 127 },
    });
    trip.itineraries = { replan: { userId: 'smokeOwner', itineraryPlan: { days: [{
      day: 1, date: '2026-09-13', scheduleItems: [
        stop('departure', '호텔', '09:00', '', 0),
        stop('attraction', '박물관', '10:00', '11:00', 1),
        stop('cafe', '카페', '12:20', '13:20', 2),
        stop('AnchorSchedule', '공연', '13:05', '13:15', 3),
        stop('arrival', '역', '15:00', '', 4),
      ],
    }] } } };
    sessionStorage.setItem('__smoke_db', JSON.stringify(trip));
  });
  await page.goto(page.smokeOrigin + '/view/replan');
  const museum = page.locator('itinerary-view .schedule-card').filter({ hasText: '박물관' });
  const cafe = page.locator('itinerary-view .schedule-card').filter({ hasText: '카페' });
  await museum.locator('.visited-btn').click();
  const replan = page.locator('itinerary-view #replan-trip-btn');
  await replan.click();
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor();
  const preview = await dialog.textContent();
  if (!preview.includes('박물관에서 12:01 출발') || !preview.includes('13:05 공연') || !preview.includes('제외: 카페')) {
    throw Error('Unexpected replan preview: ' + preview);
  }
  await cafe.waitFor({ state: 'visible' });
  await dialog.locator('.confirm-cancel').click();
  await cafe.waitFor({ state: 'visible' });
  await replan.click();
  await dialog.locator('.confirm-ok').click();
  await cafe.waitFor({ state: 'hidden' });
  if (await museum.locator('.visited-btn').getAttribute('aria-pressed') !== 'true') throw Error('Visited mark changed');
  await page.locator('itinerary-view #undo-deletion-btn').click();
  await cafe.waitFor({ state: 'visible' });
  return { errors: page.smokeErrors };
}
