// Run after refactor-smoke-profile.js. Regressions fail; unresolved findings are recorded separately.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  page.smokeFindings = [];
  await page.evaluate(() => {
    window.__smoke.authError=null;
    window.__smoke.setUser({uid:'smokeCopyOwner',displayName:'복사 검증 계정',email:'copy@example.invalid',emailVerified:true,providerData:[]});
    window.navigate('/share/smoke1');
  });
  await page.locator('itinerary-view #shared-notice').waitFor({state:'visible'});
  await page.locator('itinerary-view #save-itinerary-btn').click();
  await page.waitForURL('**/view/smoke1');
  await page.locator('itinerary-view .item-edit-btn').first().waitFor({state:'visible'});
  check(await page.evaluate(() => {
    const db=JSON.parse(sessionStorage.getItem('__smoke_db'));
    return db.itineraries.smoke1.userId==='smokeCopyOwner' && !!db.shared_itineraries.smoke1;
  }), 'Copy must be private and original public document must remain');
  page.smokeResults.push('PASS authenticated shared-copy/private ownership/edit controls/original preserved');

  await page.evaluate(() => {
    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
    Object.defineProperty(navigator,'share',{configurable:true,value:()=>new Promise((_resolve,reject)=>{window.__smoke.shareFinish=()=>reject(new DOMException('Cancelled','AbortError'));})});
  });
  await page.locator('itinerary-view #download-image-btn').click();
  await page.waitForFunction(() => typeof window.__smoke.shareFinish==='function');
  const label=await page.locator('itinerary-view #download-image-btn').textContent();
  if(label==='generatingImage') page.smokeFindings.push({id:'F3',severity:'low',issue:'Image export displays untranslated generatingImage key'});
  await page.evaluate(() => window.navigate('/profile/personal'));
  await page.locator('#page-profile').waitFor({state:'visible'});
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-route-theme'));
  await page.evaluate(() => window.__smoke.shareFinish());
  await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.getElementById('download-image-btn').disabled);
  const after = await page.evaluate(() => document.documentElement.getAttribute('data-route-theme'));
  check(before===after, 'Finishing export must not restore the previous route theme over profile');
  page.smokeResults.push('PASS F2 delayed image share cancellation preserves the destination route theme');
  // Restore test route through the app router, not by changing production code.
  await page.evaluate(() => window.navigate('/profile/security'));
  await page.locator('profile-view #btn-delete-account-trigger').click();
  await page.locator('profile-view #btn-modal-confirm').click();
  await page.waitForURL('**/login');
  check(await page.evaluate(() => window.__smoke.user)===null, 'Successful fake deletion must return to login');
  check(await page.evaluate(() => !JSON.parse(sessionStorage.getItem('__smoke_db')).itineraries.smoke1), 'Successful fake deletion must remove private itinerary');
  page.smokeResults.push('PASS successful fake account deletion/login navigation');
  // Server retry semantics are covered by account-deletion-smoke.js. F3 remains separate work.
  return {results:page.smokeResults,findings:page.smokeFindings,errors:page.smokeErrors};
}
