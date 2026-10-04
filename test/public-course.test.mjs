import test from 'node:test';
import assert from 'node:assert/strict';
import { publishableStops } from '../src/domains/itinerary/services/public-course.mjs';

test('public preview excludes private endpoints, appointments and unresolved AI places', () => {
  const plan = { days: [{ date: '2026-11-01', scheduleItems: [
    { type: 'departure', title: 'Hotel', location: 'Private address' },
    { type: 'AnchorSchedule', title: 'Medical appointment', location: 'Private clinic' },
    { type: 'attraction', title: 'Museum', location: 'Seoul Museum', duration: 90 },
    { type: 'dining', title: 'Lunch', location: 'Seoul cafe', duration: 60 },
    { type: 'leisure', title: 'Maybe', location: 'Hotel', placeIntent: 'walk', placeStatus: 'unresolved' },
    { type: 'arrival', title: 'Hotel', location: 'Private address' },
  ] }] };
  assert.deepEqual(publishableStops(plan), [
    { name: 'Museum', location: 'Seoul Museum', stayMinutes: 90 },
    { name: 'Lunch', location: 'Seoul cafe', stayMinutes: 60 },
  ]);
});
