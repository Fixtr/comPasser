import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCost, summarizeCosts, formatCostSummary, formatCostAmount, isTransportEstimatedCost,
} from '../src/domains/itinerary/services/itinerary-cost.mjs';

const stop = (cost, type = 'attraction') => ({ type, practicalInfo: { estimatedCost: cost } });
const sum = (...costs) => summarizeCosts(costs.map(c => stop(c)));

test('common AI cost formats are parsed', () => {
  assert.deepEqual(parseCost('₩3,000 (입장료)'), { min: 3000, max: 3000, currency: 'KRW' });
  assert.deepEqual(parseCost('₩20,000 - ₩35,000'), { min: 20000, max: 35000, currency: 'KRW' });
  assert.deepEqual(parseCost('Approx. ₩9,500 (직통열차)'), { min: 9500, max: 9500, currency: 'KRW' });
  assert.deepEqual(parseCost('15000원'), { min: 15000, max: 15000, currency: 'KRW' });
  assert.deepEqual(parseCost('KRW 12,000'), { min: 12000, max: 12000, currency: 'KRW' });
});

/**
 * 여기가 이 파일의 핵심이다. 예전에는 통화 표기를 아예 보지 않고 세 자리
 * 이상 숫자를 전부 원화로 찍었다 — "2,000엔" 이 "₩2,000" 이 됐다.
 * 이 앱의 데모가 도쿄인 것을 생각하면 작은 문제가 아니다.
 */
test('통화 표기를 읽는다 — 엔을 원으로 바꿔 부르지 않는다', () => {
  assert.deepEqual(parseCost('2,000엔'), { min: 2000, max: 2000, currency: 'JPY' });
  assert.deepEqual(parseCost('¥1,500'), { min: 1500, max: 1500, currency: 'JPY' });
  assert.deepEqual(parseCost('1,200円'), { min: 1200, max: 1200, currency: 'JPY' });
  assert.deepEqual(parseCost('JPY 800'), { min: 800, max: 800, currency: 'JPY' });
  assert.deepEqual(parseCost('€30 - €45'), { min: 30, max: 45, currency: 'EUR' });
  assert.deepEqual(parseCost('약 500바트'), { min: 500, max: 500, currency: 'THB' });
});

test('표기가 붙어 있으면 작은 수도 금액으로 본다', () => {
  // 세 자리 규칙은 "2인" 같은 값을 거르려던 것이다. 통화 기호가 붙어 있으면
  // 그럴 위험이 없으므로 $25 도 금액이다 — 예전에는 이걸 통째로 놓쳤다.
  assert.deepEqual(parseCost('$25'), { min: 25, max: 25, currency: 'USD' });
  assert.deepEqual(parseCost('$12 - $18'), { min: 12, max: 18, currency: 'USD' });
});

test('통화 표기가 있어도 인원수는 금액이 아니다', () => {
  // 표기가 붙으면 작은 수도 금액으로 보게 했더니, 이번에는 "(1인)"의 1 이
  // 최소 금액으로 들어왔다. 작은 수를 금액으로 보는 조건은 "표기가 어딘가
  // 있다"가 아니라 "그 숫자 바로 옆에 표기가 있다"여야 한다.
  assert.deepEqual(parseCost('약 2500엔 (1인)'), { min: 2500, max: 2500, currency: 'JPY' });
  assert.deepEqual(parseCost('성인 1인 12,000원 / 어린이 8,000원'),
    { min: 8000, max: 12000, currency: 'KRW' });
  assert.deepEqual(parseCost('$5 (2인 기준)'), { min: 5, max: 5, currency: 'USD' });
});

test('표기가 없으면 통화를 지어내지 않는다', () => {
  assert.deepEqual(parseCost('3,000'), { min: 3000, max: 3000, currency: null });
  assert.deepEqual(parseCost('무료'), { min: 0, max: 0, currency: null });
});

test('free entries count as a known zero cost', () => {
  assert.equal(parseCost('Free').min, 0);
  assert.equal(parseCost('Free entrance').max, 0);
  // "무료(특별 전시 유료)" 처럼 단서가 붙어도 기본은 무료로 본다.
  assert.equal(parseCost('무료 (특별 전시 유료)').min, 0);
});

test('values with no usable amount are reported as unparseable, not as zero', () => {
  // 0 으로 처리하면 합계가 실제보다 적게 나와 사용자를 오도한다.
  assert.equal(parseCost('지하철 기본요금'), null);
  assert.equal(parseCost('쇼핑 및 식사 비용에 따라 다름'), null);
  assert.equal(parseCost('업체별 상이'), null);
  assert.equal(parseCost(''), null);
  assert.equal(parseCost(null), null);
});

test('AI transport fares are not treated as venue costs', () => {
  assert.equal(isTransportEstimatedCost('KTX 요금 ₩59,800'), true);
  assert.equal(isTransportEstimatedCost('공항철도 직통열차 ₩9,500'), true);
  assert.equal(isTransportEstimatedCost('Public transit fare $5'), true);
  assert.equal(isTransportEstimatedCost('입장료 ₩15,000'), false);
  assert.equal(isTransportEstimatedCost('기차 박물관 입장료 ₩12,000'), false,
    '장소 비용임을 밝힌 값까지 교통비로 버리면 안 된다');
  // Transport words inside a venue name are not fares (the Met is in the New York catalogue).
  for (const venue of ['Metropolitan Museum $25', 'Trail pass ¥500', 'Train Street cafe 50,000₫', 'Transporter Bridge £5']) {
    assert.equal(isTransportEstimatedCost(venue), false, venue);
  }
  for (const fare of ['Metro ticket €2.15', 'Railway pass ¥2,000', 'Transportation ₩3,000', 'Airport rail $10']) {
    assert.equal(isTransportEstimatedCost(fare), true, fare);
  }

  const summary = summarizeCosts([
    stop('KTX 요금 ₩59,800'),
    stop('식사 ₩20,000', 'dining'),
  ]);
  assert.deepEqual(summary.totals, [{ currency: 'KRW', min: 20000, max: 20000, count: 1 }]);
  assert.equal(summary.unknownCount, 1);
});

test('small non-monetary numbers are not mistaken for amounts', () => {
  assert.equal(parseCost('2인 기준'), null, '인원수를 금액으로 읽으면 안 된다');
  assert.equal(parseCost('Top 3'), null);
});

test('departure and arrival markers are excluded from the total', () => {
  const summary = summarizeCosts([
    { type: 'departure', practicalInfo: { estimatedCost: '₩50,000' } },
    stop('₩3,000'),
    { type: 'arrival', practicalInfo: { estimatedCost: '₩50,000' } },
  ]);
  assert.equal(summary.knownCount, 1, '경계 항목은 방문지가 아니라 비용 대상이 아니다');
  assert.deepEqual(summary.totals, [{ currency: 'KRW', min: 3000, max: 3000, count: 1 }]);
});

test('a range sums into a range', () => {
  const summary = sum('₩3,000', '₩20,000 - ₩35,000');
  assert.deepEqual(summary.totals, [{ currency: 'KRW', min: 23000, max: 38000, count: 2 }]);
  assert.equal(summary.knownCount, 2);
  assert.equal(summary.unknownCount, 0);
});

test('표기 없는 금액은 그날의 통화에 붙는다', () => {
  // 하루 안에서 "¥1,500" 과 맨숫자 "3000" 이 섞이면 둘 다 엔이라고 보는 것이
  // 자연스럽다 — AI 는 하루를 한 통화로 쓴다.
  const summary = sum('¥1,500', '3,000');
  assert.deepEqual(summary.totals, [{ currency: 'JPY', min: 4500, max: 4500, count: 2 }]);
  assert.equal(summary.assumedCurrency, false);
});

test('표기가 하나도 없으면 원화로 본다 — 다만 가정임을 남긴다', () => {
  const summary = sum('3,000', '5,000');
  assert.deepEqual(summary.totals, [{ currency: 'KRW', min: 8000, max: 8000, count: 2 }]);
  assert.equal(summary.assumedCurrency, true, '가정을 했다는 사실이 값에 남아야 한다');
});

test('통화가 섞이면 환산하지 않고 따로 보여준다', () => {
  // 환율을 끌어오지 않는 이상 더할 수 없다. 억지로 더하면 그 순간부터
  // 화면의 숫자는 근거가 없다.
  const summary = sum('¥1,500', '₩3,000');
  assert.equal(summary.mixed, true);
  assert.equal(summary.totals.length, 2);
  assert.deepEqual(summary.totals.map(t => t.currency).sort(), ['JPY', 'KRW']);
});

test('unparseable stops are counted so the UI can disclose them', () => {
  const summary = sum('₩10,000', '지하철 기본요금', '업체별 상이');
  assert.equal(summary.knownCount, 1);
  assert.equal(summary.unknownCount, 2);
});

test('a stop with no cost field is unknown, never implicitly free', () => {
  // 값이 비어 있는 것과, 금액이 적혀 있는데 못 읽은 것은 다르다.
  const summary = summarizeCosts([{ type: 'attraction' }, { type: 'attraction', practicalInfo: {} }]);
  assert.equal(summary.unknownCount, 2);
  assert.equal(summary.knownCount, 0);
});

test('the summary text discloses unpriced stops', () => {
  const withUnknown = summarizeCosts([
    stop('₩3,000'), stop('₩20,000 - ₩35,000'), stop('업체별 상이'),
  ]);
  assert.equal(formatCostSummary(withUnknown), '1인 예상 비용 ₩23,000 ~ ₩38,000 · 1곳은 금액 미정');

  assert.equal(formatCostSummary(sum('₩5,000')), '1인 예상 비용 ₩5,000', '단일 금액은 범위로 쓰지 않는다');
});

test('엔은 엔으로 찍는다', () => {
  assert.equal(formatCostSummary(sum('2,000엔', '1,500엔')), '1인 예상 비용 ¥3,500');
  assert.equal(formatCostAmount(sum('2,000엔')), '¥2,000');
});

test('섞인 통화는 한 줄에 나란히 — 사이에 환산이 없다', () => {
  const text = formatCostSummary(sum('¥1,500', '₩3,000'));
  assert.match(text, /¥1,500/);
  assert.match(text, /₩3,000/);
  assert.ok(!/~/.test(text), '서로 다른 통화를 범위로 묶으면 안 된다');
});

test('nothing to sum yields no text at all', () => {
  assert.equal(formatCostSummary(sum('업체별 상이')), '예상 비용 미확인 · 1곳은 금액 미정');
  assert.equal(formatCostSummary(null), null);
  assert.equal(formatCostAmount(null), null);
});

test('english output is produced for the en locale', () => {
  const summary = summarizeCosts([stop('₩1,000'), stop('₩2,000'), stop('업체별 상이')]);
  assert.equal(formatCostSummary(summary, 'en'), 'Est. ₩3,000 per person · 1 stop(s) not priced');
});

test('무료 앵커와 비용 없는 추천을 합쳐 무료 여행으로 표시하지 않는다', () => {
  const summary=summarizeCosts([{type:'AnchorSchedule',practicalInfo:{estimatedCost:'무료'}},
    {type:'dining',verifiedPlace:{placeId:'real'},practicalInfo:{}}, {type:'leisure'}]);
  assert.equal(summary.unknownCount,2);
  assert.equal(formatCostAmount(summary),'비용 미확인');
  assert.equal(formatCostAmount(summary,'en'),'Cost unknown');
  assert.doesNotMatch(formatCostSummary(summary),/₩0/);
  assert.match(formatCostSummary(summary),/2곳은 금액 미정/);
  assert.equal(formatCostAmount(sum('무료','Free')),'₩0');
});
