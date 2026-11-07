import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineTrips } from '../src/domains/itinerary/services/offline-trips.mjs';

const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const plan = { days: [{ day: 1, scheduleItems: [{ title: 'A', time: '10:00' }] }] };
const trip = (id, itineraryPlan = plan) => ({ id, userId: 'owner', title: id, itineraryPlan });
const setup = () => {
  const storage = memory(), cache = createOfflineTrips({ getStorage: () => storage, now: () => 1 });
  cache.setUser('owner');
  cache.save('owner', trip('a'));
  cache.save('owner', trip('b'));
  return cache;
};
const ids = cache => cache.list('owner').map(item => item.id).sort();

test('remove drops only the named trip and only for the signed-in owner', () => {
  const cache = setup();
  cache.remove('other', 'a');
  assert.deepEqual(ids(cache), ['a', 'b']);
  cache.remove('owner', 'a');
  assert.deepEqual(ids(cache), ['b']);
});

// null mirrors the itinerary-deleted event, where id: null means every private trip.
test('remove with a null id drops every trip, a missing id drops none', () => {
  const cache = setup();
  cache.remove('owner', undefined);
  assert.deepEqual(ids(cache), ['a', 'b']);
  cache.remove('owner', null);
  assert.deepEqual(ids(cache), []);
});

test('refresh updates only trips already kept offline and keeps the old copy when the server item is invalid', () => {
  const cache = setup();
  const edited = structuredClone(plan); edited.days[0].scheduleItems[0].title = 'Edited';
  cache.refresh('owner', [{ ...trip('a'), itineraryPlan: edited }, trip('c')]);
  assert.equal(cache.get('owner', 'a').itineraryPlan.days[0].scheduleItems[0].title, 'Edited');
  assert.equal(cache.get('owner', 'c'), null);
  assert.throws(() => cache.refresh('owner', [trip('b', { days: [] })]));
  assert.deepEqual(ids(cache), ['a', 'b']);
  assert.equal(cache.get('owner', 'b').itineraryPlan.days.length, 1);
});
