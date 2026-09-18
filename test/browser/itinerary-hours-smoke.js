async page => {
  await page.evaluate(()=>{
    const selectedPlace={placeId:'hours-test',displayName:'식당',formattedAddress:'서울',lat:37.5,lng:127};
    window.__hoursFixtures={'hours-test':{utcOffsetMinutes:540,regularOpeningHours:{periods:[{open:{day:4,hour:11,minute:0},close:{day:4,hour:21,minute:0}}]}}};
    const view=document.querySelector('itinerary-view');
    view.state.open({days:[{date:'2026-09-17',scheduleItems:[
      {type:'departure',title:'출발',time:'10:00'},
      {type:'dining',title:'식당',time:'10:54',endTime:'11:24',selectedPlace},
      {type:'dining',title:'미확인',time:'12:00',endTime:'13:00',practicalInfo:{operatingHours:'24시간'}},
      {type:'arrival',title:'도착',time:'22:00'}]}]});
    window.navigate('/view');view.renderCurrentState();
  });
  await page.locator('itinerary-view .visit-hours[data-status="conflict"]').waitFor({state:'visible'});
  if(!(await page.locator('itinerary-view .visit-hours').nth(2).textContent()).includes('확인 필요')) throw Error('AI hours trusted');
  await page.evaluate(()=>{
    const v=document.querySelector('itinerary-view');
    if(v.currentItinerary.days[0].scheduleItems[1].time!=='10:54') throw Error('Hours changed time');
    v.currentItinerary.days[0].scheduleItems[1].time='11:00';v.renderCurrentState();
  });
  await page.locator('itinerary-view .visit-hours[data-status="regular"]').waitFor({state:'visible'});
  return {errors:page.smokeErrors};
}
