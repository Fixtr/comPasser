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

test('an AI anchor with a rephrased title is merged, not duplicated', () => {
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '09:30', type: 'attraction', title: '남산 산책', location: '남산공원' },
      // Gemini kept the time/location but rewrote the title
      {
        time: '11:02',
        endTime: '14:02',
        type: 'AnchorSchedule',
        title: '국립중앙박물관 상설전 관람',
        description: '한국 대표 유물을 관람합니다.',
        location: '서울특별시 용산구 서빙고로 137 국립중앙박물관'
      }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, flatRequest, 'ko');

  const anchorItems = day.scheduleItems.filter(item => item.type === 'AnchorSchedule');
  assert.equal(anchorItems.length, 1);
  assert.equal(anchorItems[0].title, '국립중앙박물관 견학');
  assert.equal(anchorItems[0].time, '11:02');
  // The AI's richer description survives the merge
  assert.equal(anchorItems[0].description, '한국 대표 유물을 관람합니다.');
});

test('two user anchors never produce more than two anchor items', () => {
  const request = {
    ...flatRequest,
    anchorSchedules: [
      { day: 1, name: '박물관 견학', time: '11:00', endTime: '13:00', location: '국립중앙박물관' },
      { day: 1, name: '한강 유람선', time: '17:00', endTime: '18:30', location: '여의도 한강공원' }
    ]
  };
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '11:00', endTime: '13:00', type: 'AnchorSchedule', title: '국립중앙박물관 관람', location: '국립중앙박물관' },
      { time: '14:00', type: 'dining', title: '용산 맛집', location: '용산역' },
      { time: '17:00', endTime: '18:30', type: 'AnchorSchedule', title: '한강 크루즈 탑승', location: '여의도 한강공원 유람선 선착장' }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, request, 'ko');

  const anchorItems = day.scheduleItems.filter(item => item.type === 'AnchorSchedule');
  assert.equal(anchorItems.length, 2);
  assert.deepEqual(anchorItems.map(item => item.title), ['박물관 견학', '한강 유람선']);
});

test('an anchor the AI scheduled at the wrong time is corrected in place', () => {
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '13:00', type: 'attraction', title: '국립중앙박물관 견학', location: '국립중앙박물관' }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, flatRequest, 'ko');

  const anchorItems = day.scheduleItems.filter(item => item.type === 'AnchorSchedule');
  assert.equal(anchorItems.length, 1);
  assert.equal(anchorItems[0].time, '11:02');
  const museumItems = day.scheduleItems.filter(item => isMuseum(item.location));
  assert.equal(museumItems.length, 1);
});

test('AnchorSchedule items the user never selected are demoted to attractions', () => {
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '11:02', endTime: '14:02', type: 'AnchorSchedule', title: '국립중앙박물관 견학', location: '국립중앙박물관' },
      { time: '16:00', type: 'AnchorSchedule', title: '광장시장 먹거리 투어', location: '광장시장' }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, flatRequest, 'ko');

  const anchorItems = day.scheduleItems.filter(item => item.type === 'AnchorSchedule');
  assert.equal(anchorItems.length, 1);
  assert.equal(anchorItems[0].title, '국립중앙박물관 견학');
  const demoted = day.scheduleItems.find(item => item.title === '광장시장 먹거리 투어');
  assert.equal(demoted.type, 'attraction');
});

function isMuseum(location) {
  return typeof location === 'string' && location.includes('국립중앙박물관');
}

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
