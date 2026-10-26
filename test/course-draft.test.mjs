import test from 'node:test';
import assert from 'node:assert/strict';
import { addCourseToDraft, cityDestination, setDraftDestination } from '../src/domains/planner/services/course-draft.mjs';
import { curatedRoute } from '../src/domains/itinerary/services/public-route.mjs';
import { destinationById } from '../src/domains/planner/services/travel-destinations.mjs';

const seoul = { id: 'seoul', country: 'KOR', name: 'Seoul, South Korea' };
const tokyo = { id: 'tokyo', country: 'JPN', name: 'Tokyo, Japan' };
const forest = { day: 1, name: '서울숲', location: '서울숲', flexible: true, time: '', endTime: '', stayMinutes: 60 };
const seoulDraft = () => ({ country: 'KOR', destination: seoul, destinationStage: 'places', anchorSchedules: [forest],
  stays: [{ location: 'Seoul hotel', checkin: '2026-10-01', checkout: '2026-10-02' }], dailyLocations: [{ day: 1, startLocation: 'A', endLocation: 'B' }] });

test('a draft plans one city: another city drops the old visits and stays, the same city keeps them', () => {
  assert.deepEqual(cityDestination(destinationById('tokyo')), tokyo);
  const moved = setDraftDestination(seoulDraft(), tokyo);
  assert.deepEqual([moved.country, moved.destination, moved.destinationStage], ['JPN', tokyo, 'places']);
  assert.deepEqual([moved.anchorSchedules, moved.stays, moved.dailyLocations], [[], [], null]);
  assert.deepEqual(setDraftDestination(seoulDraft(), seoul), seoulDraft());
  // A draft with no city yet (new or legacy) has nothing to mix with, so it keeps its visits.
  assert.deepEqual(setDraftDestination({ anchorSchedules: [forest] }, tokyo).anchorSchedules, [forest]);
});

test('copying a course for another city replaces that city’s visits; Korean courses carry their city', () => {
  const korean = curatedRoute('curated-seoul');
  assert.deepEqual(korean.destination, seoul);
  assert.deepEqual(addCourseToDraft({ anchorSchedules: [] }, korean).destination, seoul);
  const tokyoDraft = addCourseToDraft({ anchorSchedules: [] }, curatedRoute('curated-tokyo'));
  const switched = addCourseToDraft(tokyoDraft, korean);
  assert.deepEqual([switched.country, switched.destination], ['KOR', seoul]);
  assert.deepEqual(switched.anchorSchedules.map(stop => stop.name), ['경복궁', '서촌 한옥마을']);
  // The same city is the same trip: new places are appended once.
  assert.deepEqual(addCourseToDraft(switched, curatedRoute('curated-seoul-2')).anchorSchedules.map(stop => stop.name),
    ['경복궁', '서촌 한옥마을', '북촌한옥마을']);
});
