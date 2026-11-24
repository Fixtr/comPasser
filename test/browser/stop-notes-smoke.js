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
  // Read mode hides the note button; the 편집 toggle shows it.
  await notes.waitFor({ state: 'attached' });
  if (await notes.isVisible()) throw Error('Read mode shows the note button');
  await page.locator('itinerary-view #edit-mode-btn').filter({ visible: true }).click();
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
  // Read mode after the reload: the saved note and its link are readable on the card as text, without the button.
  const savedText = page.locator('itinerary-view .stop-note-text');
  await savedText.filter({ hasText: '건물 뒤편 입구', visible: true }).waitFor();
  if (await savedText.textContent() !== note || await savedText.locator('b').count()) throw Error('Saved note is not shown as plain text');
  if (await page.locator('itinerary-view .stop-note-link').filter({ visible: true }).getAttribute('href') !== link) throw Error('Saved booking link is not shown in read mode');
  if (await notes.isVisible()) throw Error('Read mode shows the note button after a reload');
  // The card says in words that this is the traveler's own note, and the text is tied to that label.
  const savedLabel = page.locator('itinerary-view .stop-note-label');
  const savedLink = page.locator('itinerary-view .stop-note-link');
  if (await savedLabel.filter({ visible: true }).textContent() !== '개인 메모') throw Error('Saved note has no visible private label');
  if (await savedText.getAttribute('aria-labelledby') !== await savedLabel.getAttribute('id')) throw Error('Saved note is not tied to its label');
  if (await savedLink.getAttribute('aria-describedby') !== await savedLabel.getAttribute('id')) throw Error('Booking link is not tied to its label');
  if ((await savedLink.boundingBox()).height < 44) throw Error('Booking link tap area is under 44px');
  if (await savedLink.getAttribute('rel') !== 'noopener noreferrer') throw Error('Booking link lost its rel');
  const failed = page.locator('itinerary-view .stop-notes-status');
  if (await failed.count()) throw Error('A successful read shows the notes status');
  await page.locator('itinerary-view #edit-mode-btn').filter({ visible: true }).click();
  await notes.click();
  await editor.getByRole('link', { name: '예약 링크 열기' }).waitFor();
  // While the editor is open the card shows the note once: in the editor.
  const onCard = page.locator('itinerary-view .schedule-card > :is(.stop-note-label, .stop-note-text, .stop-note-link)');
  if (await onCard.filter({ visible: true }).count()) throw Error('The note shows twice while its editor is open');
  if (await editor.getByLabel('메모', { exact: true }).inputValue() !== note) throw Error('Private note lost on reload');
  if (await editor.getByRole('link', { name: '예약 링크 열기' }).getAttribute('href') !== link) throw Error('Booking link lost on reload');
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  if (await onCard.filter({ visible: true }).count() !== 3 || await savedText.textContent() !== note) throw Error('Closing the editor did not bring the saved note back');

  // A failed read says so once for the trip; its retry button repeats the read.
  await page.evaluate(() => {
    window.__smoke.dbError = 'read';
    const view = document.querySelector('itinerary-view');
    view._stopNotes = null;
    view.renderCurrentState();
  });
  const retry = failed.getByRole('button', { name: '다시 시도', exact: true });
  await retry.waitFor();
  if (await failed.count() !== 1 || await failed.getAttribute('role') !== 'alert') throw Error('Failed notes read is not one announced status');
  if (await onCard.filter({ visible: true }).count()) throw Error('A failed read shows a note');
  await retry.click();
  await failed.getByText('저장한 개인 메모를 불러오지 못했어요.').waitFor();
  if (await failed.count() !== 1) throw Error('A failed retry added a second status');
  await page.evaluate(() => { window.__smoke.dbError = undefined; });
  await retry.click();
  await failed.waitFor({ state: 'detached' });
  await savedText.filter({ hasText: '건물 뒤편 입구', visible: true }).waitFor();
  // Saving shows the new value on the card once the editor closes.
  await notes.click();
  await editor.getByLabel('메모', { exact: true }).fill(note + '!');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  if (await savedText.filter({ visible: true }).textContent() !== note + '!') throw Error('Saved value is not back on the card');
  await notes.click();
  await editor.getByLabel('메모', { exact: true }).fill(note);
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await editor.waitFor({ state: 'detached' });

  await page.locator('itinerary-view #share-itinerary-btn').click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.getElementById('share-itinerary-btn').disabled);
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  const published = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__smoke_db')).shared_itineraries);
  if (JSON.stringify(published).includes(note) || JSON.stringify(published).includes(link)) throw Error('Private note leaked into published snapshot');
  await page.goto(shared);
  await page.locator('itinerary-view .schedule-title').filter({ hasText: '식당' }).waitFor();
  if (await notes.count()) throw Error('Shared itinerary exposes a private note button');
  if (await page.locator('itinerary-view :is(.stop-note-label, .stop-note-text, .stop-note-link, .stop-notes-status)').count()) throw Error('Shared itinerary shows private note parts');

  await page.goto('/view/smoke1');
  await page.locator('itinerary-view #edit-mode-btn').filter({ visible: true }).click();
  await notes.click();
  await editor.getByLabel('메모', { exact: true }).clear();
  await editor.getByLabel('예약 링크 (선택)', { exact: true }).clear();
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  if (await page.locator('itinerary-view .stop-note-text, itinerary-view .stop-note-link, itinerary-view .stop-note-label').filter({ visible: true }).count()) throw Error('A cleared note is still shown');
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__smoke_db')).itineraries.smoke1.stopNotes);
  if (Object.keys(stored).length) throw Error('Clearing both fields did not delete the note');

  // A plan saved without ids (before the backfill): the view and the note service give it the same old-key ids.
  const cafeB = '2026-09-17#1#카페';
  await page.evaluate(cafeB => {
    const db = JSON.parse(sessionStorage.getItem('__smoke_db'));
    db.itineraries.smoke1.itineraryPlan = { request: { startTime: '09:00', endTime: '18:00' }, days: [{ day: 1, date: '2026-09-17', scheduleItems: [
      { type: 'departure', time: '09:00', title: '출발' },
      { type: 'cafe', time: '10:00', endTime: '11:00', title: '카페', location: 'A동' },
      { type: 'cafe', time: '12:00', endTime: '13:00', title: '카페', location: 'B동' },
      { type: 'arrival', time: '18:00', title: '도착' },
    ] }] };
    db.itineraries.smoke1.stopNotes = { [cafeB]: { text: 'B동 메모', url: '' } };
    sessionStorage.setItem('__smoke_db', JSON.stringify(db));
    sessionStorage.removeItem('compasser.itineraries.v1');
  }, cafeB);
  await page.goto('/view/smoke1');
  await page.locator('itinerary-view #edit-mode-btn').filter({ visible: true }).click();
  await notes.nth(1).waitFor({ state: 'visible' });
  // The note shows on its own stop only.
  const shownNotes = await page.locator('itinerary-view .schedule-card').evaluateAll(cards => cards.map(card => { const text = card.querySelector('.stop-note-text'); return text && !text.hidden ? text.textContent : ''; }).join('|'));
  if (shownNotes !== '||B동 메모|') throw Error('Saved note shown on the wrong card: ' + shownNotes);
  await notes.nth(0).click();
  await editor.locator('textarea:not([disabled])').waitFor();
  if (await editor.getByLabel('메모', { exact: true }).inputValue() !== '') throw Error('Note shown on the wrong stop');
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  await notes.nth(1).click();
  await editor.locator('textarea:not([disabled])').waitFor();
  if (await editor.getByLabel('메모', { exact: true }).inputValue() !== 'B동 메모') throw Error('Note did not reach its stop');
  await editor.getByLabel('메모', { exact: true }).fill('B동 새 메모');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  const rewritten = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__smoke_db')).itineraries.smoke1.stopNotes);
  if (JSON.stringify(rewritten) !== JSON.stringify({ [cafeB]: { text: 'B동 새 메모', url: '' } })) throw Error('Note write did not keep the note on its stop: ' + JSON.stringify(rewritten));

  // A saved recommendation stop that the map re-resolves on screen only (never saved) keeps its note.
  await page.evaluate(() => {
    const db = JSON.parse(sessionStorage.getItem('__smoke_db'));
    db.itineraries.smoke1.itineraryPlan = { request: { startTime: '09:00', endTime: '18:00' }, days: [{ day: 1, date: '2026-09-17', scheduleItems: [
      { type: 'departure', time: '09:00', title: '출발' },
      { type: 'attraction', time: '10:00', endTime: '11:00', title: '공원', stopId: 'rec1', placeIntent: { purpose: '공원', category: 'park', nearLocation: '' },
        placeStatus: 'verified', verifiedPlace: { placeId: 'saved-place', displayName: '공원', formattedAddress: '서울', lat: 37.5, lng: 127, source: 'google_places' } },
      { type: 'arrival', time: '18:00', title: '도착' },
    ] }] };
    db.itineraries.smoke1.stopNotes = { rec1: { text: '추천 메모', url: '' } };
    sessionStorage.setItem('__smoke_db', JSON.stringify(db));
    sessionStorage.removeItem('compasser.itineraries.v1');
  });
  await page.goto('/view/smoke1');
  await page.locator('itinerary-view #edit-mode-btn').filter({ visible: true }).click();
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
  if (JSON.stringify(recNotes) !== JSON.stringify({ rec1: { text: '추천 새 메모', url: '' } })) throw Error('Re-resolved stop note write: ' + JSON.stringify(recNotes));
  // Without :has() the card is marked while its editor is open, and unmarked however the editor goes away.
  const marked = () => page.locator('itinerary-view .schedule-card[data-note-open]').count();
  const noteShown = () => page.locator('itinerary-view .stop-note-text').filter({ visible: true }).count();
  const open = async () => {
    await notes.first().click();
    await editor.locator('textarea:not([disabled])').waitFor();
    if (await marked() !== 1 || await noteShown()) throw Error('An open editor must mark its card and hide the saved note');
  };
  const closed = async how => {
    await editor.waitFor({ state: 'detached' });
    await page.locator('itinerary-view .stop-note-text').filter({ visible: true }).waitFor();
    if (await marked() || await noteShown() !== 1) throw Error(`The card stayed marked after ${how}`);
  };
  await open();
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  await closed('cancel');
  await open();
  await editor.locator('textarea').press('Escape');
  await closed('Escape');
  await open();
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await closed('save');
  await open();
  await page.evaluate(() => document.querySelector('itinerary-view').cancelPendingLoad());
  await closed('the view removing its editors');
  // That call also retires the cards' buttons; a render brings live ones back.
  await page.evaluate(() => document.querySelector('itinerary-view').renderCurrentState());
  await open();
  await page.evaluate(() => document.querySelector('itinerary-view').renderCurrentState());
  await closed('a re-render');
  // Open, cancel and reopen before the first read ends: the first editor's late close must not unmark the reopened card.
  await page.evaluate(() => {
    const root = document.querySelector('itinerary-view').shadowRoot;
    const button = [...root.querySelectorAll('.stop-note-btn')].find(item => item.offsetParent);
    button.click();
    root.querySelector('.stop-note-editor [type="button"]').click();
    button.click();
  });
  await editor.locator('textarea:not([disabled])').waitFor();
  if (await editor.count() !== 1 || await marked() !== 1 || await noteShown()) throw Error('A stale editor close unmarked the reopened card');
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  await closed('cancel after a reopen');
  // The failed-read status is removed, not only hidden, when the view stops showing an editable private trip.
  await page.evaluate(() => {
    window.__smoke.dbError = 'read';
    const view = document.querySelector('itinerary-view');
    view._stopNotes = null;
    view.renderCurrentState();
  });
  await failed.getByRole('button', { name: '다시 시도', exact: true }).waitFor();
  await page.evaluate(() => {
    window.__smoke.dbError = undefined;
    document.querySelector('itinerary-view').setError('<div class="state-block"></div>');
  });
  if (await failed.count()) throw Error('The notes status stayed on an error screen');
  return { errors: page.smokeErrors };
}
