import test from 'node:test';
import assert from 'node:assert/strict';
import { publishableStops } from '../src/domains/itinerary/services/public-course.mjs';
import { filterCourses, validateCourseReview } from '../src/domains/itinerary/services/course-community.mjs';

test('course discovery combines address search, city and visit-duration filters', () => {
  const routes = [
    { title: 'Afternoon', stops: [{ name: 'Museum', location: '서울 Seoul', stayMinutes: 120 }] },
    { title: 'Beach', stops: [{ name: '海辺', location: 'Busan', stayMinutes: 240 }] },
  ];
  assert.deepEqual(filterCourses(routes, { search: 'MUSEUM seoul', city: 'seoul', duration: 'short' }), [routes[0]]);
  assert.deepEqual(filterCourses(routes, { city: 'busan', duration: 'half' }), [routes[1]]);
  assert.deepEqual(filterCourses(routes, { search: 'Museum', city: 'busan' }), []);
});

test('travel reviews reject future/impossible dates and invalid actual metrics', () => {
  const input = { visitDate: '2026-10-04', comment: ' Easy to walk ', walkingKm: '2.5', spentWon: '', visitMinutes: '90' };
  assert.deepEqual(validateCourseReview(input, '2026-10-05'), { visitDate: '2026-10-04', comment: 'Easy to walk', walkingKm: 2.5, spentWon: null, visitMinutes: 90 });
  for (const patch of [{ visitDate: '2026-02-30' }, { visitDate: '2026-10-06' }, { comment: ' ' }, { walkingKm: -1 }, { spentWon: 0.5 }, { visitMinutes: 1441 }]) {
    assert.throws(() => validateCourseReview({ ...input, ...patch }, '2026-10-05'));
  }
});

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
