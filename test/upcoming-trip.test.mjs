import test from 'node:test';
import assert from 'node:assert/strict';
import { upcomingTrip } from '../src/domains/itinerary/services/upcoming-trip.mjs';

const trip = (id, ...dates) => ({ id, itineraryPlan: { days: dates.map((date, index) => ({ day: index + 1, date })) } });

test('past trips are ignored, a trip ending today still counts', () => {
  assert.equal(upcomingTrip([trip('past', '2026-11-01', '2026-11-03')], '2026-11-09'), null);
  const endsToday = trip('last', '2026-11-07', '2026-11-08', '2026-11-09');
  assert.deepEqual(upcomingTrip([endsToday], '2026-11-09'), { item: endsToday, daysUntil: -2, dayNumber: 3 });
});

test('an ongoing trip wins over a future one and reports its day number', () => {
  const ongoing = trip('now', '2026-11-08', '2026-11-10');
  const result = upcomingTrip([trip('soon', '2026-11-10'), ongoing], '2026-11-09');
  assert.equal(result.item, ongoing);
  assert.equal(result.dayNumber, 2);
});

test('the nearest future trip is chosen among several', () => {
  const near = trip('near', '2026-11-12', '2026-11-13');
  const result = upcomingTrip([trip('far', '2026-12-01'), near, trip('later', '2026-11-20')], '2026-11-09');
  assert.deepEqual(result, { item: near, daysUntil: 3, dayNumber: null });
  // The first day is D-day and day 1.
  assert.deepEqual(upcomingTrip([near], '2026-11-12'), { item: near, daysUntil: 0, dayNumber: 1 });
});

test('trips with missing or invalid dates are ignored', () => {
  const items = [
    trip('none'), { id: 'noPlan' }, null,
    trip('blank', '', '2026-11-12'), trip('bad', '2026-02-30'), trip('text', 'tomorrow'),
    trip('backwards', '2026-11-12', '2026-11-10'),
  ];
  assert.equal(upcomingTrip(items, '2026-11-09'), null);
  assert.equal(upcomingTrip([trip('ok', '2026-11-10')], 'not-a-date'), null);
});

test('stored dates with a time suffix are read by their calendar day', () => {
  const stamped = trip('stamped', '2026-11-10T00:00:00.000Z');
  assert.equal(upcomingTrip([stamped], '2026-11-09').daysUntil, 1);
});

test('month and year boundaries count calendar days', () => {
  assert.equal(upcomingTrip([trip('jan', '2027-01-02')], '2026-12-30').daysUntil, 3);
  assert.equal(upcomingTrip([trip('mar', '2028-03-01')], '2028-02-28').daysUntil, 2);
  assert.equal(upcomingTrip([trip('newYear', '2026-12-31', '2027-01-01', '2027-01-02')], '2027-01-01').dayNumber, 2);
});
