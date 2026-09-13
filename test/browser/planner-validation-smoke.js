// Run after refactor-smoke-setup.js. Real form/validation, isolated auth/AI/DB/Maps.
async page => {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const results = [];
  const request = { date: ['2026-10-20', '2026-10-21'], startTime: '09:00', endTime: '18:00',
    startLocation: '서울역', endLocation: '호텔',
    dailyTimes: [{ day: 1, startTime: '09:00', endTime: '18:00', isCustom: true },
      { day: 2, startTime: '11:00', endTime: '20:00', isCustom: true }],
    anchorSchedules: [{ day: 2, name: '공연', time: '10:00', endTime: '12:00', location: '' }] };
  await page.evaluate(async () => { const { setLang } = await import('/src/utils/i18n.js'); setLang('ko'); });
  const populate = async data => {
    await page.evaluate(data => {
      window.navigate('/plan');
      document.querySelector('travel-form').populateForm(data);
      window.__smoke.requests = [];
    }, data);
    await page.locator('#travel-form-view').waitFor({ state: 'visible' });
  };
  const blocked = async () => {
    await page.locator('travel-form .primary-btn').click();
    check(await page.evaluate(() => window.__smoke.requests.length === 0), 'Invalid form must not reach generation');
    check(!await page.locator('travel-form .primary-btn').isDisabled(), 'Invalid form must unlock submit');
  };

  await populate(request);
  await blocked();
  check(await page.locator('travel-form .anchor-time').getAttribute('aria-invalid') === 'true', 'Wrong-day anchor time must be highlighted');
  check((await page.locator('body').innerText()).includes('해당 일차'), 'Korean bounds feedback must be visible');
  results.push('PASS custom-day anchor bounds: no generation, visible feedback, focused field, unlocked button');

  await page.locator('travel-form .anchor-time').fill('11:00');
  await page.locator('travel-form .primary-btn').click();
  await page.waitForFunction(() => window.__smoke.requests.length === 1);
  check((await page.evaluate(() => window.__smoke.requests[0])).anchorSchedules[0].time === '11:00', 'Corrected anchor must be submitted');
  await page.evaluate(() => window.navigate('/profile'));
  results.push('PASS corrected anchor can be resubmitted with its optional location empty');

  const noAnchors = { ...request, anchorSchedules: [] };
  await populate(noAnchors);
  await page.locator('travel-form #add-anchor-btn').click();
  await page.locator('travel-form .primary-btn').click();
  await page.waitForFunction(() => window.__smoke.requests.length === 1);
  check((await page.evaluate(() => window.__smoke.requests[0])).anchorSchedules.length === 0, 'Untouched optional rows must remain ignored');
  await page.evaluate(() => window.navigate('/profile'));
  results.push('PASS untouched optional anchor row remains valid');

  await populate({ ...request, anchorSchedules: Array.from({ length: 11 }, () => ({ ...request.anchorSchedules[0], time: '11:00' })) });
  await page.evaluate(async () => { const { setLang } = await import('/src/utils/i18n.js'); setLang('en'); });
  await blocked();
  check((await page.locator('body').innerText()).includes('up to 10 anchors'), 'English anchor-limit feedback must be visible');
  results.push('PASS anchor limit prevents silent truncation and shows English feedback');

  await populate(noAnchors);
  await page.locator('travel-form .daily-time-row[data-day="2"] .daily-start-time').fill('');
  // Also exercise the JS guard when native required validation is bypassed.
  await page.evaluate(() => document.querySelector('travel-form').shadowRoot.getElementById('travel-form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  check(await page.evaluate(() => window.__smoke.requests.length === 0), 'Empty custom time must not borrow a global time');
  check(await page.locator('travel-form .daily-time-row[data-day="2"] .daily-start-time').getAttribute('aria-invalid') === 'true', 'Empty custom time must be highlighted');
  results.push('PASS cleared custom time stays invalid instead of falling back to global defaults');

  await page.evaluate(async () => { const { setLang } = await import('/src/utils/i18n.js'); setLang('ko'); });
  check(page.smokeErrors.length === 0, 'Unexpected page errors: ' + page.smokeErrors.join(', '));
  return { results, errors: page.smokeErrors };
}
