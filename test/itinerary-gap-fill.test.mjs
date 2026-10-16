import test from 'node:test';
import assert from 'node:assert/strict';
import { fillMeasuredGaps, gapFillFits } from '../src/domains/itinerary/services/itinerary-gap-fill.mjs';
import { loadScheduleHours, nextVisitStart } from '../src/domains/itinerary/services/itinerary-hours.mjs';
import { fitMeasuredSchedule } from '../src/domains/itinerary/services/itinerary-end-fit.mjs';
import { scheduleFlexibleVisits } from '../src/domains/planner/services/schedule-flexible-visits.mjs';
import { recommendationFields, selectRecommendation } from '../src/domains/map/services/recommendation-place.mjs';

const p = id => ({placeId:id,displayName:id,formattedAddress:'서울',lat:37.5,lng:127});
const s = (id, type, time, endTime = '') => ({title:id,type,time,endTime,location:id,selectedPlace:p(id)});
const hours = (open = 9, close = 18) => ({utcOffsetMinutes:540,regularOpeningHours:{periods:Array.from({length:7},(_,day)=>({open:{day,hour:open,minute:0},close:{day,hour:close,minute:0}}))}});
const options = overrides => ({date:'2030-10-09',endTime:'17:11',travelMinutes:async()=>10,getHours:async()=>hours(),
  findRecommendation:async(item, center, excluded)=>{
    const id = ['extra-a','extra-b'].find(id=>!excluded.has(id));
    if (!id) return null;
    const candidate = {...p(id),id,location:{lat:37.5,lng:127},types:['tourist_attraction'],
      addressComponents:[{types:['country'],shortText:'KR'}]};
    return {...item,...recommendationFields(item,selectRecommendation([candidate],item.placeIntent,center,excluded))};
  },...overrides});

test('legacy map identity and delayed live hours prevent Gyeongbokgung from moving to 07:36', async()=>{
  const items=[s('station','departure','07:11'),{...s('palace','AnchorSchedule','09:30','10:30'),selectedPlace:null,flexible:true},s('hotel','arrival','17:11')];
  const data=await loadScheduleHours(items,[{index:1,resolvedPlace:p('palace')}],async id=>{
    assert.equal(id,'palace');await new Promise(resolve=>setTimeout(resolve,5));return hours();
  });
  const fit=fitMeasuredSchedule(items,[{fromIndex:0,durationMinutes:25},{fromIndex:1,durationMinutes:30}], '17:11','07:11',{compact:true,date:'2030-10-09',hoursByIndex:data});
  assert.equal(fit.items[1].time,'09:00');assert.equal(fit.items[1].endTime,'10:00');
  assert.equal(nextVisitStart(items[1],'2030-10-09',hours(9,10),9*60+1,60,17*60),null);
});

test('long raw gaps do not qualify without measured 90-minute free time', async()=>{
  const items=[s('hotel','departure','09:00'),s('booking','AnchorSchedule','12:00','13:00'),s('airport','arrival','17:11')];
  let searched=0;
  for(const routes of [[],[{fromIndex:0,durationMinutes:91}], [{fromIndex:0,durationMinutes:null}], [{fromIndex:0,toIndex:2,durationMinutes:0}]]) {
    const result=await fillMeasuredGaps(items,routes,options({findRecommendation:async()=>{searched++;return null;}}));
    assert.equal(result.changed,false);
  }
  assert.equal(searched,0);
});

test('measured gaps get at most two verified visits with hours, travel and 30-minute slack; boundaries/bookings stay exact', async()=>{
  const items=[s('station','departure','07:11'),s('booking','AnchorSchedule','12:00','13:00'),s('hotel','arrival','15:00')];
  const routes=[{fromIndex:0,durationMinutes:27},{fromIndex:1,durationMinutes:27}];
  const result=await fillMeasuredGaps(items,routes,options());
  assert.equal(result.changed,true);assert.equal(result.items.filter(i=>i.gapFill).length,2);
  assert.deepEqual(result.items.filter(i=>!i.gapFill),items);
  assert.deepEqual(result.items.filter(i=>i.gapFill).map(i=>[i.time,i.endTime]),[['09:00','10:00'],['13:10','14:10']]);
  const confirmed = result.items.slice(1).map((_,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes:10}));
  const evidence = {date:'2030-10-09',endTime:'17:11',hoursByIndex:result.items.map(()=>hours())};
  assert.equal(gapFillFits(result.items,confirmed,evidence),true);
  assert.equal(gapFillFits(result.items,confirmed.map(r=>({...r,durationMinutes:r.fromIndex===1?91:10})),evidence),false);
  assert.equal(gapFillFits(result.items,confirmed.slice(1),evidence),false);
  assert.equal(gapFillFits(result.items,confirmed,{...evidence,hoursByIndex:[]}),false);
  assert.deepEqual(items.map(i=>i.title),['station','booking','hotel']);
  assert.equal((await fillMeasuredGaps(result.items,routes,options())).changed,false);
});

test('no hours, closed venue, duplicate, missing route or insufficient return slack leaves free time intact', async()=>{
  const items=[s('hotel','departure','09:00'),s('booking','AnchorSchedule','11:00','12:00')];
  const routes=[{fromIndex:0,durationMinutes:10}];
  for (const overrides of [{getHours:async()=>null},{getHours:async()=>hours(12,18)},
    {getHours:async()=>({utcOffsetMinutes:540,businessStatus:'CLOSED_PERMANENTLY'})},
    {travelMinutes:async()=>null},{travelMinutes:async()=>20},
    {findRecommendation:async()=>({...s('booking','attraction','09:00','10:00'),placeStatus:'verified'})}]) {
    assert.equal((await fillMeasuredGaps(items,routes,options(overrides))).changed,false);
  }
});

test('automatic required visits choose an earlier-open venue first and remeasure return travel after waiting', async()=>{
  const request={date:['2030-10-09'],startTime:'09:00',endTime:'12:30',startLocation:'hotel',endLocation:'end',anchorSchedules:[
    {day:1,name:'late',location:'late',flexible:true,stayMinutes:60},
    {day:1,name:'early',location:'early',flexible:true,stayMinutes:60}]};
  const departures=[];
  const result=await scheduleFlexibleVisits(request,{travelMinutes:async(from,to,_date,time)=>{if(to==='end')departures.push(time);return 0;},
    hoursStatus:async(anchor,_date,time)=>anchor.name==='late'&&time<'11:00'?'conflict':'regular'});
  assert.equal(result.issue,null);
  assert.deepEqual(result.request.anchorSchedules.map(a=>a.time),['11:00','09:00']);
  assert.ok(departures.includes('12:00'));
  const blocked=await scheduleFlexibleVisits({...request,anchorSchedules:request.anchorSchedules.slice(0,1),endTime:'12:15'},
    {travelMinutes:async(from,to,_date,time)=>to==='end'&&time>='12:00'?30:0,
      hoursStatus:async(_anchor,_date,time)=>time<'11:00'?'conflict':'regular'});
  assert.equal(blocked.request.anchorSchedules[0].time,undefined);assert.ok(blocked.issue);
});
