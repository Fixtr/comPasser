import test from 'node:test';
import assert from 'node:assert/strict';
import { RoutingService } from '../src/domains/map/services/routing-service.js';
import { verifyGeneratedItinerary } from '../src/domains/planner/services/generated-day-quality.js';
import { selectRecommendation } from '../src/domains/map/services/recommendation-place.mjs';
import { fitMeasuredSchedule, hasFixedArrivalConflict } from '../src/domains/itinerary/services/itinerary-end-fit.mjs';
import { improveMeasuredRouteOrder, suggestRouteOrder } from '../src/domains/itinerary/services/itinerary-route-order.mjs';

const place = n => ({placeId:`q${n}`,displayName:`P${n}`,formattedAddress:'서울',lat:37.5,lng:127+n*.02});
const stop = (n,type,time,endTime='') => ({title:`P${n}`,type,time,endTime,selectedPlace:place(n)});
const measured = values => values.map((durationMinutes,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes}));

test('optional gap search honors pace and leaves single-day airport buffers alone', async () => {
  for (const [pace, dayCount, endLocation, expectedSearches, companion] of [
    ['relaxed', 2, 'Hotel', 0],
    [undefined, 2, 'Hotel', 2],
    ['balanced', 1, 'Hotel', 0],
    ['packed', 1, 'Hotel', 1],
    ['packed', 1, 'Incheon Airport', 0],
    ['packed', 1, 'Hotel', 0, 'parents'],
    ['packed', 1, 'Hotel', 0, 'family_kids'],
  ]) {
    const days = Array.from({ length: dayCount }, (_, index) => ({
      day: index + 1, date: `2030-10-0${index + 1}`,
      scheduleItems: [stop(0, 'departure', '09:00'), stop(1, 'arrival', '18:00')],
    }));
    let searches = 0;
    await verifyGeneratedItinerary({ request: { startTime: '09:00', endTime: '18:00', endLocation, pace, companion,
      date: days.map(day => day.date) }, days }, {
      geocoding: { geocodeSchedule: async () => [] },
      createChecks: () => ({
        travelMinutes: async () => 10,
        getHours: async () => null,
        findRecommendation: async () => { searches++; return null; },
      }),
    });
    assert.equal(searches, expectedSearches, `${pace} for ${dayCount} days ending at ${endLocation}`);
  }
});

const twoStopDays = count => Array.from({ length: count }, (_, index) => ({ day: index + 1, date: `2030-10-0${index + 1}`,
  scheduleItems: [stop(0, 'departure', '09:00'), stop(1, 'arrival', '18:00')] }));
const tripOf = (days, extra = {}) => ({ request: { startTime: '09:00', endTime: '18:00', endLocation: 'Hotel',
  date: days.map(day => day.date), ...extra }, days });
const quiet = async run => { const warn = console.warn; console.warn = () => {}; try { return await run(); } finally { console.warn = warn; } };

test('one failing day or stage leaves the other days verified, in place-then-route stage order', async () => {
  const days = twoStopDays(2), stages = [], geocoded = [], searched = [];
  const result = await quiet(() => verifyGeneratedItinerary(tripOf(days, { theme: 'food' }), {
    onStage: stage => stages.push(stage),
    geocoding: { geocodeSchedule: async (_items, date) => { geocoded.push(date); if (date === days[0].date) throw new Error('maps'); return []; } },
    createChecks: () => ({
      travelMinutes: async (_from, _to, date) => { if (date === days[0].date) throw new Error('maps'); return 10; },
      getHours: async () => null,
      findRecommendation: async (item, _center, _excluded, date) => { searched.push([date, item.placeIntent]); return null; },
    }),
  }));
  assert.deepEqual(stages, ['places', 'routes']);
  assert.deepEqual(geocoded, days.map(day => day.date));
  assert.deepEqual(searched.map(([date]) => date), [days[1].date]);
  // The trip theme reaches gap filling: a food trip fills a gap with a cafe, never a second full meal.
  assert.equal(searched[0][1].category, 'cafe');
  assert.deepEqual(result.days.map(day => day.scheduleItems.map(item => item.title)), [['P0', 'P1'], ['P0', 'P1']]);
});

test('days are fitted concurrently but gap searches stay one at a time', async () => {
  const days = twoStopDays(3), live = { travel: 0, search: 0 }, peak = { travel: 0, search: 0 };
  const track = async (kind, value) => {
    peak[kind] = Math.max(peak[kind], ++live[kind]);
    await new Promise(resolve => setTimeout(resolve, 10));
    live[kind]--;
    return value;
  };
  await verifyGeneratedItinerary(tripOf(days), {
    geocoding: { geocodeSchedule: async () => [] },
    createChecks: () => ({ travelMinutes: () => track('travel', 10), getHours: async () => null,
      findRecommendation: () => track('search', null) }),
  });
  assert.equal(peak.travel, 3);
  assert.equal(peak.search, 1);
});

test('a gap visit whose confirming route lookup fails is not kept', async () => {
  const days = twoStopDays(2);
  const open = { utcOffsetMinutes: 540, regularOpeningHours: { periods: Array.from({ length: 7 }, (_, day) =>
    ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 18, minute: 0 } })) } };
  let created = 0;
  const result = await quiet(() => verifyGeneratedItinerary(tripOf(days), {
    geocoding: { geocodeSchedule: async () => [] },
    createChecks: () => {
      const gapStage = ++created > days.length;
      let calls = 0;
      return {
        // fillMeasuredGaps measures the two new legs; the third call is the confirmation.
        travelMinutes: async () => { if (gapStage && ++calls > 2) throw new Error('maps'); return 10; },
        getHours: async () => open,
        findRecommendation: async () => ({ ...stop(5, 'attraction', '09:00', '10:00'), placeStatus: 'verified' }),
      };
    },
  }));
  assert.equal(created, 4);
  assert.deepEqual(result.days.map(day => day.scheduleItems.map(item => item.title)), [['P0', 'P1'], ['P0', 'P1']]);
});

test('reported Day 3: 07:11 + 48 minutes moves an untimed required visit to 07:59; bookings never move', () => {
  const plan = [stop(0,'departure','07:11'), {...stop(1,'AnchorSchedule','07:56','08:41'),flexible:true},
    stop(2,'AnchorSchedule','10:00','11:00'),stop(0,'arrival','17:11')];
  const fitted = fitMeasuredSchedule(plan,measured([48,24,30]),'17:11','07:11',{compact:true});
  assert.equal(fitted.items[1].time,'07:59');
  assert.equal(fitted.items[1].endTime,'08:44');
  assert.deepEqual(fitted.items[2],plan[2]);
  assert.equal(hasFixedArrivalConflict(fitted.items,measured([48,24,30])),false);
  assert.equal(fitted.items[1].flexible,true);
  assert.deepEqual(fitMeasuredSchedule(fitted.items,measured([48,24,30]),'17:11','07:11',{compact:true}).items,fitted.items);
});

test('reported Day 2: measured gaps compact lunch to noon, preserving openings and user earliest starts', () => {
  const plan = [stop(0,'departure','09:00'),stop(1,'attraction','09:30','10:32'),
    {...stop(2,'dining','13:00','14:00'),placeIntent:{category:'restaurant'}},
    {...stop(3,'attraction','15:00','16:00'),visitNotBefore:'15:00'},stop(4,'arrival','17:11')];
  const hours = {utcOffsetMinutes:540,regularOpeningHours:{periods:[{open:{day:3,hour:10,minute:0},close:{day:3,hour:17,minute:0}}]}};
  const fitted = fitMeasuredSchedule(plan,measured([10,10,20,20]),'17:11','09:00',
    {compact:true,date:'2030-10-02',hoursByIndex:[null,hours]});
  assert.equal(fitted.items[1].time,'10:00');
  assert.equal(fitted.items[2].time,'12:00');
  assert.equal(fitted.items[2].endTime,'13:00');
  assert.equal(fitted.items[3].time,'15:00');
  assert.equal(fitMeasuredSchedule(plan,measured([null,10,20,20]),'17:11','09:00',{compact:true}).adjusted,false);
});

const zigzag = () => [stop(0,'departure','09:00'),stop(3,'attraction','09:10','09:40'),
  stop(1,'attraction','09:50','10:20'),stop(2,'leisure','10:30','11:00'),stop(4,'arrival','15:00')];
test('automatic reordering is accepted only when actual journeys improve; incomplete/slower candidates keep the original', async () => {
  const plan = zigzag(), snapshot=structuredClone(plan), routes=measured([30,30,30,30]);
  const options = {startTime:'09:00',endTime:'15:00',date:'2030-10-02',travelMinutes:async()=>10};
  const better = await improveMeasuredRouteOrder(plan,[],routes,options);
  assert.equal(better.changed,true);
  assert.deepEqual(better.items.map(i=>i.title),['P0','P1','P2','P3','P4']);
  assert.equal(better.savedMinutes,80);
  assert.deepEqual(plan,snapshot);
  for (const duration of [null,40]) assert.equal((await improveMeasuredRouteOrder(plan,[],routes,
    {...options,travelMinutes:async()=>duration})).changed,false);
  assert.equal((await improveMeasuredRouteOrder(plan,[],routes.slice(1),options)).changed,false);
  const invalid = [...routes.slice(1),{fromIndex:8,toIndex:9,durationMinutes:30}];
  assert.equal((await improveMeasuredRouteOrder(plan,[],invalid,options)).changed,false);
});

test('automatic ordering keeps meals at their positions, bookings and user-added stops at their boundaries', () => {
  const plan = zigzag();plan[2].type='dining';
  assert.equal(suggestRouteOrder(plan,[],{automatic:true}).items[2].title,plan[2].title);
  plan[2].type='AnchorSchedule';
  assert.equal(suggestRouteOrder(plan,[],{automatic:true}).changed,false);
  plan[2].type='attraction';plan[2].addedByUser=true;
  assert.equal(suggestRouteOrder(plan,[],{automatic:true}).changed,false);
});

test('untimed required visits can improve order while retaining their full stays', async () => {
  const plan=zigzag();
  for (const item of plan.slice(1,4)) { item.type='AnchorSchedule';item.flexible=true; }
  const better=await improveMeasuredRouteOrder(plan,[],measured([30,30,30,30]),{
    startTime:'09:00',endTime:'15:00',date:'2030-10-02',travelMinutes:async()=>10
  });
  assert.equal(better.changed,true);
  assert.deepEqual(better.items.map(item=>item.title),['P0','P1','P2','P3','P4']);
  const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
  assert.ok(better.items.slice(1,4).every(item=>item.flexible &&
    minutes(item.endTime)-minutes(item.time)===30));
});

test('reordered legacy stops retain their resolved coordinates and their own opening-hours evidence', async () => {
  const plan = zigzag();
  const resolved = plan.map((item, index) => ({index, name:item.title, address:'서울', coordinates:item.selectedPlace}));
  for (const item of plan) delete item.selectedPlace;
  const calls = [];
  const options = {startTime:'09:00',endTime:'15:00',date:'2030-10-02',travelMinutes:async (from, to) => {
    calls.push([from.placeId, to.placeId]);
    return 10;
  }};
  assert.equal((await improveMeasuredRouteOrder(plan,resolved,measured([30,30,30,30]),options)).changed,true);
  assert.deepEqual(calls,[['q0','q1'],['q1','q2'],['q2','q3'],['q3','q4']]);
  options.hoursByIndex = [null,null,{utcOffsetMinutes:540,businessStatus:'CLOSED_PERMANENTLY'}];
  assert.equal((await improveMeasuredRouteOrder(plan,resolved,measured([30,30,30,30]),options)).changed,false);
});

test('automatic airport-internal attractions require verified access and are excluded from generic candidates', () => {
  const airport = {...place(0),displayName:'인천국제공항 제2여객터미널 한국전통문화센터 동관',
    types:['tourist_attraction'],addressComponents:[{types:['country'],shortText:'KR'}]};
  const rejected={};
  assert.equal(selectRecommendation([airport],{category:'tourist_attraction',purpose:'문화체험'},place(0),new Set(),rejected),null);
  assert.equal(rejected['restricted-access'],1);
});

test('short legs choose a real walking route when faster; unavailable walking keeps transit; failures never become estimates', async () => {
  const prior=globalThis.google;
  globalThis.google={maps:{TravelMode:{TRANSIT:'TRANSIT'}}};
  try {
    for (const [walk,bus,expected] of [[600,840,600],[null,840,840],[1200,600,600],[600,null,600]]) {
      const calls=[];
      const routing=new RoutingService({importLibrary:async()=>({DirectionsService:class {
        async route(request) {
          calls.push(request);const seconds=request.travelMode==='WALKING'?walk:bus;
          if(seconds===null) throw Error('ZERO_RESULTS');
          return {routes:[{legs:[{duration:{value:seconds}}]}]};
        }
      }})});
      const result=await routing.getTransitRoute({lat:37.5,lng:127},{lat:37.5,lng:127.005},new Date());
      assert.equal(result.routes[0].legs[0].duration.value,expected);
      assert.equal(calls.length,2);
      assert.equal(calls[1].transitOptions,undefined);
      calls.length=0;
      if(bus===null) await assert.rejects(routing.getTransitRoute(place(0),place(4)));
      else await routing.getTransitRoute(place(0),place(4));
      assert.equal(calls.length,1);
    }
  } finally {globalThis.google=prior;}
});
