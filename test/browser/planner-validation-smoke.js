// Run after refactor-smoke-setup.js. Real form/validation, isolated auth/AI/DB/Maps.
async page => {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const results = [];
  // The Ionic review only generates from searched places, so endpoints and visits carry place identity.
  const place = (placeId, displayName) => ({ placeId, displayName, formattedAddress: '서울', lat: 37.55, lng: 126.97 });
  const station = place('seoul-station', '서울역'), hotel = place('hotel', '호텔'), hall = place('hall', '공연장');
  const request = { date: ['2026-10-20', '2026-10-21'], startTime: '09:00', endTime: '18:00',
    startLocation: station, endLocation: hotel,
    overnightLocations: ['호텔'],
    dailyTimes: [{ day: 1, startTime: '09:00', endTime: '18:00', isCustom: true },
      { day: 2, startTime: '11:00', endTime: '20:00', isCustom: true }],
    anchorSchedules: [{ day: 2, name: '공연', time: '10:00', endTime: '12:00', location: hall }] };
  const form = page.locator('travel-form');
  const generate = form.locator('#final-generate');
  const issues = form.locator('#review-issues');
  await page.evaluate(async () => { const { setLang } = await import('/src/utils/i18n.js'); setLang('ko'); });
  const populate = async data => {
    await page.evaluate(data => {
      const view = document.querySelector('travel-form');
      // A filled form returns from its review to the inputs, as the review's Edit does.
      if (view.reviewing) view.hideReview();
      view.populateForm(data);
      window.__smoke.requests = [];
    }, data);
    await form.locator('.primary-btn').waitFor({ state: 'visible' });
  };
  // The Ionic planner reviews the inputs first; its generate button runs the generation checks.
  const review = async () => {
    await form.locator('.primary-btn').click();
    await generate.waitFor({ state: 'visible' });
  };
  const blocked = async () => {
    await review();
    await generate.click();
    await issues.waitFor({ state: 'visible' });
    check(await page.evaluate(() => window.__smoke.requests.length === 0), 'Invalid form must not reach generation');
    check(!await generate.isDisabled(), 'Invalid form must unlock submit');
  };
  // The review's Edit returns to the inputs and marks the field that blocked generation.
  const editIssue = () => issues.getByRole('button', { name: '수정', exact: true }).first().click();

  await populate(request);
  await blocked();
  const boundsFeedback = await issues.innerText();
  await editIssue();
  check(await form.locator('.anchor-time').getAttribute('aria-invalid') === 'true', 'Wrong-day anchor time must be highlighted');
  check(boundsFeedback.includes('그날 여행 시작·종료 시간'), 'Korean bounds feedback must be visible: ' + boundsFeedback);
  results.push('PASS custom-day anchor bounds: no generation, visible feedback, focused field, unlocked button');

  await populate(request);
  // The planner checks measured travel from the day's start (15 min in the fake), so the fix leaves room for it.
  await form.locator('.anchor-time').fill('11:30');
  await review();
  await generate.click();
  await page.waitForFunction(() => window.__smoke.requests.length === 1);
  check((await page.evaluate(() => window.__smoke.requests[0])).anchorSchedules[0].time === '11:30', 'Corrected anchor must be submitted');
  // Leaving during generation asks to stop it; stopping keeps the inputs.
  await page.evaluate(() => window.navigate('/profile'));
  await page.locator('[role="alertdialog"] .confirm-ok').click();
  results.push('PASS corrected anchor can be resubmitted');

  const noAnchors = { ...request, anchorSchedules: [] };
  await populate(noAnchors);
  await form.locator('#add-anchor-btn').click();
  await review();
  await generate.click();
  await page.waitForFunction(() => window.__smoke.requests.length === 1);
  check((await page.evaluate(() => window.__smoke.requests[0])).anchorSchedules.length === 0, 'Untouched optional rows must remain ignored');
  await page.evaluate(() => window.navigate('/profile'));
  await page.locator('[role="alertdialog"] .confirm-ok').click();
  results.push('PASS untouched optional anchor row remains valid');

  // Eleven fixed visits that fit the day, so only the per-day limit blocks them.
  const eleven = Array.from({ length: 11 }, (_, i) => {
    const start = 11 * 60 + 30 + i * 45, time = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return { day: 2, name: `공연 ${i + 1}`, time: time(start), endTime: time(start + 30), location: hall };
  });
  await populate({ ...request, anchorSchedules: eleven });
  await page.evaluate(async () => { const { setLang } = await import('/src/utils/i18n.js'); setLang('en'); });
  await blocked();
  const limitFeedback = await issues.innerText();
  check(limitFeedback.includes('up to 10 must-visit places'), 'English anchor-limit feedback must be visible: ' + limitFeedback);
  results.push('PASS anchor limit prevents silent truncation and shows English feedback');

  await populate(noAnchors);
  await form.locator('.daily-time-row[data-day="2"] .daily-start-time').fill('');
  await review();
  check(await generate.isDisabled(), 'The review must hold back an empty custom time');
  const reviewFeedback = await issues.innerText();
  // Also exercise the JS guard when the review's disabled button is bypassed.
  await page.evaluate(() => document.querySelector('travel-form').shadowRoot.getElementById('travel-form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await page.waitForFunction(() => document.querySelector('travel-form').isSubmitting === false);
  check(await page.evaluate(() => window.__smoke.requests.length === 0), 'Empty custom time must not borrow a global time');
  // The review says the field is empty; only the guard's _revealInvalidField swaps in the planner's own message.
  const guardFeedback = await issues.innerText();
  check(!reviewFeedback.includes('both start and end times') && guardFeedback.includes('[Day 2] Error: Please enter both start and end times'),
    'The JS guard must block the empty custom time: ' + JSON.stringify([reviewFeedback, guardFeedback]));
  await page.evaluate(async () => { const { setLang } = await import('/src/utils/i18n.js'); setLang('ko'); });
  await editIssue();
  check(await form.locator('.daily-time-row[data-day="2"] .daily-start-time').getAttribute('aria-invalid') === 'true', 'Empty custom time must be highlighted');
  results.push('PASS cleared custom time stays invalid instead of falling back to global defaults');

  check(page.smokeErrors.length === 0, 'Unexpected page errors: ' + page.smokeErrors.join(', '));
  return { results, errors: page.smokeErrors };
}
