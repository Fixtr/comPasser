// Run after refactor-smoke-setup.js. Real login/verify UI, fake Firebase Auth.
async (page) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const login=page.locator('login-view');
  const error=login.locator('#error-msg');
  const toast=page.locator('#app-toast-container .app-toast');
  const calls=()=>page.evaluate(()=>window.__smoke.calls);
  const forgot=async()=>{
    await page.evaluate(()=>{window.__smoke.calls=[];document.getElementById('app-toast-container')?.replaceChildren();});
    await login.locator('#forgot-password').click();
  };
  await page.evaluate(()=>{window.__smoke.setUser(null);window.navigate('/login?next=%2Fprofile%2Fsecurity');});
  await login.locator('#forgot-password').waitFor({state:'visible'});
  check(await login.locator('#forgot-password').textContent()==='비밀번호를 잊으셨나요?','Login must offer a password reset');
  check(await error.getAttribute('role')==='alert','Reset failures must be announced to screen readers');

  for(const email of ['','not-an-email']){
    await login.locator('#email-input').fill(email);
    await forgot();
    await error.filter({hasText:'비밀번호를 재설정할 이메일 주소를 입력해주세요.'}).waitFor({state:'visible'});
    check((await calls()).length===0,`"${email}" must not send a reset email`);
  }

  await login.locator('#email-input').fill('smoke@example.invalid');
  await forgot();
  await toast.filter({hasText:'계정이 있다면 smoke@example.invalid 주소로 비밀번호 재설정 메일을 보냈습니다.'}).waitFor({state:'visible'});
  check(JSON.stringify(await calls())==='["send-reset:smoke@example.invalid|/profile/security|ko"]','The reset email must go to the typed address, keep the return path and use the app language');
  check(!await error.isVisible(),'A sent reset must clear the old error');

  // A double tap on a slow connection must not send two mails.
  await page.evaluate(()=>{window.__smoke.calls=[];window.__smoke.resetDelay=300;});
  await login.locator('#forgot-password').dblclick();
  await toast.filter({hasText:'계정이 있다면'}).first().waitFor({state:'visible'});
  check((await calls()).length===1,'A double tap must send one reset email');
  await page.evaluate(()=>{window.__smoke.resetDelay=0;});

  await page.evaluate(()=>{window.__smoke.resetError='auth/user-not-found';});
  await forgot();
  await toast.filter({hasText:'계정이 있다면'}).waitFor({state:'visible'});
  check(!await error.isVisible(),'An unknown address must look the same as a known one');

  for(const [code,message] of [['auth/too-many-requests','요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'],
    ['auth/network-request-failed','메일을 보내지 못했습니다. 연결을 확인하고 다시 시도해주세요.']]){
    await page.evaluate(code=>{window.__smoke.resetError=code;},code);
    await forgot();
    await error.filter({hasText:message}).waitFor({state:'visible'});
    check(await toast.count()===0,`${code} must not claim the mail was sent`);
  }
  await page.evaluate(()=>{window.__smoke.resetError='';});

  // Firebase sends the reset link to the project's action URL, which is this app's /verify.
  const verify=page.locator('verify-view');
  await page.evaluate(()=>{window.__smoke.calls=[];window.navigate('/verify?mode=resetPassword&oobCode=smoke-code');});
  await verify.locator('#reset-form').waitFor({state:'visible'});
  check(await verify.locator('#title-text').textContent()==='새 비밀번호 설정','The reset link must open the new-password form');
  await verify.locator('#new-password-input').fill('short');
  await verify.locator('#reset-btn').click();
  await verify.locator('#error-msg').filter({hasText:'비밀번호는 6자 이상이어야 합니다.'}).waitFor({state:'visible'});
  check(await verify.locator('#error-msg').getAttribute('role')==='alert','Reset form errors must be announced');
  check((await calls()).length===0,'A short password must not reach Firebase');

  await page.evaluate(()=>{window.__smoke.resetError='auth/expired-action-code';});
  await verify.locator('#new-password-input').fill('new-password-1');
  await verify.locator('#reset-btn').click();
  await verify.locator('#error-msg').filter({hasText:'링크가 만료되었거나 이미 사용되었습니다.'}).waitFor({state:'visible'});

  await page.evaluate(()=>{window.__smoke.resetError='';window.__smoke.calls=[];});
  await verify.locator('#new-password-input').fill('new-password-1');
  await verify.locator('#reset-btn').click();
  await verify.locator('#title-text').filter({hasText:'비밀번호를 변경했습니다'}).waitFor({state:'visible'});
  check(JSON.stringify(await calls())==='["confirm-reset:smoke-code:new-password-1"]','The new password must be confirmed with the link code');
  check(!await verify.locator('#reset-form').isVisible(),'The form must close after the password changes');
  check(page.smokeErrors.length===0,'Unexpected page errors: '+page.smokeErrors.join(','));
  return {errors:page.smokeErrors,findings:[]};
}
