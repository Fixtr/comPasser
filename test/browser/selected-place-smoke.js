// Real form, constraints, state and persistence adapters; Google/AI/DB isolated.
async page => {
  await page.evaluate(() => window.navigate('/plan'));
  await page.locator('travel-form #start-time').waitFor({state:'visible'});
  await page.evaluate(async () => {
    const form=document.querySelector('travel-form');
    form.populateForm({date:['2026-10-20'],startTime:'10:00',endTime:'16:00',startLocation:'',endLocation:'',anchorSchedules:[{name:'예약',time:'13:00',endTime:'14:00',location:'',day:1}]});
    for(const [selector,id,name] of [['#start-location','start-id','서울역'],['#end-location','end-id','서울역'],['.anchor-location','anchor-id','국립중앙박물관']]) {
      const el=form.shadowRoot.querySelector(selector);
      el.dispatchEvent(Object.assign(new Event('gmp-select'),{placePrediction:{toPlace:()=>({
        id,displayName:name,formattedAddress:'서울특별시 중구 테스트 주소',location:{lat:()=>37.5,lng:()=>127},fetchFields:async()=>{}
      })}}));
      await el.placeSelectionPending;
    }
  });
  await page.reload();
  await page.locator('travel-form .anchor-name').waitFor({state:'visible'});
  const read=()=>page.evaluate(()=>document.querySelector('travel-form').getFormData());
  const restored=await read();
  if(restored.startLocation.placeId!=='start-id'||restored.endLocation.placeId!=='end-id'||restored.anchorSchedules[0].location.placeId!=='anchor-id') throw Error('Selected IDs lost on form reload');
  await page.locator('travel-form .primary-btn').click();
  await page.waitForFunction(()=>window.__smoke.requests.length===1);
  await page.evaluate(async()=>{
    const {enforcePlannerConstraints}=await import('/src/domains/planner/services/planner-constraints.mjs');
    const request=window.__smoke.requests[0];
    window.__smoke.pending.shift().resolve({request,days:enforcePlannerConstraints([{day:1,date:'2026-10-20',scheduleItems:[]}],request)});
  });
  await page.locator('#show-results-btn').click();
  await page.locator('itinerary-view #save-itinerary-btn').click();
  await page.waitForURL('**/view/smoke1');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('itinerary-view')?.currentItinerary?.days?.length);
  const result=await page.evaluate(async()=>{
    const plan=document.querySelector('itinerary-view').currentItinerary;
    const {GeocodingService}=await import('/src/domains/map/services/geocoding-service.js');
    const service=new GeocodingService({importLibrary:async()=>{throw Error('Selected venue must not be text-searched');}});
    return (await service.geocodeSchedule(plan.days[0].scheduleItems)).map(i=>({id:i.selectedPlace?.placeId,lat:i.latLng.lat}));
  });
  if(result.map(i=>i.id).join()!=='start-id,anchor-id,end-id'||result.some(i=>i.lat!==37.5)) throw Error('Saved selected places must drive map coordinates');
  await page.locator('#edit-itinerary-btn').click();
  await page.locator('travel-form #start-location input').fill('수동 수정');
  if(typeof (await read()).startLocation!=='string') throw Error('Typing must clear the old ID');
  return {results:['PASS selection → draft/reload → generate → save/reload → exact coordinates; manual edit clears ID'],errors:page.smokeErrors};
}
