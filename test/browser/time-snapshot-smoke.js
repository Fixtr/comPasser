// User-reported overlap and saved/share time mismatch; no external services.
async page => {
  await page.evaluate(()=>{
    const view=document.querySelector('itinerary-view');
    view.state.open({request:{date:['2026-10-20'],startTime:'09:00',endTime:'18:00',startLocation:'서울역',endLocation:'서울역'},days:[{day:1,date:'2026-10-20',scheduleItems:[
      {type:'departure',title:'서울역 출발 준비',location:'서울역',time:'07:51',endTime:'09:00'},
      {type:'attraction',title:'쇼핑',time:'09:08',endTime:'11:38'},
      {type:'dining',title:'식사1',time:'11:55',endTime:'12:25'},
      {type:'dining',title:'박물관 푸드코트',time:'12:46',endTime:'13:40'},
      {type:'AnchorSchedule',title:'박물관 예약',time:'12:54',endTime:'14:55',practicalInfo:{estimatedCost:'무료'}},
      {type:'leisure',title:'미확인 방문',time:'14:55',endTime:'15:25'},
      {type:'arrival',title:'서울역 복귀',location:'서울역',time:'18:00'}
    ]}]});
    window.navigate('/view'); view.renderCurrentState();
  });
  await page.locator('itinerary-view .schedule-title').filter({hasText:'박물관 푸드코트'}).waitFor({state:'visible'});
  await page.evaluate(()=>{
    const view=document.querySelector('itinerary-view');
    window.__measuredRoutes=[8,10,21,27].map((durationMinutes,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes}));
    const send=()=>window.dispatchEvent(new CustomEvent('transit-info-ready',{detail:{context:view._mapRequest,routes:window.__measuredRoutes}}));
    send(); send();
    const items=view.currentItinerary.days[0].scheduleItems;
    if(items[0].time!=='09:00'||items[0].endTime!=='') throw Error('Requested departure changed to preparation start');
    if(items[3].endTime!=='12:27'||items[4].time!=='12:54') throw Error('Measured morning block not repaired');
  });
  await page.waitForFunction(()=>document.querySelector('itinerary-view').shadowRoot.querySelectorAll('.time-badge')[3]?.textContent.includes('12:27'));
  if(await page.locator('itinerary-view #anchor-time-warning').isVisible()) throw Error('Resolved anchor conflict still shown');
  if(!(await page.locator('itinerary-view #cost-summary').textContent()).includes('비용 미확인')) throw Error('Missing costs shown as free');
  await page.locator('itinerary-view #save-itinerary-btn').click();
  await page.waitForURL('**/view/smoke1');
  await page.reload();
  await page.locator('itinerary-view .schedule-title').filter({hasText:'박물관 푸드코트'}).waitFor({state:'visible'});
  await page.evaluate(()=>{
    const view=document.querySelector('itinerary-view');
    const before=JSON.stringify(view.currentItinerary.days[0].scheduleItems.map(i=>[i.time,i.endTime]));
    window.dispatchEvent(new CustomEvent('transit-info-ready',{detail:{context:view._mapRequest,routes:[{fromIndex:0,toIndex:1,durationMinutes:180}]}}));
    if(before!==JSON.stringify(view.currentItinerary.days[0].scheduleItems.map(i=>[i.time,i.endTime]))) throw Error('Saved snapshot silently rescheduled');
    window.__savedTimes=before;
  });
  await page.locator('itinerary-view #share-itinerary-btn').click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(()=>!document.querySelector('itinerary-view').shadowRoot.getElementById('share-itinerary-btn').disabled);
  const sharedUrl=await page.evaluate(()=>navigator.clipboard.readText());
  const savedTimes=await page.evaluate(()=>window.__savedTimes);
  await page.goto(sharedUrl);
  await page.locator('itinerary-view .schedule-title').filter({hasText:'박물관 푸드코트'}).waitFor({state:'visible'});
  const sharedTimes=await page.evaluate(()=>JSON.stringify(document.querySelector('itinerary-view').currentItinerary.days[0].scheduleItems.map(i=>[i.time,i.endTime])));
  if(sharedTimes!==savedTimes) throw Error('Sharing/reopening changed schedule times');
  if(await page.locator('itinerary-view #recalculate-times-btn').isVisible()) throw Error('Shared snapshot exposes recalculation');
  await page.goto(page.smokeOrigin+'/view/smoke1');
  await page.locator('itinerary-view #recalculate-times-btn').click();
  if(!await page.evaluate(()=>document.querySelector('itinerary-view')._allowTimeAdjustment)) throw Error('Explicit recalculation did not unlock adjustment');
  return {results:['PASS partial measured fitting, unknown costs, saved/share times immutable, explicit recalculation'],errors:page.smokeErrors};
}
