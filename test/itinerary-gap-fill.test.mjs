import test from 'node:test';
import assert from 'node:assert/strict';
import { fillMeasuredGaps, failedGapFills } from '../src/domains/itinerary/services/itinerary-gap-fill.mjs';
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
  for(const [routes, skipped] of [[[],{}],[[{fromIndex:0,durationMinutes:91}],{short:1}], [[{fromIndex:0,durationMinutes:null}],{leg:1}], [[{fromIndex:0,toIndex:2,durationMinutes:0}],{leg:1}]]) {
    const result=await fillMeasuredGaps(items,routes,options({findRecommendation:async()=>{searched++;return null;}}));
    assert.equal(result.changed,false);
    assert.deepEqual(result.skipped,skipped);
  }
  const unknown=[s('hotel','departure','09:00'),{...s('booking','AnchorSchedule','12:00','13:00'),selectedPlace:null}];
  assert.deepEqual((await fillMeasuredGaps(unknown,[{fromIndex:0,durationMinutes:10}],options())).skipped,{'no-identity':1});
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
  assert.deepEqual(failedGapFills(result.items,confirmed,evidence),[]);
  assert.deepEqual(failedGapFills(result.items,confirmed.map(r=>({...r,durationMinutes:r.fromIndex===1?91:10})),evidence),[1]);
  assert.deepEqual(failedGapFills(result.items,confirmed.slice(1),evidence),[1]);
  assert.deepEqual(failedGapFills(result.items,confirmed,{...evidence,hoursByIndex:[]}),[1,3]);
  assert.deepEqual(items.map(i=>i.title),['station','booking','hotel']);
  assert.equal((await fillMeasuredGaps(result.items,routes,options())).changed,false);
});

test('no hours, closed venue, duplicate, missing route or insufficient return slack leaves free time intact', async()=>{
  const items=[s('hotel','departure','09:00'),s('booking','AnchorSchedule','11:00','12:00')];
  const routes=[{fromIndex:0,durationMinutes:10}];
  for (const [overrides, reason] of [[{getHours:async()=>null},'hours-missing'],[{getHours:async()=>hours(12,18)},'hours'],
    [{getHours:async()=>({utcOffsetMinutes:540,businessStatus:'CLOSED_PERMANENTLY'})},'hours'],
    [{travelMinutes:async()=>null},'inbound'],[{travelMinutes:async()=>20},'outbound'],
    [{findRecommendation:async()=>({...s('booking','attraction','09:00','10:00'),placeStatus:'verified'})},'excluded'],
    [{findRecommendation:async()=>null},'no-candidate'],
    [{getHours:async()=>({})},'hours-unknown'],[{travelMinutes:async()=>50},'window'],
    [{findRecommendation:async item=>({...item,placeStatus:'unresolved'})},'unverified']]) {
    const result=await fillMeasuredGaps(items,routes,options(overrides));
    assert.equal(result.changed,false,reason);
    assert.deepEqual(result.skipped,{[reason]:1},reason);
  }
});

test('gaps past the four-search cap and after the daily limit are counted, not silently dropped', async()=>{
  // Seven 2-hour blocks give six measured gaps of 110 free minutes each.
  const items=[s('hotel','departure','08:00'),...[1,2,3,4,5].map(n=>s(`b${n}`,'AnchorSchedule',`${String(8+2*n).padStart(2,'0')}:00`,`${String(8+2*n).padStart(2,'0')}:00`)),s('end','arrival','20:00')];
  const routes=items.slice(1).map((_,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes:10}));
  const result=await fillMeasuredGaps(items,routes,options({endTime:'20:00'}));
  assert.equal(result.items.filter(i=>i.gapFill).length,2);
  // The 08:00 gap closes before the 09:00 opening (hours); two fill, the last tried gap is left (not-tried).
  assert.deepEqual(result.skipped,{cap:2,hours:1,'not-tried':1});
});

test('a long remaining gap after the first fill gets a chained second visit (Seoul day 2 shape)', async()=>{
  // tower 13:40 -> airport 20:00 with a 123-minute airport leg is one large gap; the daily limit of two is not reached.
  const items=[s('hotel','departure','10:00'),s('tower','AnchorSchedule','12:10','13:40'),s('airport','arrival','20:00')];
  const routes=[{fromIndex:0,durationMinutes:130},{fromIndex:1,durationMinutes:123}];
  const searched=[];
  const findRecommendation=async(item,center,excluded)=>{
    searched.push(item.placeIntent.category);
    const id=['extra-a','extra-b'].find(id=>!excluded.has(id));if(!id)return null;
    const candidate={...p(id),id,location:{lat:37.5,lng:127},types:['tourist_attraction','cafe'],addressComponents:[{types:['country'],shortText:'KR'}]};
    return {...item,...recommendationFields(item,selectRecommendation([candidate],item.placeIntent,center,excluded))};
  };
  const base=options({endTime:'20:00',theme:'food',findRecommendation,travelMinutes:async(_from,to)=>to.placeId==='airport'?123:20});
  const result=await fillMeasuredGaps(items,routes,base);
  assert.deepEqual(result.items.map(i=>[i.title,i.time,i.endTime]),[['hotel','10:00',''],['tower','12:10','13:40'],
    ['extra-a','14:00','15:00'],['extra-b','15:50','16:50'],['airport','20:00','']]);
  // The chained visit is a general attraction, never a second cafe/park in a row; 30 minutes separate the two visits.
  assert.deepEqual(searched,['cafe','tourist_attraction']);
  assert.deepEqual(result.skipped,{short:1});
  const confirmed=result.items.slice(1).map((item,fromIndex)=>({fromIndex,toIndex:fromIndex+1,
    durationMinutes:fromIndex===0?130:result.items[fromIndex+1].title==='airport'?123:20}));
  assert.deepEqual(failedGapFills(result.items,confirmed,{date:'2030-10-09',endTime:'20:00',hoursByIndex:result.items.map(()=>hours())}),[]);
  // Under 120 minutes left after the first visit: no chained search.
  searched.length=0;
  const tight=await fillMeasuredGaps([s('hotel','departure','10:00'),s('tower','AnchorSchedule','12:10','13:40'),s('airport','arrival','18:00')],routes,
    {...base,endTime:'18:00'});
  assert.equal(tight.items.filter(i=>i.gapFill).length,1);
  assert.equal(searched.length,1);
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

test('gap search follows the trip theme and keeps tourist attractions without one', async()=>{
  const items=[s('station','departure','07:11'),s('hotel','arrival','15:00')];
  for (const [theme, language, category, purpose] of [[undefined,'ko','tourist_attraction','관광 명소'],
    ['food','ko','cafe','디저트 카페'],['healing','en','park','quiet park'],['unknown','en','tourist_attraction','tourist attraction'],['toString','en','tourist_attraction','tourist attraction']]) {
    const intents=[];
    await fillMeasuredGaps(items,[{fromIndex:0,durationMinutes:10}],options({theme,language,
      findRecommendation:async item=>{intents.push(item.placeIntent);return null;}}));
    assert.deepEqual(intents.map(i=>[i.category,i.purpose]),[[category,purpose]],String(theme));
  }
});

test('food-theme gap fill keeps the day at two cafe stops', async()=>{
  const cafe={...s('cafe-1','dining','10:00','11:00'),placeIntent:{category:'cafe'}};
  const items=[s('station','departure','07:11'),cafe,s('hotel','arrival','17:11')];
  const routes=[{fromIndex:0,durationMinutes:10},{fromIndex:1,durationMinutes:10}];
  const searchAs=intents=>async(item,center,excluded,...rest)=>{
    intents.push(item.placeIntent.category);
    return options().findRecommendation({...item,placeIntent:{...item.placeIntent,category:'tourist_attraction'}},center,excluded,...rest);
  };
  const one=[];
  assert.equal((await fillMeasuredGaps(items,routes,options({theme:'food',findRecommendation:searchAs(one)}))).changed,true);
  // The big afternoon gap gets the cafe; the closed early gap and the chained remainder search attractions.
  assert.deepEqual(one,['cafe','tourist_attraction','tourist_attraction']);
  const two=[];
  await fillMeasuredGaps([items[0],cafe,{...cafe,time:'12:00',endTime:'13:00'},items[2]],
    [...routes,{fromIndex:2,durationMinutes:10}],options({theme:'food',findRecommendation:searchAs(two)}));
  assert.ok(two.length&&two.every(category=>category==='tourist_attraction'),two.join());
});
