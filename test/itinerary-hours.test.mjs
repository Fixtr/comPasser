import test from 'node:test';
import assert from 'node:assert/strict';
import { assessVisitHours as assess, createHoursLookup, hoursPlaceId } from '../src/domains/itinerary/services/itinerary-hours.mjs';
const p = (day, hour, minute=0) => ({day,hour,minute});
const data = periods => ({utcOffsetMinutes:540,regularOpeningHours:{periods}});
const check = (time,endTime,periods,date='2026-09-17') => assess({time,endTime},date,data(periods));
test('hours compare entire visit, breaks, boundaries and closed weekdays',()=>{
  const periods=[{open:p(4,11),close:p(4,15)},{open:p(4,17,30),close:p(4,21)}];
  assert.equal(check('10:54','11:24',periods),'conflict');
  assert.equal(check('19:50','21:20',periods),'conflict');
  assert.equal(check('14:50','17:40',periods),'conflict');
  assert.equal(check('11:00','15:00',periods),'regular');
  assert.equal(check('11:00','12:00',periods,'2026-09-18'),'conflict');
});
test('overnight and week wrap, 24 hours, adjacent periods',()=>{
  assert.equal(check('23:00','01:00',[{open:p(4,22),close:p(5,2)}]),'regular');
  assert.equal(check('00:30','01:30',[{open:p(6,22),close:p(0,2)}],'2026-09-20'),'regular');
  assert.equal(check('23:00','01:00',[{open:p(0,0)}]),'regular');
  assert.equal(check('11:00','13:00',[{open:p(4,10),close:p(4,12)},{open:p(4,12),close:p(4,14)}]),'regular');
});
test('unknown or malformed data never certifies opening',()=>{
  for(const periods of [[],[{open:p(4,11)}],[{open:p(4,25),close:p(4,26)}]])
    assert.equal(check('11:00','12:00',periods),'unknown');
  assert.equal(check('11:00','12:00',[],'2026-02-30'),'unknown');
  assert.equal(assess({time:'11:00',endTime:'12:00'},'2026-09-17',{utcOffsetMinutes:0}),'unknown');
  assert.equal(assess({},'2026-09-17',{utcOffsetMinutes:540,businessStatus:'CLOSED_TEMPORARILY'},
    Date.parse('2026-09-17T00:00:00Z')),'closed');
  assert.equal(assess({time:'11:00',endTime:'12:00'},'2026-09-18',
    {utcOffsetMinutes:540,businessStatus:'CLOSED_TEMPORARILY'},Date.parse('2026-09-17T00:00:00Z')),'unknown');
  assert.equal(hoursPlaceId({practicalInfo:{operatingHours:'24시간'}}),null);
});
test('near-term exceptional hours take precedence over regular hours',()=>{
  const regular=[{open:p(4,9),close:p(4,18)}];
  const exceptional=[{open:p(4,13),close:p(4,17)}];
  const hours={...data(regular),currentOpeningHours:{periods:exceptional}};
  const now=Date.parse('2026-09-16T15:00:00Z'); // Sep 17 in Korea
  assert.equal(assess({time:'10:00',endTime:'11:00'},'2026-09-17',hours,now),'conflict');
  assert.equal(assess({time:'14:00',endTime:'15:00'},'2026-09-17',hours,now),'current');
  assert.equal(assess({time:'10:00',endTime:'11:00'},'2026-09-24',hours,now),'regular');
  assert.equal(assess({time:'14:00',endTime:'15:00'},'2026-09-17',
    {...hours,currentOpeningHours:{periods:[]}},now),'conflict');
});
test('lookup coalesces, expires and safely handles denial and timeout',async()=>{
  let calls=0, now=0;
  const lookup=createHoursLookup(async()=>({Place:class {async fetchFields(){calls++;this.utcOffsetMinutes=540;}}}),{now:()=>now});
  await Promise.all([lookup('id'),lookup('id')]); assert.equal(calls,1);
  now=300001;await lookup('id');assert.equal(calls,2);
  assert.equal(await createHoursLookup(async()=>{throw Error('denied');})('id'),null);
  assert.equal(await createHoursLookup(()=>new Promise(()=>{}),{timeoutMs:5})('id'),null);
});
test('identity is required and unresolved recommendations cannot reuse a stale ID',()=>{
  const selectedPlace={placeId:'id',displayName:'식당',formattedAddress:'서울',lat:37,lng:127};
  assert.equal(hoursPlaceId({selectedPlace}),'id');
  assert.equal(hoursPlaceId({resolvedPlace:selectedPlace}),'id');
  assert.equal(hoursPlaceId({selectedPlace,placeIntent:{},placeStatus:'unresolved'}),null);
  assert.equal(hoursPlaceId({selectedPlace:{placeId:'id'}}),null);
  const item=Object.freeze({time:'19:50',endTime:'21:20'});
  assert.equal(assess(item,'2026-09-17',data([{open:p(4,11),close:p(4,21)}])),'conflict');
  assert.equal(item.endTime,'21:20');
});
