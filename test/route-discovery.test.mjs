import test from 'node:test';
import assert from 'node:assert/strict';
import { findRouteStops, routeDiscoveryGaps } from '../src/domains/planner/services/route-discovery.js';
const place = (id, name=id) => ({placeId:id,displayName:name,formattedAddress:'서울 중구',lat:37.55,lng:126.98});
const request = () => ({date:['2026-10-08'],startTime:'09:00',endTime:'18:00',
  startLocation:place('start'),endLocation:place('end'),anchorSchedules:[]});
function services(options={}) {
  let index = 0;
  return {
    resolvePlace: async value => value,
    getRoute:async () => ({routes:[{legs:[{duration:{value:600}}],overview_path:[{lat:37.56,lng:126.99}]}]}),
    findPlace:async () => place('candidate-'+index++),
    travelMinutes:async () => 10,
    hoursStatus:async () => 'regular',
    ...options,
  };
}
test('recommendations use measured legs, retain identity and respect fixed time windows', async () => {
  const input=request(), original=structuredClone(input);
  input.anchorSchedules=[{day:1,name:'예약',location:place('booking'),time:'11:00',endTime:'12:00'}];
  const result=await findRouteStops(input,1,services());
  assert.equal(result.status,'ready');
  assert.equal(result.suggestions.length,3);
  assert.equal(result.suggestions[0].detourMinutes,10);
  assert.equal(result.suggestions[0].visit.location.placeId,'candidate-0');
  assert.equal(result.suggestions[0].time,'12:10');
  assert.equal(result.suggestions[0].visit.flexible,true);
  assert.equal(result.suggestions[0].hours,'regular');
  assert.equal(input.startLocation.placeId,original.startLocation.placeId);
  assert.equal(input.anchorSchedules[0].time,'11:00');
});
test('no unmeasured, excessive, closed or duplicate detours are recommended', async () => {
  for (const overrides of [
    {travelMinutes:async()=>null}, {travelMinutes:async()=>30}, {hoursStatus:async()=> 'closed'},
    {findPlace:async()=>place('start')},
  ]) {
    const result=await findRouteStops(request(),1,services(overrides));
    assert.equal(result.suggestions.length,0);
  }
  const result=await findRouteStops(request(),1,services({getRoute:async()=>{throw new Error('denied');}}));
  assert.equal(result.status,'unavailable');
  const estimated=await findRouteStops(request(),1,services({getRoute:async()=>({estimated:true,routes:[{legs:[{duration:{value:600}}]}]})}));
  assert.deepEqual(estimated,{status:'unavailable',suggestions:[]},'a straight-line estimate is not a measured baseline');
});
test('selected day overrides and hotel boundaries drive the measured route; other-day visits are excluded', async () => {
  const input={...request(),date:['2026-10-08','2026-10-09'],overnightLocations:[place('hotel')],
    dailyLocations:[{day:2,startLocation:place('override'),endLocation:''}],
    anchorSchedules:[{day:1,name:'Already selected',location:place('duplicate'),time:'11:00',endTime:'12:00'}]};
  let fromId;
  const result=await findRouteStops(input,2,services({getRoute:async(from)=>{
    fromId=from.placeId;return {routes:[{legs:[{duration:{value:600}}]}]};
  },findPlace:async(_center,excluded)=>{assert.ok(excluded.has('duplicate'));return place('duplicate');}}));
  assert.equal(fromId,'override');
  assert.equal(result.suggestions.length,0);
});
test('insufficient space and incomplete endpoints yield no fake recommendations', async () => {
  const input={...request(),endTime:'09:30'};
  assert.equal((await findRouteStops(input,1,services())).status,'empty');
  assert.equal((await findRouteStops({...input,endTime:'10:30'},1,services({getRoute:async()=>
    ({routes:[{legs:[{duration:{value:3600}}]}]})}))).status,'empty');
  assert.equal((await findRouteStops({...request(),endLocation:''},1,services())).status,'missing-input');
  assert.deepEqual(routeDiscoveryGaps({startTime:'09:00',endTime:'18:00',startLocation:'역',endLocation:'숙소',
    anchors:[{time:'',endTime:'',location:'공연장'}]}),[]);
});
