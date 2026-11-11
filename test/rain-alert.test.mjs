import test from 'node:test';
import assert from 'node:assert/strict';
import { rainAlert, isOutdoorStop } from '../src/domains/itinerary/services/rain-alert.mjs';

const forecast = hours => ({ status: 'forecast', date: '2026-09-13',
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, rainPercent: hours[hour] ?? 0 })) });
const stop = (time, endTime, extra = {}) => ({ type: 'attraction', title: time, time, endTime, ...extra });
const day = [
  { type: 'departure', title: '출발', time: '09:00' },
  stop('10:00', '11:00', { placeIntent: { category: 'museum', purpose: '박물관' } }),
  stop('12:00', '13:00', { type: 'dining' }),
  stop('14:30', '15:30', { placeIntent: { category: 'park', purpose: '산책' } }),
  stop('16:00', '17:00', { placeIntent: { category: 'tourist_attraction', purpose: '전망' } }),
  { type: 'arrival', title: '도착', time: '18:00' },
];

test('outdoor stops are parks, attractions and legacy visits; fixed, dining and indoor categories are not', () => {
  assert.equal(isOutdoorStop(day[3]), true);
  assert.equal(isOutdoorStop(day[4]), true);
  assert.equal(isOutdoorStop(stop('10:00', '11:00')), true);
  assert.equal(isOutdoorStop(stop('10:00', '11:00', { type: 'leisure' })), true);
  for (const item of [day[0], day[1], day[2], day[5], { ...day[3], type: 'AnchorSchedule' },
    stop('10:00', '11:00', { placeIntent: { category: 'cafe', purpose: '카페' } })]) assert.equal(isOutdoorStop(item), false);
});

test('the first outdoor stop overlapping rain is chosen with the whole contiguous rain window', () => {
  assert.deepEqual(rainAlert(day, forecast({ 14: 80, 15: 60, 16: 50, 17: 49 })), { index: 3, from: 14, to: 17 });
  // Rain at 10 is during the museum visit only, so the park is still the first affected outdoor stop.
  assert.deepEqual(rainAlert(day, forecast({ 10: 90, 16: 70 })), { index: 4, from: 16, to: 17 });
  // A stop ending exactly on the hour does not count the next hour.
  assert.equal(rainAlert([stop('13:00', '14:00')], forecast({ 14: 90 })), null);
  assert.deepEqual(rainAlert([stop('13:00', '14:01')], forecast({ 14: 90 })), { index: 0, from: 14, to: 15 });
});

test('no alert without data: missing, unknown, light or snow-only hours never become rain', () => {
  assert.equal(rainAlert(day, forecast({ 14: 49, 15: 30 })), null);
  assert.equal(rainAlert(day, forecast({ 14: null, 15: null })), null);
  assert.equal(rainAlert(day, { status: 'unavailable' }), null);
  assert.equal(rainAlert(day, null), null);
  assert.equal(rainAlert(day, { status: 'forecast', date: '2026-09-13', hours: [{ hour: 20, rainPercent: 100 }] }), null);
});

test('skipped (visited) stops and stops without valid times are ignored', () => {
  const rain = forecast({ 14: 80, 15: 80, 16: 80 });
  assert.deepEqual(rainAlert(day, rain, { skip: index => index === 3 }), { index: 4, from: 14, to: 17 });
  assert.equal(rainAlert([stop('15:00', '14:00'), stop('', '15:00'), stop('14:00', null)], rain), null);
});
