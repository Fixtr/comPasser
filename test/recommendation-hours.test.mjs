import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationHours } from '../functions/recommendation-hours.mjs';

const today = '2026-10-14'; // Wednesday; all dates and points are venue-local wall time.
const point = (day, hour, minute = 0) => ({ day, hour, minute });
const dated = (day, hour, minute = 0) => ({ ...point(new Date(`2026-10-${day}`).getUTCDay(), hour, minute), date: { year: 2026, month: 10, day } });
const weekly = periods => ({ regularOpeningHours: { periods } });
const assess = (place, date = '2026-10-15') => recommendationHours(place, date, today);

test('visit date, not openNow or description order, determines weekly hours and days off', () => {
  const place = weekly([{ open: point(4, 9), close: point(4, 12) }, { open: point(4, 13), close: point(4, 18) }]);
  place.regularOpeningHours.openNow = false;
  place.regularOpeningHours.weekdayDescriptions = ['Closed'];
  assert.deepEqual(assess(place), { status: 'regular', intervals: ['09:00–12:00', '13:00–18:00'] });
  assert.equal(assess(place, '2026-10-16').status, 'closed');
  assert.equal(assess(weekly([])).status, 'closed');
  assert.equal(assess({}).status, 'unknown');
  assert.equal(assess({ regularOpeningHours: { openNow: true } }).status, 'unknown');
});

test('current dated special hours override weekly hours, including holiday closure and exceptional opening', () => {
  const place = weekly([{ open: point(4, 9), close: point(4, 18) }]);
  place.currentOpeningHours = { periods: [], specialDays: [{ date: { year: 2026, month: 10, day: 15 } }] };
  assert.equal(assess(place).status, 'closed');
  place.currentOpeningHours.periods = [{ open: dated(15, 11), close: dated(15, 14) }];
  assert.deepEqual(assess(place), { status: 'current', intervals: ['11:00–14:00'] });
  place.regularOpeningHours.periods = [];
  assert.equal(assess(place).status, 'current');
  delete place.currentOpeningHours.periods;
  assert.equal(assess(place).status, 'unknown'); // A special day cannot silently fall back to weekly hours.
  place.currentOpeningHours.periods = [{ open: dated(14, 9), close: dated(14, 18) }];
  assert.equal(assess(place).status, 'closed');
});

test('the seven-day local window includes day six only; stale or malformed current data stays unknown', () => {
  const place = { ...weekly([{ open: point(3, 10), close: point(3, 17) }]), currentOpeningHours: { periods: [] } };
  assert.equal(assess(place, '2026-10-20').status, 'closed');
  assert.deepEqual(assess(place, '2026-10-21'), { status: 'regular', intervals: ['10:00–17:00'] });
  for (const periods of [[{ open: dated(13, 9), close: dated(13, 17) }], [{ open: dated(21, 9), close: dated(21, 17) }],
    [{ open: point(4, 9), close: point(4, 17) }], [{ open: { ...dated(15, 9), day: 6 }, close: dated(15, 17) }]]) {
    assert.equal(assess({ ...place, currentOpeningHours: { periods } }).status, 'unknown');
  }
});

test('overnight, Saturday/Sunday rollover, midnight closing and overlapping intervals are handled', () => {
  const place = weekly([{ open: point(6, 22), close: point(0, 2) }]);
  assert.deepEqual(assess(place, '2026-10-17'), { status: 'regular', intervals: ['22:00–24:00'] });
  assert.deepEqual(assess(place, '2026-10-18'), { status: 'regular', intervals: ['00:00–02:00'] });
  const midnight = weekly([{ open: point(3, 22), close: point(4, 0) }]);
  assert.equal(assess(midnight).status, 'closed');
  const overlaps = weekly([{ open: point(4, 10), close: point(4, 17) }, { open: point(4, 9), close: point(4, 12) }]);
  assert.deepEqual(assess(overlaps).intervals, ['09:00–17:00']);
  const current = { currentOpeningHours: { periods: [{ open: dated(14, 22), close: dated(15, 2) }] } };
  assert.deepEqual(assess(current), { status: 'current', intervals: ['00:00–02:00'] });
});

test('24/7 sentinel and truncated boundaries work; other missing close or malformed points do not imply opening', () => {
  assert.deepEqual(assess(weekly([{ open: point(0, 0) }])), { status: 'regular', intervals: ['00:00–24:00'] });
  assert.deepEqual(assess({ currentOpeningHours: { periods: [{ open: point(0, 0) }] } }), { status: 'current', intervals: ['00:00–24:00'] });
  const truncated = { currentOpeningHours: { periods: [{ open: { ...dated(14, 0), truncated: true }, close: { ...dated(20, 23, 59), truncated: true } }] } };
  assert.deepEqual(assess(truncated, '2026-10-20'), { status: 'current', intervals: ['00:00–24:00'] });
  for (const periods of [[null], [{}], [{ open: {} }], [{ open: point(4, 9) }],
    [{ open: point(4, 24), close: point(4, 23) }], [{ open: point(4, 9), close: point(4, 9) }],
    [{ open: point(7, 9), close: point(4, 17) }], [{ open: point(4, 9, 60), close: point(4, 17) }]]) {
    assert.equal(assess(weekly(periods)).status, 'unknown');
  }
  assert.equal(assess(weekly([{ open: point(0, 0) }]), '2026-02-30').status, 'unknown');
});


test('malformed current periods cannot be replaced with regular hours',()=>{
 for(const periods of [null,{},'unknown',false]){
  const place={...weekly([{open:point(4,9),close:point(4,18)}]),currentOpeningHours:{periods}};
  assert.equal(assess(place).status,'unknown');
 }
});
