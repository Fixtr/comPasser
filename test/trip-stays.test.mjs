import test from 'node:test';
import assert from 'node:assert/strict';
import { dateRange } from '../functions/travel-region.mjs';
import { moveTripDates, nightlyStays, stayIssue } from '../src/domains/planner/services/trip-stays.mjs';
import { toPlannerDraft } from '../src/domains/planner/services/planner-draft.mjs';

const hotel = id => ({ placeId: id, displayName: id, formattedAddress: '서울', lat: 37.55, lng: 126.98 });
const stays = [
  { location: hotel('hotel-a'), checkin: '2026-10-07', checkout: '2026-10-08' },
  { location: hotel('hotel-b'), checkin: '2026-10-08', checkout: '2026-10-09' },
  { location: hotel('hotel-c'), checkin: '2026-10-09', checkout: '2026-10-10' },
];

test('shortening a trip keeps out-of-trip stays flagged and still applies the stay inside it', () => {
  const short = moveTripDates({ date: dateRange('2026-10-07', 4), stays }, dateRange('2026-10-07', 2));
  assert.deepEqual(short.stays, stays, 'stays outside the trip are kept so lengthening it again restores them');
  assert.equal(stayIssue(short.stays, short.date), 1);
  assert.deepEqual(nightlyStays(short.stays, short.date).map(place => place.placeId), ['hotel-a']);
  assert.deepEqual(toPlannerDraft(short).overnightLocations.map(place => place.placeId), ['hotel-a']);
  const long = moveTripDates(short, dateRange('2026-10-07', 4));
  assert.deepEqual(nightlyStays(long.stays, long.date).map(place => place.placeId), ['hotel-a', 'hotel-b', 'hotel-c']);
});

test('a stay partly outside the trip, overlapping or reversed applies to no night', () => {
  const dates = dateRange('2026-10-07', 3);
  const partly = [stays[0], { ...stays[1], checkout: '2026-10-10' }];
  assert.equal(stayIssue(partly, dates), 1);
  assert.deepEqual(nightlyStays(partly, dates).map(place => place.placeId ?? place), ['hotel-a', '']);
  const overlap = [{ ...stays[0], checkout: '2026-10-09' }, stays[1]];
  assert.equal(stayIssue(overlap, dates), 0);
  assert.deepEqual(nightlyStays(overlap, dates), ['', '']);
  assert.deepEqual(nightlyStays([{ ...stays[0], checkout: '2026-10-07' }, stays[1]], dates).map(place => place.placeId ?? place), ['', 'hotel-b']);
});
