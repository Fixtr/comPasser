async page => {
  await page.evaluate(async () => {
    await window.__smoke.openPlan({
      request: { startTime: '09:00', endTime: '18:00' },
      days: [{ day: 1, date: '2026-09-17', scheduleItems: [
        { type: 'departure', time: '09:00', title: '출발' },
        { type: 'AnchorSchedule', time: '10:00', endTime: '11:00', title: '식당' },
        { type: 'arrival', time: '18:00', title: '도착' },
      ] }],
    });
  });
  const notes = page.locator('itinerary-view .stop-note-btn');
  if (await notes.count()) throw Error('Draft shows a private note button');
  await page.locator('itinerary-view #save-itinerary-btn').click();
  await page.waitForURL('**/view/smoke1');
  await notes.first().waitFor({ state: 'visible' });
  if (await notes.count() !== 1) throw Error('Only the visit should show a note button');
  const editor = page.locator('itinerary-view .stop-note-editor');
  const note = '<b>건물 뒤편 입구</b>';
  const link = 'https://example.invalid/booking';
  await notes.click();
  await editor.getByLabel('메모', { exact: true }).fill(note);
  await editor.getByLabel('예약 링크 (선택)', { exact: true }).fill(link);
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  await page.reload();
  await notes.click();
  await editor.getByRole('link', { name: '예약 링크 열기' }).waitFor();
  if (await editor.getByLabel('메모', { exact: true }).inputValue() !== note) throw Error('Private note lost on reload');
  if (await editor.getByRole('link', { name: '예약 링크 열기' }).getAttribute('href') !== link) throw Error('Booking link lost on reload');
  await editor.getByRole('button', { name: '취소', exact: true }).click();

  await page.locator('itinerary-view #share-itinerary-btn').click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.getElementById('share-itinerary-btn').disabled);
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  const published = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__smoke_db')).shared_itineraries);
  if (JSON.stringify(published).includes(note) || JSON.stringify(published).includes(link)) throw Error('Private note leaked into published snapshot');
  await page.goto(shared);
  await page.locator('itinerary-view .schedule-title').filter({ hasText: '식당' }).waitFor();
  if (await notes.count()) throw Error('Shared itinerary exposes a private note button');

  await page.goto('/view/smoke1');
  await notes.click();
  await editor.getByLabel('메모', { exact: true }).clear();
  await editor.getByLabel('예약 링크 (선택)', { exact: true }).clear();
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__smoke_db')).itineraries.smoke1.stopNotes);
  if (Object.keys(stored).length) throw Error('Clearing both fields did not delete the note');

  // A trip saved before stop ids: two same-named stops, a note under the second one's old place key.
  const placeKey = JSON.stringify(['2026-09-17', 'cafe', '', ['카페', 'B동']]);
  await page.evaluate(placeKey => {
    const db = JSON.parse(sessionStorage.getItem('__smoke_db'));
    db.itineraries.smoke1.itineraryPlan = { request: { startTime: '09:00', endTime: '18:00' }, days: [{ day: 1, date: '2026-09-17', scheduleItems: [
      { type: 'departure', time: '09:00', title: '출발' },
      { type: 'cafe', time: '10:00', endTime: '11:00', title: '카페', location: 'A동' },
      { type: 'cafe', time: '12:00', endTime: '13:00', title: '카페', location: 'B동' },
      { type: 'arrival', time: '18:00', title: '도착' },
    ] }] };
    db.itineraries.smoke1.stopNotes = { [placeKey]: { text: 'B동 메모', url: '' } };
    sessionStorage.setItem('__smoke_db', JSON.stringify(db));
    sessionStorage.removeItem('compasser.itineraries.v1');
  }, placeKey);
  await page.goto('/view/smoke1');
  await notes.nth(1).waitFor({ state: 'visible' });
  const migrated = await page.waitForFunction(() => {
    const trip = JSON.parse(sessionStorage.getItem('__smoke_db')).itineraries.smoke1;
    const id = trip.itineraryPlan.days[0].scheduleItems[2].stopId;
    return id && trip.stopNotes[id] ? { id, keys: Object.keys(trip.stopNotes) } : null;
  }).then(handle => handle.jsonValue());
  if (JSON.stringify(migrated.keys) !== JSON.stringify([migrated.id])) throw Error('Old place-key note was not moved to the stop id: ' + migrated.keys);
  await notes.nth(0).click();
  await editor.locator('textarea:not([disabled])').waitFor();
  if (await editor.getByLabel('메모', { exact: true }).inputValue() !== '') throw Error('Old note shown on the wrong stop');
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  await notes.nth(1).click();
  await editor.locator('textarea:not([disabled])').waitFor();
  if (await editor.getByLabel('메모', { exact: true }).inputValue() !== 'B동 메모') throw Error('Old note did not reach its stop');
  await editor.getByLabel('메모', { exact: true }).fill('B동 새 메모');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  const rewritten = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__smoke_db')).itineraries.smoke1.stopNotes);
  if (JSON.stringify(rewritten) !== JSON.stringify({ [migrated.id]: { text: 'B동 새 메모', url: '', place: placeKey } })) throw Error('Note write did not keep the note on its stop: ' + JSON.stringify(rewritten));

  // A saved recommendation stop that the map re-resolves on screen only (never saved) keeps its note.
  const recPlace = JSON.stringify(['2026-09-17', 'attraction', '', 'saved-place']);
  await page.evaluate(recPlace => {
    const db = JSON.parse(sessionStorage.getItem('__smoke_db'));
    db.itineraries.smoke1.itineraryPlan = { request: { startTime: '09:00', endTime: '18:00' }, days: [{ day: 1, date: '2026-09-17', scheduleItems: [
      { type: 'departure', time: '09:00', title: '출발' },
      { type: 'attraction', time: '10:00', endTime: '11:00', title: '공원', stopId: 'rec1', placeIntent: { purpose: '공원', category: 'park', nearLocation: '' },
        placeStatus: 'verified', verifiedPlace: { placeId: 'saved-place', displayName: '공원', formattedAddress: '서울', lat: 37.5, lng: 127, source: 'google_places' } },
      { type: 'arrival', time: '18:00', title: '도착' },
    ] }] };
    db.itineraries.smoke1.stopNotes = { rec1: { text: '추천 메모', url: '', place: recPlace } };
    sessionStorage.setItem('__smoke_db', JSON.stringify(db));
    sessionStorage.removeItem('compasser.itineraries.v1');
  }, recPlace);
  await page.goto('/view/smoke1');
  await notes.first().waitFor({ state: 'visible' });
  await page.evaluate(() => document.querySelector('itinerary-view').state.resolvePlaces(0, [{ index: 1, verifiedPlace: null }]));
  if (await page.evaluate(() => document.querySelector('itinerary-view').currentItinerary.days[0].scheduleItems[1].verifiedPlace?.placeId) === 'saved-place') throw Error('Re-resolution did not change the place on screen');
  await notes.first().click();
  await editor.locator('textarea:not([disabled])').waitFor();
  if (await editor.getByLabel('메모', { exact: true }).inputValue() !== '추천 메모') throw Error('Re-resolved stop lost its saved note');
  await editor.getByLabel('메모', { exact: true }).fill('추천 새 메모');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  const recNotes = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__smoke_db')).itineraries.smoke1.stopNotes);
  if (JSON.stringify(recNotes) !== JSON.stringify({ rec1: { text: '추천 새 메모', url: '', place: recPlace } })) throw Error('Re-resolved stop note write: ' + JSON.stringify(recNotes));
  return { errors: page.smokeErrors };
}
