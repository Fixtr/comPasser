import test from 'node:test';
import assert from 'node:assert/strict';
import { addSelectedWaypoint } from '../src/domains/planner/services/selected-waypoint.mjs';

const waypoint = { name: '서울숲', location: '서울숲, 서울 성동구 뚝섬로 273' };
const boundary = (type, time) => ({ type, time, title: type });

test('selected stop replaces an AI visit slot without moving fixed appointments or keeping AI venue claims', () => {
  const days = [{ day: 1, scheduleItems: [boundary('departure', '09:00'),
    { type: 'dining', time: '11:00', endTime: '12:00', title: 'AI 식당', placeIntent: { purpose: '맛집' }, practicalInfo: { estimatedCost: '₩10000' } },
    { type: 'AnchorSchedule', time: '14:00', endTime: '15:00', title: '공연' }, boundary('arrival', '18:00')] }];
  const result = addSelectedWaypoint(days, { selectedWaypoints: [waypoint] });
  assert.deepEqual(result[0].scheduleItems.map(item => item.type), ['departure', 'attraction', 'AnchorSchedule', 'arrival']);
  assert.equal(result[0].scheduleItems[1].title, '서울숲');
  assert.equal(result[0].scheduleItems[1].location, waypoint.location);
  assert.equal(result[0].scheduleItems[1].addedByUser, true);
  assert.equal(result[0].scheduleItems[1].time, '11:00');
  assert.equal(result[0].scheduleItems[2].time, '14:00');
  assert.equal(result[0].scheduleItems[1].placeIntent, undefined);
  assert.equal(result[0].scheduleItems[1].practicalInfo, undefined);
  assert.equal(days[0].scheduleItems[1].title, 'AI 식당');
});

test('a trip with no AI visits gets the selected stop in its largest free gap', () => {
  const days = [{ day: 1, scheduleItems: [boundary('departure', '09:00'),
    { type: 'AnchorSchedule', time: '10:00', endTime: '11:00' }, boundary('arrival', '18:00')] }];
  const result = addSelectedWaypoint(days, { selectedWaypoints: [waypoint] });
  const items = result[0].scheduleItems;
  assert.deepEqual(items.map(item => item.type), ['departure', 'AnchorSchedule', 'attraction', 'arrival']);
  assert.equal(items[1].time, '10:00');
  assert.equal(items[2].addedByUser, true);
  assert.ok(items[2].time >= '11:00' && items[2].endTime <= '18:00');
  assert.equal(items[3].time, '18:00');
});
