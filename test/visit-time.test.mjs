import test from 'node:test';
import assert from 'node:assert/strict';
import {editVisitTime} from '../src/domains/itinerary/services/itinerary-edit.mjs';
import {fitMeasuredSchedule} from '../src/domains/itinerary/services/itinerary-end-fit.mjs';
const fixture=()=>[
  {type:'departure',time:'09:00'},
  {type:'dining',title:'식당',time:'10:54',endTime:'11:24',selectedPlace:{placeId:'retain'}},
  {type:'attraction',time:'11:45',endTime:'12:27'},
  {type:'AnchorSchedule',time:'12:54',endTime:'14:55'},
  {type:'arrival',time:'18:00'}];
test('time edits preserve places/anchors and set earliest visit time immutably',()=>{
  const items=fixture(), before=JSON.stringify(items);
  const result=editVisitTime(items,1,'11:00','11:30');
  assert.equal(result.changed,true);assert.equal(result.items[1].visitNotBefore,'11:00');
  assert.equal(result.items[1].selectedPlace,items[1].selectedPlace);
  assert.equal(result.items[3],items[3]);assert.equal(JSON.stringify(items),before);
});
test('reject fixed/boundary/invalid/overnight/out-of-block edits',()=>{
  for(const [i,a,b] of [[0,'11:00','11:30'],[3,'13:00','14:00'],[4,'17:00','18:00'],[-1,'11:00','11:30'],
    [1,'25:00','26:00'],[1,'23:00','01:00'],[1,'11:00','11:00'],[1,'08:00','10:00'],[1,'12:00','13:00']])
    assert.equal(editVisitTime(fixture(),i,a,b).changed,false);
});
test('fit respects opening-time wait while shortening later stay to preserve anchor',()=>{
  const items=editVisitTime(fixture(),1,'11:00','11:30').items;
  const routes=[10,21,27,10].map((durationMinutes,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes}));
  const result=fitMeasuredSchedule(items,routes,'18:00','09:00');
  assert.equal(result.items[1].time,'11:00');
  assert.equal(result.items[2].endTime,'12:27');
  assert.equal(result.items[3].time,'12:54');
  assert.ok(result.adjusted);
});
