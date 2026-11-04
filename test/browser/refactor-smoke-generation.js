// Run after refactor-smoke-setup.js using the same Playwright page.
async (page) => {
  page.smokeResults = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  // One planner page; the form stays in the DOM, hidden, while generation runs.
  const form = page.locator('travel-form');
  const loading = page.locator('.ionic-generation:visible');
  await page.evaluate(() => window.navigate('/plan'));
  await form.locator('#start-location input').waitFor({state:'visible'});
  await form.locator('#generation-credit-balance').filter({hasText:'3장'}).waitFor();
  page.smokePlan = {
    days: [{ day:1, date:'2026-10-20', scheduleItems:[
      {type:'departure',title:'서울역',location:'서울역',time:'09:00',endTime:'09:00'},
      {type:'attraction',title:'경복궁',location:'경복궁',time:'09:30',endTime:'11:00',description:'궁궐 산책'},
      {type:'dining',title:'점심',location:'광화문',time:'11:30',endTime:'12:30'},
      {type:'arrival',title:'서울역',location:'서울역',time:'18:00',endTime:'18:00'},
    ]}],
  };
  await form.locator('#start-time').fill('09:00');
  await form.locator('#end-time').fill('18:00');
  // The Ionic planner only accepts places picked from the search; the faked autocomplete has no list, so pick through its event.
  await form.evaluate(async element => {
    for (const selector of ['#start-location', '#end-location']) {
      const control = element.shadowRoot.querySelector(selector);
      control.dispatchEvent(Object.assign(new Event('gmp-select'), {placePrediction:{toPlace:() => ({
        id:'seoul-station', displayName:'서울역', formattedAddress:'서울특별시 중구 한강대로 405', location:{lat:() => 37.5547, lng:() => 126.9707}, fetchFields:async () => {},
      })}}));
      await control.placeSelectionPending;
    }
  });
  await form.locator('.primary-btn').click();
  const generate = form.locator('#final-generate');
  // The review shows its own copy of the balance; the form's copy is hidden behind it.
  const reviewCredits = form.locator('#review-panel .credit-balance strong');
  const submit = async () => {
    await generate.click();
    await loading.filter({hasText:'여행 동선을 만들고 있습니다'}).waitFor({state:'visible'});
  };
  await submit();
  check(await form.locator('.primary-btn').isDisabled(), 'Submit should stay locked during generation');
  check(await generate.isDisabled(), 'Review generate should stay locked during generation');
  await page.evaluate(() => window.__smoke.setUser(window.__smoke.user));
  check(await loading.isVisible(), 'Auth reevaluation must preserve loading');
  page.smokeResults.push('PASS generation loading/button lock/same-user auth reevaluation');

  // Leaving during generation asks to stop it; stopping keeps the inputs on /plan and ignores the late result.
  await page.evaluate(() => window.navigate('/profile/personal'));
  await page.locator('[role="alertdialog"]').filter({hasText:'일정 만들기를 멈출까요?'}).waitFor({state:'visible'});
  await page.locator('[role="alertdialog"] .confirm-ok').click();
  await generate.waitFor({state:'visible'});
  check(page.url().endsWith('/plan?review=1') || page.url().endsWith('/plan'), 'Stopping must stay on the planner');
  check(!await generate.isDisabled(), 'Stopping must release submit');
  await page.evaluate(plan => window.__smoke.pending.shift().resolve(plan), page.smokePlan);
  await reviewCredits.filter({hasText:'2장'}).waitFor();
  check(await generate.isVisible() && !await loading.count(), 'Old result must not restore result view');
  check(await page.evaluate(() => !document.querySelector('itinerary-view')?.currentItinerary) && !page.url().includes('/view'), 'Old result must not be applied');
  page.smokeResults.push('PASS stop on route exit/late AI result ignored');

  await submit();
  await page.evaluate(() => window.__smoke.pending.shift().reject(new Error('TEST: 429 temporary failure')));
  const failed = page.locator('.ionic-generation:visible').filter({hasText:'일정을 만들지 못했습니다'});
  await failed.waitFor({state:'visible'});
  check((await failed.getByRole('alert').textContent()).includes('429'), 'Error must be displayed');
  await failed.getByRole('button', {name:'입력으로 돌아가기'}).click();
  await generate.waitFor({state:'visible'});
  await reviewCredits.filter({hasText:'2장'}).waitFor();
  check((await reviewCredits.textContent())==='2장', 'Failed generation must keep the credit');
  check(!await generate.isDisabled(), 'Retry form must unlock');
  page.smokeResults.push('PASS generation failure/error display/back/retry enabled');

  await submit();
  await page.evaluate(plan => window.__smoke.pending.shift().resolve(plan), page.smokePlan);
  // Ionic hands a successful result straight to /view.
  await page.waitForURL('**/view');
  await page.locator('itinerary-view #results').waitFor({state:'visible'});
  // The real timeline intentionally fades in after a 150 ms timer.
  await page.locator('itinerary-view .schedule-title').filter({hasText:'경복궁'}).waitFor({state:'visible'});
  await page.evaluate(() => window.__smoke.setUser(window.__smoke.user));
  check(await page.locator('itinerary-view .schedule-title').filter({hasText:'경복궁'}).isVisible() && page.url().endsWith('/view'), 'Auth reevaluation must preserve success');
  check(page.smokeErrors.length===0, 'Unexpected page error: '+page.smokeErrors.join(','));
  page.smokeResults.push('PASS generation success/result handoff/real itinerary rendering');
  return {results:page.smokeResults, errors:page.smokeErrors};
}
