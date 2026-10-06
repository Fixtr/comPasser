import { normalizePlannerRequest } from '../src/domains/planner/services/planner-constraints.mjs';

const anchor = (name, time, endTime, location, day = 1) => ({ name, time, endTime, location, day });
const make = (id, description, overrides = {}) => ({ id, description, request: normalizePlannerRequest({
  date: ['2026-10-06'], startTime: '09:00', endTime: '18:00',
  startLocation: '서울역', endLocation: '서울역', theme: 'photo', budget: 'standard',
  anchorSchedules: [], ...overrides
}) });

// Fixed dates/inputs keep runs comparable. Change the version when changing cases.
export const CASE_VERSION = 1;
export const cases = [
  make('day-anchor', '당일치기: 박물관 필수 일정과 점심 배치', {
    anchorSchedules: [anchor('국립중앙박물관 관람', '13:00', '14:00', '국립중앙박물관')]
  }),
  make('day-airport', '당일치기: 도심에서 인천공항까지, 종료 시각과 도착 여유', {
    endTime: '21:00', endLocation: '인천국제공항 제1여객터미널', budget: 'flex',
    anchorSchedules: [anchor('경복궁 관람', '15:00', '16:00', '경복궁')]
  }),
  make('day-short', '당일치기: 3시간 안에 휴식과 식사가 과밀하게 들어가는지', {
    startTime: '11:00', endTime: '14:00', startLocation: '서울숲', endLocation: '서울숲',
    theme: 'healing', budget: 'budget'
  }),
  make('day-tight-anchors', '당일치기: 서로 먼 필수 일정 사이 10분, 불가능한 이동 탐지', {
    anchorSchedules: [anchor('국립중앙박물관 관람', '10:00', '11:30', '국립중앙박물관'),
      anchor('롯데월드타워 약속', '11:40', '12:40', '롯데월드타워')]
  }),
  make('four-day-food', '3박 4일: 동일 출발·도착 조건에서 식사 체류시간과 일자 누락', {
    date: ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'], theme: 'food'
  }),
  make('four-day-anchors', '3박 4일: 매일 필수 일정, 첫날·마지막 날 시간 축소', {
    date: ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'], theme: 'activity',
    dailyTimes: [{ day: 1, startTime: '14:00', endTime: '19:00' },
      { day: 2, startTime: '09:00', endTime: '18:00' },
      { day: 3, startTime: '09:00', endTime: '18:00' },
      { day: 4, startTime: '09:00', endTime: '14:00' }],
    anchorSchedules: [anchor('경복궁 관람', '15:00', '16:00', '경복궁'),
      anchor('국립중앙박물관 관람', '13:00', '14:00', '국립중앙박물관', 2),
      anchor('서울숲 산책', '14:00', '15:00', '서울숲', 3),
      anchor('남산서울타워 관람', '11:00', '12:00', '남산서울타워', 4)]
  })
];

export const MULTIDAY_CASE_VERSION = 2;
export const multidayCases = [
  { id: 'four-day-food-overnights', description: '3박 4일: 같은 숙소를 잇는 식도락 일정',
    request: normalizePlannerRequest({ ...cases[4].request,
      overnightLocations: ['롯데호텔 서울', '롯데호텔 서울', '롯데호텔 서울'] }) },
  { id: 'four-day-anchors-overnights', description: '3박 4일: 필수 일정과 세 숙소를 잇는 일정',
    request: normalizePlannerRequest({ ...cases[5].request,
      overnightLocations: ['나인트리 프리미어 호텔 인사동', '노보텔 앰배서더 서울 용산', '호텔 포코 성수'] }) }
];
