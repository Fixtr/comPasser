/**
 * 지도 구간 넘기기에 올릴 구간 목록과 한 줄 설명.
 * 이미 그린 선 가운데 하나를 고르는 일이라 경로 요청은 여기 없다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLegList } from '../src/domains/map/services/map-legs.mjs';

const WORDS = {
  busFormat: '{0}번 버스', subwayFormat: '{0}', trainFormat: '{0} 기차', transitText: '대중교통', walkText: '도보', vehicleBus: '버스', vehicleSubway: '지하철', vehicleFerry: '페리',
  durationMinutes: '{0}분', durationHours: '{0}시간', durationHoursMinutes: '{0}시간 {1}분',
  estimatedWalkDuration: '약 {0}분 (직선거리 추정)', estimatedTransitDuration: '약 {0}분 (자동차 시간 기반 추정)',
};
const t = key => WORDS[key];
const stops = ['호텔', '감천문화마을', '송도해수욕장', '자갈치시장', '국제시장', '용두산공원', '부산역'].map(title => ({ title }));
const walk = (fromIndex, minutes = 10) => ({ fromIndex, toIndex: fromIndex + 1, mode: 'WALKING', durationMinutes: minutes, displayMinutes: minutes });

test('일곱 곳을 잇는 여섯 구간이 번호 순서대로 나온다', () => {
  const list = buildLegList([0, 1, 2, 3, 4, 5].map(i => walk(i)), stops, t);
  assert.deepEqual(list.map(leg => leg.label), ['1 → 2', '2 → 3', '3 → 4', '4 → 5', '5 → 6', '6 → 7']);
  assert.deepEqual(list.map(leg => leg.fromIndex), [0, 1, 2, 3, 4, 5]);
  assert.equal(list[0].description, '호텔 → 감천문화마을 · 도보 10분');
});

test('같은 장소 안 이동과 결과가 없는 구간은 빠진다', () => {
  const list = buildLegList([
    walk(0), { fromIndex: 1, toIndex: 2, mode: 'SAME_PLACE', samePlace: true, durationMinutes: 0 },
    null, walk(4), undefined,
  ], stops, t);
  assert.deepEqual(list.map(leg => leg.label), ['1 → 2', '5 → 6']);
});

test('대중교통 구간은 노선과 소요 시간을 한 줄에 적는다', () => {
  const [bus, subway, long] = buildLegList([
    { fromIndex: 1, toIndex: 2, mode: 'TRANSIT', vehicleType: 'BUS', lineName: '41', durationMinutes: 15, displayMinutes: 15 },
    { fromIndex: 2, toIndex: 3, mode: 'TRANSIT', vehicleType: 'SUBWAY', lineName: '1호선', durationMinutes: 8, displayMinutes: 7 },
    { fromIndex: 3, toIndex: 4, mode: 'TRANSIT', durationMinutes: 75, displayMinutes: 75 },
  ], stops, t);
  assert.equal(bus.description, '감천문화마을 → 송도해수욕장 · 41번 버스 15분');
  assert.equal(subway.description, '송도해수욕장 → 자갈치시장 · 1호선 7분');
  assert.equal(long.description, '자갈치시장 → 국제시장 · 대중교통 1시간 15분');
});

test('노선 이름이 없는 대중교통 구간은 일정표와 같은 수단 이름을 쓴다', () => {
  const [bus, subway, ferry, unknown] = buildLegList([
    { fromIndex: 0, toIndex: 1, mode: 'TRANSIT', vehicleType: 'BUS', durationMinutes: 18, displayMinutes: 18 },
    { fromIndex: 1, toIndex: 2, mode: 'TRANSIT', vehicleType: 'metro_rail', durationMinutes: 9, displayMinutes: 9 },
    { fromIndex: 2, toIndex: 3, mode: 'TRANSIT', vehicleType: 'FERRY', durationMinutes: 30, displayMinutes: 30 },
    { fromIndex: 3, toIndex: 4, mode: 'TRANSIT', vehicleType: 'SHARE_TAXI', durationMinutes: 12, displayMinutes: 12 },
  ], stops, t);
  assert.equal(bus.description, '호텔 → 감천문화마을 · 버스 18분');
  assert.equal(subway.description, '감천문화마을 → 송도해수욕장 · 지하철 9분');
  assert.equal(ferry.description, '송도해수욕장 → 자갈치시장 · 페리 30분');
  assert.equal(unknown.description, '자갈치시장 → 국제시장 · 대중교통 12분');
});

test('추정 구간은 포함하고 기존 추정 문구를 그대로 쓴다', () => {
  const [walkGuess, transitGuess] = buildLegList([
    { fromIndex: 0, toIndex: 1, mode: 'WALKING', estimated: true, durationMinutes: 18 },
    { fromIndex: 1, toIndex: 2, mode: 'TRANSIT', estimated: true, durationMinutes: 40 },
  ], stops, t);
  assert.equal(walkGuess.description, '호텔 → 감천문화마을 · 약 18분 (직선거리 추정)');
  assert.equal(transitGuess.description, '감천문화마을 → 송도해수욕장 · 약 40분 (자동차 시간 기반 추정)');
});

test('시간을 재지 못한 구간은 선이 있으므로 남기고 시간은 지어내지 않는다', () => {
  const [failed] = buildLegList([{ fromIndex: 0, toIndex: 1, mode: 'WALKING', duration: '', durationMinutes: null }], stops, t);
  assert.equal(failed.description, '호텔 → 감천문화마을');
});

test('구간이 없으면 빈 목록이다', () => {
  assert.deepEqual(buildLegList([], stops, t), []);
  assert.deepEqual(buildLegList(undefined, undefined, t), []);
});
