import test from 'node:test';
import assert from 'node:assert/strict';

test('저장 시각을 수정하지 않아도 새 이동시간에 따른 종료 초과는 경고한다', () => {
  const plan={request:{endTime:'18:00'},days:[{scheduleItems:[
    {type:'attraction',time:'16:00',endTime:'17:30'}, {type:'arrival',time:'18:00'}
  ]}]};
  const before=structuredClone(plan);
  assert.equal(getEndTimeWarning(plan,0,[{fromIndex:0,toIndex:1,durationMinutes:60}]).overflowMinutes,30);
  assert.deepEqual(plan,before);
});

import {
  buildItineraryViewModel,
  reconcileWithConstraints,
  getDayConstraints,
  getEndTimeWarning,
  getTransitCoverage
} from '../src/domains/itinerary/services/itinerary-view-model.mjs';

/**
 * 이 파일은 계산 로직이 아니라 "배선"을 지킨다. 실제로 사용자에게 새어나갔던
 * 버그들이 전부 이 계층에서 발생했다:
 *   - 저장/공유 링크로 연 일정에 가드레일이 적용되지 않음
 *   - 날짜 탭을 바꿔도 경고가 이전 날짜 것으로 남음
 * 아래 테스트들은 각각 그 상황을 그대로 재현한다.
 */

const airportRequest = {
  date: ['2026-08-18'],
  startTime: '09:00',
  endTime: '20:51',
  startLocation: '서울특별시 중구 동호로 신라호텔서울',
  endLocation: '인천광역시 구 공항로 인천공항 (ICN)',
  anchorSchedules: []
};

const types = items => items.map(i => `${i.type}@${i.time}`).join(' | ');

test('saved itinerary loaded from a link gets the guardrails re-applied', () => {
  // 실제 제보 재현: 저장된 데이터에 가짜 "OO로 이동" 항목 2개가 남아 있고
  // 마지막 항목은 자정을 넘겨(23:31~03:27) 종료 시각을 초과한 상태.
  // 예전에는 이 데이터가 아무 보정 없이 그대로 렌더링됐다.
  const saved = {
    request: airportRequest,
    days: [{
      day: 1,
      date: '2026-08-18',
      scheduleItems: [
        { time: '19:56', endTime: '21:26', type: 'dining', title: '광화문 근처에서 저녁 식사', location: '광화문' },
        { time: '21:43', endTime: '22:13', type: 'leisure', title: '서울역으로 이동', location: '서울역' },
        { time: '23:31', endTime: '03:27', type: 'leisure', title: '인천국제공항으로 이동', location: '인천국' }
      ]
    }]
  };

  const vm = buildItineraryViewModel({ rawItinerary: saved });

  assert.equal(
    vm.scheduleItems.some(i => /이동$/.test(i.title)),
    false,
    '가짜 이동 항목은 저장된 일정을 열 때도 제거돼야 한다'
  );
  assert.equal(vm.scheduleItems.at(-1).type, 'arrival');
  assert.equal(vm.scheduleItems.at(-1).time, '20:51');
});

test('an itinerary without a saved request is left untouched instead of crashing', () => {
  // 아주 예전 저장본에는 request 가 없다. 보정 기준이 없으므로 원본 유지.
  const legacy = { days: [{ day: 1, scheduleItems: [{ time: '09:00', endTime: '10:00', type: 'attraction', title: '옛날' }] }] };

  const vm = buildItineraryViewModel({ rawItinerary: legacy });

  assert.equal(vm.scheduleItems.length, 1);
  assert.equal(vm.scheduleItems[0].title, '옛날');
  assert.equal(vm.overflowMinutes, 0);
});

test('the legacy itineraryPlan wrapper survives reconciliation', () => {
  const wrapped = {
    request: { ...airportRequest, endTime: '18:00', endLocation: '인천국제공항' },
    itineraryPlan: {
      days: [{ day: 1, scheduleItems: [
        { time: '10:00', endTime: '11:00', type: 'attraction', title: '관광', location: '경복궁' }
      ] }]
    }
  };

  const reconciled = reconcileWithConstraints(wrapped, 'ko');

  assert.ok(reconciled.itineraryPlan, '구버전 껍데기가 유지돼야 한다');
  assert.equal(reconciled.itineraryPlan.days[0].scheduleItems.at(-1).type, 'arrival');
});

test('the end-time warning is computed for the day being viewed, not always day 1', () => {
  // 1일차는 초과, 2일차는 여유. 탭을 바꾸면 경고도 그 날짜 기준이어야 한다.
  const multiDay = {
    request: {
      date: ['2026-08-18', '2026-08-19'],
      dailyData: [
        { day: 1, date: '2026-08-18', startTime: '09:00', endTime: '20:00', startLocation: '서울역', endLocation: '인천국제공항', anchors: [] },
        { day: 2, date: '2026-08-19', startTime: '09:00', endTime: '22:00', startLocation: '서울역', endLocation: '서울역', anchors: [] }
      ],
      anchorSchedules: []
    },
    days: [
      { day: 1, scheduleItems: [{ time: '18:00', endTime: '19:30', type: 'dining', title: '저녁', location: '광화문' }] },
      { day: 2, scheduleItems: [{ time: '10:00', endTime: '11:00', type: 'attraction', title: '관광', location: '경복궁' }] }
    ]
  };
  // 1일차 마지막 방문 -> 도착 구간이 실제로 120분 걸린다.
  const transitRoutes = [{ fromIndex: 1, toIndex: 2, durationMinutes: 120 }];

  const day1 = buildItineraryViewModel({ rawItinerary: multiDay, activeDayIndex: 0, transitRoutes });
  assert.equal(day1.endTime, '20:00');
  assert.ok(day1.overflowMinutes > 0, '1일차는 종료 시각을 초과해야 한다');

  const day2 = buildItineraryViewModel({ rawItinerary: multiDay, activeDayIndex: 1, transitRoutes: [] });
  assert.equal(day2.endTime, '22:00', '2일차는 자기 종료 시각을 써야 한다');
  assert.equal(day2.overflowMinutes, 0, '여유 있는 날짜에는 경고가 없어야 한다');
});

test('real transit time pushes the arrival honestly instead of clamping it', () => {
  // 제보 케이스: 카페 19:07~20:07, 실제 이동 94분 -> 21:41 이어야 하고,
  // 종료 예정(20:51) 대비 50분 초과로 보고돼야 한다.
  const raw = {
    request: airportRequest,
    days: [{ day: 1, scheduleItems: [
      { time: '19:07', endTime: '20:07', type: 'dining', title: '간식 및 카페', location: '서울특별시 용산구 이촌로 244' }
    ] }]
  };

  const vm = buildItineraryViewModel({
    rawItinerary: raw,
    transitRoutes: [{ fromIndex: 1, toIndex: 2, durationMinutes: 94 }]
  });

  assert.equal(vm.scheduleItems.at(-1).time, '21:41', '도착 시각을 종료 시각으로 눌러 담으면 안 된다');
  assert.equal(vm.overflowMinutes, 50);
});

test('no transit data yet still yields a renderable view without a false warning', () => {
  const raw = {
    request: airportRequest,
    days: [{ day: 1, scheduleItems: [
      { time: '10:00', endTime: '11:00', type: 'attraction', title: '경복궁', location: '경복궁' }
    ] }]
  };

  const vm = buildItineraryViewModel({ rawItinerary: raw, transitRoutes: [] });

  assert.ok(vm.scheduleItems.length >= 2);
  assert.equal(vm.scheduleItems.at(-1).time, '20:51');
  assert.equal(vm.overflowMinutes, 0, '실제 이동시간을 모르는 동안 허위 경고를 띄우면 안 된다');
});

test('building the view model twice is idempotent (generation + load both run it)', () => {
  const raw = {
    request: airportRequest,
    days: [{ day: 1, scheduleItems: [
      { time: '19:56', endTime: '21:26', type: 'dining', title: '저녁', location: '광화문' },
      { time: '21:43', endTime: '22:13', type: 'leisure', title: '서울역으로 이동', location: '서울역' }
    ] }]
  };

  const once = buildItineraryViewModel({ rawItinerary: raw });
  const twice = buildItineraryViewModel({ rawItinerary: once.itinerary });

  assert.equal(types(once.scheduleItems), types(twice.scheduleItems));
});

test('an out-of-range day index falls back to the first day instead of throwing', () => {
  const raw = {
    request: airportRequest,
    days: [{ day: 1, scheduleItems: [{ time: '10:00', endTime: '11:00', type: 'attraction', title: 'A', location: '경복궁' }] }]
  };

  const vm = buildItineraryViewModel({ rawItinerary: raw, activeDayIndex: 7 });

  assert.ok(vm.scheduleItems.length > 0);
  assert.equal(vm.endTime, '20:51');
});

test('empty and malformed inputs produce an empty view model without throwing', () => {
  assert.deepEqual(buildItineraryViewModel({ rawItinerary: null }).scheduleItems, []);
  assert.deepEqual(buildItineraryViewModel({}).scheduleItems, []);
  assert.deepEqual(buildItineraryViewModel().scheduleItems, []);
  assert.deepEqual(buildItineraryViewModel({ rawItinerary: { days: [] } }).scheduleItems, []);
});

test('getDayConstraints matches by day number and falls back to index', () => {
  const byNumber = { request: { dailyData: [{ day: 2, endTime: '18:00' }, { day: 1, endTime: '20:00' }] } };
  assert.equal(getDayConstraints(byNumber, 0).endTime, '20:00', 'day 번호로 찾아야 한다');

  const noNumbers = { request: { dailyData: [{ endTime: '18:00' }, { endTime: '22:00' }] } };
  assert.equal(getDayConstraints(noNumbers, 1).endTime, '22:00', 'day 번호가 없으면 인덱스로 폴백');

  assert.equal(getDayConstraints({}, 0), null);
});

test('getEndTimeWarning reports overflow on the already-adjusted plan without normalizing it away', () => {
  // 회귀 방지: 경고 갱신에 buildItineraryViewModel(=reconcile 포함)을 쓰면
  // enforcePlannerConstraints 가 초과 항목을 정리하고 도착을 종료 시각으로
  // 되돌려 초과가 0이 돼버린다. 탭 전환 시 실제로 경고가 사라졌던 버그.
  const adjusted = {
    request: {
      dailyData: [{ day: 1, startTime: '09:00', endTime: '20:00', startLocation: '서울역', endLocation: '인천국제공항', anchors: [] }]
    },
    days: [{ day: 1, scheduleItems: [
      { time: '09:00', endTime: '', type: 'departure', title: '출발 · 서울역', location: '서울역' },
      { time: '18:00', endTime: '19:30', type: 'dining', title: '저녁', location: '광화문' },
      { time: '21:30', endTime: '', type: 'arrival', title: '도착 · 인천국제공항', location: '인천국제공항' }
    ] }]
  };

  const { endTime, overflowMinutes } = getEndTimeWarning(adjusted, 0);

  assert.equal(endTime, '20:00');
  assert.equal(overflowMinutes, 90, '21:30 도착은 20:00 대비 90분 초과로 보고돼야 한다');
});

test('getEndTimeWarning is day-aware and safe on malformed input', () => {
  const multi = {
    request: { dailyData: [
      { day: 1, endTime: '20:00', startLocation: '서울역', endLocation: '인천국제공항' },
      { day: 2, endTime: '22:00', startLocation: '서울역', endLocation: '서울역' }
    ] },
    days: [
      { day: 1, scheduleItems: [{ time: '18:00', endTime: '19:00' }, { time: '21:30', endTime: '', type: 'arrival' }] },
      { day: 2, scheduleItems: [{ time: '10:00', endTime: '11:00' }, { time: '12:00', endTime: '', type: 'arrival' }] }
    ]
  };

  assert.equal(getEndTimeWarning(multi, 0).overflowMinutes, 90);
  assert.equal(getEndTimeWarning(multi, 1).overflowMinutes, 0);
  assert.deepEqual(getEndTimeWarning(null, 0), { endTime: null, overflowMinutes: 0 });
  assert.deepEqual(getEndTimeWarning({}, 0), { endTime: null, overflowMinutes: 0 });
});

test('transit coverage distinguishes verified, partial, and unavailable states', () => {
  const items = [{ time: '09:00' }, { time: '10:00' }, { time: '11:00' }]; // 구간 2개

  assert.deepEqual(
    getTransitCoverage(items, [{ fromIndex: 0, durationMinutes: 20 }, { fromIndex: 1, durationMinutes: 30 }]),
    { expected: 2, resolved: 2, status: 'verified' }
  );

  assert.deepEqual(
    getTransitCoverage(items, [{ fromIndex: 0, durationMinutes: 20 }]),
    { expected: 2, resolved: 1, status: 'partial' }
  );

  // Directions 실패 폴백은 durationMinutes 가 null 이라 검증된 것으로 세지 않는다.
  assert.deepEqual(
    getTransitCoverage(items, [{ fromIndex: 0, durationMinutes: null }, { fromIndex: 1, durationMinutes: null }]),
    { expected: 2, resolved: 0, status: 'none' }
  );

  assert.equal(getTransitCoverage(items, []).status, 'none');
  assert.equal(getTransitCoverage(items, null).status, 'none');
});

test('transit coverage reports "none" when the map explicitly failed, even with routes present', () => {
  const items = [{ time: '09:00' }, { time: '10:00' }];
  const routes = [{ fromIndex: 0, durationMinutes: 20 }];

  assert.equal(getTransitCoverage(items, routes, false).status, 'verified');
  assert.equal(getTransitCoverage(items, routes, true).status, 'none', '지도가 실패를 알리면 검증됐다고 하면 안 된다');
});

test('a single-stop day needs no transit verification', () => {
  assert.deepEqual(getTransitCoverage([{ time: '09:00' }], []), { expected: 0, resolved: 0, status: 'verified' });
  assert.deepEqual(getTransitCoverage([], []), { expected: 0, resolved: 0, status: 'verified' });
});

test('a zero-duration same-place segment counts as verified, not as a failure', () => {
  // 쇼핑몰 방문 -> 그 몰 안에서 저녁 식사처럼 좌표가 같은 구간은 지도가
  // Directions 를 호출하지 않고 소요시간 0 으로 확정한다. 이걸 미확인으로
  // 세면 "일부 구간만 확인됨" 안내가 잘못 뜬다.
  const items = [{ time: '15:48' }, { time: '16:07' }, { time: '17:37' }, { time: '21:48' }];
  const routes = [
    { fromIndex: 0, toIndex: 1, durationMinutes: 19 },
    { fromIndex: 1, toIndex: 2, durationMinutes: 0, samePlace: true },
    { fromIndex: 2, toIndex: 3, durationMinutes: 93 }
  ];

  assert.deepEqual(getTransitCoverage(items, routes), { expected: 3, resolved: 3, status: 'verified' });
});
