import test from 'node:test';
import assert from 'node:assert/strict';
import { assignStopIds, legacyStopKeys, stopKeys } from '../src/domains/itinerary/services/visited-stops.mjs';
import { legacyStopNoteKeys, migrateStopNotes, stopNoteKeys } from '../src/domains/itinerary/services/stop-notes.mjs';
import { editVisitTime, moveScheduleItem, removeScheduleItem, replaceSchedulePlace, insertScheduleItem } from '../src/domains/itinerary/services/itinerary-edit.mjs';
import { replanRemaining } from '../src/domains/itinerary/services/itinerary-replan.mjs';
import { shiftItineraryDates } from '../src/domains/itinerary/services/itinerary-duplicate.mjs';
import { createItineraryState } from '../src/domains/itinerary/services/itinerary-state.mjs';

const place = id => ({ placeId: id, displayName: id, formattedAddress: `${id} address`, lat: 37.5, lng: 127 });
const plan = () => ({ days: [{ date: '2026-11-10', scheduleItems: [
  { type: 'departure', title: 'Hotel', time: '09:00' },
  { type: 'cafe', title: 'Cafe', time: '10:00', endTime: '11:00', verifiedPlace: { placeId: 'cafe' } },
  { type: 'museum', title: 'Museum', time: '11:30', endTime: '12:30' },
  { type: 'cafe', title: 'Cafe', time: '13:00', endTime: '14:00', verifiedPlace: { placeId: 'cafe' } },
  { type: 'arrival', title: 'Station', time: '18:00' },
] }] });
const ids = trip => stopKeys(trip.days[0]);

test('saved plans without ids get their old visit-mark keys, deterministically', () => {
  const legacy = plan(), oldKeys = legacyStopKeys(legacy.days[0]);
  assert.equal(assignStopIds(legacy, { legacy: true }), true);
  assert.deepEqual(ids(legacy), [undefined, oldKeys[1], oldKeys[2], oldKeys[3], undefined]);
  const again = plan();
  assignStopIds(again, { legacy: true });
  assert.deepEqual(ids(again), ids(legacy));
  assert.equal(assignStopIds(legacy, { legacy: true }), false);
});

test('new stops get unique random ids and kept ids never change', () => {
  const trip = plan();
  assignStopIds(trip);
  const [, a, b, c] = ids(trip);
  assert.equal(new Set([a, b, c]).size, 3);
  assert.notEqual(a, legacyStopKeys(trip.days[0])[1]);
  trip.days[0].scheduleItems[3].stopId = a; // a duplicated id is reassigned on the later stop only
  trip.days[0].scheduleItems[2].stopId = 7;
  assignStopIds(trip, { legacy: true });
  const [, a2, b2, c2] = ids(trip);
  assert.equal(a2, a);
  assert.equal(typeof b2, 'string');
  assert.equal(new Set([a2, b2, c2]).size, 3);
});

test('ids survive time edits, reorder, delete, insert, replan and place replacement', async () => {
  const trip = plan();
  assignStopIds(trip);
  const items = trip.days[0].scheduleItems, [, a, b, c] = ids(trip);
  assert.deepEqual(stopKeys({ scheduleItems: editVisitTime(items, 2, '11:40', '12:40').items }).slice(1, 4), [a, b, c]);
  assert.deepEqual(stopKeys({ scheduleItems: moveScheduleItem(items, 1, 1).items }).slice(1, 4), [b, a, c]);
  assert.deepEqual(stopKeys({ scheduleItems: removeScheduleItem(items, 2).items }).slice(1, 3), [a, c]);
  const inserted = insertScheduleItem(items, 2, { selectedPlace: place('park') }).items;
  assert.deepEqual(stopKeys({ scheduleItems: inserted }).slice(1, 5), [a, undefined, b, c]);
  // Keeping the id keeps the slot's visit mark and private note when only the venue changes.
  const replaced = replaceSchedulePlace(items, 2, place('gallery')).items;
  assert.equal(replaced[2].title, 'gallery');
  assert.equal(replaced[2].stopId, b);
  const replanned = await replanRemaining({ day: trip.days[0], origin: 1, startTime: '11:10', endTime: '15:00',
    locations: items.map(item => item.title), hours: [], travelMinutes: async () => 10 });
  assert.equal(replanned.status, 'ready');
  assert.deepEqual(stopKeys({ scheduleItems: replanned.items }).slice(1, 4), [a, b, c]);
});

test('state fills ids on open and restore, keeps them on edits, and gives new stops fresh ones', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const state = createItineraryState({ getStorage: () => storage });
  state.setUser('owner');
  const legacy = plan(), oldKeys = legacyStopKeys(legacy.days[0]);
  state.open(legacy, { kind: 'private', id: 'trip' });
  assert.deepEqual(ids(state.current.plan).slice(1, 4), oldKeys.slice(1, 4));
  const items = insertScheduleItem(state.current.plan.days[0].scheduleItems, 2, { selectedPlace: place('park') }).items;
  state.editDayItems(0, items);
  const added = ids(state.current.plan)[2];
  assert.ok(added && !oldKeys.includes(added));
  assert.deepEqual(ids(state.snapshot().plan), ids(state.current.plan));

  const restored = createItineraryState({ getStorage: () => storage });
  restored.setUser('owner');
  restored.activateDocument('trip', { userId: 'owner' });
  assert.deepEqual(ids(restored.current.plan), ids(state.current.plan));
});

test('a duplicated trip gets new ids for every stop', () => {
  const trip = plan();
  assignStopIds(trip);
  const copy = shiftItineraryDates(trip, '2026-12-01', '2026-11-11');
  const before = ids(trip).filter(Boolean), after = ids(copy).filter(Boolean);
  assert.equal(after.length, before.length);
  assert.ok(after.every(id => !before.includes(id)));
});

test('notes key by stop id, so the same place twice a day holds two notes', () => {
  const trip = plan();
  assignStopIds(trip);
  const keys = stopNoteKeys(trip.days[0]);
  assert.deepEqual(keys, [null, ...ids(trip).slice(1, 4), null]);
  assert.notEqual(keys[1], keys[3]);
});

test('notes stored under the old place keys move to the stop ids', () => {
  const stored = plan();
  stored.days[0].scheduleItems[3].verifiedPlace = { placeId: 'other-cafe' };
  const [, cafe, museum, other] = legacyStopNoteKeys(stored.days[0]);
  const trip = { itineraryPlan: stored, stopNotes: { [cafe]: { text: 'cafe', url: '' }, [other]: { text: 'other', url: '' }, unknown: { text: 'kept', url: '' } } };
  const opened = structuredClone(stored);
  assignStopIds(opened, { legacy: true });
  const [, a, b, c] = ids(opened);
  assert.ok(museum);
  assert.deepEqual(migrateStopNotes(trip), { [a]: { text: 'cafe', url: '' }, [c]: { text: 'other', url: '' }, unknown: { text: 'kept', url: '' } });
  assert.equal(stored.days[0].scheduleItems[1].stopId, undefined, 'the stored plan is not mutated');
  // A note already written under the id wins over a leftover old one.
  trip.stopNotes[b] = { text: 'new', url: '' };
  trip.stopNotes[museum] = { text: 'old', url: '' };
  assert.deepEqual(migrateStopNotes(trip)[b], { text: 'new', url: '' });
  assert.equal(Object.hasOwn(migrateStopNotes(trip), museum), false);
});
