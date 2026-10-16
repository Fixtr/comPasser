// Real geocoder, state, view and save/reload; external Google/Firestore isolated.
async page => {
  await page.evaluate(async()=>{
    const {prepareGeneratedPlaces}=await import('/src/domains/map/services/recommendation-place.mjs');
    const view=document.querySelector('itinerary-view');
    const selectedPlace={placeId:'station',displayName:'서울역',formattedAddress:'서울특별시 중구',lat:37.55,lng:126.97};
    const days=prepareGeneratedPlaces([{day:1,date:'2026-10-20',scheduleItems:[
      {type:'dining',title:'점심 식사',location:'서울역',time:'12:00',endTime:'13:00',placeIntent:{purpose:'점심 식사',category:'restaurant',nearLocation:'서울역'}},
      {type:'leisure',title:'공원 산책',location:'서울역',time:'14:00',endTime:'15:00',placeIntent:{purpose:'공원 산책',category:'park',nearLocation:'서울역'}}
    ]}]);
    days[0].scheduleItems.unshift({type:'departure',title:'서울역 출발',location:'서울역',time:'10:00',selectedPlace});
    days[0].scheduleItems.push({type:'arrival',title:'서울역 도착',location:'서울역',time:'18:00',selectedPlace});
    view.state.open({request:{date:['2026-10-20'],startTime:'10:00',endTime:'18:00',startLocation:selectedPlace,endLocation:selectedPlace},days});
    window.navigate('/view');
    view.renderCurrentState();
  });
  await page.locator('itinerary-view .schedule-title').filter({hasText:'점심 식사'}).waitFor({state:'visible'});
  const dining=page.locator('itinerary-view .schedule-card').nth(1);
  if(await dining.locator('.action-links').isVisible()) throw Error('Unverified recommendation must not expose navigation');
  await page.evaluate(async()=>{
    const view=document.querySelector('itinerary-view');
    const {GeocodingService}=await import('/src/domains/map/services/geocoding-service.js');
    window.__recommendationSearches=0;
    const service=new GeocodingService({importLibrary:async()=>({Place:{searchByText:async request=>{
      window.__recommendationSearches++;
      return {places:request.includedType==='restaurant'?[{id:'real-restaurant',displayName:'검증된 실제 식당',formattedAddress:'서울특별시 중구 식당 주소',
        location:{lat:37.551,lng:126.971},types:['restaurant'],businessStatus:'OPERATIONAL',addressComponents:[{types:['country'],shortText:'KR'}]}]:[]};
    }}})});
    const items=view.currentItinerary.days[0].scheduleItems.map((i,index)=>({...i,displayIndex:index+1}));
    const results=await service.geocodeSchedule(items);
    window.__placeResult=items.map((item,index)=>{
      const found=results.find(r=>r.displayIndex===index+1);
      return {index,name:found?.resolvedName||'',address:found?.resolvedAddress||'',
        ...(item.placeIntent?{verifiedPlace:found?.verifiedPlace||null}:{})};
    });
    // A superseded response must not change the plan.
    window.dispatchEvent(new CustomEvent('places-resolved',{detail:{context:{...view._mapRequest,requestId:-1},places:window.__placeResult}}));
    if(view.currentItinerary.days[0].scheduleItems[1].verifiedPlace) throw Error('Stale result applied');
    window.dispatchEvent(new CustomEvent('places-resolved',{detail:{context:view._mapRequest,places:window.__placeResult}}));
  });
  await dining.locator('.schedule-title').filter({hasText:'검증된 실제 식당'}).waitFor({state:'visible'});
  if(!await dining.locator('.action-links').isVisible()) throw Error('Verified links missing');
  if(!(await dining.locator('a.primary').getAttribute('href')).includes('query_place_id=real-restaurant')) throw Error('Link must use canonical ID');
  const park=page.locator('itinerary-view .schedule-card').nth(2);
  if(!(await park.locator('.resolved-place').textContent()).includes('확인하지 못했습니다')) throw Error('Unresolved warning missing');
  if(await park.locator('.action-links').isVisible()) throw Error('Unresolved place must not have active links');
  await page.locator('itinerary-view #save-itinerary-btn').click();
  await page.waitForURL('**/view/smoke1');
  await page.reload();
  await page.locator('itinerary-view .schedule-title').filter({hasText:'검증된 실제 식당'}).waitFor({state:'visible'});
  await page.evaluate(async()=>{
    const items=document.querySelector('itinerary-view').currentItinerary.days[0].scheduleItems;
    const saved=items.find(i=>i.verifiedPlace);
    if(saved?.verifiedPlace.placeId!=='real-restaurant'||saved.latLng.lat!==37.551) throw Error('Saved identity/coordinates lost');
    const {GeocodingService}=await import('/src/domains/map/services/geocoding-service.js');
    const service=new GeocodingService({importLibrary:async()=>{throw Error('Verified restaurant must not be searched again');}});
    const results=await service.geocodeSchedule(items.filter(i=>i.placeIntent?.category!=='park'));
    if(results.find(i=>i.verifiedPlace)?.verifiedPlace.placeId!=='real-restaurant') throw Error('Saved ID not reused');
  });
  await page.evaluate(async()=>{
    const {normalizePlannerRequest,enforcePlannerConstraints}=await import('/src/domains/planner/services/planner-constraints.mjs');
    const {GeocodingService}=await import('/src/domains/map/services/geocoding-service.js');
    const station={placeId:'station',displayName:'서울역',formattedAddress:'서울 중구',lat:37.55,lng:126.97};
    const hotel={placeId:'hotel',displayName:'호텔',formattedAddress:'서울 중구',lat:37.552,lng:126.971};
    const request=normalizePlannerRequest({date:['2026-10-20','2026-10-21'],startTime:'09:00',endTime:'18:00',
      startLocation:station,endLocation:hotel,overnightLocations:[hotel]});
    const days=enforcePlannerConstraints(request.date.map((date,index)=>({day:index+1,date,scheduleItems:[]})),request);
    days[0].scheduleItems.splice(1,0,{type:'attraction',time:'10:00',endTime:'11:00',placeStatus:'pending',
      placeIntent:{purpose:'관광 명소',category:'tourist_attraction',nearLocation:'서울역'}});
    if(days[0].scheduleItems[1]?.placeStatus!=='pending') throw Error('Empty day did not receive a recoverable visit');
    days[0].scheduleItems[1].placeIntent.purpose='한옥 문화 체험';
    const queries=[];
    const service=new GeocodingService({importLibrary:async()=>({Place:{searchByText:async query=>{
      queries.push(query.textQuery);
      return {places:query.textQuery==='관광 명소'?[{id:'verified-visit',displayName:'검증된 명소',
        formattedAddress:'서울 중구',location:{lat:37.551,lng:126.971},types:['tourist_attraction'],
        businessStatus:'OPERATIONAL',addressComponents:[{types:['country'],shortText:'KR'}]}]:[]};
    }}})});
    const found=await service.geocodeSchedule(days[0].scheduleItems.map((item,index)=>({...item,displayIndex:index+1})));
    if(queries.join('|')!=='한옥 문화 체험|관광 명소'||found[1]?.verifiedPlace?.placeId!=='verified-visit')
      throw Error('Recovered visit did not become a verified nearby place');
  });
  return {results:['PASS intent → real candidate filtering → canonical card/link → unresolved warning → save/reload → ID reuse; stale result ignored'],errors:page.smokeErrors};
}
