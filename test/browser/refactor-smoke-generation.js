// Run after refactor-smoke-setup.js using the same Playwright page.
async (page) => {
  page.smokeResults = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.evaluate(() => window.navigate('/plan'));
  await page.locator('#travel-form-view').waitFor({state:'visible'});
  await page.locator('travel-form #generation-credit-balance').filter({hasText:'3장'}).waitFor();
  page.smokePlan = {
    days: [{ day:1, date:'2026-10-20', scheduleItems:[
      {type:'departure',title:'서울역',location:'서울역',time:'09:00',endTime:'09:00'},
      {type:'attraction',title:'경복궁',location:'경복궁',time:'09:30',endTime:'11:00',description:'궁궐 산책'},
      {type:'dining',title:'점심',location:'광화문',time:'11:30',endTime:'12:30'},
      {type:'arrival',title:'서울역',location:'서울역',time:'18:00',endTime:'18:00'},
    ]}],
  };
  const submit = async () => {
    await page.locator('travel-form #start-time').fill('09:00');
    await page.locator('travel-form #end-time').fill('18:00');
    await page.locator('travel-form #start-location input').fill('서울역');
    await page.locator('travel-form #end-location input').fill('서울역');
    await page.locator('travel-form .primary-btn').click();
    await page.locator('#loading-transition-view').waitFor({state:'visible'});
  };
  await submit();
  check(await page.locator('travel-form .primary-btn').isDisabled(), 'Submit should stay locked during generation');
  await page.evaluate(() => window.__smoke.setUser(window.__smoke.user));
  check(await page.locator('#loading-transition-view').isVisible(), 'Auth reevaluation must preserve loading');
  page.smokeResults.push('PASS generation loading/button lock/same-user auth reevaluation');

  await page.evaluate(() => window.navigate('/profile/personal'));
  await page.locator('#page-profile').waitFor({state:'visible'});
  check(!await page.locator('travel-form .primary-btn').isDisabled(), 'Leaving route must release submit');
  await page.goBack();
  await page.locator('#travel-form-view').waitFor({state:'visible'});
  await page.evaluate(plan => window.__smoke.pending.shift().resolve(plan), page.smokePlan);
  check(await page.locator('#travel-form-view').isVisible(), 'Old result must not restore result view');
  await page.locator('travel-form #generation-credit-balance').filter({hasText:'2장'}).waitFor();
  check(await page.evaluate(() => !document.querySelector('itinerary-view').currentItinerary), 'Old result must not be applied');
  page.smokeResults.push('PASS route exit/back/late AI result ignored');

  await submit();
  await page.evaluate(() => window.__smoke.pending.shift().reject(new Error('TEST: 429 temporary failure')));
  await page.locator('#show-results-btn').waitFor({state:'visible'});
  check((await page.locator('#loading-subtext').textContent()).includes('429'), 'Error must be displayed');
  await page.locator('#show-results-btn').click();
  await page.locator('#travel-form-view').waitFor({state:'visible'});
  check((await page.locator('travel-form #generation-credit-balance').textContent())==='2장', 'Failed generation must keep the credit');
  check(!await page.locator('travel-form .primary-btn').isDisabled(), 'Retry form must unlock');
  page.smokeResults.push('PASS generation failure/error display/back/retry enabled');

  await submit();
  await page.evaluate(plan => window.__smoke.pending.shift().resolve(plan), page.smokePlan);
  await page.locator('#show-results-btn').waitFor({state:'visible'});
  await page.waitForFunction(() => document.querySelector('travel-form')?.shadowRoot
    ?.getElementById('generation-credit-balance')?.textContent === '1장');
  check(page.url().endsWith('/plan'), 'Success must wait for user');
  await page.evaluate(() => window.__smoke.setUser(window.__smoke.user));
  check(await page.locator('#show-results-btn').isVisible(), 'Auth reevaluation must preserve success');
  await page.locator('#show-results-btn').click();
  await page.waitForURL('**/view');
  await page.locator('itinerary-view #results').waitFor({state:'visible'});
  // The real timeline intentionally fades in after a 150 ms timer.
  await page.locator('itinerary-view .schedule-title').filter({hasText:'경복궁'}).waitFor({state:'visible'});
  check(page.smokeErrors.length===0, 'Unexpected page error: '+page.smokeErrors.join(','));
  page.smokeResults.push('PASS generation success/user continuation/real itinerary rendering');
  return {results:page.smokeResults, errors:page.smokeErrors};
}
