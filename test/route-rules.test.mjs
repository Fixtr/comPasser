import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { MIN_STAY } from '../functions/route-rules/absolute.mjs';
import { MEAL_TIMES, ACTIVITY_TIMES } from '../functions/route-rules/regions/default.mjs';
import { minimumStayMinutes, minutesOf } from '../src/domains/itinerary/services/itinerary-schedule-adjust.mjs';
const { buildPrompt, sanitizePlannerRequest } = createRequire(import.meta.url)('../functions/itinerary-prompt.js');

test('server prompt and app read the same route rules', () => {
  const prompt = buildPrompt(sanitizePlannerRequest({ date: ['2026-10-06'], companion: 'family_kids' }), 'en');
  assert.ok(prompt.includes(`Prefer lunch at ${MEAL_TIMES.lunch.from}-${MEAL_TIMES.lunch.to} and dinner at ${MEAL_TIMES.dinner.from}-${MEAL_TIMES.dinner.to}`));
  assert.ok(prompt.includes(`Never start lunch before ${MEAL_TIMES.earliestLunch}.`));
  assert.ok(prompt.includes(`after ${ACTIVITY_TIMES.lateNight}`));
  assert.equal(minimumStayMinutes({ type: 'dining', placeIntent: { category: 'restaurant' } }), MIN_STAY.meal);
  assert.equal(minimumStayMinutes({ type: 'attraction', placeIntent: { category: 'park' } }), MIN_STAY.visit);
});

test('default meal times are valid and in order', () => {
  const order = [MEAL_TIMES.earliestLunch, MEAL_TIMES.lunchWindow.from, MEAL_TIMES.lunch.from, MEAL_TIMES.lunch.to,
    MEAL_TIMES.lunchWindow.to, MEAL_TIMES.dinnerFrom, MEAL_TIMES.airportDinnerFloor, MEAL_TIMES.dinnerFloor,
    MEAL_TIMES.dinner.from, MEAL_TIMES.dinner.to].map(minutesOf);
  assert.ok(order.every(value => value !== null));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});
