async page => {
  await page.evaluate(async()=>{
    await window.__smoke.openPlan({days:[{day:1,date:'2026-10-20',scheduleItems:[
      {type:'departure',time:'09:00',title:'출발'},
      {type:'leisure',title:'휴식 및 주변 경관 감상',time:'14:55',endTime:'15:25',placeIntent:{purpose:'휴식'},placeStatus:'unresolved'},
      {type:'arrival',time:'18:00',title:'도착'}]}]});
  });
  await page.locator('itinerary-view .replace-place-btn').click();
  await page.locator('itinerary-view .place-replacement gmp-place-autocomplete input').waitFor({state:'visible'});
  await page.evaluate(async()=>{
    const input=document.querySelector('itinerary-view').shadowRoot.querySelector('.place-replacement gmp-place-autocomplete');
    input.dispatchEvent(Object.assign(new Event('gmp-select'),{placePrediction:{toPlace:()=>({fetchFields:async()=>{throw Error('lookup failed');}})}}));
    await input.placeSelectionPending;
  });
  if(await page.locator('itinerary-view .replace-place-confirm').isEnabled()) throw Error('Failed lookup enables replacement');
  await page.locator('itinerary-view .place-replacement').getByRole('button',{name:'취소',exact:true}).click();
  await page.locator('itinerary-view .replace-place-btn').click();
  await page.locator('itinerary-view .place-replacement gmp-place-autocomplete input').fill('용산가족공원');
  if(await page.locator('itinerary-view .replace-place-confirm').isEnabled()) throw Error('Text alone enables replacement');
  const select=()=>page.evaluate(async()=>{
    const input=document.querySelector('itinerary-view').shadowRoot.querySelector('.place-replacement gmp-place-autocomplete');
    input.dispatchEvent(Object.assign(new Event('gmp-select'),{placePrediction:{toPlace:()=>({id:'park-id',displayName:'용산가족공원',formattedAddress:'서울 용산구 서빙고로 185',location:{lat:()=>37.52,lng:()=>126.98},fetchFields:async()=>{}})}}));
    await input.placeSelectionPending;
  });
  await select();
  await page.locator('itinerary-view .place-replacement gmp-place-autocomplete input').fill('다른 곳');
  if(await page.locator('itinerary-view .replace-place-confirm').isEnabled()) throw Error('Edited text retains selected ID');
  await select();
  await page.locator('itinerary-view .replace-place-confirm').click();
  await page.locator('itinerary-view .schedule-title').filter({hasText:'용산가족공원'}).waitFor({state:'visible'});
  await page.locator('itinerary-view #save-itinerary-btn').click();
  await page.waitForURL('**/view/smoke1');
  await page.reload();
  await page.locator('itinerary-view .schedule-title').filter({hasText:'용산가족공원'}).waitFor({state:'visible'});
  const check=()=>page.evaluate(()=>{
    const item=document.querySelector('itinerary-view').currentItinerary.days[0].scheduleItems[1];
    if(item.selectedPlace?.placeId!=='park-id'||item.time!=='14:55'||item.endTime!=='15:25'||Object.hasOwn(item,'placeIntent')) throw Error('Replacement identity/time lost');
  });
  await check();
  await page.locator('itinerary-view #share-itinerary-btn').click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(()=>!document.querySelector('itinerary-view').shadowRoot.getElementById('share-itinerary-btn').disabled);
  const url=await page.evaluate(()=>navigator.clipboard.readText());
  await page.goto(url);
  await page.locator('itinerary-view .schedule-title').filter({hasText:'용산가족공원'}).waitFor({state:'visible'});
  await check();
  if(await page.locator('itinerary-view .replace-place-btn').count()) throw Error('Shared copy is editable');
  return {results:['PASS selected replacement → save/reload → share; text edit invalidation'],errors:page.smokeErrors};
}
