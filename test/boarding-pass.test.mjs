import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseDurationMinutes,
  formatMinutes,
  buildBoardingPass,
  MAX_ROWS,
} from '../src/domains/itinerary/services/boarding-pass.mjs';

const day = {
  date: '2026-08-25',
  scheduleItems: [
    { type: 'departure', title: '출발', location: '서울역', time: '09:00' },
    { type: 'Sightseeing', title: '시부야 스카이', location: '시부야', time: '10:30',
      duration: '1시간 20분', transitInfo: '지하철 14분 · 2.1km',
      practicalInfo: { estimatedCost: '2,000엔' } },
    { type: 'AnchorSchedule', title: '아지노야 본점', location: '아자부주반', time: '13:00',
      duration: '1시간 30분', transitInfo: '도보 9분 · 0.7km',
      practicalInfo: { estimatedCost: '3,000엔' } },
    { type: 'Sightseeing', title: '나카메구로 산책', location: '나카메구로', time: '15:00',
      duration: '1시간', transitInfo: '지하철 11분 · 1.8km' },
    { type: 'arrival', title: '도착', location: '신주쿠 호텔', time: '17:00' },
  ],
};
const plan = { days: [day] };

test('이동 시간 문구에서 분을 읽는다', () => {
  assert.equal(parseDurationMinutes('약 15분'), 15);
  assert.equal(parseDurationMinutes('1시간 10분'), 70);
  assert.equal(parseDurationMinutes('2시간'), 120);
  assert.equal(parseDurationMinutes('지하철 14분 · 2.1km'), 14);
  assert.equal(parseDurationMinutes(''), null);
  assert.equal(parseDurationMinutes('곧 도착'), null);
  // 거리의 숫자를 시간으로 읽으면 안 된다.
  assert.equal(parseDurationMinutes('2.1km'), null);
});

test('분을 사람이 읽는 길이로 되돌린다', () => {
  assert.equal(formatMinutes(52), '52분');
  assert.equal(formatMinutes(80), '1시간 20분');
  assert.equal(formatMinutes(120), '2시간');
  assert.equal(formatMinutes(0), null);
  assert.equal(formatMinutes(52, 'en'), '52m');
  assert.equal(formatMinutes(80, 'en'), '1h 20m');
});

test('출발과 도착은 줄이 아니라 티켓의 구간이 된다', () => {
  const pass = buildBoardingPass({ plan, dayIndex: 0, title: '도쿄 여행' });
  assert.equal(pass.from, '서울역');
  assert.equal(pass.to, '신주쿠 호텔');
  assert.deepEqual(pass.rows.map(r => r.name), ['시부야 스카이', '아지노야 본점', '나카메구로 산책']);
});

test('고정 일정은 확정 좌석으로 표시된다', () => {
  const pass = buildBoardingPass({ plan, dayIndex: 0, title: '도쿄 여행' });
  assert.deepEqual(pass.rows.map(r => r.anchor), [false, true, false]);
});

test('이동 시간을 합산한다', () => {
  const pass = buildBoardingPass({ plan, dayIndex: 0, title: '도쿄 여행' });
  // 14 + 9 + 11
  assert.equal(pass.transit, '34분');
});

test('비용은 금액만, 단서는 따로 — 라벨과 겹치지 않게', () => {
  const pass = buildBoardingPass({ plan, dayIndex: 0, title: '도쿄 여행' });
  // 티켓에는 '비용' 라벨이 이미 붙는다. 값에 '1인 예상 비용' 이 또 들어가면
  // 같은 말이 두 번 적힌다.
  assert.ok(!/예상|비용|per person/i.test(pass.cost));
  assert.equal(pass.costNote, '1곳 미정');
});

test('도쿄 일정의 티켓에는 엔이 찍힌다', () => {
  // 위 픽스처의 금액은 "2,000엔"·"3,000엔" 이다. 예전에는 티켓이 원화
  // 기호를 직접 만들어 붙여서 ₩5,000 으로 나갔다 — 공유받은 사람에게
  // 열 배쯤 어긋난 금액이 간 셈이다.
  const pass = buildBoardingPass({ plan, dayIndex: 0, title: '도쿄 여행' });
  assert.equal(pass.cost, '¥5,000');
});

test('합계에 못 넣은 곳이 있으면 그 사실을 남긴다', () => {
  const withUnknown = { date: '2026-08-25', scheduleItems: [
    { type: 'Sightseeing', title: 'A', location: 'a', time: '10:00',
      practicalInfo: { estimatedCost: '3,000원' } },
    { type: 'Sightseeing', title: 'B', location: 'b', time: '12:00',
      practicalInfo: { estimatedCost: '쇼핑에 따라 다름' } },
  ] };
  const pass = buildBoardingPass({ plan: { days: [withUnknown] }, dayIndex: 0, title: 'x' });
  assert.equal(pass.cost, '₩3,000');
  assert.equal(pass.costNote, '1곳 미정');
});

test('날짜와 일차로 결정되는 일련번호 — 같은 입력이면 같은 값', () => {
  const a = buildBoardingPass({ plan, dayIndex: 0, title: '도쿄 여행' });
  const b = buildBoardingPass({ plan, dayIndex: 0, title: '도쿄 여행' });
  assert.equal(a.code, b.code);
  assert.match(a.code, /^CP[0-9A-Z-]+$/);
  assert.equal(a.dateLabel, '2026.08.25');
  assert.equal(a.dayLabel, '1일차');
});

test('한 장에 담기지 않으면 잘라내되 몇 곳이 빠졌는지 남긴다', () => {
  const many = {
    date: '2026-08-25',
    scheduleItems: [
      { type: 'departure', title: '출발', location: '서울역', time: '08:00' },
      ...Array.from({ length: MAX_ROWS + 3 }, (_, i) => ({
        type: 'Sightseeing', title: `장소 ${i + 1}`, location: `곳 ${i + 1}`,
        time: `${String(9 + i).padStart(2, '0')}:00`, duration: '1시간',
      })),
    ],
  };
  const pass = buildBoardingPass({ plan: { days: [many] }, dayIndex: 0, title: '긴 하루' });
  assert.equal(pass.rows.length, MAX_ROWS);
  assert.equal(pass.more, 3);
});

test('그릴 것이 없으면 티켓을 만들지 않는다', () => {
  assert.equal(buildBoardingPass({ plan: { days: [] }, dayIndex: 0, title: 'x' }), null);
  assert.equal(buildBoardingPass({ plan: null, dayIndex: 0, title: 'x' }), null);
  assert.equal(buildBoardingPass({
    plan: { days: [{ date: '2026-08-25', scheduleItems: [] }] }, dayIndex: 0, title: 'x',
  }), null);
});

test('출발·도착이 없어도 첫 곳과 마지막 곳으로 구간을 만든다', () => {
  const bare = { date: '2026-08-25', scheduleItems: [
    { type: 'Sightseeing', title: '경복궁', location: '종로', time: '10:00', duration: '1시간' },
    { type: 'Sightseeing', title: '북촌', location: '가회동', time: '12:00', duration: '1시간' },
  ] };
  const pass = buildBoardingPass({ plan: { days: [bare] }, dayIndex: 0, title: '서울' });
  assert.equal(pass.from, '종로');
  assert.equal(pass.to, '가회동');
  assert.equal(pass.rows.length, 2);
});

test('an arrival at an unset stay shows its label on the ticket, not the destination string', () => {
  const unsetPlan = { days: [{ ...day, scheduleItems: [
    ...day.scheduleItems.filter(item => item.type !== 'arrival'),
    { type: 'arrival', title: '도착 · 숙소 미정 (서울 중심)', location: 'Seoul, South Korea', stayUnsetLabel: '숙소 미정 (서울 중심)', time: '18:00' },
  ] }] };
  assert.equal(buildBoardingPass({ plan: unsetPlan, dayIndex: 0, title: '서울 여행' }).to, '숙소 미정 (서울 중심)');
});

test('자동 배치한 꼭 갈 장소는 확정이 아니다 — 시간을 정한 곳만 확정으로 표시한다', () => {
  const flexible = { days: [{ ...day, scheduleItems: day.scheduleItems.map(item =>
    item.type === 'AnchorSchedule' ? { ...item, flexible: true } : item) }] };
  const pass = buildBoardingPass({ plan: flexible, dayIndex: 0 });
  assert.deepEqual(pass.rows.map(r => r.anchor), [false, false, false]);
  assert.equal(pass.anchorCount, 0);
});

test('일차는 티켓 언어로 적는다', () => {
  assert.equal(buildBoardingPass({ plan, dayIndex: 0 }).dayLabel, '1일차');
  assert.equal(buildBoardingPass({ plan, dayIndex: 0, language: 'en' }).dayLabel, 'DAY 1');
});
