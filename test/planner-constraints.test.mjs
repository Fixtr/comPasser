import test from 'node:test';
import assert from 'node:assert/strict';
import { toPlannerDraft } from '../src/domains/planner/services/planner-draft.mjs';

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

test('near-location intents remain visits, not departure/arrival or anchor identities', () => {
  const request={date:['2026-10-20'],startTime:'09:00',endTime:'18:00',startLocation:'서울역',endLocation:'서울역',
    anchorSchedules:[{day:1,name:'박물관 예약',location:'박물관',time:'13:00',endTime:'14:00'}]};
  const visit=(purpose,nearLocation,time,endTime)=>({type:'dining',title:purpose,location:nearLocation,time,endTime,
    placeIntent:{purpose,nearLocation,category:'restaurant'}});
  const [day]=enforcePlannerConstraints([{scheduleItems:[visit('아침','서울역','09:30','10:30'),
    visit('점심','박물관','13:00','14:00'),visit('저녁','서울역','16:00','17:00')]}],request);
  assert.equal(day.scheduleItems.filter(i=>i.type==='dining').length,3);
  assert.equal(day.scheduleItems.filter(i=>i.type==='AnchorSchedule').length,1);
  assert.equal(day.scheduleItems[0].type,'departure');
  assert.equal(day.scheduleItems.at(-1).type,'arrival');
});

test('editing a previously normalized request rebuilds daily constraints from the current draft', () => {
  const draft = toPlannerDraft(normalizePlannerRequest(flatRequest));
  draft.date = ['2026-10-01'];
  draft.startTime = '10:00';
  draft.anchorSchedules = [];
  const request = normalizePlannerRequest(draft);
  assert.equal(request.dailyData[0].date, '2026-10-01');
  assert.equal(request.dailyData[0].startTime, '10:00');
  assert.deepEqual(request.dailyData[0].anchors, []);
});

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

test('cleared custom times remain empty so client/server validation cannot accept hidden global defaults', () => {
  const normalized = normalizePlannerRequest({ ...flatRequest,
    dailyTimes: [{ day: 1, startTime: '', endTime: '', isCustom: true }] });
  assert.equal(normalized.dailyData[0].startTime, '');
  assert.equal(normalized.dailyData[0].endTime, '');
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
  assert.equal(day.scheduleItems[1].time, '21:06');
  assert.equal(day.scheduleItems[1].endTime, '');
});

test('an AI item scheduled past the day end time is dropped instead of leaving the arrival out of order', () => {
  // Reproduces a real report: the AI appended a bogus "moving to the
  // airport" leisure stop after dinner, running past midnight, instead of
  // ending the day at endLocation/endTime. Because its location text never
  // matched endLocation, the old code just pushed the forced arrival after
  // it — putting a 21:56 item after a 23:40 one.
  const request = {
    ...flatRequest,
    endTime: '21:56',
    anchorSchedules: []
  };
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '20:27', endTime: '21:57', type: 'dining', title: '이태원 저녁 식사', location: '서울 이태원' },
      { time: '23:40', endTime: '02:36', type: 'leisure', title: '인천국제공항 이동', location: '인천공항 이동경로' }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, request, 'ko');

  const bogus = day.scheduleItems.find(item => item.title === '인천국제공항 이동');
  assert.equal(bogus, undefined, 'the overflow item should be dropped, not just pushed past');

  const last = day.scheduleItems.at(-1);
  assert.equal(last.type, 'arrival');
  assert.equal(last.time, '21:56');
  assert.equal(last.location, request.endLocation);

  // Chronological order holds for every remaining item.
  for (let i = 1; i < day.scheduleItems.length; i++) {
    const prevTime = day.scheduleItems[i - 1].time;
    const currTime = day.scheduleItems[i].time;
    assert.ok(prevTime <= currTime, `expected ${prevTime} <= ${currTime} at index ${i}`);
  }
});

test('an overflow item whose time wrapped past midnight is still dropped (not mistaken for early morning)', () => {
  // Real report: the AI's bogus "moving to the airport" item landed at
  // "01:33" (past midnight) instead of a time like "23:40". Compared as
  // raw HH:MM minutes, "01:33" (93) looks earlier than "21:56" (1316), so
  // a naive filter/sort would treat it as an early-morning item instead of
  // recognizing it rolled into the next day — leaving it in place ahead of
  // the forced arrival, or sorting it to the very front of the day.
  const request = {
    ...flatRequest,
    endTime: '21:56',
    anchorSchedules: []
  };
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '20:48', endTime: '21:18', type: 'leisure', title: '광화문 이동', location: '광화문' },
      { time: '21:33', endTime: '23:03', type: 'dining', title: '광화문 맛집 저녁 식사', location: '광화문' },
      { time: '01:33', endTime: '02:59', type: 'leisure', title: '인천국제공항 (ICN) 이동', location: '인천공항 이동경로' }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, request, 'ko');

  const bogus = day.scheduleItems.find(item => item.title === '인천국제공항 (ICN) 이동');
  assert.equal(bogus, undefined, 'the post-midnight overflow item should be dropped');

  const last = day.scheduleItems.at(-1);
  assert.equal(last.type, 'arrival');
  assert.equal(last.time, '21:56');

  // "광화문 이동" (20:48) must not have been sorted after "01:33" as if the
  // wrapped time were legitimately earlier in the day — full chronological
  // order must hold for every remaining item.
  assert.equal(day.scheduleItems[0].time, flatRequest.startTime);
  for (let i = 1; i < day.scheduleItems.length; i++) {
    const prevTime = day.scheduleItems[i - 1].time;
    const currTime = day.scheduleItems[i].time;
    assert.ok(prevTime <= currTime, `expected ${prevTime} <= ${currTime} at index ${i}`);
  }
});

test('an anchor scheduled at/after the day end time survives the overflow trim', () => {
  const request = {
    ...flatRequest,
    endTime: '21:56',
    anchorSchedules: [
      { day: 1, name: '심야 이벤트', time: '22:30', endTime: '23:30', location: '서울 어딘가' }
    ]
  };
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '22:30', endTime: '23:30', type: 'AnchorSchedule', title: '심야 이벤트', location: '서울 어딘가' }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, request, 'ko');

  const anchor = day.scheduleItems.find(item => item.type === 'AnchorSchedule');
  assert.ok(anchor, 'user-selected anchors must never be dropped by the overflow trim');
  assert.equal(anchor.time, '22:30');
});

test('trailing "moving to X" narration items are dropped so arrival follows the last real visit directly', () => {
  // 실제 재현: 저녁 식사 다음 "서울역으로 이동" -> "인천국제공항으로 이동"
  // 두 개의 가짜 이동 항목이 붙어 있었다. 둘 다 목적지(인천공항) 자체가
  // 아니고, 실제 다구간 여정을 항목으로 쪼갠 것뿐이라 전부 제거하고
  // 도착 항목이 마지막 실제 방문 바로 다음에 오게 한다.
  const request = {
    ...flatRequest,
    endTime: '21:56',
    anchorSchedules: []
  };
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '19:56', endTime: '21:26', type: 'dining', title: '광화문 근처에서 저녁 식사', location: '광화문' },
      { time: '21:43', endTime: '22:13', type: 'leisure', title: '서울역으로 이동', location: '서울역' },
      { time: '23:31', endTime: '03:27', type: 'leisure', title: '인천국제공항으로 이동', location: '인천국' }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, request, 'ko');

  const narrationItems = day.scheduleItems.filter(item => /이동/.test(item.title) && item.type !== 'departure' && item.type !== 'arrival');
  assert.deepEqual(narrationItems, [], 'no leftover "이동" narration items should remain');

  const last = day.scheduleItems.at(-1);
  assert.equal(last.type, 'arrival');
  assert.equal(last.time, '21:56');

  const dinnerIndex = day.scheduleItems.findIndex(item => item.title === '광화문 근처에서 저녁 식사');
  assert.equal(dinnerIndex, day.scheduleItems.length - 2, 'arrival must sit immediately after the last real visit');
});

test('a genuine trailing leisure visit that is not transit narration survives', () => {
  const request = {
    ...flatRequest,
    endTime: '21:56',
    anchorSchedules: []
  };
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '19:56', endTime: '20:26', type: 'dining', title: '저녁 식사', location: '광화문' },
      { time: '20:40', endTime: '21:10', type: 'leisure', title: '광화문 야경 감상', location: '광화문' }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, request, 'ko');

  const nightView = day.scheduleItems.find(item => item.title === '광화문 야경 감상');
  assert.ok(nightView, 'a real leisure stop without "이동" wording must not be stripped');
});

test('each day of a multi-day trip is capped by its own end time, independent of the others', () => {
  const request = {
    date: ['2026-08-18', '2026-08-19'],
    dailyData: [
      { day: 1, date: '2026-08-18', startTime: '09:00', endTime: '22:00', startLocation: '서울역 근처 호텔', endLocation: '서울역 근처 호텔' },
      { day: 2, date: '2026-08-19', startTime: '09:00', endTime: '15:00', startLocation: '서울역 근처 호텔', endLocation: '인천국제공항' }
    ],
    anchorSchedules: []
  };
  const generatedDays = [
    {
      day: 1,
      scheduleItems: [
        { time: '09:00', endTime: '20:00', type: 'attraction', title: '1일차 관광', location: '경복궁' },
        { time: '23:50', endTime: '01:00', type: 'leisure', title: '1일차 심야 이동', location: '어딘가' }
      ]
    },
    {
      day: 2,
      scheduleItems: [
        { time: '09:00', endTime: '13:00', type: 'attraction', title: '2일차 관광', location: '경복궁' }
      ]
    }
  ];

  const days = enforcePlannerConstraints(generatedDays, request, 'ko');

  const day1Last = days[0].scheduleItems.at(-1);
  assert.equal(day1Last.type, 'arrival');
  assert.equal(day1Last.time, '22:00'); // 1일차 종료 시각 — 2일차(15:00)와 섞이지 않는다

  const day2Last = days[1].scheduleItems.at(-1);
  assert.equal(day2Last.type, 'arrival');
  assert.equal(day2Last.time, '15:00'); // 2일차는 자기 자신의 종료 시각을 쓴다
});

test('a transit-narration item is removed even when it is not the last item', () => {
  // 실제 제보 재현: AI 가 "인천국제공항 이동" 뒤에 "인천 도착"을 하나 더
  // 붙이는 바람에 가짜 이동 항목이 마지막이 아니게 됐고, 배열 끝에서부터만
  // 제거하던 기존 로직이 이를 놓쳤다.
  const request = {
    ...flatRequest,
    startTime: '15:48',
    endTime: '21:48',
    startLocation: '서울특별시 용산구 한강대로23길 아이파크몰 용산점',
    endLocation: '인천광역시 구 공항로 인천공항 (ICN)',
    anchorSchedules: []
  };
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '16:14', endTime: '18:26', type: 'attraction', title: '국립중앙박물관', location: '서울특별시 용산구 서빙고로 137' },
      { time: '18:50', endTime: '20:20', type: 'dining', title: '용산역 맛집 탐방', location: '서울특별시 용산구 한강대로23길' },
      { time: '20:30', endTime: '21:18', type: 'leisure', title: '인천국제공항 이동', location: '인천광역시 중구 공항로 271' },
      { time: '21:20', endTime: '21:40', type: 'leisure', title: '인천 도착', location: '인천' }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, request, 'ko');

  assert.equal(
    day.scheduleItems.some(item => item.title === '인천국제공항 이동'),
    false,
    '마지막이 아니어도 이동 서술 항목은 제거돼야 한다'
  );

  const last = day.scheduleItems.at(-1);
  assert.equal(last.type, 'arrival', '목적지에 붙은 AI 항목은 도착 지점으로 승격돼야 한다');
  assert.equal(last.time, '21:48');
  assert.equal(last.endTime, '');
  assert.equal(last.location, request.endLocation);
});

test('a matched departure item is promoted to the departure type', () => {
  const request = { ...flatRequest, anchorSchedules: [] };
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '09:30', endTime: '10:00', type: 'attraction', title: '호텔에서 출발', location: flatRequest.startLocation },
      { time: '20:00', endTime: '20:30', type: 'attraction', title: '공항 도착', location: flatRequest.endLocation }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, request, 'ko');

  assert.equal(day.scheduleItems.length, 2);
  assert.equal(day.scheduleItems[0].type, 'departure');
  assert.equal(day.scheduleItems[0].time, flatRequest.startTime);
  assert.equal(day.scheduleItems.at(-1).type, 'arrival');
});

test('a genuine stop whose name merely contains 이동 is not stripped', () => {
  const request = { ...flatRequest, anchorSchedules: [] };
  const generatedDays = [{
    day: 1,
    scheduleItems: [
      { time: '12:00', endTime: '13:00', type: 'dining', title: '이동갈비 맛집', location: '경기도 포천시' },
      { time: '15:00', endTime: '16:00', type: 'attraction', title: '이동면 자연휴양림', location: '경기도 포천시 이동면' }
    ]
  }];

  const [day] = enforcePlannerConstraints(generatedDays, request, 'ko');

  assert.ok(day.scheduleItems.some(i => i.title === '이동갈비 맛집'));
  assert.ok(day.scheduleItems.some(i => i.title === '이동면 자연휴양림'));
});
