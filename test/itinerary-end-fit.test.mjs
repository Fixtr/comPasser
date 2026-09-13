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
const routes = [35,27,10,41].map((durationMinutes, fromIndex) => ({fromIndex,toIndex:fromIndex+1,durationMinutes}));

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
