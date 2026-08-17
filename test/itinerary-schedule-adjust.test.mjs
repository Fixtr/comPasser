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

test('a missing single hop mid-chain no longer lets a later item show an earlier time than the one before it', () => {
  // 실제 사용자 제보 재현: A -> B 구간은 실제 이동시간이 40분으로 밝혀져
  // B가 뒤로 밀리는데, B -> C 구간(예: "공항으로 이동 준비"처럼 지오코딩이
  // 안 되는 모호한 장소)은 Directions 결과가 아예 없다. 이 경우에도 C가
  // B보다 앞선 시각에 남아있으면 안 된다.
  const scheduleItems = [
    { time: '09:00', endTime: '10:00', title: 'A' },
    { time: '10:00', endTime: '10:30', title: 'B' },
    { time: '10:05', endTime: '10:35', title: 'C (이동시간 데이터 없음)' }
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 40 } // A -> B 만 실제 데이터 있음
    // B -> C 구간은 지오코딩 실패로 아예 transitRoutes에 없음
  ];

  const [a, b, c] = applyTransitDelays(scheduleItems, transitRoutes);

  assert.equal(a.time, '09:00');
  assert.equal(b.time, '10:40'); // 10:00 + 40분
  assert.equal(b.endTime, '11:10');
  // B가 11:10에 끝나므로, 이동시간을 모르더라도 C는 최소 11:10 이후여야 한다.
  assert.equal(c.time, '11:10');
  assert.equal(c.endTime, '11:40'); // 원래 30분 체류가 유지된 채 뒤로 밀림
});

test('the final arrival item never gets pushed past the user-set end time, even when earlier delays cascade into it', () => {
  // 사용자 제보: 시작 시간은 지키지만 종료 시각을 넘겨서 끝나는 경우가
  // 있었다. enforcePlannerConstraints 가 도착 항목을 정확히 21:56 으로
  // 고정해도, 앞선 저녁식사가 실제 이동시간 때문에 크게 밀리면 그 뒤를
  // 따라 도착 항목까지 21:56 을 넘겨 밀렸다. 일찍 끝나는 건 괜찮지만
  // 종료 시각을 넘기면 안 된다.
  const scheduleItems = [
    { time: '20:27', endTime: '21:27', title: '저녁 식사' },
    { time: '21:56', endTime: '', title: '도착', type: 'arrival' } // enforcePlannerConstraints 가 고정한 값
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 45 } // 21:27 + 45분 = 22:12, 21:56 을 넘김
  ];

  const [dinner, arrival] = applyTransitDelays(scheduleItems, transitRoutes, '21:56');

  assert.equal(dinner.time, '20:27'); // 첫 항목은 그대로
  // 도착 항목은 계산상 22:12 가 되어야 하지만, 사용자가 지정한 종료 시각(21:56)을 넘지 않는다.
  assert.equal(arrival.time, '21:56');
  assert.equal(arrival.endTime, '');
});

test('the final item can still be pushed later as long as it stays within the day end time', () => {
  const scheduleItems = [
    { time: '20:00', endTime: '20:30', title: 'A' },
    { time: '20:40', endTime: '', title: '도착', type: 'arrival' }
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 20 } // 20:30 + 20분 = 20:50, 21:56 안쪽
  ];

  const [, arrival] = applyTransitDelays(scheduleItems, transitRoutes, '21:56');

  assert.equal(arrival.time, '20:50'); // 종료 시각(21:56) 안쪽이라 정상적으로 밀림
});

test('without a dayEndTime argument, the final item is pushed with no ceiling (backward compatible)', () => {
  const scheduleItems = [
    { time: '20:00', endTime: '20:30', title: 'A' },
    { time: '20:40', endTime: '', title: '도착', type: 'arrival' }
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 90 } // 20:30 + 90분 = 22:00
  ];

  const [, arrival] = applyTransitDelays(scheduleItems, transitRoutes);

  assert.equal(arrival.time, '22:00'); // dayEndTime을 안 넘겼으니 상한 없이 그대로 밀림
});

test('a final item whose time already wrapped past midnight is still clamped to the day end time', () => {
  // "01:33" 처럼 자정을 넘긴 시각은 숫자로만 보면 "21:56"보다 작아 보여
  // 상한을 넘지 않은 것처럼 착각하기 쉽다.
  const scheduleItems = [
    { time: '21:33', endTime: '23:03', title: '광화문 맛집 저녁 식사' },
    { time: '01:33', endTime: '02:59', title: '인천국제공항 이동', type: 'arrival' }
  ];

  const [, arrival] = applyTransitDelays(scheduleItems, [], '21:56');

  assert.equal(arrival.time, '21:56');
  assert.equal(arrival.endTime, '21:56');
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
