import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitedStops, VISITED_STOPS_KEY, stopKeys, isVisitableStop, pickNextStop } from '../src/domains/itinerary/services/visited-stops.mjs';

const memory = () => { const values = new Map(); return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };
const day = () => ({ date: '2026-09-17', scheduleItems: [
  { type: 'departure', time: '09:00', title: '호텔' },
  { type: 'cafe', time: '10:00', title: '카페' },
  { type: 'attraction', time: '11:00', title: '궁', selectedPlace: { placeId: 'p1' } },
  { type: 'cafe', time: '15:00', title: '카페' },
  { type: 'arrival', time: '18:00', title: '호텔' },
] });

test('toggle marks and unmarks a stop for one trip only', () => {
  const storage = memory(), store = createVisitedStops({ getStorage: () => storage });
  const [, cafe] = stopKeys(day());
  assert.equal(store.toggle('private:a', cafe), true);
  assert.deepEqual([...store.visited('private:a')], [cafe]);
  assert.equal(store.visited('shared:a').size, 0);
  assert.equal(store.toggle('private:a', cafe), false);
  assert.equal(store.visited('private:a').size, 0);
});

test('corrupt or blocked storage means nothing is marked', () => {
  const storage = memory();
  storage.setItem(VISITED_STOPS_KEY, '{not json');
  const store = createVisitedStops({ getStorage: () => storage });
  assert.equal(store.visited('private:a').size, 0);
  assert.equal(store.toggle('private:a', 'k'), true);
  assert.equal(store.visited('private:a').has('k'), true);
  const blocked = createVisitedStops({ getStorage: () => ({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }) });
  assert.equal(blocked.visited('private:a').size, 0);
  assert.equal(blocked.toggle('private:a', 'k'), false);
  assert.equal(createVisitedStops({ getStorage: () => null }).toggle('private:a', 'k'), false);
});

test('keeps only the 50 most recently changed trips', () => {
  const storage = memory();
  let clock = 0;
  const store = createVisitedStops({ getStorage: () => storage, now: () => ++clock });
  for (let i = 0; i < 51; i++) store.toggle(`private:t${i}`, 'k');
  assert.equal(store.visited('private:t0').size, 0);
  assert.equal(store.visited('private:t1').size, 1);
  assert.equal(store.visited('private:t50').size, 1);
  assert.equal(Object.keys(JSON.parse(storage.getItem(VISITED_STOPS_KEY)).trips).length, 50);
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
