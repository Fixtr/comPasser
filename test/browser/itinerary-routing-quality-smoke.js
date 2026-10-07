// Four-day replay of reported route/time problems; actual services run against isolated Maps fixtures.
async page => {
  await page.evaluate(() => {
    const p=n=>({placeId:`quality-${n}`,displayName:`P${n}`,formattedAddress:'서울',lat:37.5,lng:127+n*.02});
    const s=(n,type,time,endTime='')=>({title:`P${n}`,type,time,endTime,location:`P${n}`,selectedPlace:p(n)});
    const optional=(n,time,endTime)=>({...s(n,'attraction',time,endTime),selectedPlace:null,placeStatus:'verified',
      placeIntent:{purpose:'공원',category:'park',nearLocation:'P0'},verifiedPlace:{...p(n),source:'google_places'}});
    const view=document.querySelector('itinerary-view');
    const dates=['2026-10-07','2026-10-08','2026-10-09','2026-10-10'];
    view.state.open({request:{date:dates,startTime:'07:11',endTime:'17:11',startLocation:p(0),endLocation:p(8),
      overnightLocations:[p(4),p(4),p(4)],anchorSchedules:[
        {day:2,name:'P5',location:p(5),time:'09:00',endTime:'10:32'},
        {day:3,name:'P7',location:p(7),time:'07:56',endTime:'08:41',flexible:true,stayMinutes:45}
      ]},days:[
      {day:1,date:dates[0],scheduleItems:[s(0,'departure','07:11'),optional(3,'09:10','09:40'),
        optional(1,'09:50','10:20'),optional(2,'10:30','11:00'),s(4,'arrival','17:11')]},
      {day:2,date:dates[1],scheduleItems:[s(4,'departure','07:11'),s(5,'AnchorSchedule','09:00','10:32'),
        {...optional(6,'13:00','14:00'),type:'dining',placeIntent:{purpose:'점심',category:'restaurant',nearLocation:'P5'}},s(4,'arrival','17:11')]},
      {day:3,date:dates[2],scheduleItems:[s(4,'departure','07:11'),{...s(7,'AnchorSchedule','07:56','08:41'),flexible:true},s(4,'arrival','17:11')]},
      {day:4,date:dates[3],scheduleItems:[s(4,'departure','07:11'),
        {...s(7,'AnchorSchedule','09:10','09:40'),flexible:true},
        {...s(5,'AnchorSchedule','09:50','10:20'),flexible:true},
        {...s(6,'AnchorSchedule','10:30','11:00'),flexible:true},s(8,'arrival','17:11')]}
    ]});
    window.navigate('/view');view.renderCurrentState();
    window.__qualityMapRequests=[];
    window.addEventListener('render-map-route',event=>window.__qualityMapRequests.push(event.detail));
  });
  const send = values => page.evaluate(values => {
    const view=document.querySelector('itinerary-view');
    window.dispatchEvent(new CustomEvent('transit-info-ready',{detail:{context:view._mapRequest,
      routes:values.map((durationMinutes,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes,duration:`${durationMinutes}분`,mode:'TRANSIT'}))}}));
  },values);
  await page.locator('itinerary-view .schedule-title').filter({hasText:'P3'}).waitFor({state:'visible'});
  await send([30,30,30,30]);
  await page.waitForFunction(()=>document.querySelector('itinerary-view').currentItinerary.days[0].scheduleItems[1].title==='P1');
  await send([15,15,15,15]);
  if(JSON.stringify(await page.locator('itinerary-view .schedule-title').allTextContents())!==JSON.stringify(['P0','P1','P2','P3','P4'])) {
    await page.waitForFunction(()=>document.querySelector('itinerary-view').shadowRoot.querySelectorAll('.schedule-title')[1]?.textContent==='P1');
  }
  await page.getByRole('button',{name:'2일차 2026-10-08',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('itinerary-view').activeDayIndex===1);
  await send([30,10,30]);
  await send([30,10,30]);
  await page.waitForFunction(()=>document.querySelector('itinerary-view').shadowRoot.querySelectorAll('.time-badge')[2]?.textContent.includes('12:00'));
  await page.locator('itinerary-view .schedule-free-time').first().waitFor({state:'visible'});
  if(!(await page.locator('itinerary-view .schedule-free-time').first().textContent()).includes('자유 시간')) throw Error('Remaining gap is unexplained');
  await page.evaluate(()=>{
    const v=document.querySelector('itinerary-view');
    const items=v.currentItinerary.days[1].scheduleItems;
    if(items[1].time!=='09:00'||items[1].endTime!=='10:32') throw Error('Reservation moved');
    if(items[2].time!=='12:00'||items[2].endTime!=='13:00') throw Error('Lunch gap not compacted');
    const excluded=window.__qualityMapRequests.at(-1).plan.excludedPlaceIds;
    if(!excluded.includes('quality-7')) throw Error('Future-day must-visit not reserved against recommendations');
  });
  await page.getByRole('button',{name:'3일차 2026-10-09',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('itinerary-view').activeDayIndex===2);
  await send([48,30]);
  await send([48,30]);
  await page.waitForFunction(()=>document.querySelector('itinerary-view').shadowRoot.querySelectorAll('.time-badge')[1]?.textContent.includes('07:59'));
  if(await page.locator('itinerary-view #anchor-time-warning').isVisible()) throw Error('Flexible visit still reports a fixed-time conflict');
  await page.getByRole('button',{name:'4일차 2026-10-10',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('itinerary-view').activeDayIndex===3);
  await send([30,30,30,30]);
  await page.waitForFunction(()=>document.querySelector('itinerary-view').currentItinerary.days[3].scheduleItems[1].title==='P5');
  await send([15,15,15,15]);
  await page.evaluate(()=>{
    const items=document.querySelector('itinerary-view').currentItinerary.days[3].scheduleItems;
    if(items.slice(1,4).map(item=>item.title).join()!=='P5,P6,P7'||items.slice(1,4).some(item=>item.flexible!==true))
      throw Error('Required visits did not retain their improved route');
  });
  await page.getByRole('button',{name:'3일차 2026-10-09',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('itinerary-view').shadowRoot.getElementById('timeline-container')).opacity)===1);
  for (const toast of await page.locator('#app-toast-container .app-toast').all()) await toast.click();
  await page.waitForFunction(()=>!document.querySelector('#app-toast-container .app-toast'));
  await page.locator('itinerary-view .schedule-card').nth(1).scrollIntoViewIfNeeded();
  await page.screenshot({path:page.smokeOutputDir+'/routing-quality-mobile.png',fullPage:true});
  await page.locator('itinerary-view #save-itinerary-btn').click();
  await page.waitForURL('**/view/smoke1');await page.reload();
  await page.getByRole('button',{name:'3일차 2026-10-09',exact:true}).click();
  await page.locator('itinerary-view .time-badge').filter({hasText:'07:59'}).waitFor({state:'visible'});
  const before=await page.evaluate(()=>JSON.stringify(document.querySelector('itinerary-view').currentItinerary.days));
  await send([90,30]);
  const after=await page.evaluate(()=>JSON.stringify(document.querySelector('itinerary-view').currentItinerary.days));
  if(before!==after) throw Error('Saved snapshot changed on read');
  await page.getByRole('button',{name:'4일차 2026-10-10',exact:true}).click();
  await page.locator('itinerary-view .schedule-title').filter({hasText:'P8'}).waitFor({state:'visible'});
  await page.evaluate(async () => {
    const {createFlexibleVisitChecks} = await import('/src/domains/planner/services/flexible-visit-checks.js');
    const checks = createFlexibleVisitChecks();
    if (await checks.travelMinutes({lat:37.5,lng:127},{lat:37.5,lng:127.02},'2026-10-07','09:00') !== 15)
      throw Error('Legacy coordinate route was not measured');
    const view = document.querySelector('itinerary-view');
    for (const durations of [[10,20,10],[10,10,50]]) {
      const items = [
        {type:'departure',title:'출발',time:'09:00'},
        {type:'attraction',title:'후보',time:'09:10',endTime:'09:20'},
        {type:'AnchorSchedule',title:'예약',time:'09:30',endTime:'10:00'},
        {type:'arrival',title:'도착',time:'10:10'}
      ];
      view.state.open({request:{date:['2026-10-07'],startTime:'09:00',endTime:'10:30'},
        days:[{day:1,date:'2026-10-07',scheduleItems:items}]});
      const original = items.map(item => ({...item,title:item.type === 'attraction' ? '기존' : item.title}));
      view._routeOrderOriginal = {items:original,beforeMinutes:100};
      const routes = durations.map((durationMinutes,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes}));
      if (!view.verifyRouteImprovement(routes) || view.currentItinerary.days[0].scheduleItems[1].title !== '기존')
        throw Error('Faster route with a reservation/end-time conflict was not rolled back');
    }
  });
  return {results:['PASS measured reorder, noon meal, explicit free time, flexible required visit, day identity exclusions, save/reload immutability'],errors:page.smokeErrors};
}
