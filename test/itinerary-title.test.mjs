import test from 'node:test';
import assert from 'node:assert/strict';

import { buildItineraryTitle, itineraryCity } from '../src/domains/itinerary/services/itinerary-title.mjs';

const day = (date, ...items) => ({ date, scheduleItems: items });
const stop = (title, type = 'attraction') => ({ type, title });

test('a single-day trip is titled by its date and first real stop', () => {
  // 출발/도착은 대개 호텔·공항이라 변별력이 없으므로 제외한다.
  const itinerary = { days: [day('2026-08-20',
    { type: 'departure', title: '출발 · 신라호텔서울' },
    stop('경복궁'),
    stop('삼청동 점심', 'dining'),
    stop('북촌 한옥마을'),
    { type: 'arrival', title: '도착 · 인천공항' }
  )] };

  assert.equal(buildItineraryTitle(itinerary), '8월 20일 · 경복궁 외 2곳');
});

test('a single real stop needs no "외 N곳" suffix', () => {
  const itinerary = { days: [day('2026-08-20', stop('경복궁'))] };
  assert.equal(buildItineraryTitle(itinerary), '8월 20일 · 경복궁');
});

test('a multi-day trip is titled by its date range and length', () => {
  const itinerary = { days: [day('2026-08-20'), day('2026-08-21'), day('2026-08-22')] };
  assert.equal(buildItineraryTitle(itinerary), '8월 20일~8월 22일 · 2박 3일');
});

test('english output uses numeric dates and english wording', () => {
  const itinerary = { days: [day('2026-08-20', stop('Gyeongbokgung'), stop('Lunch', 'dining'))] };
  assert.equal(buildItineraryTitle(itinerary, 'en'), '08/20 · Gyeongbokgung +1 more');
});

test('the legacy itineraryPlan wrapper is understood', () => {
  const wrapped = { itineraryPlan: { days: [day('2026-08-20', stop('경복궁'))] } };
  assert.equal(buildItineraryTitle(wrapped), '8월 20일 · 경복궁');
});

test('a day with only departure/arrival falls back to the date alone', () => {
  const itinerary = { days: [day('2026-08-20',
    { type: 'departure', title: '출발 · 서울역' },
    { type: 'arrival', title: '도착 · 인천공항' }
  )] };
  assert.equal(buildItineraryTitle(itinerary), '8월 20일');
});

test('missing or malformed data yields a safe generic title', () => {
  assert.equal(buildItineraryTitle(null), '여행 일정');
  assert.equal(buildItineraryTitle({ days: [] }), '여행 일정');
  assert.equal(buildItineraryTitle({}), '여행 일정');
  assert.equal(buildItineraryTitle(null, 'en'), 'Trip plan');
  // 날짜가 없어도 방문지가 있으면 그걸로 구분한다.
  assert.equal(buildItineraryTitle({ days: [{ scheduleItems: [stop('경복궁')] }] }), '경복궁');
});

test('same start and end date is treated as a single day, not a range', () => {
  const itinerary = { days: [day('2026-08-20', stop('경복궁'))] };
  assert.equal(buildItineraryTitle(itinerary), '8월 20일 · 경복궁');
});

test('a trip whose request names a catalogue city leads with that city', () => {
  const days = [day('2026-08-20'), day('2026-08-21'), day('2026-08-22')];
  const seoul = { request: { destination: { id: 'seoul', name: 'Seoul, South Korea' } }, days };
  const tokyo = { itineraryPlan: { request: { destination: { id: 'tokyo' } }, days } };
  assert.equal(buildItineraryTitle(seoul), '서울 · 8월 20일~8월 22일 · 2박 3일');
  assert.equal(buildItineraryTitle(tokyo, 'en'), 'Tokyo · 08/20–08/22 · 3 days');
  assert.equal(itineraryCity(tokyo), '도쿄');
  // An unknown id or a plan from before destinations were stored keeps the old title.
  assert.equal(itineraryCity({ request: { destination: { id: 'atlantis' } }, days }), '');
  assert.equal(buildItineraryTitle({ request: {}, days }), '8월 20일~8월 22일 · 2박 3일');
});
