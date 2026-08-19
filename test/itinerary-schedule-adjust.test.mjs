import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTransitDelays,
  getEndTimeOverflowMinutes,
  trimScheduleToEndTime
} from '../src/domains/itinerary/services/itinerary-schedule-adjust.mjs';

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

test('the final arrival keeps its true computed time even when it exceeds the user-set end time', () => {
  // 사용자 제보: 예전에는 이 상황에서 도착 시각을 종료 시각으로 눌러
  // 표시했는데, 그러면 "20:07 에 끝나고 94분 이동했는데 20:51 도착" 같은
  // 사실과 다른 시각이 나왔다. 시각은 계산 결과 그대로 두고, 초과했다는
  // 사실은 getEndTimeOverflowMinutes 로 따로 알린다.
  const scheduleItems = [
    { time: '20:27', endTime: '21:27', title: '저녁 식사' },
    { time: '21:56', endTime: '', title: '도착', type: 'arrival' }
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 45 } // 21:27 + 45분 = 22:12
  ];

  const [dinner, arrival] = applyTransitDelays(scheduleItems, transitRoutes);

  assert.equal(dinner.time, '20:27'); // 첫 항목은 그대로
  assert.equal(arrival.time, '22:12'); // 눌러 담지 않고 사실대로
  assert.equal(arrival.endTime, '');

  // 종료 시각(21:56) 대비 16분 초과 -> UI 가 경고를 띄울 수 있다.
  assert.equal(getEndTimeOverflowMinutes([dinner, arrival], '21:56'), 16);
});

test('the reported screenshot case yields the honest arrival time and its overflow', () => {
  // 카페 19:07~20:07, 실제 이동 94분, 종료 예정 20:51
  const scheduleItems = [
    { time: '19:07', endTime: '20:07', title: '간식 및 카페' },
    { time: '20:51', endTime: '', title: '도착 · 인천공항', type: 'arrival' }
  ];

  const [, arrival] = applyTransitDelays(scheduleItems, [{ fromIndex: 0, durationMinutes: 94 }]);

  assert.equal(arrival.time, '21:41'); // 20:07 + 94분 — 강제로 20:51 로 눌리지 않는다
  assert.equal(getEndTimeOverflowMinutes([{ time: '19:07', endTime: '20:07' }, arrival], '20:51'), 50);
});

test('no overflow is reported when the day genuinely fits', () => {
  const items = [
    { time: '19:00', endTime: '19:30', title: 'A' },
    { time: '20:00', endTime: '', title: '도착', type: 'arrival' }
  ];
  assert.equal(getEndTimeOverflowMinutes(items, '20:51'), 0);
});

test('overflow detection handles a missing or malformed end time', () => {
  const items = [{ time: '19:00', endTime: '19:30' }, { time: '23:00', endTime: '' }];
  assert.equal(getEndTimeOverflowMinutes(items, undefined), 0);
  assert.equal(getEndTimeOverflowMinutes(items, 'nonsense'), 0);
  assert.equal(getEndTimeOverflowMinutes([], '20:00'), 0);
});

test('the final item is pushed by the real transit time like any other item', () => {
  const scheduleItems = [
    { time: '20:00', endTime: '20:30', title: 'A' },
    { time: '20:40', endTime: '', title: '도착', type: 'arrival' }
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 20 } // 20:30 + 20분 = 20:50
  ];

  const [, arrival] = applyTransitDelays(scheduleItems, transitRoutes);

  assert.equal(arrival.time, '20:50');
  assert.equal(getEndTimeOverflowMinutes([{ time: '20:00', endTime: '20:30' }, arrival], '21:56'), 0);
});

test('overflow detection recognizes a time that wrapped past midnight', () => {
  // "02:59" 는 숫자만 보면 "21:56"보다 작아 초과가 아닌 것처럼 보이지만,
  // 직전 항목(23:03)보다 이르므로 자정을 넘긴 다음날 시각이다.
  const scheduleItems = [
    { time: '21:33', endTime: '23:03', title: '광화문 맛집 저녁 식사' },
    { time: '01:33', endTime: '02:59', title: '인천국제공항', type: 'arrival' }
  ];

  // 02:59(+1일) = 1619분, 21:56 = 1316분 -> 303분 초과
  assert.equal(getEndTimeOverflowMinutes(scheduleItems, '21:56'), 303);
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

test('a skipped (ungeocoded) stop no longer receives the travel time of the segment that bypassed it', () => {
  // 지오코딩에 실패한 항목은 지도에서 빠지므로 구간이 연속이 아니다.
  // A,B,C,D 중 C가 실패하면 지도는 A→B(0→1)와 B→D(1→3)만 계산한다.
  // 예전에는 fromIndex 로 "i-1 구간"을 찾아 B→D 의 90분이 C 에 붙었고,
  // C 가 D 의 자리(12:30)로 밀린 뒤 D 는 13:20 까지 밀렸다.
  const scheduleItems = [
    { time: '09:00', endTime: '10:00', title: 'A' },
    { time: '10:10', endTime: '11:00', title: 'B' },
    { time: '11:10', endTime: '12:00', title: 'C (지오코딩 실패)' },
    { time: '12:10', endTime: '13:00', title: 'D' }
  ];
  const transitRoutes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 10 },
    { fromIndex: 1, toIndex: 3, durationMinutes: 90 } // C를 건너뛴 실제 경로
  ];

  const [a, b, c, d] = applyTransitDelays(scheduleItems, transitRoutes);

  assert.equal(a.time, '09:00');
  assert.equal(b.time, '10:10');
  // C는 실제 소요시간을 모르므로 겹치지만 않으면 원래 시각을 지킨다.
  assert.equal(c.time, '11:10', 'C가 D의 자리로 밀리면 안 된다');
  assert.equal(c.endTime, '12:00');
  // D는 출발지인 B의 종료(11:00)에 실제 90분을 더한 값이어야 한다.
  assert.equal(d.time, '12:30');
  assert.equal(d.endTime, '13:20');
});

test('routes are matched by toIndex, so out-of-order route arrays still land correctly', () => {
  const scheduleItems = [
    { time: '09:00', endTime: '10:00', title: 'A' },
    { time: '10:05', endTime: '11:00', title: 'B' },
    { time: '11:05', endTime: '12:00', title: 'C' }
  ];
  // 일부러 뒤섞어 전달
  const transitRoutes = [
    { fromIndex: 1, toIndex: 2, durationMinutes: 40 },
    { fromIndex: 0, toIndex: 1, durationMinutes: 30 }
  ];

  const [, b, c] = applyTransitDelays(scheduleItems, transitRoutes);

  assert.equal(b.time, '10:30'); // A 종료(10:00) + 30분
  assert.equal(b.endTime, '11:25'); // 25분 밀렸으므로 체류 55분 유지
  assert.equal(c.time, '12:05'); // 밀린 B의 종료(11:25) + 40분
});

test('legacy routes without toIndex still behave as contiguous segments', () => {
  const scheduleItems = [
    { time: '09:00', endTime: '10:00', title: 'A' },
    { time: '10:00', endTime: '11:00', title: 'B' }
  ];

  const [, b] = applyTransitDelays(scheduleItems, [{ fromIndex: 0, durationMinutes: 45 }]);

  assert.equal(b.time, '10:45'); // toIndex 가 없으면 fromIndex + 1 로 간주
});

test('a same-place segment (0 minutes) only enforces no-overlap, never a shift', () => {
  const scheduleItems = [
    { time: '16:07', endTime: '17:37', title: '용산 아이파크몰' },
    { time: '17:37', endTime: '19:07', title: '몰 안에서 저녁 식사' }
  ];

  const [mall, dinner] = applyTransitDelays(scheduleItems, [
    { fromIndex: 0, toIndex: 1, durationMinutes: 0, samePlace: true }
  ]);

  assert.equal(mall.time, '16:07');
  assert.equal(dinner.time, '17:37', '같은 장소면 이동시간 0이므로 그대로 이어져야 한다');
  assert.equal(dinner.endTime, '19:07');
});

test('trimming shortens the last stop so the day fits its end time', () => {
  // 경고만 띄우지 말고 그 자리에서 해결할 수 있어야 한다.
  const items = [
    { time: '09:00', endTime: '', type: 'departure', title: '출발' },
    { time: '10:00', endTime: '12:00', type: 'attraction', title: '박물관' },
    { time: '14:30', endTime: '16:30', type: 'attraction', title: '카페' },
    { time: '18:00', endTime: '', type: 'arrival', title: '도착' }
  ];

  const { items: trimmed, shortenedCount, removedTitles, resolved } =
    trimScheduleToEndTime(items, '17:00');

  assert.equal(resolved, true);
  assert.equal(shortenedCount, 1);
  assert.deepEqual(removedTitles, [], '줄여서 맞출 수 있으면 항목을 빼지 않는다');
  assert.equal(trimmed.at(-2).endTime, '15:30', '마지막 방문지를 60분 줄인다');
  assert.equal(getEndTimeOverflowMinutes(trimmed, '17:00'), 0);
});

test('a stop that cannot be shortened enough is dropped instead of left at 5 minutes', () => {
  const items = [
    { time: '09:00', endTime: '', type: 'departure', title: '출발' },
    { time: '10:00', endTime: '15:00', type: 'attraction', title: '메인 관광' },
    { time: '15:30', endTime: '16:00', type: 'leisure', title: '짧은 산책' },
    { time: '19:00', endTime: '', type: 'arrival', title: '도착' }
  ];
  // 3시간 초과 -> 30분짜리 산책을 20분까지 줄여도 모자라므로 빼야 한다.
  const { removedTitles } = trimScheduleToEndTime(items, '16:00');

  assert.ok(removedTitles.includes('짧은 산책'), '의미 없는 5분짜리로 남기지 않는다');
});

test('user-selected anchors and boundaries are never trimmed', () => {
  const items = [
    { time: '09:00', endTime: '', type: 'departure', title: '출발' },
    { time: '10:00', endTime: '16:00', type: 'AnchorSchedule', title: '예약된 공연' },
    { time: '19:00', endTime: '', type: 'arrival', title: '도착' }
  ];

  const { items: trimmed, removedTitles, shortenedCount, resolved } =
    trimScheduleToEndTime(items, '17:00');

  assert.deepEqual(removedTitles, []);
  assert.equal(shortenedCount, 0);
  assert.equal(resolved, false, '건드릴 수 없으면 해결하지 못했다고 알린다');
  assert.equal(trimmed.find(i => i.type === 'AnchorSchedule').endTime, '16:00');
});

test('a day that already fits is returned untouched', () => {
  const items = [
    { time: '09:00', endTime: '10:00', type: 'attraction', title: 'A' },
    { time: '11:00', endTime: '', type: 'arrival', title: '도착' }
  ];
  const result = trimScheduleToEndTime(items, '18:00');

  assert.equal(result.items, items, '바꿀 게 없으면 원본을 그대로 돌려준다');
  assert.equal(result.resolved, true);
});

test('trimming handles empty and malformed input without throwing', () => {
  assert.doesNotThrow(() => trimScheduleToEndTime([], '18:00'));
  assert.doesNotThrow(() => trimScheduleToEndTime(null, '18:00'));
  assert.doesNotThrow(() => trimScheduleToEndTime([{ time: 'x' }], '18:00'));
});
