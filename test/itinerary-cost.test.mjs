import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCost, summarizeCosts, formatCostSummary } from '../src/domains/itinerary/services/itinerary-cost.mjs';

const stop = (cost, type = 'attraction') => ({ type, practicalInfo: { estimatedCost: cost } });

test('common AI cost formats are parsed', () => {
  assert.deepEqual(parseCost('₩3,000 (입장료)'), { min: 3000, max: 3000 });
  assert.deepEqual(parseCost('₩20,000 - ₩35,000'), { min: 20000, max: 35000 });
  assert.deepEqual(parseCost('Approx. ₩9,500 (직통열차)'), { min: 9500, max: 9500 });
  assert.deepEqual(parseCost('15000원'), { min: 15000, max: 15000 });
  assert.deepEqual(parseCost('KRW 12,000'), { min: 12000, max: 12000 });
});

test('free entries count as a known zero cost', () => {
  assert.deepEqual(parseCost('무료'), { min: 0, max: 0 });
  assert.deepEqual(parseCost('Free'), { min: 0, max: 0 });
  assert.deepEqual(parseCost('Free entrance'), { min: 0, max: 0 });
  // "무료(특별 전시 유료)" 처럼 단서가 붙어도 기본은 무료로 본다.
  assert.deepEqual(parseCost('무료 (특별 전시 유료)'), { min: 0, max: 0 });
});

test('values with no usable amount are reported as unparseable, not as zero', () => {
  // 0 으로 처리하면 합계가 실제보다 적게 나와 사용자를 오도한다.
  assert.equal(parseCost('지하철 기본요금'), null);
  assert.equal(parseCost('쇼핑 및 식사 비용에 따라 다름'), null);
  assert.equal(parseCost('업체별 상이'), null);
  assert.equal(parseCost(''), null);
  assert.equal(parseCost(null), null);
});

test('small non-monetary numbers are not mistaken for amounts', () => {
  assert.equal(parseCost('2인 기준'), null, '인원수를 금액으로 읽으면 안 된다');
  assert.equal(parseCost('Top 3'), null);
});

test('departure and arrival markers are excluded from the total', () => {
  const items = [
    { type: 'departure', practicalInfo: { estimatedCost: '₩50,000' } },
    stop('₩3,000'),
    { type: 'arrival', practicalInfo: { estimatedCost: '₩50,000' } }
  ];
  const summary = summarizeCosts(items);
  assert.equal(summary.min, 3000, '경계 항목은 방문지가 아니라 비용 대상이 아니다');
  assert.equal(summary.knownCount, 1);
});

test('a range sums into a range', () => {
  const summary = summarizeCosts([stop('₩3,000'), stop('₩20,000 - ₩35,000', 'dining')]);
  assert.deepEqual(summary, { min: 23000, max: 38000, knownCount: 2, unknownCount: 0 });
});

test('unparseable stops are counted so the UI can disclose them', () => {
  const summary = summarizeCosts([stop('₩10,000'), stop('지하철 기본요금'), stop('업체별 상이')]);
  assert.equal(summary.knownCount, 1);
  assert.equal(summary.unknownCount, 2);
});

test('a stop with no cost field at all is not counted as unpriced', () => {
  // 값이 비어 있는 것과, 금액이 적혀 있는데 못 읽은 것은 다르다.
  const summary = summarizeCosts([{ type: 'attraction' }, { type: 'attraction', practicalInfo: {} }]);
  assert.equal(summary.unknownCount, 0);
  assert.equal(summary.knownCount, 0);
});

test('the summary text discloses unpriced stops', () => {
  const withUnknown = { min: 23000, max: 38000, knownCount: 2, unknownCount: 1 };
  assert.equal(formatCostSummary(withUnknown), '1인 예상 비용 ₩23,000 ~ ₩38,000 · 1곳은 금액 미정');

  const allKnown = { min: 5000, max: 5000, knownCount: 1, unknownCount: 0 };
  assert.equal(formatCostSummary(allKnown), '1인 예상 비용 ₩5,000', '단일 금액은 범위로 쓰지 않는다');
});

test('nothing to sum yields no text at all', () => {
  assert.equal(formatCostSummary({ min: 0, max: 0, knownCount: 0, unknownCount: 3 }), null);
  assert.equal(formatCostSummary(null), null);
});

test('english output is produced for the en locale', () => {
  const summary = { min: 1000, max: 2000, knownCount: 2, unknownCount: 1 };
  assert.equal(formatCostSummary(summary, 'en'), 'Est. ₩1,000 ~ ₩2,000 per person · 1 stop(s) not priced');
});
