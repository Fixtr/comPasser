async page=>{
  await page.evaluate(async()=>{
    await window.__smoke.openPlan({request:{startTime:'09:00',endTime:'18:00'},days:[{day:1,date:'2026-09-17',scheduleItems:[
      {type:'departure',time:'09:00',title:'출발'},
      {type:'dining',time:'10:54',endTime:'11:24',title:'식당'},
      {type:'attraction',time:'11:45',endTime:'12:27',title:'관람'},
      {type:'AnchorSchedule',time:'12:54',endTime:'14:55',title:'고정 일정'},
      {type:'arrival',time:'18:00',title:'도착'}]}]});
  });
  await page.locator('itinerary-view .visit-time-btn').first().click();
  await page.locator('itinerary-view .visit-time-editor').getByRole('button',{name:'취소',exact:true}).click();
  if(await page.locator('itinerary-view .visit-time-editor').count()) throw Error('Cancel did not close');
  if(await page.locator('itinerary-view .visit-time-btn').count()!==2) throw Error('Fixed time editable');
  await page.locator('itinerary-view .visit-time-btn').first().click();
  await page.locator('itinerary-view .visit-time-editor').getByLabel('방문 시작').fill('11:00');
  await page.locator('itinerary-view .visit-time-editor').getByLabel('방문 종료').fill('13:30');
  await page.locator('itinerary-view .visit-time-editor button[type=submit]').click();
  if(!(await page.locator('itinerary-view .visit-time-editor [role=alert]').textContent()).includes('09:00~12:54')) throw Error('Invalid boundary allowed or range not named');
  await page.locator('itinerary-view .visit-time-editor').getByLabel('방문 종료').fill('11:30');
  await page.locator('itinerary-view .visit-time-editor button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('itinerary-view').currentItinerary.days[0].scheduleItems[1].time==='11:00');
  await page.evaluate(()=>{
    const v=document.querySelector('itinerary-view');
    window.dispatchEvent(new CustomEvent('transit-info-ready',{detail:{context:v._mapRequest,routes:[10,21,27,10].map((durationMinutes,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes}))}}));
    const items=v.currentItinerary.days[0].scheduleItems;
    if(items[1].time!=='11:00'||items[2].endTime!=='12:27'||items[3].time!=='12:54') throw Error('Time fit lost edit/anchor');
  });
  await page.locator('itinerary-view #save-itinerary-btn').click();await page.waitForURL('**/view/smoke1');await page.reload();
  await page.waitForFunction(()=>document.querySelector('itinerary-view')?.currentItinerary?.days?.[0]?.scheduleItems?.[1]?.visitNotBefore==='11:00');
  await page.locator('itinerary-view #share-itinerary-btn').click();await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(()=>!document.querySelector('itinerary-view').shadowRoot.getElementById('share-itinerary-btn').disabled);
  await page.goto(await page.evaluate(()=>navigator.clipboard.readText()));
  await page.locator('itinerary-view .schedule-title').filter({hasText:'식당'}).waitFor({state:'visible'});
  if(await page.locator('itinerary-view .visit-time-btn').count()) throw Error('Shared time editable');
  return {errors:page.smokeErrors};
}
