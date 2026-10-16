// Run after refactor-smoke-setup.js. All auth/AI/DB/Maps boundaries remain fake.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  const request = {
    date: ['2026-10-01', '2026-10-02'], theme: 'food', budget: 'budget',
    startTime: '09:00', endTime: '18:00', startLocation: '서울역', endLocation: '서울역',
    overnightLocations: ['서울역'],
    dailyTimes: [
      { day: 1, startTime: '09:00', endTime: '18:00', isCustom: true },
      { day: 2, startTime: '10:00', endTime: '19:00', isCustom: true },
    ],
    anchorSchedules: [{ day: 2, name: '공연', time: '12:00', endTime: '13:00', location: '공연장' }],
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
  await page.waitForFunction(() => document.querySelector('itinerary-view').currentItinerary?.request?.date?.length === 2);
  await page.locator('#edit-itinerary-btn').click();
  await page.locator('travel-form #schedule-date').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('travel-form').shadowRoot.getElementById('schedule-date').readOnly);
  const read = () => page.evaluate(() => {
    const view = document.querySelector('travel-form'), root = view.shadowRoot;
    return { request: view.getFormData(), date: root.getElementById('schedule-date').value,
      badges: root.getElementById('preference-chips-container').textContent,
      days: [...root.querySelectorAll('.anchor-day option')].map(option => option.value),
      daily: [...root.querySelectorAll('.daily-start-time')].map(input => input.value) };
  });
  let actual = await read();
  check(actual.date.includes('2026-10-01') && actual.date.includes('2026-10-02'), 'Edited dates must be visible');
  check(JSON.stringify(actual.request.date) === JSON.stringify(request.date), 'Submitted dates must match the edited trip');
  check(actual.request.theme === 'food' && actual.request.budget === 'budget', 'Edited theme/budget must win');
  check(actual.badges.includes('2026-10-01'), 'Badges must use the same draft');
  check(actual.days.join() === '1,2' && actual.request.anchorSchedules[0].day === 2, 'Day selector must use edited duration');
  check(actual.daily.join() === '09:00,10:00', 'Custom daily times must be restored');
  check(actual.request.overnightLocations.join() === '서울역', 'Overnight place must be restored');
  results.push('PASS saved-trip edit: visible/submitted dates, preferences, anchor day and daily times agree');

  await page.locator('travel-form .anchor-name').fill('수정한 공연');
  await page.evaluate(() => window.navigate('/profile'));
  await page.locator('#page-profile').waitFor({ state: 'visible' });
  await page.goBack();
  await page.locator('travel-form .anchor-name').waitFor({ state: 'visible' });
  check((await read()).request.anchorSchedules[0].name === '수정한 공연', 'Back navigation must retain edits');
  await page.reload();
  await page.locator('travel-form .anchor-name').waitFor({ state: 'visible' });
  actual = await read();
  check(JSON.stringify(actual.request.date) === JSON.stringify(request.date), 'Reload must retain edited dates');
  check(actual.request.anchorSchedules[0].name === '수정한 공연', 'Reload must retain detail edits');
  results.push('PASS detail edits survive route exit/back and reload');

  await page.locator('travel-form .primary-btn').click();
  await page.waitForFunction(() => window.__smoke.requests.length === 1);
  const sent = await page.evaluate(() => window.__smoke.requests[0]);
  check(JSON.stringify(sent) === JSON.stringify(actual.request), 'Generate click must send exactly the displayed form data');
  results.push('PASS actual submit event delivers the displayed conditions to generation');
  await page.evaluate(() => window.navigate('/profile'));
  await page.goBack();
  await page.locator('travel-form #reselect-preference-btn').click();
  await page.locator('preference-view #skip-btn').waitFor({ state: 'visible' });
  check(await page.locator('preference-view [data-duration="2"]').evaluate(el => el.classList.contains('selected')), 'Preference re-entry must restore edited duration');
  check(await page.locator('preference-view #theme-grid [data-value="food"]').evaluate(el => el.classList.contains('selected')), 'Theme edit must restore the current selection');
  check(await page.locator('preference-view #budget-grid [data-value="budget"]').evaluate(el => el.classList.contains('selected')), 'Budget edit must restore the current selection');
  await page.locator('preference-view #skip-btn').click();
  await page.locator('travel-form #schedule-date').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('travel-form').draft.theme === null);
  actual = await read();
  check(actual.request.theme === null && actual.request.budget === null, 'Skip must clear both preferences');
  check(actual.request.anchorSchedules[0].name === '수정한 공연', 'Preference change must keep details');
  results.push('PASS preference re-entry/skip updates the same draft without losing details');

  await page.locator('travel-form #reselect-preference-btn').click();
  await page.locator('preference-view #prev-step-btn').click();
  await page.locator('preference-view [data-duration="4"]').click();
  await page.locator('preference-view #next-step-btn').click();
  await page.locator('preference-view #skip-btn').click();
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
  await page.reload();
  await page.locator('travel-form #schedule-date').waitFor({ state: 'visible' });
  actual = await read();
  check(actual.request.anchorSchedules.length === 0 && actual.request.startLocation === '', 'Reset must survive reload');
  results.push('PASS reset preserves dates and cleared details across reload');
  check(page.smokeErrors.length === 0, 'No unhandled page errors: ' + page.smokeErrors.join(', '));
  return { results, errors: page.smokeErrors };
}
