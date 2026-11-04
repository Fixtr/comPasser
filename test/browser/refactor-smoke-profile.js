// Run after refactor-smoke-itinerary.js. No real account or document is modified.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.evaluate(() => {
    window.__smoke.setUser({uid:'smokeOwner',displayName:'검증 계정',email:'smoke@example.invalid',emailVerified:true,providerData:[]});
    window.navigate('/profile/personal');
  });
  const birthdayEdit = page.locator('profile-view #field-birthday .btn-edit-inline');
  await birthdayEdit.waitFor({state:'visible'});
  await page.locator('profile-view #generation-credit-balance').filter({hasText:'1장'}).waitFor();
  await birthdayEdit.click();
  await page.locator('profile-view #input-birthday').fill('1995-05-20');
  await page.locator('profile-view #field-birthday .btn-save').click();
  await page.locator('profile-view #input-birthday').waitFor({state:'detached'});
  await page.reload();
  await page.locator('profile-view #field-birthday .value-text').filter({hasText:'1995-05-20'}).waitFor({state:'visible'});
  await page.locator('profile-view #generation-credit-balance').filter({hasText:'1장'}).waitFor();
  page.smokeResults.push('PASS real profile edit/save/reload display');

  await birthdayEdit.click();
  await page.locator('profile-view #input-birthday').fill('1999-09-09');
  await page.evaluate(() => {window.__smoke.dbError='write';});
  await page.locator('profile-view #field-birthday .btn-save').click();
  await page.getByText('저장에 실패했습니다.',{exact:true}).waitFor({state:'visible'});
  check(await page.locator('profile-view #input-birthday').inputValue()==='1999-09-09', 'Failed save must keep input');
  check(await page.evaluate(() => JSON.parse(sessionStorage.getItem('__smoke_db')).users.smokeOwner.birthday)==='1995-05-20', 'Failed save must keep old persisted value');
  await page.evaluate(() => {window.__smoke.dbError=null;});
  await page.locator('profile-view #field-birthday .btn-cancel').click();
  page.smokeResults.push('PASS profile save failure/message/input preservation');

  check(await page.locator('profile-view #field-phoneNumber').count()===0, 'Retired phone field must not be displayed');
  check(await page.locator('profile-view .verified-badge').count()===0, 'Retired verification badge must not be displayed');
  check(await page.evaluate(() => JSON.parse(sessionStorage.getItem('__smoke_db')).users.smokeOwner.phoneNumber)==='01000000000', 'Legacy phone data must not be deleted');
  page.smokeResults.push('PASS retired phone/verification UI with legacy data retained');

  await page.getByRole('button',{name:'내 여행 일정',exact:true}).click();
  await page.locator('profile-view .trip-card').waitFor({state:'visible'});
  await page.locator('profile-view .btn-view').click();
  await page.waitForURL('**/view/smoke1');
  await page.locator('itinerary-view .schedule-title').filter({hasText:'경복궁'}).waitFor({state:'visible'});
  page.smokeResults.push('PASS profile saved-list/view action/private itinerary');

  await page.setViewportSize({width:390,height:844});
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1), 'Mobile result must not overflow horizontally');
  await page.locator('itinerary-view #share-itinerary-btn').click();
  await page.locator('#app-confirm-host .confirm-cancel').click();
  if (page.smokeOutputDir) await page.screenshot({path:page.smokeOutputDir + '/mobile-itinerary.png'});
  await page.evaluate(() => window.navigate('/profile/personal'));
  await birthdayEdit.waitFor({state:'visible'});
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1), 'Mobile profile must not overflow horizontally');
  await birthdayEdit.click();
  await page.locator('profile-view #input-birthday').fill('1996-06-21');
  await page.locator('profile-view #field-birthday .btn-save').click();
  await page.locator('profile-view #input-birthday').waitFor({state:'detached'});
  if (page.smokeOutputDir) await page.screenshot({path:page.smokeOutputDir + '/mobile-profile.png'});
  page.smokeResults.push('PASS 390px viewport/share dialog/profile edit/no horizontal overflow');

  await page.getByRole('button',{name:'보안 및 계정',exact:true}).click();
  await page.waitForURL('**/profile/security');
  // /profile/security is its own Ionic page; the personal page's profile-view stays in the DOM, hidden.
  const security = selector => page.locator('profile-view '+selector+':visible');
  await security('#btn-delete-account-trigger').click();
  await security('#btn-modal-cancel').click();
  check(await page.evaluate(() => !!JSON.parse(sessionStorage.getItem('__smoke_db')).users.smokeOwner), 'Cancelled deletion must preserve profile');
  page.smokeResults.push('PASS account deletion confirmation/cancel');


  await page.evaluate(() => {window.__smoke.dbError='delete';});
  await security('#btn-delete-account-trigger').click();
  await security('#btn-modal-confirm').click();
  await security('#account-deletion-status').filter({hasText:'접수되어'}).waitFor({state:'visible'});
  check(await security('#btn-delete-account-trigger').isDisabled(), 'Accepted deletion must remain locked');
  check(await page.evaluate(() => !!JSON.parse(sessionStorage.getItem('__smoke_db')).users.smokeOwner), 'Server failure retains unprocessed profile');
  check(await page.evaluate(() => window.__smoke.user?.uid)==='smokeOwner', 'Pending job must not claim completion');
  await page.reload();
  await security('#account-deletion-status').filter({hasText:'접수되어'}).waitFor({state:'visible'});
  check(!(await page.evaluate(() => window.__smoke.calls)).includes('server-request'), 'Reload must not resubmit deletion');
  page.smokeResults.push('PASS server deletion outage/pending/duplicate guard/reload receipt recovery');
  await page.evaluate(() => window.__smoke.finishServerDeletion());
  await page.reload();
  await page.waitForURL('**/account-deletion-status');
  await page.locator('account-deletion-status-view #statuses').filter({hasText:'완료'}).waitFor({state:'visible'});
  check(await page.evaluate(() => !JSON.parse(sessionStorage.getItem('__smoke_db')).users.smokeOwner), 'Server completion removes profile');
  page.smokeResults.push('PASS server retry completes before client logout');
  check(page.smokeErrors.length===0, 'Unexpected page errors: '+page.smokeErrors.join(','));
  return {results:page.smokeResults, errors:page.smokeErrors};
}
