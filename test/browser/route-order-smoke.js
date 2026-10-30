async page => {
  await page.evaluate(()=>{
    const point=n=>({placeId:`order-${n}`,displayName:`P${n}`,formattedAddress:'서울',lat:37.5,lng:127+n*.02});
    const i=(n,type,time,endTime='')=>({title:`P${n}`,type,time,endTime,selectedPlace:point(n)});
    const view=document.querySelector('itinerary-view');
    view.state.open({days:[{day:1,date:'2026-09-17',scheduleItems:[i(0,'departure','09:00'),i(3,'attraction','09:10','09:40'),
      i(1,'dining','09:50','10:50'),i(2,'leisure','11:00','11:20'),i(4,'AnchorSchedule','12:00','13:00'),i(5,'arrival','14:00')]}]});
    window.navigate('/view');view.renderCurrentState();
  });
  const order=()=>page.locator('itinerary-view .schedule-title').allTextContents();
  await page.locator('itinerary-view .schedule-title').filter({hasText:'P3'}).waitFor({state:'visible'});
  const before=await order();
  await page.locator('itinerary-view #improve-route-btn').click();
  if(!(await page.locator('#app-confirm-host .confirm-message').textContent()).includes('직선거리')) throw Error('Distance claimed as travel time');
  await page.locator('#app-confirm-host .confirm-cancel').click();
  if(JSON.stringify(await order())!==JSON.stringify(before)) throw Error('Cancel mutated order');
  await page.locator('itinerary-view #improve-route-btn').click();
  await page.evaluate(()=>document.querySelector('itinerary-view').requestMapRoute());
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(()=>document.querySelector('itinerary-view').shadowRoot.querySelectorAll('.schedule-title')[1]?.textContent==='P3');
  if(JSON.stringify(await order())!==JSON.stringify(before)) throw Error('Stale confirmation applied');
  await page.locator('itinerary-view #improve-route-btn').click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(()=>document.querySelector('itinerary-view').shadowRoot.querySelectorAll('.schedule-title')[1]?.textContent==='P1');
  if(JSON.stringify(await order())!==JSON.stringify(['P0','P1','P2','P3','P4','P5'])) throw Error('Order not applied');
  // Once the order is the improvement, there is nothing left to offer, so the button goes away.
  await page.locator('itinerary-view #improve-route-btn').waitFor({state:'hidden'});
  await page.evaluate(()=>{
    const v=document.querySelector('itinerary-view');
    const anchor=v.currentItinerary.days[0].scheduleItems[4];
    if(anchor.time!=='12:00'||anchor.endTime!=='13:00') throw Error('Anchor moved');
  });
  await page.locator('itinerary-view #save-itinerary-btn').click();await page.waitForURL('**/view/smoke1');
  await page.reload();
  await page.locator('itinerary-view .schedule-title').filter({hasText:'P1'}).waitFor({state:'visible'});
  if(JSON.stringify(await order())!==JSON.stringify(['P0','P1','P2','P3','P4','P5'])) throw Error('Saved order lost');
  await page.locator('itinerary-view #share-itinerary-btn').click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(()=>!document.querySelector('itinerary-view').shadowRoot.getElementById('share-itinerary-btn').disabled);
  await page.goto(await page.evaluate(()=>navigator.clipboard.readText()));
  await page.locator('itinerary-view .schedule-title').filter({hasText:'P1'}).waitFor({state:'visible'});
  if(await page.locator('itinerary-view #improve-route-btn').isVisible()) throw Error('Shared plan exposes reorder');
  return {errors:page.smokeErrors};
}
