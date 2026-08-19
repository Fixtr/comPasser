import test from 'node:test';
import assert from 'node:assert/strict';

import { removeScheduleItem, moveScheduleItem, isEditableItem } from '../src/domains/itinerary/services/itinerary-edit.mjs';

const day = () => ([
  { time: '09:00', endTime: '', type: 'departure', title: '출발' },
  { time: '10:00', endTime: '11:00', type: 'attraction', title: 'A' },
  { time: '11:30', endTime: '13:00', type: 'dining', title: 'B' },
  { time: '13:30', endTime: '14:30', type: 'attraction', title: 'C' },
  { time: '15:00', endTime: '', type: 'arrival', title: '도착' }
]);

const titles = (items) => items.map(i => i.title);

test('boundary items are not editable', () => {
  assert.equal(isEditableItem({ type: 'departure' }), false);
  assert.equal(isEditableItem({ type: 'arrival' }), false);
  assert.equal(isEditableItem({ type: 'attraction' }), true);
  assert.equal(isEditableItem({ type: 'AnchorSchedule' }), true, '필수 일정도 사용자가 뺄 수 있다');
});

test('removing a stop pulls the rest of the day forward', () => {
  // 삭제만 하고 시각을 그대로 두면 그 자리에 빈 시간이 남는다.
  const { items, removed } = removeScheduleItem(day(), 2); // B (11:30-13:00, 뒤 간격 30분)

  assert.equal(removed.title, 'B');
  assert.deepEqual(titles(items), ['출발', 'A', 'C', '도착']);
  assert.equal(items[2].time, '11:30', 'C 가 B 가 비운 자리로 당겨진다');
  assert.equal(items[2].endTime, '12:30', '체류 시간(1시간)은 유지된다');
  assert.equal(items[3].time, '13:00', '도착도 함께 당겨진다');
});

test('departure and arrival cannot be removed', () => {
  const original = day();
  assert.equal(removeScheduleItem(original, 0).removed, null);
  assert.equal(removeScheduleItem(original, 4).removed, null);
  assert.deepEqual(titles(removeScheduleItem(original, 0).items), titles(original));
});

test('removing with an invalid index changes nothing', () => {
  const original = day();
  assert.equal(removeScheduleItem(original, 99).removed, null);
  assert.equal(removeScheduleItem(original, -1).removed, null);
  assert.equal(removeScheduleItem(null, 0).removed, null);
});

test('moving swaps the content but keeps each time slot', () => {
  // 시각까지 따라 옮기면 옮긴 항목이 하루 흐름에서 벗어난 시각을 갖게 된다.
  const { items, moved } = moveScheduleItem(day(), 1, 1); // A 를 아래로

  assert.equal(moved, true);
  assert.deepEqual(titles(items), ['출발', 'B', 'A', 'C', '도착']);
  assert.equal(items[1].time, '10:00', '첫 슬롯의 시각은 그대로');
  assert.equal(items[2].time, '11:30', '두 번째 슬롯의 시각도 그대로');
});

test('a move that would cross a boundary is refused', () => {
  const original = day();
  // A(index 1)를 위로 옮기면 출발(index 0)과 바뀌게 된다.
  const up = moveScheduleItem(original, 1, -1);
  assert.equal(up.moved, false);
  assert.deepEqual(titles(up.items), titles(original));

  // C(index 3)를 아래로 옮기면 도착(index 4)과 바뀌게 된다.
  const down = moveScheduleItem(original, 3, 1);
  assert.equal(down.moved, false);
});

test('moving past either end of the list is refused', () => {
  const original = day();
  assert.equal(moveScheduleItem(original, 0, -1).moved, false);
  assert.equal(moveScheduleItem(original, 4, 1).moved, false);
  assert.equal(moveScheduleItem(original, 99, 1).moved, false);
});

test('edits never mutate the input array', () => {
  const original = day();
  const snapshot = JSON.parse(JSON.stringify(original));

  removeScheduleItem(original, 2);
  moveScheduleItem(original, 1, 1);

  assert.deepEqual(original, snapshot);
});

test('items with malformed times are handled without throwing', () => {
  const broken = [
    { time: 'x', endTime: 'y', type: 'attraction', title: 'A' },
    { time: '10:00', endTime: '11:00', type: 'attraction', title: 'B' }
  ];
  assert.doesNotThrow(() => removeScheduleItem(broken, 0));
  assert.doesNotThrow(() => moveScheduleItem(broken, 0, 1));
});
