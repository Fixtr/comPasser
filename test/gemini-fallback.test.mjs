import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMockItinerary,
  isValidGeneratedDays
} from '../src/domains/planner/services/gemini-fallback.mjs';
import { normalizePlannerRequest } from '../src/domains/planner/services/planner-constraints.mjs';

const flatRequest = {
  date: ['2026-06-29'],
  startTime: '09:06',
  endTime: '21:06',
  startLocation: '서울특별시 중구 동호로 신라호텔서울',
  endLocation: '인천광역시 중구 공항로 인천공항 (ICN)',
  anchorSchedules: [{
    day: 1,
    name: '국립중앙박물관 견학',
    time: '11:02',
    endTime: '14:02',
    location: '국립중앙박물관'
  }]
};

test('mock itinerary still respects the exact departure/arrival constraints', () => {
  const constraints = normalizePlannerRequest(flatRequest);
  const { days } = buildMockItinerary(constraints, 'ko');

  assert.equal(days.length, 1);
  const [day] = days;
  assert.equal(day.scheduleItems[0].type, 'departure');
  assert.equal(day.scheduleItems[0].time, '09:06');
  assert.equal(day.scheduleItems[0].location, flatRequest.startLocation);
  assert.equal(day.scheduleItems.at(-1).type, 'arrival');
  assert.equal(day.scheduleItems.at(-1).time, '21:06');
  assert.equal(day.scheduleItems.at(-1).location, flatRequest.endLocation);
});

test('mock itinerary includes the user anchor even when the AI never responded', () => {
  const constraints = normalizePlannerRequest(flatRequest);
  const { days } = buildMockItinerary(constraints, 'ko');

  const anchor = days[0].scheduleItems.find(item => item.type === 'AnchorSchedule');
  assert.ok(anchor, 'expected the user-selected anchor to survive the mock fallback');
  assert.equal(anchor.title, '국립중앙박물관 견학');
  assert.equal(anchor.time, '11:02');
  assert.equal(anchor.location, '국립중앙박물관');
});

test('one mock day is produced per selected date', () => {
  const constraints = normalizePlannerRequest({
    ...flatRequest,
    date: ['2026-06-29', '2026-06-30'],
    anchorSchedules: [
      { day: 1, name: '박물관 견학', time: '11:00', endTime: '13:00', location: '국립중앙박물관' },
      { day: 2, name: '한강 유람선', time: '17:00', endTime: '18:30', location: '여의도 한강공원' }
    ]
  });

  const { days } = buildMockItinerary(constraints, 'ko');

  assert.equal(days.length, 2);
  assert.equal(days[0].date, '2026-06-29');
  assert.equal(days[1].date, '2026-06-30');
  assert.equal(days[0].scheduleItems.find(i => i.type === 'AnchorSchedule').title, '박물관 견학');
  assert.equal(days[1].scheduleItems.find(i => i.type === 'AnchorSchedule').title, '한강 유람선');
});

test('missing date/dailyData falls back to a single "Unknown Date" day around Seoul', () => {
  const { days } = buildMockItinerary({}, 'en');

  assert.equal(days.length, 1);
  assert.equal(days[0].date, 'Unknown Date');
  assert.equal(days[0].scheduleItems[0].location, 'Seoul, South Korea');
  assert.equal(days[0].scheduleItems.at(-1).location, 'Seoul, South Korea');
});

test('lang="en" produces English copy, anything else falls back to Korean copy', () => {
  const constraints = normalizePlannerRequest(flatRequest);

  const en = buildMockItinerary(constraints, 'en');
  assert.equal(en.days[0].theme, 'Mock Generated Itinerary');
  assert.equal(en.days[0].scheduleItems[0].title, 'Start Location');

  const ko = buildMockItinerary(constraints, 'ko');
  assert.equal(ko.days[0].theme, '임시 생성된 일정');
  assert.equal(ko.days[0].scheduleItems[0].title, '출발지');
});

test('isValidGeneratedDays rejects anything that is not a non-empty array', () => {
  assert.equal(isValidGeneratedDays([{ day: 1 }]), true);
  assert.equal(isValidGeneratedDays([]), false);
  assert.equal(isValidGeneratedDays(null), false);
  assert.equal(isValidGeneratedDays(undefined), false);
  assert.equal(isValidGeneratedDays('not-an-array'), false);
  assert.equal(isValidGeneratedDays({ days: [] }), false);
});
