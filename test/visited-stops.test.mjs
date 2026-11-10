import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitedStops, VISITED_STOPS_KEY, stopKeys, isVisitableStop, pickNextStop } from '../src/domains/itinerary/services/visited-stops.mjs';
import { recommendationFields } from '../src/domains/map/services/recommendation-place.mjs';

const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const day = () => ({ date: '2026-09-17', scheduleItems: [
  { type: 'departure', time: '09:00', title: '호텔' },
  { type: 'cafe', time: '10:00', title: '카페' },
  { type: 'attraction', time: '11:00', title: '궁', selectedPlace: { placeId: 'p1' } },
  { type: 'cafe', time: '15:00', title: '카페' },
  { type: 'arrival', time: '18:00', title: '호텔' },
] });

test('toggle marks and unmarks a stop for one trip only', () => {
  const storage = memory(), store = createVisitedStops({ getStorage: () => storage });
  store.setUser('owner');
  const [, cafe] = stopKeys(day());
  assert.equal(store.toggle('private:a', cafe, 'owner'), true);
  assert.deepEqual([...store.visited('private:a', 'owner')], [cafe]);
  assert.equal(store.visited('shared:a', 'owner').size, 0);
  assert.equal(store.toggle('private:a', cafe, 'owner'), false);
  assert.equal(store.visited('private:a', 'owner').size, 0);
});

test('corrupt or blocked storage means nothing is marked', () => {
  const storage = memory();
  storage.setItem(VISITED_STOPS_KEY, '{not json');
  const store = createVisitedStops({ getStorage: () => storage });
  store.setUser('owner');
  assert.equal(store.visited('private:a', 'owner').size, 0);
  assert.equal(store.toggle('private:a', 'k', 'owner'), true);
  assert.equal(store.visited('private:a', 'owner').has('k'), true);
  const blocked = createVisitedStops({ getStorage: () => ({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }) });
  blocked.setUser('owner');
  assert.equal(blocked.visited('private:a', 'owner').size, 0);
  assert.equal(blocked.toggle('private:a', 'k', 'owner'), false);
  const unavailable = createVisitedStops();
  unavailable.setUser('owner');
  assert.equal(unavailable.toggle('private:a', 'k', 'owner'), false);
});

test('keeps only the 50 most recently changed trips', () => {
  const storage = memory();
  let clock = 0;
  const store = createVisitedStops({ getStorage: () => storage, now: () => ++clock });
  store.setUser('owner');
  for (let i = 0; i < 51; i++) store.toggle(`private:t${i}`, 'k', 'owner');
  assert.equal(store.visited('private:t0', 'owner').size, 0);
  assert.equal(store.visited('private:t1', 'owner').size, 1);
  assert.equal(store.visited('private:t50', 'owner').size, 1);
  assert.equal(Object.keys(JSON.parse(storage.getItem(VISITED_STOPS_KEY)).trips).length, 50);
});

test('legacy marks are cleared; reload restores only the current account or guest scope', () => {
  const storage = memory();
  const open = () => createVisitedStops({ getStorage: () => storage });
  storage.setItem(VISITED_STOPS_KEY, JSON.stringify({ version: 1, trips: { 'private:a': { stops: ['legacy'] } } }));
  const store = open();
  store.setUser('first');
  assert.equal(storage.getItem(VISITED_STOPS_KEY), null);
  assert.equal(store.toggle('shared:a', 'first mark', 'first'), true);

  const reloaded = open();
  assert.equal(reloaded.visited('shared:a', 'first').size, 0);
  reloaded.setUser('first');
  assert.deepEqual([...reloaded.visited('shared:a', 'first')], ['first mark']);
  reloaded.setUser(null);
  assert.equal(storage.getItem(VISITED_STOPS_KEY), null);
  assert.equal(reloaded.visited('shared:a', null).size, 0);
  assert.equal(reloaded.toggle('shared:a', 'late click', 'first'), false);
  assert.equal(reloaded.toggle('shared:a', 'guest mark', null), true);

  const guestReload = open();
  guestReload.setUser(null);
  assert.deepEqual([...guestReload.visited('shared:a', null)], ['guest mark']);
  guestReload.setUser('second');
  assert.equal(storage.getItem(VISITED_STOPS_KEY), null);
  assert.equal(guestReload.visited('shared:a', 'second').size, 0);
});

test('stop keys survive a fresh copy and time shifts, and tell repeated titles apart', () => {
  const keys = stopKeys(day());
  const copy = structuredClone(day());
  copy.scheduleItems[1].time = '10:20';
  assert.deepEqual(stopKeys(copy), keys);
  assert.equal(new Set(keys).size, keys.length);
  assert.notEqual(keys[1], keys[3]);
});

test('only titled stops between the endpoints are visitable', () => {
  assert.deepEqual(day().scheduleItems.map(isVisitableStop), [false, true, true, true, false]);
  assert.equal(isVisitableStop({ type: 'cafe', title: '' }), false);
});

test('next stop skips visited stops', () => {
  const plan = day(), keys = stopKeys(plan);
  assert.equal(pickNextStop(plan, { visited: new Set() }).time, '10:00');
  assert.equal(pickNextStop(plan, { visited: new Set([keys[1]]) }).time, '11:00');
  assert.equal(pickNextStop(plan, { visited: new Set([keys[1], keys[2]]), currentTime: '09:30' }).time, '15:00');
  assert.equal(pickNextStop(plan, { visited: new Set([keys[1], keys[2], keys[3]]), currentTime: '09:30' }).type, 'arrival');
  assert.equal(pickNextStop(plan, { visited: new Set(), currentTime: '19:00' }), undefined);
  // Unverified recommendations and unset stays are still skipped as before.
  assert.equal(pickNextStop({ date: 'd', scheduleItems: [{ type: 'cafe', title: 'x', placeIntent: {}, placeStatus: 'pending' }, { type: 'arrival', title: 'y', stayUnsetLabel: 'z' }] }, { visited: new Set() }), undefined);
});

test('a recommendation keeps its key when a place lookup renames it', () => {
  const placeIntent = { purpose: '현지 식당', category: 'restaurant', nearLocation: '' };
  const plan = { date: '2026-09-13', scheduleItems: [
    { type: 'dining', time: '13:00', title: '실제 식당', placeIntent, placeStatus: 'verified' },
    { type: 'cafe', time: '15:00', title: 'C' },
  ] };
  const [key] = stopKeys(plan);
  const renamed = structuredClone(plan), item = renamed.scheduleItems[0];
  Object.assign(item, recommendationFields(item, null));
  assert.equal(item.title, '현지 식당');
  assert.equal(stopKeys(renamed)[0], key);
  item.title = '다른 식당'; item.placeStatus = 'verified';
  assert.equal(stopKeys(renamed)[0], key);
  assert.equal(pickNextStop(renamed, { visited: new Set([key]) }).title, 'C');
});
