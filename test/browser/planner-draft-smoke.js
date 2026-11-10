// Run after refactor-smoke-setup.js. All auth/AI/DB/Maps boundaries remain fake.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  // The Ionic review only generates from searched places, so endpoints and the booking carry place identity.
  const station = { placeId: 'seoul-station', displayName: '서울역', formattedAddress: '서울 중구', lat: 37.555, lng: 126.97 };
  const hall = { placeId: 'concert-hall', displayName: '공연장', formattedAddress: '서울 종로구', lat: 37.57, lng: 126.98 };
  const request = {
    date: ['2026-10-01', '2026-10-02'], theme: 'food', budget: 'budget', companion: 'family_kids',
    startTime: '09:00', endTime: '18:00', startLocation: station, endLocation: station,
    overnightLocations: ['서울역'],
    dailyTimes: [
      { day: 1, startTime: '09:00', endTime: '18:00', isCustom: true },
      { day: 2, startTime: '10:00', endTime: '19:00', isCustom: true },
    ],
    anchorSchedules: [{ day: 2, name: '공연', time: '12:00', endTime: '13:00', location: hall }],
  };
  await page.evaluate(request => {
    sessionStorage.setItem('userPreference', JSON.stringify({ date: ['2026-10-20'], theme: 'photo', budget: 'flex' }));
    const db = JSON.parse(sessionStorage.getItem('__smoke_db'));
    db.itineraries ||= {};
    db.itineraries.editDraft = { userId: 'smokeOwner', itineraryPlan: { request, days: request.date.map((date, i) => ({
      date, day: i + 1, scheduleItems: [{ type: 'departure', title: '서울역', location: '서울역', time: '09:00', endTime: '09:00' }],
    })) } };
    sessionStorage.setItem('__smoke_db', JSON.stringify(db));
    window.navigate('/view/editDraft');
  }, request);
  // Leaving /plan from setup asks first; answer it like a user opening a saved trip.
  await page.locator('[role="alertdialog"] .confirm-ok').click();
  // The Ionic shell mounts <itinerary-view> lazily on /view/:id.
  await page.waitForFunction(() => document.querySelector('itinerary-view')?.currentItinerary?.request?.date?.length === 2);
  await page.locator('.ionic-result-edit').click();
  await page.locator('travel-form #schedule-date').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('travel-form').shadowRoot.getElementById('schedule-date').readOnly);
  const read = () => page.evaluate(() => {
    const view = document.querySelector('travel-form'), root = view.shadowRoot;
    // The Ionic planner shows the start date and end date in two read-only fields.
    return { request: view.getFormData(), date: root.getElementById('schedule-date').value + ' ' + root.getElementById('trip-end-date').value,
      badges: root.getElementById('preference-chips-container').textContent,
      days: [...root.querySelectorAll('.anchor-day option')].map(option => option.value),
      daily: [...root.querySelectorAll('.daily-start-time')].map(input => input.value) };
  });
  // Reloading /plan while signed in asks first and discards the inputs if accepted (by design on the Ionic shell),
  // so a reload the user cancels must keep the page, and the stored draft must already hold what the form shows.
  const cancelReload = async () => {
    const dialog = page.waitForEvent('dialog');
    const reload = page.reload({ timeout: 3000 }).catch(() => {});
    const prompt = await dialog;
    check(prompt.type() === 'beforeunload', 'Reload with inputs must ask first');
    await prompt.dismiss();
    await reload;
  };
  const stored = () => page.evaluate(async () => (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read());
  let actual = await read();
  check(actual.date.includes('2026-10-01') && actual.date.includes('2026-10-02'), 'Edited dates must be visible');
  check(JSON.stringify(actual.request.date) === JSON.stringify(request.date), 'Submitted dates must match the edited trip');
  check(actual.request.theme === 'food' && actual.request.budget === 'budget' && actual.request.companion === 'family_kids', 'Edited theme/budget/companion must win');
  check(actual.badges.includes('2026-10-01'), 'Badges must use the same draft');
  check(actual.days.join() === '1,2' && actual.request.anchorSchedules[0].day === 2, 'Day selector must use edited duration');
  check(actual.daily.join() === '09:00,10:00', 'Custom daily times must be restored');
  check(actual.request.overnightLocations.join() === '서울역', 'Overnight place must be restored');
  results.push('PASS saved-trip edit: visible/submitted dates, preferences, anchor day and daily times agree');

  await page.locator('travel-form .anchor-name').fill('수정한 공연');
  // Leaving /plan with inputs asks first (the legacy shell had no such question); staying keeps the edits.
  await page.evaluate(() => window.navigate('/profile'));
  await page.locator('[role="alertdialog"] .confirm-cancel').click();
  check(new URL(page.url()).pathname === '/plan', 'Cancelling the leave question must stay on the planner');
  check((await read()).request.anchorSchedules[0].name === '수정한 공연', 'Cancelled route exit must retain edits');
  await cancelReload();
  actual = await read();
  const saved = await stored();
  check(JSON.stringify(actual.request.date) === JSON.stringify(request.date) && JSON.stringify(saved.date) === JSON.stringify(request.date), 'Reload must retain edited dates');
  check(actual.request.anchorSchedules[0].name === '수정한 공연' && saved.anchorSchedules[0].name === '수정한 공연', 'Reload must retain detail edits');
  results.push('PASS detail edits survive a cancelled route exit and a cancelled reload, and are stored');

  // Change the companion from the review's style edit; the choice must reach generation.
  await page.locator('travel-form .primary-btn').click();
  await page.locator('travel-form [data-review-edit="style"]').click();
  const styleStep = page.locator('preference-view:visible');
  check(await styleStep.locator('#companion-grid [data-value="family_kids"]').getAttribute('aria-pressed') === 'true', 'Companion edit must restore the saved selection');
  await styleStep.locator('#companion-grid [data-value="parents"]').click();
  check(await styleStep.locator('#companion-grid [aria-pressed="true"]').count() === 1, 'Companion is a single choice');
  await styleStep.locator('#submit-btn').click();
  await page.waitForFunction(() => document.querySelector('travel-form').draft.companion === 'parents');
  actual = await read();
  check(actual.request.companion === 'parents' && actual.request.anchorSchedules[0].name === '수정한 공연', 'Companion change must keep details');
  // The Ionic planner reviews the inputs before the generate button.
  await page.locator('travel-form .primary-btn').click();
  await page.locator('travel-form #final-generate').click();
  await page.waitForFunction(() => window.__smoke.requests.length === 1);
  const sent = await page.evaluate(() => window.__smoke.requests[0]);
  // `step` is only the planner's own position (the review sets '/plan?review=1'), not a trip condition.
  const conditions = ({ step: _step, ...rest }) => JSON.stringify(rest);
  check(conditions(sent) === conditions(actual.request), 'Generate click must send exactly the displayed form data');
  check(sent.companion === 'parents', 'Selected companion must reach the generation request');
  results.push('PASS actual submit event delivers the displayed conditions to generation');
  // Leaving during generation asks to stop it, which keeps the inputs and returns to the review.
  await page.evaluate(() => window.navigate('/profile'));
  await page.locator('[role="alertdialog"] .confirm-ok').click();
  await page.locator('travel-form [data-review-edit="style"]').click();
  const preference = page.locator('preference-view:visible');
  await preference.locator('#skip-btn').waitFor({ state: 'visible' });
  check(await preference.locator('[data-duration="2"]').evaluate(el => el.classList.contains('selected')), 'Preference re-entry must restore edited duration');
  check(await preference.locator('#theme-grid [data-value="food"]').evaluate(el => el.classList.contains('selected')), 'Theme edit must restore the current selection');
  check(await preference.locator('#budget-grid [data-value="budget"]').evaluate(el => el.classList.contains('selected')), 'Budget edit must restore the current selection');
  await preference.locator('#skip-btn').click();
  await page.locator('travel-form #schedule-date').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('travel-form').draft.theme === null);
  actual = await read();
  check(actual.request.theme === null && actual.request.budget === null && actual.request.companion === null, 'Skip must clear all preferences');
  check(actual.request.anchorSchedules[0].name === '수정한 공연', 'Preference change must keep details');
  results.push('PASS preference re-entry/skip updates the same draft without losing details');

  await page.locator('travel-form #reselect-preference-btn').click();
  // Each preference step is its own Ionic page, and earlier pages stay in the DOM hidden.
  const shown = selector => page.locator(`preference-view ${selector}:visible`);
  await shown('#prev-step-btn').click();
  await shown('[data-duration="4"]').click();
  await shown('#next-step-btn').click();
  await shown('#skip-btn').click();
  await page.waitForFunction(() => document.querySelector('travel-form').draft.date.length === 4);
  actual = await read();
  const changedDates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
  check(JSON.stringify(actual.request.date) === JSON.stringify(changedDates), 'Changed duration must update submitted dates');
  check(actual.date.includes('2026-10-04') && actual.days.join() === '1,2,3,4', 'Date display and anchor options must update together');
  check(actual.request.anchorSchedules[0].day === 2, 'Duration expansion must keep anchor day');
  check(actual.request.overnightLocations.length === 3 && actual.request.overnightLocations[0] === '서울역',
    'Duration expansion must preserve existing overnight place and add a new night');
  results.push('PASS explicit duration change updates dates/day options and preserves anchors');

  await page.locator('travel-form #reset-btn').click();
  actual = await read();
  check(actual.request.anchorSchedules.length === 0 && actual.request.startLocation === '', 'Reset must clear details');
  check(JSON.stringify(actual.request.date) === JSON.stringify(changedDates), 'Reset must retain visible selected dates');
  await cancelReload();
  actual = await read();
  const cleared = await stored();
  check(actual.request.anchorSchedules.length === 0 && actual.request.startLocation === '', 'Reset must survive reload');
  check(cleared.anchorSchedules.length === 0 && cleared.startLocation === '' && JSON.stringify(cleared.date) === JSON.stringify(changedDates), 'Reset must be stored');
  results.push('PASS reset preserves dates and cleared details across a cancelled reload, and is stored');
  check(page.smokeErrors.length === 0, 'No unhandled page errors: ' + page.smokeErrors.join(', '));
  return { results, errors: page.smokeErrors };
}
