// Real itinerary state/view; map responses and persistence use isolated fixtures.
async page => {
  await page.evaluate(async () => {
    await window.__smoke.openPlan({request:{date:['2026-10-20'], startTime:'10:00',endTime:'16:00',startLocation:'서울역',endLocation:'서울역'}, days:[{date:'2026-10-20',scheduleItems:[
      {type:'departure',title:'서울역',location:'서울역',time:'10:00',endTime:''},
      {type:'attraction',title:'식물원',location:'식물원',time:'10:35',endTime:'12:35'},
      {type:'dining',title:'점심',location:'점심',time:'12:35',endTime:'13:35'},
      {type:'attraction',title:'쇼핑몰',location:'쇼핑몰',time:'13:35',endTime:'15:35',duration:'2시간'},
      {type:'arrival',title:'서울역',location:'서울역',time:'16:00',endTime:''}
    ]}]});
    window.__fitMapRequests = [];
    window.addEventListener('render-map-route', event => window.__fitMapRequests.push(event.detail));
  });
  await page.locator('itinerary-view .schedule-title').filter({hasText:'쇼핑몰'}).waitFor({state:'visible'});
  const dispatch = durations => page.evaluate(durations => {
    const view = document.querySelector('itinerary-view');
    window.dispatchEvent(new CustomEvent('transit-info-ready',{detail:{context:view._mapRequest,
      routes:durations.map((durationMinutes,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes,mode:'TRANSIT'}))}}));
  }, durations);
  await dispatch([35,27,10,41]);
  await page.waitForFunction(() => document.querySelector('itinerary-view').shadowRoot.querySelectorAll('.time-badge')[4]?.textContent === '16:00');
  const first = await page.evaluate(() => ({plan:document.querySelector('itinerary-view').state.snapshot().plan,requests:window.__fitMapRequests.length}));
  if (first.requests !== 1 || first.plan.days[0].scheduleItems[3].endTime !== '15:19') throw new Error('Auto fit must update state and recheck transport once');
  // Four measured adjustments can follow changed bus departures. The fifth
  // response still warns when a further fit would violate minimum stay.
  await dispatch([35,27,10,51]);
  await dispatch([35,27,10,61]);
  await dispatch([35,27,10,71]);
  await dispatch([35,27,10,161]);
  const last = await page.evaluate(() => ({plan:document.querySelector('itinerary-view').state.snapshot().plan,requests:window.__fitMapRequests.length}));
  if (last.requests !== 4 || last.plan.days[0].scheduleItems.at(-1).time <= '16:00') throw new Error('Recheck bound must keep honest late arrival');
  await page.locator('itinerary-view #end-time-warning').waitFor({state:'visible'});
  await page.locator('itinerary-view #save-itinerary-btn').click();
  await page.waitForURL('**/view/smoke1');
  await page.reload();
  await page.locator('itinerary-view .schedule-title').filter({hasText:'쇼핑몰'}).waitFor({state:'visible'});
  const saved = await page.evaluate(() => document.querySelector('itinerary-view').state.snapshot().plan.days[0].scheduleItems[3]);
  if (saved.endTime !== '14:49') throw new Error('Adjusted visit duration must survive save/reload');
  const shared = await page.evaluate(() => {
    const view = document.querySelector('itinerary-view');
    view.state.open(view.state.snapshot().plan,{kind:'shared',id:'read-only-fixture'});
    view.renderCurrentState();
    const before = view.currentItinerary.days[0].scheduleItems[3].endTime;
    const retried = view.applyTransitDelaysToActiveDay([35,27,10,90].map((durationMinutes,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes})));
    return {before, after:view.currentItinerary.days[0].scheduleItems[3].endTime, retried:!!retried};
  });
  if (shared.retried || shared.before !== shared.after) throw new Error('Shared plans must not auto-trim');
  const missingRouteConflict = await page.evaluate(() => {
    const view = document.querySelector('itinerary-view');
    view.state.open({request:{endTime:'16:00'},days:[{scheduleItems:[
      {type:'departure',title:'서울역',time:'10:00'},
      {type:'dining',title:'미확인 점심',time:'12:32',endTime:'13:32'},
      {type:'AnchorSchedule',title:'박물관',time:'13:00',endTime:'14:00'},
      {type:'arrival',title:'서울역',time:'16:00'}
    ]}]});
    view.lastTransitRoutes = [];
    view.refreshEndTimeWarning();
    const warning = view.shadowRoot.getElementById('anchor-time-warning');
    return !warning.hidden && warning.textContent.includes('앞선 방문 일정을 조정');
  });
  if (!missingRouteConflict) throw new Error('Known overlap must warn before any route is available');
  const fixedConflict = await page.evaluate(() => {
    const view = document.querySelector('itinerary-view');
    view.state.open({request:{date:['2026-10-20'],startTime:'09:00',endTime:'18:00'},days:[{date:'2026-10-20',scheduleItems:[
      {type:'departure',title:'서울역',time:'09:00'},
      {type:'AnchorSchedule',title:'박물관',time:'10:00',endTime:'11:30'},
      {type:'AnchorSchedule',title:'타워',time:'11:40',endTime:'12:40'},
      {type:'arrival',title:'서울역',time:'18:00'}
    ]}]});
    view.renderCurrentState();
    view.lastTransitRoutes = [{fromIndex:0,toIndex:1,durationMinutes:30},
      {fromIndex:1,toIndex:2,durationMinutes:50},{fromIndex:2,toIndex:3,durationMinutes:30}];
    view.refreshEndTimeWarning();
    const warning = view.shadowRoot.getElementById('anchor-time-warning');
    return {visible:!warning.hidden,text:warning.textContent};
  });
  if (!fixedConflict.visible || !fixedConflict.text.includes('앞선 방문을 빼도 해결되지')) {
    throw new Error('Impossible fixed-to-fixed travel must tell users to change a fixed condition');
  }
  const noRoutePrune = await page.evaluate(() => {
    const view = document.querySelector('itinerary-view');
    window.__fitMapRequests = [];
    window.addEventListener('render-map-route', event => window.__fitMapRequests.push(event.detail));
    view.state.open({request:{date:['2026-10-20'],startTime:'10:00',endTime:'16:00',startLocation:'서울역',endLocation:'서울역'},days:[{date:'2026-10-20',scheduleItems:[
      {type:'departure',title:'서울역',time:'10:00'},
      {type:'attraction',title:'찾을 수 없는 장소',time:'11:00',endTime:'12:00',placeIntent:{purpose:'공원',category:'park',nearLocation:'서울역'}},
      {type:'arrival',title:'서울역',time:'16:00'}
    ]}]});
    view.renderCurrentState();
    const before = window.__fitMapRequests.length;
    window.dispatchEvent(new CustomEvent('places-resolved',{detail:{context:view._mapRequest,places:[
      {index:1,name:'',address:'',verifiedPlace:null,unresolvedReason:'no-results'}
    ]}}));
    return {count:view.currentItinerary.days[0].scheduleItems.length,rechecks:window.__fitMapRequests.length-before};
  });
  if (noRoutePrune.count !== 2 || noRoutePrune.rechecks !== 1) throw new Error('A missing optional place must be removed and rerouted even with no transit segments');
  return {results:['PASS automatic fitting, measured recheck, bounded retries, warning and saved duration'],errors:page.smokeErrors};
}
