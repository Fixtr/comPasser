import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enforcePlannerConstraints,
  normalizePlannerRequest
} from '../src/domains/planner/services/planner-constraints.mjs';

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

test('flat form fields are converted to optimizer dailyData', () => {
  const normalized = normalizePlannerRequest(flatRequest);

  assert.equal(normalized.dailyData.length, 1);
  assert.equal(normalized.dailyData[0].startLocation, flatRequest.startLocation);
  assert.equal(normalized.dailyData[0].endLocation, flatRequest.endLocation);
  assert.deepEqual(normalized.dailyData[0].anchors, flatRequest.anchorSchedules);
});

test('daily custom times are assigned to their matching day', () => {
  const normalized = normalizePlannerRequest({
    ...flatRequest,
    date: ['2026-06-29', '2026-06-30'],
    dailyTimes: [
      { day: 1, startTime: '08:00', endTime: '18:00' },
      { day: 2, startTime: '10:00', endTime: '22:00' }
    ]
  });

  assert.equal(normalized.dailyData[0].startTime, '08:00');
  assert.equal(normalized.dailyData[1].startTime, '10:00');
  assert.equal(normalized.dailyData[1].endTime, '22:00');
});

test('AI output is bounded by the exact selected locations and includes anchors', () => {
  const generatedDays = [{
    day: 1,
    date: '2026-06-29',
    theme: '휴식',
    scheduleItems: [
      { time: '10:00', endTime: '12:30', type: 'attraction', title: '서울숲', location: '서울숲' },
      { time: '19:00', endTime: '20:30', type: 'dining', title: '상암동 맛집', location: '상암동' }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, flatRequest, 'ko');

  assert.equal(day.scheduleItems[0].type, 'departure');
  assert.equal(day.scheduleItems[0].time, '09:06');
  assert.equal(day.scheduleItems[0].location, flatRequest.startLocation);
  assert.equal(day.scheduleItems.at(-1).type, 'arrival');
  assert.equal(day.scheduleItems.at(-1).time, '21:06');
  assert.equal(day.scheduleItems.at(-1).location, flatRequest.endLocation);

  const anchor = day.scheduleItems.find(item => item.type === 'AnchorSchedule');
  assert.equal(anchor.title, '국립중앙박물관 견학');
  assert.equal(anchor.time, '11:02');
  assert.equal(anchor.endTime, '14:02');
  assert.equal(anchor.location, '국립중앙박물관');
});

test('an AI endpoint that already matches is corrected instead of duplicated', () => {
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '09:30', type: 'attraction', title: '호텔 출발', location: flatRequest.startLocation },
      { time: '20:00', endTime: '20:30', type: 'attraction', title: '공항 도착', location: flatRequest.endLocation }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, { ...flatRequest, anchorSchedules: [] }, 'ko');

  assert.equal(day.scheduleItems.length, 2);
  assert.equal(day.scheduleItems[0].time, '09:06');
  assert.equal(day.scheduleItems[1].endTime, '21:06');
});
