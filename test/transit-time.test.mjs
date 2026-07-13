import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTransitDepartureTime } from '../src/domains/map/services/transit-time.mjs';

const NOW = new Date('2026-07-14T12:00:00');

test('a future itinerary time is used as-is', () => {
  const departure = buildTransitDepartureTime('2026-07-20', '09:44', NOW);
  assert.deepEqual(departure, new Date('2026-07-20T09:44:00'));
});

test('a past itinerary time is shifted forward preserving weekday and clock time', () => {
  // 2026-07-07 is a Tuesday, one week and two hours before NOW
  const departure = buildTransitDepartureTime('2026-07-07', '09:44', NOW);
  assert.deepEqual(departure, new Date('2026-07-21T09:44:00'));
  assert.equal(departure.getDay(), new Date('2026-07-07T09:44:00').getDay());
  assert.ok(departure >= NOW);
});

test('earlier today is shifted to next week, not dropped', () => {
  const departure = buildTransitDepartureTime('2026-07-14', '09:00', NOW);
  assert.deepEqual(departure, new Date('2026-07-21T09:00:00'));
});

test('unusable inputs return null', () => {
  assert.equal(buildTransitDepartureTime('', '09:44', NOW), null);
  assert.equal(buildTransitDepartureTime('2026-07-14', '', NOW), null);
  assert.equal(buildTransitDepartureTime('14/07/2026', '09:44', NOW), null);
  assert.equal(buildTransitDepartureTime('2026-07-14', '9시', NOW), null);
});
