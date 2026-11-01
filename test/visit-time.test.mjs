import test from 'node:test';
import assert from 'node:assert/strict';
import {editVisitTime} from '../src/domains/itinerary/services/itinerary-edit.mjs';
import {fitMeasuredSchedule} from '../src/domains/itinerary/services/itinerary-end-fit.mjs';
import {visitTimeError} from '../src/domains/itinerary/ui/visit-time-editor.js';
import {setLang} from '../src/utils/i18n.js';
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
test('a rejected time reports the real surrounding limits',()=>{
  for(const [a,b] of [['08:00','10:00'],['12:00','13:00'],['11:00','11:00'],['',''] ]){
    const {lower,upper}=editVisitTime(fixture(),1,a,b);
    assert.deepEqual([lower,upper],['09:00','12:54']);
  }
  const after=editVisitTime(fixture().slice(0,2),1,'08:00','10:00'), before=editVisitTime(fixture().slice(1,4),0,'12:00','13:00');
  assert.deepEqual([after.lower,after.upper],['09:00','']);
  assert.deepEqual([before.lower,before.upper],['','12:54']);
});
test('no range is made up when none exists',()=>{
  const none=editVisitTime([{type:'dining'}],0,'11:00','11:00');
  assert.deepEqual([none.changed,none.lower,none.upper],[false,'','']);
  const closed=editVisitTime([{type:'AnchorSchedule',time:'10:00',endTime:'12:00'},{type:'dining'},{type:'AnchorSchedule',time:'12:00'}],1,'11:00','11:30');
  assert.deepEqual([closed.changed,closed.lower,closed.upper],[false,'','']);
  const broken=editVisitTime([{type:'departure',time:'soon'},{type:'dining'}],1,'11:00','11:30');
  assert.deepEqual([broken.changed,broken.lower,broken.upper],[false,'','']);
  // One valid and one malformed boundary: every entry fails, so the valid one is no usable limit.
  const brokenLower=editVisitTime([{type:'departure',time:'9:00'},{type:'dining'},{type:'AnchorSchedule',time:'12:54'}],1,'10:00','11:00');
  assert.deepEqual([brokenLower.changed,brokenLower.lower,brokenLower.upper],[false,'','']);
  const brokenUpper=editVisitTime([{type:'departure',time:'09:00'},{type:'dining'},{type:'AnchorSchedule',time:'soon'}],1,'10:00','11:00');
  assert.deepEqual([brokenUpper.changed,brokenUpper.lower,brokenUpper.upper],[false,'','']);
});
test('the error names the range in both languages',()=>{
  for(const [lang,noRange] of [['ko','종료'],['en','end']]){
    setLang(lang);
    const both=visitTimeError({lower:'09:00',upper:'12:54'});
    assert.ok(both.includes('09:00')&&both.includes('12:54'),both);
    const from=visitTimeError({lower:'09:00',upper:''}), until=visitTimeError({lower:'',upper:'12:54'});
    assert.ok(from.includes('09:00'),from);assert.ok(until.includes('12:54'),until);
    for(const text of [both,from,until,visitTimeError({lower:'',upper:''})]){
      assert.ok(!text.includes('{'),text);assert.ok(text.includes(noRange),text);
    }
    assert.ok(!/\d\d:\d\d/.test(visitTimeError({lower:'',upper:''})));
  }
  setLang('ko');
});
