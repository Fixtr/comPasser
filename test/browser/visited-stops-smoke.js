async page=>{
  await page.evaluate(async()=>{
    await window.__smoke.openPlan({request:{startTime:'09:00',endTime:'18:00'},days:[{day:1,date:'2026-09-17',scheduleItems:[
      {type:'departure',time:'09:00',title:'출발'},
      {type:'cafe',time:'10:00',endTime:'11:00',title:'카페'},
      {type:'attraction',time:'11:30',endTime:'12:30',title:'궁'},
      {type:'arrival',time:'18:00',title:'도착'}]}]});
  });
  await page.locator('itinerary-view .schedule-title').filter({hasText:'카페'}).waitFor({state:'visible'});
  if(await page.locator('itinerary-view .visited-btn').count()) throw Error('Unsaved draft shows visited toggles');
  await page.locator('itinerary-view #save-itinerary-btn').click();await page.waitForURL('**/view/smoke1');await page.reload();
  const toggles=page.locator('itinerary-view .visited-btn');
  await toggles.first().waitFor({state:'visible'});
  if(await toggles.count()!==2) throw Error('Endpoints must not be markable');
  await page.evaluate(()=>document.querySelector('itinerary-view').setAttribute('mobile-summary',''));
  await toggles.first().click();
  if(await toggles.first().getAttribute('aria-pressed')!=='true') throw Error('Toggle not pressed');
  const next=await page.evaluate(()=>document.querySelector('itinerary-view').shadowRoot.getElementById('next-stop-title').textContent);
  if(next!=='궁') throw Error('Next stop did not skip the visited stop: '+next);
  await page.reload();
  await page.locator('itinerary-view .visited-btn').first().waitFor({state:'visible'});
  if(await page.locator('itinerary-view .visited-btn').first().getAttribute('aria-pressed')!=='true') throw Error('Mark lost on reload');
  if(await page.locator('itinerary-view .schedule-card[data-visited]').count()!==1) throw Error('Visited card not dimmed');
  await page.locator('itinerary-view .visited-btn').first().click();
  if(await page.locator('itinerary-view .schedule-card[data-visited]').count()) throw Error('Unmark failed');
  if(JSON.stringify(await page.evaluate(()=>document.querySelector('itinerary-view').currentItinerary)).includes('visited')) throw Error('Visited state leaked into the plan');

  await page.evaluate(()=>{
    const db=JSON.parse(sessionStorage.getItem('__smoke_db'));
    const itineraryPlan=structuredClone(db.itineraries.smoke1.itineraryPlan);
    itineraryPlan.days[0].scheduleItems[1].title='공유 카페';
    db.shared_itineraries={visitedShare:{itineraryPlan}};
    sessionStorage.setItem('__smoke_db',JSON.stringify(db));
    window.navigate('/share/visitedShare');
  });
  const sharedToggle=page.locator('.schedule-card').filter({hasText:'공유 카페'}).locator('.visited-btn');
  await page.waitForURL('**/share/visitedShare');
  await sharedToggle.click();
  if(await sharedToggle.getAttribute('aria-pressed')!=='true') throw Error('Shared trip did not record the signed-in visit');
  await page.evaluate(()=>window.__smoke.setUser(null));
  await sharedToggle.and(page.locator('[aria-pressed="false"]')).waitFor({state:'visible'});
  if(await page.evaluate(()=>localStorage.getItem('compasser.visited.v1'))!==null) throw Error('Signed-in visit survived logout');
  return {errors:page.smokeErrors};
}
