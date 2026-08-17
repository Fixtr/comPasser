import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeData } from '../src/domains/itinerary/services/itinerary-normalize.mjs';

test('null/undefined input returns null', () => {
  assert.equal(normalizeData(null), null);
  assert.equal(normalizeData(undefined), null);
});

test('new-format data (itineraryPlan.days) is returned as-is', () => {
  const itineraryPlan = { days: [{ day: 1, scheduleItems: [] }] };
  const result = normalizeData({ itineraryPlan, userId: 'abc' });
  assert.equal(result, itineraryPlan);
});

test('legacy format (days at the top level) is wrapped', () => {
  const days = [{ day: 1, scheduleItems: [] }];
  const result = normalizeData({ days });
  assert.deepEqual(result, { days });
});

test('malformed itineraryPlan without a days array falls through to the legacy path', () => {
  const result = normalizeData({ itineraryPlan: { notDays: [] }, days: [{ day: 1 }] });
  assert.deepEqual(result, { days: [{ day: 1 }] });
});

test('missing days anywhere yields an empty days array instead of throwing', () => {
  assert.deepEqual(normalizeData({}), { days: [] });
  assert.deepEqual(normalizeData({ itineraryPlan: {} }), { days: [] });
});
