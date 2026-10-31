async page => {
  await page.evaluate(()=>{
    const view=document.querySelector('itinerary-view');
    view.state.open({days:[{day:1,date:'2026-09-17',scheduleItems:[{title:'First stop',type:'attraction',time:'09:00',endTime:'10:00',location:'서울'}]}]});
    window.navigate('/view');view.renderCurrentState();
  });
  const title=page.locator('itinerary-view .schedule-title').filter({hasText:'First stop'});
  await title.waitFor({state:'visible'});
  const share=page.locator('itinerary-view #share-itinerary-btn');
  await share.click();
  const message=await page.locator('#app-confirm-host .confirm-message').textContent();
  if(!message.includes('내 일정에 저장')||!message.includes('로그인 없이')) throw Error('Confirm must name the save and the public link: '+message);
  await page.locator('#app-confirm-host .confirm-cancel').click();
  await page.waitForFunction(()=>!document.querySelector('itinerary-view').shadowRoot.getElementById('share-itinerary-btn').disabled);
  if(page.url().match(/\/view\/\w+/)) throw Error('Cancel must not save');
  await share.click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForURL('**/view/smoke1');
  await page.waitForFunction(async()=>(await navigator.clipboard.readText()).includes('/share/'));
  const link=await page.evaluate(()=>navigator.clipboard.readText());
  if(await page.locator('#app-confirm-host .confirm-ok').count()) throw Error('Asked twice');
  await page.goto(link);
  await title.waitFor({state:'visible'});
  return {errors:page.smokeErrors};
}
