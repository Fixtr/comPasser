import test from 'node:test';
import assert from 'node:assert/strict';

import { applyTransitDelays } from '../src/domains/itinerary/services/itinerary-schedule-adjust.mjs';

test('a visit that overlaps the real transit time is pushed back, keeping its own duration', () => {
  // 사용자가 보고한 정확한 케이스: 10:47 출발, 45분 이동, 그런데 다음 항목이
  // 이동시간을 무시하고 10:47부터 1시간으로 잡혀 있던 상황
  const scheduleItems = [
    { time: '10:47', endTime: '', title: '출발' },
    { time: '10:47', endTime: '11:47', title: '국립중앙박물관' }
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 45 }
  ];

  const [, museum] = applyTransitDelays(scheduleItems, transitRoutes);

  assert.equal(museum.time, '11:32'); // 10:47 + 45분
  assert.equal(museum.endTime, '12:32'); // 원래 1시간 체류가 그대로 유지된 채 뒤로 밀림
});

test('a segment that already has enough buffer is left untouched', () => {
  const scheduleItems = [
    { time: '09:00', endTime: '10:00', title: 'A' },
    { time: '11:00', endTime: '12:00', title: 'B' } // 이미 1시간 여유
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 20 }
  ];

  const [, b] = applyTransitDelays(scheduleItems, transitRoutes);

  assert.equal(b.time, '11:00');
  assert.equal(b.endTime, '12:00');
});

test('delays cascade through the rest of the day', () => {
  const scheduleItems = [
    { time: '09:00', endTime: '10:00', title: 'A' },
    { time: '10:00', endTime: '11:00', title: 'B' },
    { time: '11:00', endTime: '12:00', title: 'C' }
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 30 }, // A -> B: 30분 지연 발생
    { fromIndex: 1, toIndex: 2, durationMinutes: 10 }  // B -> C: 밀린 B 기준으로 다시 계산
  ];

  const [a, b, c] = applyTransitDelays(scheduleItems, transitRoutes);

  assert.equal(a.time, '09:00'); // 첫 항목은 그대로
  assert.equal(b.time, '10:30'); // 10:00 + 30분 지연
  assert.equal(b.endTime, '11:30');
  assert.equal(c.time, '11:40'); // 밀린 B의 종료(11:30) + 10분
  assert.equal(c.endTime, '12:40');
});

test('unknown transit duration (failed segment) leaves that boundary untouched', () => {
  const scheduleItems = [
    { time: '09:00', endTime: '10:00', title: 'A' },
    { time: '10:00', endTime: '11:00', title: 'B' }
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: null } // Directions API 실패 폴백
  ];

  const [, b] = applyTransitDelays(scheduleItems, transitRoutes);

  assert.equal(b.time, '10:00');
  assert.equal(b.endTime, '11:00');
});

test('malformed time strings are skipped instead of throwing', () => {
  const scheduleItems = [
    { time: '', endTime: '', title: 'A' },
    { time: '10:00', endTime: '11:00', title: 'B' }
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 30 }
  ];

  assert.doesNotThrow(() => applyTransitDelays(scheduleItems, transitRoutes));
  const [, b] = applyTransitDelays(scheduleItems, transitRoutes);
  assert.equal(b.time, '10:00'); // prevEnd를 알 수 없으니 보정하지 않음
});

test('an item without endTime (e.g. departure marker) only shifts its own time', () => {
  const scheduleItems = [
    { time: '09:00', endTime: '', title: '출발' },
    { time: '09:00', endTime: '', title: '도착', type: 'arrival' }
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 25 }
  ];

  const [, arrival] = applyTransitDelays(scheduleItems, transitRoutes);
  assert.equal(arrival.time, '09:25');
  assert.equal(arrival.endTime, '');
});

test('empty inputs are returned as-is without throwing', () => {
  assert.deepEqual(applyTransitDelays([], []), []);
  assert.deepEqual(applyTransitDelays([{ time: '09:00' }], []), [{ time: '09:00' }]);
  assert.equal(applyTransitDelays(null, []), null);
});

test('the input array is not mutated', () => {
  const scheduleItems = [
    { time: '10:47', endTime: '', title: '출발' },
    { time: '10:47', endTime: '11:47', title: '박물관' }
  ];
  const frozenCopy = JSON.parse(JSON.stringify(scheduleItems));
  applyTransitDelays(scheduleItems, [{ fromIndex: 0, durationMinutes: 45 }]);
  assert.deepEqual(scheduleItems, frozenCopy);
});
