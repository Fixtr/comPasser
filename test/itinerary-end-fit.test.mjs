import test from 'node:test';
import assert from 'node:assert/strict';
import { fitMeasuredSchedule, hasFixedArrivalConflict } from '../src/domains/itinerary/services/itinerary-end-fit.mjs';
import { trimScheduleToEndTime } from '../src/domains/itinerary/services/itinerary-schedule-adjust.mjs';

const items = () => [
  { type:'departure', time:'10:00', endTime:'', title:'서울역' },
  { type:'attraction', time:'10:35', endTime:'12:35', title:'식물원', duration:'2시간' },
  { type:'dining', time:'12:35', endTime:'13:35', title:'점심' },
  { type:'attraction', time:'13:35', endTime:'15:35', title:'쇼핑몰', duration:'2시간' },
  { type:'arrival', time:'16:00', endTime:'', title:'서울역' }
];

test('이동 경로가 없어도 고정 일정과 이미 겹치는 방문은 경고한다', () => {
  const plan = [
    {type:'departure',time:'10:00'},
    {type:'dining',time:'12:32',endTime:'13:32'},
    {type:'AnchorSchedule',time:'13:00',endTime:'14:00'}
  ];
  assert.equal(hasFixedArrivalConflict(plan, []), true);
  assert.equal(hasFixedArrivalConflict(plan, [{fromIndex:0,toIndex:1,durationMinutes:32}]), true);
  plan[1].endTime = '12:30';
  assert.equal(hasFixedArrivalConflict(plan, []), false);
});
const routes = [35,27,10,41].map((durationMinutes, fromIndex) => ({fromIndex,toIndex:fromIndex+1,durationMinutes}));

test('automatic and manual fitting keep meals at 60 minutes while cafes may shrink to 20', () => {
  for (const category of ['restaurant', 'cafe']) {
    const plan = [{type:'departure',time:'09:00'},
      {type:'dining',title:'방문',time:'09:00',endTime:'10:30',placeIntent:{category}},
      {type:'arrival',time:'10:30'}];
    const measured = [15,15].map((durationMinutes,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes}));
    const result = fitMeasuredSchedule(plan,measured,'10:00');
    assert.equal(result.adjusted,true);
    if(category === 'restaurant') assert.deepEqual(result.items.map(item=>item.type),['departure','arrival']);
    else {
      assert.ok(result.items[1].endTime >= '09:35');
      assert.equal(result.items.at(-1).time,'10:00');
    }
    const manual = trimScheduleToEndTime(plan,'09:40');
    const kept = manual.items.find(i=>i.type === 'dining');
    if(category === 'restaurant') assert.equal(kept,undefined);
    else assert.equal(kept.endTime,'09:40');
  }
});

test('fitting cannot borrow time before the requested departure', () => {
  const plan = [{type:'departure',time:'07:51',endTime:'09:00'},
    {type:'attraction',time:'08:10',endTime:'09:10'},
    {type:'AnchorSchedule',time:'09:40',endTime:'10:00'},
    {type:'arrival',time:'18:00'}];
  const measured = [10,10].map((durationMinutes,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes}));
  const fitted = fitMeasuredSchedule(plan,measured,'18:00','09:00');
  assert.equal(fitted.adjusted,true);
  assert.equal(fitted.items[0].time,'09:00');
  assert.equal(fitted.items[1].time,'09:10');
  assert.equal(fitted.items[1].endTime,'09:30');
  assert.equal(fitted.items[2].time,'09:40');
  assert.deepEqual(fitMeasuredSchedule(fitted.items,measured,'18:00','09:00').items,fitted.items);
  const impossible = fitMeasuredSchedule(plan,measured,'18:00','09:20');
  assert.equal(impossible.adjusted,false);
  assert.equal(impossible.items[0].time,'09:20');
  assert.equal(hasFixedArrivalConflict(impossible.items,measured),true);
});

test('실제 제보: 오후 미확인 장소가 있어도 박물관 이전 측정 구간은 독립 조정한다', () => {
  const plan=[
    {type:'departure',time:'09:00'},
    {type:'attraction',time:'09:08',endTime:'11:38'},
    {type:'dining',time:'11:55',endTime:'12:25'},
    {type:'dining',time:'12:46',endTime:'13:40'},
    {type:'AnchorSchedule',time:'12:54',endTime:'14:55'},
    {type:'leisure',time:'14:55',endTime:'15:25'},
    {type:'arrival',time:'18:00'}
  ];
  const measured=[8,10,21,27].map((durationMinutes,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes}));
  const result=fitMeasuredSchedule(plan,measured,'18:00');
  assert.equal(result.adjusted,true);
  assert.equal(result.items[3].endTime,'12:27');
  assert.deepEqual(result.items[4],plan[4]);
  assert.equal(hasFixedArrivalConflict(result.items,measured),false);
  assert.equal(result.items[5].time,'14:55');
  const again=fitMeasuredSchedule(result.items,measured,'18:00');
  assert.equal(again.adjusted,false);
  assert.deepEqual(again.items,result.items);
});

test('앞 고정 구간이 불가능해도 뒤쪽의 가능한 측정 구간은 조정한다', () => {
  const plan=[{type:'departure',time:'09:00'}, {type:'AnchorSchedule',time:'09:05',endTime:'10:00'},
    {type:'attraction',time:'10:10',endTime:'12:10'}, {type:'arrival',time:'12:30'}];
  const measured=[30,10,30].map((durationMinutes,fromIndex)=>({fromIndex,durationMinutes}));
  const result=fitMeasuredSchedule(plan,measured,'12:00');
  assert.equal(result.adjusted,true);
  assert.equal(result.items.at(-1).time,'12:00');
  assert.equal(result.items[1].time,'09:05');
  assert.equal(hasFixedArrivalConflict(result.items,measured),true);
});

test('53분 초과 사례는 쇼핑몰 체류를 줄여 16:00에 실제 도착한다', () => {
  const original = items(), before = structuredClone(original);
  const result = fitMeasuredSchedule(original, routes, '16:00');
  assert.equal(result.adjusted, true);
  assert.equal(result.items[3].time, '14:12');
  assert.equal(result.items[3].endTime, '15:19');
  assert.equal(result.items[4].time, '16:00');
  assert.equal(result.items[3].duration, undefined);
  assert.deepEqual(original, before);
  assert.equal(result.items.length, original.length);
});

test('이미 맞춘 일정은 반복 응답으로 계속 줄어들지 않는다', () => {
  const once = fitMeasuredSchedule(items(), routes, '16:00');
  const twice = fitMeasuredSchedule(once.items, routes, '16:00');
  assert.equal(twice.adjusted, false);
  assert.deepEqual(twice.items, once.items);
});

test('교통시간을 모르는 구간이나 잘못된 시간 값으로 성공을 주장하지 않는다', () => {
  for (const durations of [routes.slice(1), routes.map(r => ({...r,durationMinutes:null})), routes.map(r => ({...r,durationMinutes:-1}))]) {
    assert.equal(fitMeasuredSchedule(items(), durations, '16:00').adjusted, false);
  }
  assert.equal(fitMeasuredSchedule(items(), routes, '25:00').adjusted, false);
});

test('최소 체류로도 불가능하면 장소를 삭제하거나 도착 시각을 속이지 않는다', () => {
  const result = fitMeasuredSchedule(items(), routes, '11:00');
  assert.equal(result.adjusted, false);
  assert.equal(result.items.at(-1).time, '16:53');
  assert.equal(result.items.length, 5);
});

test('고정 일정 양쪽을 별도로 조정하고 고정 일정 시간은 유지한다', () => {
  const original = items();
  original[2] = {...original[2],type:'AnchorSchedule',time:'12:00',endTime:'13:00'};
  const result = fitMeasuredSchedule(original, routes, '15:00');
  assert.equal(result.adjusted, true);
  assert.equal(result.items[1].endTime, '11:33');
  assert.deepEqual(result.items[2], original[2]);
  assert.equal(result.items.at(-1).time, '15:00');
});

test('고정 일정에 도달할 수 없어도 고정 시간을 뒤로 옮기지 않는다', () => {
  const original = items();
  original[1] = {...original[1],type:'AnchorSchedule',time:'10:10',endTime:'12:10'};
  const result = fitMeasuredSchedule(original, routes, '13:00');
  assert.equal(result.adjusted, false);
  assert.deepEqual(result.items[1], original[1]);
  assert.equal(hasFixedArrivalConflict(result.items, routes), true);
});

test('수동 단축도 앞 방문을 삭제했다고 고정 일정을 당기지 않는다', () => {
  const original = [
    {type:'departure',time:'09:00'},
    {type:'attraction',time:'09:10',endTime:'10:10',title:'방문'},
    {type:'AnchorSchedule',time:'11:00',endTime:'12:00'},
    {type:'arrival',time:'12:30'}
  ];
  const result = trimScheduleToEndTime(original,'11:30');
  assert.equal(result.items.find(item=>item.type==='AnchorSchedule').time, '11:00');
  assert.equal(result.resolved, false);
});

test('종료 시각 내에 여유가 있으면 원래 방문 시간을 유지한다', () => {
  const result = fitMeasuredSchedule(items(), routes, '18:00');
  assert.equal(result.adjusted, false);
  assert.equal(result.items[3].duration, '2시간');
});

test('generated unresolved visits are removed before route fitting, while user-added stops remain', () => {
  const plan = [
    {type:'departure',time:'09:00'},
    {type:'attraction',time:'10:00',endTime:'11:00',placeIntent:{purpose:'park'},placeStatus:'unresolved',unresolvedReason:'filtered'},
    {type:'attraction',time:'12:00',endTime:'13:00',addedByUser:true,placeIntent:{purpose:'museum'},placeStatus:'unresolved'},
    {type:'arrival',time:'18:00'}
  ];
  const result = fitMeasuredSchedule(plan,[],'18:00');
  assert.equal(result.adjusted,true);
  assert.deepEqual(result.items.map(item=>item.type),['departure','attraction','arrival']);
  assert.equal(result.items[1].addedByUser,true);
});

test('a Places outage keeps generated visits for retry', () => {
  const plan = [{type:'departure',time:'09:00'},
    {type:'attraction',time:'10:00',endTime:'11:00',placeIntent:{purpose:'park'},placeStatus:'unresolved',unresolvedReason:'search-failed'},
    {type:'arrival',time:'18:00'}];
  const result = fitMeasuredSchedule(plan,[],'18:00');
  assert.equal(result.adjusted,false);
  assert.equal(result.items.length,3);
});

test('fully measured visit is removed when minimum stay cannot meet fixed appointment', () => {
  const plan = [
    {type:'departure',time:'14:00'},
    {type:'leisure',time:'14:27',endTime:'15:27',title:'workshop',placeIntent:{purpose:'workshop'}},
    {type:'AnchorSchedule',time:'15:00',endTime:'16:00',title:'palace'},
    {type:'arrival',time:'19:00'}
  ];
  const result = fitMeasuredSchedule(plan,[{fromIndex:0,toIndex:1,durationMinutes:27},{fromIndex:1,toIndex:2,durationMinutes:21}], '19:00');
  assert.equal(result.adjusted,true);
  assert.deepEqual(result.items.map(item=>item.title),[undefined,'palace',undefined]);
  assert.equal(result.items[1].time,'15:00');
});

test('late measured airport dinner is removed, leaving the next route unverified', () => {
  const plan = [
    {type:'departure',time:'09:00'},
    {type:'AnchorSchedule',time:'15:00',endTime:'16:00'},
    {type:'dining',time:'19:00',endTime:'20:30',placeIntent:{category:'restaurant'}},
    {type:'arrival',time:'21:00'}
  ];
  const result = fitMeasuredSchedule(plan,[{fromIndex:1,toIndex:2,durationMinutes:30},{fromIndex:2,toIndex:3,durationMinutes:130}],'21:00');
  assert.equal(result.adjusted,true);
  assert.deepEqual(result.items.map(item=>item.type),['departure','AnchorSchedule','arrival']);
  assert.equal(result.items[1].endTime,'16:00');
});

test('a final two-minute airport overrun is fitted on the next measured pass', () => {
  const plan = [
    {type:'departure',time:'09:00'},
    {type:'attraction',time:'09:26',endTime:'10:56'},
    {type:'dining',time:'11:17',endTime:'12:47',placeIntent:{category:'restaurant'}},
    {type:'AnchorSchedule',time:'15:00',endTime:'16:00'},
    {type:'dining',time:'18:00',endTime:'19:15',placeIntent:{category:'restaurant'}},
    {type:'arrival',time:'21:02'}
  ];
  const routes = [8,9,31,20,107].map((durationMinutes,fromIndex)=>({fromIndex,toIndex:fromIndex+1,durationMinutes}));
  const fitted = fitMeasuredSchedule(plan,routes,'21:00','09:00');
  assert.equal(fitted.adjusted,true);
  assert.equal(fitted.items.at(-1).time,'21:00');
  assert.ok(fitted.items[4].time >= '18:00');
  assert.ok((Number(fitted.items[4].endTime.slice(0,2))*60+Number(fitted.items[4].endTime.slice(3))) -
    (Number(fitted.items[4].time.slice(0,2))*60+Number(fitted.items[4].time.slice(3))) >= 60);
});
