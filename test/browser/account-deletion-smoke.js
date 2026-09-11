// Run after refactor-smoke-setup.js, on a fresh fixture. Real guard + service + UI.
async (page) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const results=[];
  await page.evaluate(() => {
    const db=JSON.parse(sessionStorage.getItem('__smoke_db'));
    db.itineraries={deleteFixture:{userId:'smokeOwner',title:'삭제 보호 검증',itineraryPlan:{days:[]}}};
    sessionStorage.setItem('__smoke_db',JSON.stringify(db));
    window.navigate('/profile/security');
  });
  const before=await page.evaluate(()=>sessionStorage.getItem('__smoke_db'));
  const confirm=async()=>{
    await page.locator('profile-view #btn-delete-account-trigger').click();
    await page.locator('profile-view #btn-modal-confirm').click();
  };
  await page.evaluate(()=>{window.__smoke.loginCheckError=true;});
  await confirm();
  await page.waitForFunction(()=>!document.querySelector('profile-view').shadowRoot.getElementById('btn-modal-confirm').disabled);
  check(await page.evaluate(()=>sessionStorage.getItem('__smoke_db'))===before,'Token failure must preserve all stored data');
  check(page.url().endsWith('/profile/security'),'Token failure must not navigate');
  results.push('PASS token/network failure: zero deletes, retry enabled');

  await page.evaluate(()=>{window.__smoke.loginCheckError=false;window.__smoke.holdLoginCheck=true;});
  await confirm();
  await page.waitForFunction(()=>!!window.__smoke.finishLoginCheck);
  await page.locator('profile-view #btn-modal-cancel').click();
  await page.evaluate(()=>{window.__smoke.holdLoginCheck=false;window.__smoke.finishLoginCheck();});
  await page.waitForFunction(()=>!document.querySelector('profile-view').shadowRoot.getElementById('btn-modal-confirm').disabled);
  check(await page.evaluate(()=>sessionStorage.getItem('__smoke_db'))===before,'Cancellation before deletion must preserve data');
  results.push('PASS cancel during login check: late response cannot delete');

  await page.evaluate(()=>{window.__smoke.loginAgeMs=24*60*60*1000;window.__smoke.calls=[];});
  await confirm();
  await page.waitForURL('**/login?next=%2Fprofile%2Fsecurity');
  check(await page.evaluate(()=>sessionStorage.getItem('__smoke_db'))===before,'Stale login must preserve all data before sign-out');
  check(JSON.stringify(await page.evaluate(()=>window.__smoke.calls))===JSON.stringify(['check-login','logout']),'Stale login must not reach any delete stage');
  results.push('PASS day-old login: zero deletes, re-login return URL');

  await page.locator('login-view #email-input').fill('smoke@example.invalid');
  await page.locator('login-view #password-input').fill('incorrect');
  await page.locator('login-view #email-login-btn').click();
  await page.waitForFunction(()=>!document.querySelector('login-view').shadowRoot.getElementById('email-login-btn').disabled);
  check(await page.evaluate(()=>sessionStorage.getItem('__smoke_db'))===before,'Failed sign-in must preserve data');
  check(page.url().includes('/login?next='),'Failed sign-in must stay at login');
  results.push('PASS wrong password: data retained and no automatic deletion');

  await page.locator('login-view #password-input').fill('test-password');
  await page.locator('login-view #email-login-btn').click();
  await page.waitForURL('**/profile/security');
  await page.locator('profile-view #btn-delete-account-trigger').waitFor({state:'visible'});
  check(await page.evaluate(()=>sessionStorage.getItem('__smoke_db'))===before,'Successful sign-in must not automatically delete');
  check(!await page.locator('profile-view #delete-modal').evaluate(el=>el.classList.contains('show')),'Returning to settings must require new confirmation');
  results.push('PASS fresh login: returns to account settings, new confirmation required');

  await page.evaluate(()=>{window.__smoke.authError='TEST: auth unavailable';window.__smoke.loseDeletionResponse=true;});
  await confirm();
  await page.locator('profile-view #account-deletion-status').filter({hasText:'접수되어'}).waitFor({state:'visible'});
  check(page.url().endsWith('/profile/security'),'Pending server deletion must not claim completion or log out');
  check(await page.locator('profile-view #btn-delete-account-trigger').isDisabled(),'Accepted request must disable duplicate deletion');
  check((await page.evaluate(()=>window.__smoke.calls)).filter(c=>c==='server-request').length===1,'One server submission only');
  results.push('PASS lost response plus Auth outage: receipt reconciles pending, no false completion');
  await page.reload();
  await page.locator('profile-view #account-deletion-status').filter({hasText:'접수되어'}).waitFor({state:'visible'});
  check(!(await page.evaluate(()=>window.__smoke.calls)).includes('server-request'),'Reload must observe without resubmitting');
  results.push('PASS reload resumes status from persisted receipt without starting deletion');
  await page.evaluate(()=>window.__smoke.finishServerDeletion());
  await page.reload();
  await page.waitForURL('**/login');
  const db=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('__smoke_db')));
  check(!db.itineraries.deleteFixture&&!db.users.smokeOwner,'Fresh confirmed deletion must remove intended fixture data');
  check(await page.evaluate(()=>window.__smoke.user)===null,'Fresh confirmed deletion must finish auth deletion');
  results.push('PASS server completion: intended fixture data removed, then logout');
  check(page.smokeErrors.length===0,'Unexpected page errors: '+page.smokeErrors.join(','));
  return {results,errors:page.smokeErrors,externalServices:'all faked; no real account used'};
}
