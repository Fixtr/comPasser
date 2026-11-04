// Replay the real 07:11 departure, 09:00 palace opening and four-day hotel/airport boundaries.
async page => {
  await page.evaluate(async () => {
    const p = id => ({placeId:id,displayName:id,formattedAddress:'서울',lat:37.5+((['station','JW Seoul','airport','booking','palace'].indexOf(id)+1)||6+Number(id.split('-')[1]))*.001,lng:127});
    const s = (id,type,time,endTime='') => ({title:id,type,time,endTime,location:id,selectedPlace:p(id)});
    const hours = {utcOffsetMinutes:540,regularOpeningHours:{periods:Array.from({length:7},(_,day)=>({open:{day,hour:9,minute:0},close:{day,hour:18,minute:0}}))}};
    window.__hoursDelay = 100;
    window.__hoursFixtures = {palace:hours};
    window.__namedPlacesFixtures = {palace:{...p('palace'),id:'palace',location:{lat:p('palace').lat,lng:127}}};
    window.__placesFixtures = Array.from({length:8},(_,index)=>{
      const id = `extra-${index}`;window.__hoursFixtures[id]=hours;
      return {...p(id),id,location:{lat:p(id).lat,lng:127},types:['tourist_attraction'],businessStatus:'OPERATIONAL',
        addressComponents:[{types:['country'],shortText:'KR'}]};
    });
    const dates=['2026-10-09','2026-10-10','2026-10-11','2026-10-12'];
    await window.__smoke.openPlan({request:{date:dates,startTime:'07:11',endTime:'17:11',startLocation:p('station'),endLocation:p('airport'),
      overnightLocations:[p('JW Seoul'),p('JW Seoul'),p('JW Seoul')]},days:dates.map((date,index)=>({day:index+1,date,
      scheduleItems:[s(index===0?'station':'JW Seoul','departure','07:11'),
        ...(index===0?[{...s('palace','AnchorSchedule','09:30','10:30'),selectedPlace:null,flexible:true}]:[]),
        ...(index===2?[s('booking','AnchorSchedule','12:00','13:00')]:[]),s(index===3?'airport':'JW Seoul','arrival','17:11')]}))});
  });
  // Generation verifies every day without opening its tab.
  await page.evaluate(async()=>{
    const {verifyGeneratedItinerary}=await import('/src/domains/planner/services/generated-day-quality.js');
    const view=document.querySelector('itinerary-view');
    const stages=[];
    const plan=await verifyGeneratedItinerary(view.currentItinerary,{onStage:stage=>stages.push(stage)});
    if(stages.join()!=='places,routes') throw Error('Generation did not report its places and routes stages');
    if(plan.days.some(day=>!day.scheduleItems.some(i=>i.gapFill))) throw Error('An unopened generated day was not verified');
    if(plan.days[0].scheduleItems.find(i=>i.title==='palace').time!=='09:00') throw Error('Generation ignored palace opening');
    view.state.open(plan);view.renderCurrentState();
  });
  const settle = async index => {
    await page.evaluate(index=>document.querySelector('itinerary-view').selectDay(index),index);
    for(let pass=0;pass<8;pass++) {
      const stable=await page.evaluate(async()=>{
        const view=document.querySelector('itinerary-view'),context=view._mapRequest;
        const items=view.currentItinerary.days[view.activeDayIndex].scheduleItems;
        const place= id=>({placeId:id,displayName:id,formattedAddress:'서울',lat:37.5,lng:127});
        const places=items.map((item,index)=>({index,name:item.title,address:'서울',coordinates:{lat:37.5,lng:127},
          resolvedPlace:item.selectedPlace||item.verifiedPlace||place(item.title),...(item.verifiedPlace?{verifiedPlace:item.verifiedPlace}:{})}));
        window.dispatchEvent(new CustomEvent('places-resolved',{detail:{context,places}}));
        const routes=items.slice(1).map((_,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes:15,duration:'15분'}));
        await view._transitInfoHandler({detail:{context,routes}});
        return view._mapRequest===context;
      });
      if(stable) return;
    }
    throw Error('Measured schedule did not converge');
  };
  for(let index=0;index<4;index++) await settle(index);
  await page.evaluate(()=>{
    const days=document.querySelector('itinerary-view').currentItinerary.days;
    const palace=days[0].scheduleItems.find(i=>i.title==='palace');
    if(palace.time!=='09:00'||palace.endTime!=='10:00') throw Error('Live legacy palace hours were ignored');
    if(days.some(day=>!day.scheduleItems.some(i=>i.gapFill)||day.scheduleItems.filter(i=>i.gapFill).length>2)) throw Error('Sparse day not recovered within two-visit limit: '+days.map(day=>day.scheduleItems.filter(i=>i.gapFill).length));
    const ids=days.flatMap(day=>day.scheduleItems.filter(i=>i.gapFill).map(i=>i.verifiedPlace.placeId));
    if(new Set(ids).size!==ids.length) throw Error('A visit was repeated across days');
    if(days[2].scheduleItems.find(i=>i.title==='booking').time!=='12:00') throw Error('Reservation changed');
    const boundaries=days.map(day=>[day.scheduleItems[0].title,day.scheduleItems.at(-1).title]);
    if(JSON.stringify(boundaries)!==JSON.stringify([['station','JW Seoul'],['JW Seoul','JW Seoul'],['JW Seoul','JW Seoul'],['JW Seoul','airport']])) throw Error('Hotel boundaries changed');
  });
  await page.locator('itinerary-view #save-itinerary-btn').click();
  await page.waitForURL('**/view/smoke1');await page.reload();
  await page.getByRole('button',{name:'1일차 2026-10-09',exact:true}).click();
  await page.locator('itinerary-view .schedule-title').filter({hasText:'palace'}).waitFor();
  const saved=await page.evaluate(()=>JSON.stringify(document.querySelector('itinerary-view').currentItinerary.days));
  await settle(0);
  if(await page.evaluate(()=>JSON.stringify(document.querySelector('itinerary-view').currentItinerary.days))!==saved) throw Error('Saved schedule changed on read');
  await page.locator('itinerary-view .time-badge').filter({hasText:'09:00'}).waitFor();
  return {findings:[],errors:page.smokeErrors,checks:['delayed live palace hours and legacy identity','four-day measured gaps','unique verified extras ≤2/day','fixed booking and hotel/airport boundaries','save/reload immutability']};
}
