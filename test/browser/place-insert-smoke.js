async page => {
  await page.evaluate(async()=>{
    await window.__smoke.openPlan({days:[{day:1,date:'2026-10-20',scheduleItems:[
      {type:'departure',time:'09:00',title:'출발'},
      {type:'leisure',title:'경복궁',time:'10:00',endTime:'11:00'},
      {type:'arrival',time:'18:00',title:'도착'}]}]});
  });
  const slot=page.locator('itinerary-view .insert-slot').filter({has:page.locator('.insert-slot-btn')}).nth(1);
  await slot.locator('.insert-slot-btn').click();
  const search=page.locator('itinerary-view .insert-slot .place-replacement gmp-place-autocomplete input');
  await search.waitFor({state:'visible'});
  // The add button hides itself, and keyboard focus moves into the panel (the stay select).
  if(await page.evaluate(()=>document.querySelector('itinerary-view').shadowRoot.activeElement?.className)!=='insert-stay-select') throw Error('Focus did not move into the insert panel');
  const confirm=page.locator('itinerary-view .insert-slot .replace-place-confirm');
  if(await confirm.textContent()!=='추가') throw Error('Insert confirm keeps the replacement label');
  await search.fill('광장시장 빈대떡');
  if(await confirm.isEnabled()) throw Error('Typed text alone enables insertion');
  await page.locator('itinerary-view .insert-slot .insert-stay-select').selectOption('30');
  await page.evaluate(async()=>{
    const input=document.querySelector('itinerary-view').shadowRoot.querySelector('.insert-slot .place-replacement gmp-place-autocomplete');
    input.dispatchEvent(Object.assign(new Event('gmp-select'),{placePrediction:{toPlace:()=>({id:'market-id',displayName:'광장시장',formattedAddress:'서울 종로구 창경궁로 88',location:{lat:()=>37.57,lng:()=>126.99},fetchFields:async()=>{}})}}));
    await input.placeSelectionPending;
  });
  await confirm.click();
  await page.locator('itinerary-view .schedule-title').filter({hasText:'광장시장'}).waitFor({state:'visible'});
  const item=await page.evaluate(()=>document.querySelector('itinerary-view').currentItinerary.days[0].scheduleItems[2]);
  if(item.selectedPlace?.placeId!=='market-id'||item.time!=='11:00'||item.endTime!=='11:30'||item.location!=='서울 종로구 창경궁로 88') throw Error('Inserted stop lost its identity or stay: '+JSON.stringify(item));
  // Cancel and Escape put the slot's add button back.
  await slot.locator('.insert-slot-btn').click();
  await page.locator('itinerary-view .insert-slot .place-replacement').getByRole('button',{name:'취소',exact:true}).click();
  await slot.locator('.insert-slot-btn').waitFor({state:'visible'});
  await slot.locator('.insert-slot-btn').click();
  await page.locator('itinerary-view .insert-slot .insert-stay-select').press('Escape');
  await slot.locator('.insert-slot-btn').waitFor({state:'visible'});
  if(!page.url().endsWith('/view')) throw Error('Escape left the result page');
  return {results:['PASS insert uses the place search: text alone is rejected, the chosen place and stay are kept'],errors:page.smokeErrors};
}
