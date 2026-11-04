import test from 'node:test';
import assert from 'node:assert/strict';
import { dateRange, travelInstant, localTravelDate } from '../functions/travel-region.mjs';
import { stayIssue, nightlyStays, moveTripDates } from '../src/domains/planner/services/trip-stays.mjs';
import { createPlannerDraftStore } from '../src/domains/planner/services/planner-draft.mjs';
import { normalizePlannerRequest } from '../src/domains/planner/services/planner-constraints.mjs';
import { findPlannerRequestIssue } from '../functions/planner-request-validation.mjs';
import { createOfflineTrips } from '../src/domains/itinerary/services/offline-trips.mjs';
import { createItineraryState } from '../src/domains/itinerary/services/itinerary-state.mjs';
import { findFixedVisitIssue } from '../src/domains/planner/services/planner-preflight.mjs';
import { buildTransitDepartureTime } from '../src/domains/map/services/transit-time.mjs';
const memory=()=> { const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}; };
const place={placeId:'hotel',displayName:'Hotel',formattedAddress:'Paris, France',lat:48.8,lng:2.3};
const dates=dateRange('2026-10-17',4);
const plan={days:[{day:1,date:dates[0],scheduleItems:[{type:'attraction',title:'A',time:'10:00',location:'Paris'}]},{day:2,date:dates[1],scheduleItems:[{type:'attraction',title:'B',time:'10:00',location:'Paris'}]}]};

test('inclusive dates, international timezone and DST conversion are independent of the device timezone',()=> {
  assert.deepEqual(dates,['2026-10-17','2026-10-18','2026-10-19','2026-10-20']);
  assert.deepEqual(dateRange('2026-02-30',4),[]);
  assert.equal(travelInstant('2026-07-01','09:00','Europe/Paris').toISOString(),'2026-07-01T07:00:00.000Z');
  assert.equal(travelInstant('2026-12-01','09:00','Europe/Paris').toISOString(),'2026-12-01T08:00:00.000Z');
  assert.equal(travelInstant('2026-03-29','02:30','Europe/Paris'),null);
  assert.equal(travelInstant('2026-10-25','02:30','Europe/Paris').toISOString(),'2026-10-25T01:30:00.000Z');
  assert.equal(localTravelDate(new Date('2026-10-08T00:00:00Z'),'Europe/Paris'),'2026-10-08');
  assert.equal(buildTransitDepartureTime('2026-03-22','09:00',new Date('2026-03-23T00:00:00Z'),'Europe/Paris').toISOString(),'2026-03-29T07:00:00.000Z');
});
test('optional stays, splitting, overlaps, gaps and date shifting preserve per-day overrides',()=> {
  const stays=[{location:place,checkin:dates[0],checkout:dates[2]},{location:'Second hotel',checkin:dates[2],checkout:dates[3]}];
  assert.equal(stayIssue(stays,dates),-1);assert.deepEqual(nightlyStays(stays,dates),[place,place,'Second hotel']);
  assert.equal(stayIssue([{...stays[0],checkout:dates[3]},stays[1]],dates),0);
  assert.deepEqual(nightlyStays([{...stays[0],checkout:dates[0]}],dates),['','','']);
  const changed=moveTripDates({date:dates,stays,dailyLocations:[{day:2,startLocation:'Manual'}]},dateRange('2026-10-20',4));
  assert.equal(changed.stays[0].checkin,'2026-10-20');assert.equal(changed.stays[1].checkout,'2026-10-23');assert.equal(changed.dailyLocations[0].startLocation,'Manual');
  const request=normalizePlannerRequest({destination:{id:'paris',country:'FRA',name:'Paris, France'},date:dates,startTime:'09:00',endTime:'18:00',startLocation:place,endLocation:place,overnightLocations:['','',''],anchorSchedules:[]});
  assert.equal(request.dailyData[1].startLocation,'Paris, France');assert.equal(request.dailyData[0].timeZone,'Europe/Paris');assert.equal(findPlannerRequestIssue(request),null);
});
test('draft reload, guest claiming, account switching, reset and quota failure',()=> {
  let emptyErrors=0;const empty=createPlannerDraftStore({getStorage:memory,getRecoveryStorage:memory,onStorageError:()=>emptyErrors++});empty.setUser('first-owner');assert.equal(emptyErrors,0);assert.deepEqual(empty.read().date,[]);
  const session=memory(),local=memory();
  const create=()=>createPlannerDraftStore({getStorage:()=>session,getRecoveryStorage:()=>local});
  const store=create();store.setUser(null);store.save({date:dates,destination:{id:'paris',country:'FRA',name:'Paris'},stays:[],step:'/plan?review=1'});
  const next=create();next.setUser('owner');assert.equal(next.read().step,'/plan?review=1');
  next.setUser('other');assert.deepEqual(next.read().date,[]);assert.equal(local.getItem('compasser.planner.v1'),null);
  let failed=0;const blocked=createPlannerDraftStore({getStorage:()=>({getItem:()=>null,setItem:()=>{throw Error('quota');}}),onStorageError:()=>failed++});
  blocked.save({date:dates,theme:'photo'});assert.equal(failed,1);assert.equal(blocked.read().theme,'photo');
});
test('only owner private trips can be stored offline; failed writes are not success; removal and account switch clear content',()=> {
  const local=memory(),cache=createOfflineTrips({getStorage:()=>local,now:()=>100});cache.setUser('owner');
  assert.throws(()=>cache.save('owner',{id:'abc',userId:'other',itineraryPlan:plan}));
  cache.save('owner',{id:'abc',userId:'owner',title:'Paris',itineraryPlan:plan});assert.equal(cache.get('owner','abc').savedAt,100);
  const reload=createOfflineTrips({getStorage:()=>local});reload.setUser('owner');assert.equal(reload.list('owner').length,1);assert.equal(reload.get('other','abc'),null);
  reload.remove('owner','abc');assert.equal(reload.list('owner').length,0);
  cache.save('owner',{id:'abc',userId:'owner',itineraryPlan:plan});cache.setUser('other');assert.equal(local.getItem('compasser.offline.v1'),null);
  const blocked=createOfflineTrips({getStorage:()=>({getItem:()=>null,setItem:()=>{throw Error('quota')},removeItem:()=>{}})});blocked.setUser('owner');assert.throws(()=>blocked.save('owner',{id:'abc',userId:'owner',itineraryPlan:plan}));
});
test('trips kept offline take the server plan when the trip list loads; other trips are not cached',()=> {
  const local=memory(),cache=createOfflineTrips({getStorage:()=>local,now:()=>100});cache.setUser('owner');
  cache.save('owner',{id:'abc',userId:'owner',title:'Paris',itineraryPlan:plan});
  const edited=structuredClone(plan);edited.days[0].scheduleItems[0].title='Edited elsewhere';
  cache.refresh('owner',[{id:'abc',userId:'owner',title:'Paris',itineraryPlan:edited},{id:'xyz',userId:'owner',itineraryPlan:plan}]);
  assert.equal(cache.get('owner','abc').itineraryPlan.days[0].scheduleItems[0].title,'Edited elsewhere');
  assert.equal(cache.get('owner','xyz'),null);
});
test('delete undo and dirty state are scoped to each day and cannot edit a shared original',()=> {
  const state=createItineraryState();state.setUser('owner');state.open(structuredClone(plan));
  state.editDayItems(0,[],{undo:true});state.selectDay(1);assert.equal(state.current.undoByDay[1],undefined);assert.deepEqual(state.current.dirtyDays,[0]);
  state.editDayItems(1,[],{undo:true});state.undoDeletion(0);assert.equal(state.current.plan.days[0].scheduleItems[0].title,'A');assert.equal(state.current.plan.days[1].scheduleItems.length,0);
  state.markDayRecalculated(0);assert.deepEqual(state.current.dirtyDays,[1]);state.open(plan,{kind:'shared',id:'share'});assert.equal(state.editDayItems(0,[]),false);
});
test('preflight blocks only same-day fixed overlap and measured travel shortage; other days and automatic visits do not overlap',async()=> {
  const request={date:dates,startTime:'09:00',endTime:'18:00',startLocation:'A',endLocation:'B',anchorSchedules:[{day:1,name:'One',time:'10:00',endTime:'11:00',location:'A'},{day:1,name:'Two',time:'10:30',endTime:'12:00',location:'B'}]};
  assert.equal((await findFixedVisitIssue(request)).reason,'overlap');assert.equal(findPlannerRequestIssue(normalizePlannerRequest(request)).reason,'anchor-overlap');
  request.anchorSchedules[1].time='11:10';assert.equal((await findFixedVisitIssue(request,{travelMinutes:async()=>40})).reason,'travel');
  request.anchorSchedules[1].day=2;assert.equal(await findFixedVisitIssue(request,{travelMinutes:async()=>40}),null);
  request.anchorSchedules[1].day=1;request.anchorSchedules[1].flexible=true;assert.equal(await findFixedVisitIssue(request,{travelMinutes:async()=>40}),null);
});

test('preflight reports a fixed visit outside its day\'s custom hours as out of bounds, not as a travel shortfall',async()=> {
  const request={date:dates.slice(0,2),startTime:'09:00',endTime:'18:00',startLocation:'A',endLocation:'B',
    dailyTimes:[{day:1,startTime:'09:00',endTime:'18:00',isCustom:true},{day:2,startTime:'11:00',endTime:'20:00',isCustom:true}],
    anchorSchedules:[{day:2,name:'Show',time:'10:00',endTime:'12:00',location:'A'}]};
  assert.equal((await findFixedVisitIssue(request,{travelMinutes:async()=>15})).reason,'bounds');
  assert.equal(findPlannerRequestIssue(normalizePlannerRequest(request)).reason,'anchor-bounds');
  request.anchorSchedules[0]={...request.anchorSchedules[0],time:'19:00',endTime:'21:00'};
  assert.equal((await findFixedVisitIssue(request,{travelMinutes:async()=>15})).reason,'bounds');
  request.anchorSchedules[0]={...request.anchorSchedules[0],time:'11:30',endTime:'12:00'};
  assert.equal(await findFixedVisitIssue(request,{travelMinutes:async()=>15}),null);
});

test('server rejects region mismatches, unselected locations and nonexistent DST appointment times',async()=>{
  const input={destination:{id:'paris',country:'FRA',name:'Paris, France'},date:['2030-10-17'],startTime:'09:00',endTime:'18:00',startLocation:place,endLocation:place,anchorSchedules:[]};
  assert.equal(findPlannerRequestIssue(normalizePlannerRequest(input)),null);
  assert.equal(findPlannerRequestIssue(normalizePlannerRequest({...input,destination:{...input.destination,country:'constructor'}})).reason,'travel-region');
  assert.equal(findPlannerRequestIssue(normalizePlannerRequest({...input,destination:{...input.destination,id:'tokyo'}})).reason,'travel-region');
  assert.equal(findPlannerRequestIssue(normalizePlannerRequest({...input,startLocation:'Free text'})).reason,'missing-location');
  const spring={...input,date:['2027-03-28'],startTime:'00:00',anchorSchedules:[{day:1,name:'Booking',location:place,time:'02:30',endTime:'03:30'}]};
  assert.equal(findPlannerRequestIssue(normalizePlannerRequest(spring)).reason,'invalid-anchor-time');
  assert.equal((await findFixedVisitIssue({...input,anchorSchedules:[{day:1,name:'Booking',location:place,time:'10:00',endTime:'11:00'}]},{hoursStatus:async()=> 'closed'})).reason,'hours');
});
