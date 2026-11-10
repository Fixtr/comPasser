async page => {
  await page.evaluate(async () => {
    const place = (id, name, lng) => ({ placeId: id, displayName: name, formattedAddress: '서울', lat: 37.5, lng });
    const suggestion = (id, displayName, category) => ({ id, displayName, formattedAddress: '서울',
      location: { lat: 37.5, lng: 127.003 }, types: [category], businessStatus: 'OPERATIONAL',
      addressComponents: [{ types: ['country'], shortText: 'KR' }] });
    window.__placesFixtures = [suggestion('museum', '실내 박물관', 'museum'), suggestion('mall', '시간 미확인 상가', 'shopping_mall')];
    window.__hoursFixtures = { museum: { utcOffsetMinutes: 540,
      regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] } } };
    await window.__smoke.openPlan({ days: [{ day: 1, date: '2026-10-20', scheduleItems: [
      { type: 'departure', title: '출발', time: '09:00', selectedPlace: place('start', '출발', 127.001) },
      { type: 'attraction', title: '야외 공원', time: '10:00', endTime: '11:00', selectedPlace: place('park', '야외 공원', 127.002) },
      { type: 'AnchorSchedule', title: '공연', time: '12:00', endTime: '13:00', selectedPlace: place('show', '공연', 127.004) },
      { type: 'arrival', title: '도착', time: '18:00' },
    ] }] });
  });
  const trigger = page.locator('itinerary-view .indoor-alternatives-btn');
  const panel = page.locator('itinerary-view .indoor-alternatives');
  const apply = panel.getByRole('button', { name: '장소 바꾸기 · 실내 박물관', exact: true });
  await trigger.click();
  await apply.waitFor();
  if ((await panel.innerText()).includes('시간 미확인 상가')) throw Error('Unknown hours were treated as verified');
  if (!(await panel.innerText()).includes('앞뒤 이동 합계 30분')) throw Error('Measured travel total missing');
  const stops = () => page.evaluate(() => document.querySelector('itinerary-view').currentItinerary.days[0].scheduleItems);
  if ((await stops())[1].title !== '야외 공원') throw Error('Suggestion applied without selection');
  await panel.getByRole('button', { name: '취소', exact: true }).click();
  if (await panel.count()) throw Error('Cancel did not dismiss the alternatives');
  await trigger.click();
  await apply.click();
  await page.locator('itinerary-view .schedule-title').filter({ hasText: '실내 박물관' }).waitFor();
  const [, replacement, anchor] = await stops();
  if (replacement.selectedPlace?.placeId !== 'museum' || replacement.time !== '10:00' || replacement.endTime !== '11:00' ||
      anchor.title !== '공연' || anchor.time !== '12:00') throw Error('Replacement altered the trip’s time slots');
  return { errors: page.smokeErrors, findings: [] };
}
