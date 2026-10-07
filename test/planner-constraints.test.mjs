import test from 'node:test';
import assert from 'node:assert/strict';
import { toPlannerDraft } from '../src/domains/planner/services/planner-draft.mjs';
import { scheduleFlexibleVisits } from '../src/domains/planner/services/schedule-flexible-visits.mjs';
import { findPlannerRequestIssue } from '../functions/planner-request-validation.mjs';

import {
  enforcePlannerConstraints,
  recoverSparseGeneratedDays,
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

test('overnight places connect each day to the next without changing the trip endpoints', () => {
  const hotelA = {placeId:'hotel-a',displayName:'첫 숙소',formattedAddress:'서울 종로',lat:37.5,lng:127};
  const hotelB = {placeId:'hotel-b',displayName:'둘째 숙소',formattedAddress:'서울 마포',lat:37.6,lng:126.9};
  const request = {date:['2026-10-01','2026-10-02','2026-10-03','2026-10-04'],startTime:'09:00',endTime:'18:00',
    startLocation:'서울역',endLocation:'인천공항',overnightLocations:[hotelA,hotelB,hotelB]};
  const days = normalizePlannerRequest(request).dailyData;
  assert.deepEqual(days.map(day => [day.startLocation,day.endLocation]), [
    ['서울역',hotelA],[hotelA,hotelB],[hotelB,hotelB],[hotelB,'인천공항']
  ]);
  const result = enforcePlannerConstraints(request.date.map((date,index) => ({day:index + 1,date,scheduleItems:[]})),request);
  assert.deepEqual(result.map(day => [day.scheduleItems[0].location,day.scheduleItems.at(-1).location]), [
    ['서울역','첫 숙소'],['첫 숙소','둘째 숙소'],['둘째 숙소','둘째 숙소'],['둘째 숙소','인천공항']
  ]);
});

test('sparse multi-day blocks receive one provisional visit only when a long gap exists', () => {
  const request = { date:['2026-10-01','2026-10-02','2026-10-03','2026-10-04'],
    startTime:'09:00',endTime:'18:00',startLocation:'서울역',endLocation:'인천공항',
    overnightLocations:['호텔 A','호텔 B','호텔 C'],dailyTimes:[{day:4,startTime:'15:00',endTime:'17:00'}] };
  const generated = request.date.map((date,index) => ({day:index+1,date,scheduleItems:index===2
    ? [{type:'attraction',title:'기존 방문',location:'호텔 B',time:'11:00',endTime:'12:00'}] : []}));
  const days = enforcePlannerConstraints(generated,request);
  const recovered = recoverSparseGeneratedDays(days);
  assert.deepEqual(recovered.map(day => day.scheduleItems.filter(item => item.placeStatus === 'pending').length),[1,1,1,0]);
  assert.ok(recovered[2].scheduleItems.some(item => item.title === '기존 방문'));
  assert.equal(recovered[1].scheduleItems[1].placeIntent.nearLocation,'호텔 A');
  assert.equal(recovered[0].scheduleItems[1].placeStatus,'pending');
  assert.deepEqual(recovered.map(day => [day.scheduleItems[0].location,day.scheduleItems.at(-1).location]),
    [['서울역','호텔 A'],['호텔 A','호텔 B'],['호텔 B','호텔 C'],['호텔 C','인천공항']]);
  assert.deepEqual(recoverSparseGeneratedDays(days.slice(0,1)),days.slice(0,1));
  assert.deepEqual(days[0].scheduleItems.map(item => item.type),['departure','arrival']);
});

test('lodging selections and edited trip endpoints override stale derived daily boundaries', () => {
  const request = { date: ['2026-10-01', '2026-10-02'], startTime: '09:00', endTime: '18:00',
    startLocation: '새 출발지', endLocation: '새 도착지', overnightLocations: ['선택한 숙소'],
    dailyData: [
      { day: 1, date: '2026-10-01', startLocation: '옛 출발지', endLocation: '옛 공항' },
      { day: 2, date: '2026-10-02', startLocation: '옛 출발지', endLocation: '옛 공항' },
    ] };
  const normalized = normalizePlannerRequest(request);
  assert.deepEqual(normalized.dailyData.map(day => [day.startLocation, day.endLocation]),
    [['새 출발지', '선택한 숙소'], ['선택한 숙소', '새 도착지']]);
  assert.equal(findPlannerRequestIssue(normalized), null);
  request.startLocation = '';
  assert.equal(findPlannerRequestIssue(normalizePlannerRequest(request)).reason, 'missing-location');
});

test('untimed required visits get valid slots while reservation times remain fixed', async () => {
  const request = { ...flatRequest, date: ['2030-10-01'], startTime: '09:00', endTime: '18:00',
    anchorSchedules: [
      { day: 1, name: '공연', location: '공연장', time: '15:00', endTime: '16:00' },
      { day: 1, name: '서울숲', location: '서울숲', flexible: true, stayMinutes: 60 },
      { day: 1, name: '경복궁', location: '경복궁', flexible: true, stayMinutes: 90 }
    ] };
  const { request: placed, issue } = await scheduleFlexibleVisits(request, {
    travelMinutes: async () => 30,
    hoursStatus: async () => 'unknown'
  });
  assert.equal(issue, null);
  assert.deepEqual(placed.anchorSchedules.map(anchor => [anchor.name, anchor.time, anchor.endTime]), [
    ['공연', '15:00', '16:00'], ['서울숲', '09:30', '10:30'], ['경복궁', '11:00', '12:30']
  ]);
  assert.equal(request.anchorSchedules[1].time, undefined);
  assert.equal(placed.anchorSchedules[1].flexible, true);
  assert.equal(toPlannerDraft(normalizePlannerRequest(placed)).anchorSchedules[1].flexible, true);
  assert.equal(findPlannerRequestIssue(normalizePlannerRequest(placed)), null);
  const [day] = enforcePlannerConstraints([{ day: 1, scheduleItems: [] }], placed);
  assert.deepEqual(day.scheduleItems.filter(item => item.type === 'AnchorSchedule').map(item => item.title),
    ['서울숲', '경복궁', '공연']);
  assert.deepEqual(day.scheduleItems.filter(item => item.type === 'AnchorSchedule').map(item => item.duration),
    ['필수 방문지', '필수 방문지', '고정 일정']);
});

test('an untimed visit that cannot fit is rejected rather than silently dropped', async () => {
  const request = { ...flatRequest, date: ['2030-10-01'], startTime: '09:00', endTime: '10:00',
    anchorSchedules: [{ day: 1, name: '서울숲', location: '서울숲', flexible: true, stayMinutes: 60 }] };
  const result = await scheduleFlexibleVisits(request, { travelMinutes: async () => 30 });
  assert.deepEqual(result.issue, { reason: 'flexible-visit-space', day: 1, anchorIndex: 0 });
  assert.equal(result.request, request);
});

test('measured journeys and known opening hours place a visit after a closed slot', async () => {
  const request = { ...flatRequest, date: ['2030-10-01'], startTime: '09:00', endTime: '18:00',
    startLocation: '출발지', endLocation: '도착지', anchorSchedules: [
      { day: 1, name: '공연', location: '공연장', time: '13:00', endTime: '14:00' },
      { day: 1, name: '박물관', location: '박물관', flexible: true, stayMinutes: 60 }
    ] };
  const routes = { '출발지:박물관': 90, '박물관:공연장': 45, '박물관:도착지': 30 };
  const checked = [];
  const result = await scheduleFlexibleVisits(request, {
    travelMinutes: async (from, to) => routes[`${from}:${to}`] ?? 30,
    hoursStatus: async (_anchor, _date, start) => { checked.push(start); return start < '11:00' ? 'conflict' : 'regular'; }
  });
  assert.equal(result.issue, null);
  assert.deepEqual(checked, ['10:30', '10:45', '11:00']);
  assert.deepEqual(result.request.anchorSchedules.map(anchor => [anchor.time, anchor.endTime]),
    [['13:00', '14:00'], ['11:00', '12:00']]);
});

test('verified closure blocks generation instead of pretending the venue is open', async () => {
  const request = { ...flatRequest, date: ['2030-10-01'], startTime: '09:00', endTime: '18:00',
    anchorSchedules: [{ day: 1, name: '박물관', location: '박물관', flexible: true, stayMinutes: 60 }] };
  const result = await scheduleFlexibleVisits(request, {
    travelMinutes: async () => 0, hoursStatus: async () => 'closed'
  });
  assert.equal(result.issue.reason, 'flexible-visit-hours');
  assert.equal(result.request, request);
});

test('a failed map lookup cannot turn an unmeasured journey into a feasible visit', async () => {
  const request = { ...flatRequest, date: ['2030-10-01'], startTime: '09:00', endTime: '18:00',
    anchorSchedules: [{ day: 1, name: '박물관', location: '박물관', flexible: true, stayMinutes: 60 }] };
  const result = await scheduleFlexibleVisits(request, {
    travelMinutes: async () => null, hoursStatus: async () => 'regular'
  });
  assert.deepEqual(result.issue, { reason: 'flexible-visit-route', day: 1, anchorIndex: 0 });
  assert.equal(result.request, request);
});

test('recommendation-only empty days get authoritative boundaries and anchors exactly once', () => {
  const result = enforcePlannerConstraints([{ day: 1, date: flatRequest.date[0], scheduleItems: [] }], flatRequest);
  assert.deepEqual(result[0].scheduleItems.map(i => i.type), ['departure', 'AnchorSchedule', 'arrival']);
  assert.equal(result[0].scheduleItems[1].time, '11:02');
  assert.equal(result[0].scheduleItems[1].location, '국립중앙박물관');
  assert.deepEqual(enforcePlannerConstraints(result, flatRequest), result);
});

test('inserted anchors are sorted into the day, while genuine model overflow past midnight is removed', () => {
  const visits = [
    {type:'leisure',time:'10:00',endTime:'11:00',title:'산책',location:'서울역',placeIntent:{purpose:'산책'}},
    {type:'leisure',time:'15:00',endTime:'16:00',title:'카페',location:'서울역',placeIntent:{purpose:'카페'}},
    {type:'leisure',time:'01:00',endTime:'02:00',title:'다음날 방문',location:'서울역',placeIntent:{purpose:'야식'}}
  ];
  const [day] = enforcePlannerConstraints([{day:1,scheduleItems:visits}],flatRequest);
  assert.deepEqual(day.scheduleItems.map(i=>i.time),['09:06','10:00','11:02','15:00','21:06']);
});

test('daytime night-only suggestions are removed while an ordinary visit remains', () => {
  const request={date:['2026-09-29'],startTime:'09:00',endTime:'21:00',
    startLocation:'서울역',endLocation:'서울역',anchorSchedules:[]};
  const [day]=enforcePlannerConstraints([{scheduleItems:[
    {type:'attraction',title:'경복궁 야간 특별 관람',time:'16:17',endTime:'17:47',location:'경복궁',
      placeIntent:{purpose:'경복궁 야간 특별 관람',category:'tourist_attraction'}},
    {type:'attraction',title:'경복궁 야간 특별 관람',time:'19:00',endTime:'20:00',location:'경복궁',
      placeIntent:{purpose:'경복궁 야간 특별 관람',category:'tourist_attraction'}},
    {type:'attraction',title:'북촌 산책',time:'18:30',endTime:'19:30',location:'북촌'}
  ]}],request);
  assert.equal(day.scheduleItems.some(item=>item.title==='경복궁 야간 특별 관람'),false);
  assert.equal(day.scheduleItems.some(item=>item.title==='북촌 산책'),true);
});

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

test('actual map routes own transit facts even when the model invents KTX text and fare', () => {
  const request={date:['2026-10-20'],startTime:'10:00',endTime:'11:00',startLocation:'서울역',endLocation:'인천국제공항',anchorSchedules:[]};
  const modelItems=[
    {type:'attraction',title:'서울역 출발',location:'서울역',time:'10:00',endTime:'',transitInfo:'KTX로 공항 이동',practicalInfo:{estimatedCost:'KTX 요금 ₩59,800'}},
    {type:'attraction',title:'공항 도착',location:'인천국제공항',time:'11:00',endTime:'',transitInfo:'KTX 약 1시간',practicalInfo:{estimatedCost:'KTX 요금 ₩59,800'}},
  ];
  const [day]=enforcePlannerConstraints([{day:1,scheduleItems:modelItems}],request);
  assert.deepEqual(day.scheduleItems.map(item=>item.type),['departure','arrival']);
  assert.deepEqual(day.scheduleItems.map(item=>item.transitInfo),['','']);
  assert.deepEqual(day.scheduleItems.map(item=>item.practicalInfo?.estimatedCost || ''),['','']);
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

test('explicit daily locations override lodging and stale dailyData without changing adjacent days', () => {
  const station = { placeId: 'station', displayName: '부산역', formattedAddress: '부산', lat: 35.1, lng: 129.0 };
  const request = {
    date: ['2026-10-07', '2026-10-08', '2026-10-09'],
    startTime: '09:00', endTime: '18:00', startLocation: '서울역', endLocation: '공항',
    overnightLocations: ['숙소 A', '숙소 B'],
    dailyLocations: [{ day: 2, startLocation: station, endLocation: '' }],
    dailyData: [{ day: 2, startLocation: '오래된 출발지', endLocation: '오래된 도착지' }],
  };
  const normalized = normalizePlannerRequest(request);
  assert.deepEqual(normalized.dailyData.map(day => [day.startLocation, day.endLocation]), [
    ['서울역', '숙소 A'], [station, '숙소 B'], ['숙소 B', '공항'],
  ]);
  assert.deepEqual(normalizePlannerRequest(normalized), normalized);
  const generated = enforcePlannerConstraints([{day: 2, scheduleItems: []}], request);
  assert.equal(generated[0].scheduleItems[0].selectedPlace.placeId, 'station');
  assert.equal(generated[0].scheduleItems.at(-1).location, '숙소 B');
  assert.equal(normalizePlannerRequest({...request, dailyLocations: null}).dailyData[1].startLocation, '숙소 A');
  assert.equal(normalizePlannerRequest({...request, date: ['2026-10-07'], dailyData: [],
    dailyLocations: [{day: 1, startLocation: station}]}).dailyData[0].startLocation, '서울역');
});
