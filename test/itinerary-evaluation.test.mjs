import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../scripts/evaluate-itinerary.mjs';
import { cases } from '../scripts/itinerary-evaluation-cases.mjs';
import { findPlannerRequestIssue } from '../functions/planner-request-validation.mjs';
import { fitMeasuredSchedule } from '../src/domains/itinerary/services/itinerary-end-fit.mjs';

const request = { dailyData: [{ day: 1, date: '2026-10-06', startTime: '09:00', endTime: '18:00',
  startLocation: '서울역', endLocation: '서울역', anchors: [{ name: '약속', time: '12:00', endTime: '13:00', location: '박물관' }] }] };
const items = () => [
  { type: 'departure', time: '09:00', location: '서울역' },
  { type: 'dining', time: '11:00', endTime: '11:30', placeStatus: 'pending',
    placeIntent: { purpose: '점심', category: 'restaurant', nearLocation: '서울역' } },
  { type: 'AnchorSchedule', title: '약속', time: '12:00', endTime: '13:00', location: '박물관' },
  { type: 'arrival', time: '18:00', location: '서울역' }
];
const plan = scheduleItems => [{ day: 1, date: '2026-10-06', scheduleItems }];

test('representative cases cover valid one/four-day, short, airport and multiple-anchor requests', () => {
  assert.equal(cases.length, 6);
  for (const c of cases) assert.equal(findPlannerRequestIssue(c.request), null, c.id);
  assert.ok(cases.some(c => c.request.dailyData.length === 4));
});

test('missing map evidence stays unknown, pending is not failed, short restaurant stay is caught', () => {
  const before = plan(items());
  const report = evaluate(request, before);
  assert.equal(report.days[0].anchorArrival, 'unknown');
  assert.equal(report.days[0].endArrival, 'unknown');
  assert.equal(report.days[0].places.pending, 1);
  assert.equal(report.days[0].places.unresolved, 0);
  assert.equal(report.days[0].shortStays.length, 1);
  assert.deepEqual(before, plan(items()));
});

test('measured adjacent routes catch anchor lateness and end overflow; missing routes cannot pass', () => {
  const routes = [10, 45, 360].map((durationMinutes, fromIndex) => ({ fromIndex, toIndex: fromIndex + 1, durationMinutes }));
  const day = evaluate(request, plan(items()), { source: 'google_maps', days: [{ day: 1, transitRoutes: routes }] }).days[0];
  assert.equal(day.anchorArrival, 'fail');
  assert.equal(day.endArrival, 'fail');
  assert.equal(day.endOverflowMinutes, 60);
  const partial = evaluate(request, plan(items()), { source: 'google_maps', days: [{ day: 1, transitRoutes: routes.slice(0, 1) }] }).days[0];
  assert.equal(partial.anchorArrival, 'unknown');
  assert.equal(partial.endArrival, 'unknown');
});

test('missing days/anchors and malformed times are failures, not a zero-failure success', () => {
  assert.equal(evaluate(request, []).structure, 'fail');
  for (const malformed of [undefined, null, {}, 'bad']) assert.equal(evaluate(request, malformed).structure, 'fail');
  const broken = items().filter(item => item.type !== 'AnchorSchedule');
  broken[1].time = '25:90';
  const day = evaluate(request, plan(broken)).days[0];
  assert.equal(day.anchorContract, 'fail');
  assert.ok(day.invalidTimes.length);
});

test('meal and cafe minimums differ; changed anchor locations fail the contract', () => {
  const altered = items();
  altered[1].placeIntent.category = 'cafe';
  altered[2].location = '다른 박물관';
  const report = evaluate(request, plan(altered)).days[0];
  assert.equal(report.shortStays.length, 0);
  assert.equal(report.anchorContract, 'fail');
});

test('automatic fitting drops an impossible generated meal and requires fresh route evidence', () => {
  const input = [{ type: 'departure', time: '09:00' },
    { type: 'dining', time: '09:00', endTime: '10:00', placeIntent: { purpose: '식사', category: 'restaurant', nearLocation: '서울역' } },
    { type: 'arrival', time: '10:00' }];
  const routes = [0, 1].map(fromIndex => ({ fromIndex, toIndex: fromIndex + 1, durationMinutes: 15 }));
  const fitted = fitMeasuredSchedule(input, routes, '10:00', '09:00');
  const constraint = { dailyData: [{ ...request.dailyData[0], endTime: '10:00', anchors: [] }] };
  const day = evaluate(constraint, plan(fitted.items)).days[0];
  assert.equal(day.endArrival, 'unknown');
  assert.equal(day.shortStays.length, 0);
  assert.equal(fitted.adjusted, true);
  assert.deepEqual(fitted.items.map(item => item.type), ['departure', 'arrival']);
});

test('zero-minute real routes count; synthetic evidence and negative/duplicate routes do not establish a pass', () => {
  const valid = items(); valid[1].time = '10:00'; valid[1].endTime = '11:00';
  const routes = [0, 1, 2].map(fromIndex => ({ fromIndex, toIndex: fromIndex + 1, durationMinutes: 0 }));
  const evidence = { source: 'google_maps', days: [{ day: 1, transitRoutes: routes }] };
  assert.equal(evaluate(request, plan(valid), evidence).days[0].endArrival, 'pass');
  assert.equal(evaluate(request, plan(valid), { ...evidence, source: 'synthetic' }).days[0].endArrival, 'unknown');
  evidence.days[0].transitRoutes = [routes[0], routes[0], { ...routes[2], durationMinutes: -1 }];
  assert.equal(evaluate(request, plan(valid), evidence).days[0].endArrival, 'unknown');
});
