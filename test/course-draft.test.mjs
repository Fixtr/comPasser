import test from 'node:test';
import assert from 'node:assert/strict';
import { addCourseToDraft, cityDestination, droppedByDestination, setDraftDestination } from '../src/domains/planner/services/course-draft.mjs';
import { curatedRoute } from '../src/domains/itinerary/services/public-route.mjs';
import { destinationById } from '../src/domains/planner/services/travel-destinations.mjs';

const seoul = { id: 'seoul', country: 'KOR', name: 'Seoul, South Korea' };
const tokyo = { id: 'tokyo', country: 'JPN', name: 'Tokyo, Japan' };
const forest = { day: 1, name: '서울숲', location: '서울숲', flexible: true, time: '', endTime: '', stayMinutes: 60 };
const seoulDraft = () => ({ country: 'KOR', destination: seoul, destinationStage: 'places', anchorSchedules: [forest],
  stays: [{ location: 'Seoul hotel', checkin: '2026-10-01', checkout: '2026-10-02' }], dailyLocations: [{ day: 1, startLocation: 'A', endLocation: 'B' }],
  endLocation: 'Seoul end' });

test('a draft plans one city: another city drops the old visits and stays, the same city keeps them', () => {
  assert.deepEqual(cityDestination(destinationById('tokyo')), tokyo);
  const moved = setDraftDestination(seoulDraft(), tokyo);
  assert.deepEqual([moved.country, moved.destination, moved.destinationStage], ['JPN', tokyo, 'places']);
  assert.deepEqual([moved.anchorSchedules, moved.stays, moved.dailyLocations], [[], [], null]);
  // The final destination belonged to the old city too.
  assert.equal(moved.endLocation, '');
  assert.deepEqual(setDraftDestination(seoulDraft(), seoul), seoulDraft());
  // A draft with no city yet (new or legacy) has nothing to mix with, so it keeps its visits.
  assert.deepEqual(setDraftDestination({ anchorSchedules: [forest] }, tokyo).anchorSchedules, [forest]);
});

test('a pick for another city names what it would drop; nothing to drop means nothing to ask', () => {
  const dated = () => ({ ...seoulDraft(), date: ['2026-10-01', '2026-10-02'] });
  // Everything the saved draft loses, and only that: a new cleared field shows up here and needs a label (homeCityDrop_*).
  assert.deepEqual(droppedByDestination(dated(), tokyo), ['stays', 'endLocation', 'dailyLocations', 'overnightLocations', 'anchorSchedules']);
  assert.deepEqual(droppedByDestination({ ...dated(), stays: [], dailyLocations: null }, tokyo), ['endLocation', 'anchorSchedules']);
  assert.deepEqual(droppedByDestination(dated(), seoul), []);
  assert.deepEqual(droppedByDestination({ anchorSchedules: [forest] }, tokyo), []);
  // Dates, start and preferences survive the move, and rows that hold only dates, times or day numbers are not content.
  assert.deepEqual(droppedByDestination({ destination: seoul, country: 'KOR', date: ['2026-10-01', '2026-10-02'], startLocation: 'Seoul Station', theme: 'food',
    anchorSchedules: [{ day: 1, name: '', location: '', time: '15:00', endTime: '16:00' }], stays: [{ location: '', checkin: '2026-10-01', checkout: '2026-10-02' }],
    dailyLocations: [{ day: 1, startLocation: '', endLocation: '' }], endLocation: '' }, tokyo), []);
  // A picked place is stored as an object, not a string.
  assert.deepEqual(droppedByDestination({ destination: seoul, anchorSchedules: [], endLocation: { placeId: 'x', displayName: 'Seoul Station', formattedAddress: 'Seoul', lat: 37.55, lng: 126.97 } }, tokyo), ['endLocation']);
  // A request saved without stays keeps its lodging in overnightLocations; saving the pick recomputes that from the emptied stays.
  assert.deepEqual(droppedByDestination({ destination: seoul, date: ['2026-10-01', '2026-10-02', '2026-10-03'], overnightLocations: ['Hotel X', 'Hotel Y'] }, tokyo), ['overnightLocations']);
});

test('copying a course for another city replaces that city’s visits; Korean courses carry their city', () => {
  const korean = curatedRoute('curated-seoul');
  assert.deepEqual(korean.destination, seoul);
  assert.deepEqual(addCourseToDraft({ anchorSchedules: [] }, korean).destination, seoul);
  // A course is one day's route: its stops share a day, and the next course takes the next day.
  const two = addCourseToDraft(addCourseToDraft({ anchorSchedules: [] }, korean), curatedRoute('curated-seoul-2'));
  assert.deepEqual(two.anchorSchedules.map(stop => stop.day), [1, 1, 2]);
  const tokyoDraft = addCourseToDraft({ anchorSchedules: [] }, curatedRoute('curated-tokyo'));
  const switched = addCourseToDraft(tokyoDraft, korean);
  assert.deepEqual([switched.country, switched.destination], ['KOR', seoul]);
  assert.deepEqual(switched.anchorSchedules.map(stop => stop.name), ['경복궁', '서촌 한옥마을']);
  // The same city is the same trip: new places are appended once.
  assert.deepEqual(addCourseToDraft(switched, curatedRoute('curated-seoul-2')).anchorSchedules.map(stop => stop.name),
    ['경복궁', '서촌 한옥마을', '북촌한옥마을']);
  // A place added from the English page and again from the Korean list is still one place.
  const english = addCourseToDraft({ anchorSchedules: [] }, korean, 'en');
  assert.deepEqual(addCourseToDraft(english, curatedRoute('curated-seoul-2')).anchorSchedules.map(stop => stop.name),
    ['Gyeongbokgung Palace', 'Seochon Hanok Village', '북촌한옥마을']);
});
