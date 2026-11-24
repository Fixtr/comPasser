import test from 'node:test';
import assert from 'node:assert/strict';
import { departureAdvice } from '../src/domains/itinerary/services/departure-advice.mjs';

const at = clock => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
const items = [
  { type: 'departure', title: '호텔', time: '09:00' },
  { type: 'attraction', title: '해운대해수욕장', time: '12:00', endTime: '13:30', stopId: 'beach' },
  { type: 'AnchorSchedule', title: '해변열차 탑승', time: '14:00', endTime: '14:40', stopId: 'train' },
  { type: 'cafe', title: '카페', time: '15:30', endTime: '16:30', stopId: 'cafe' },
  { type: 'arrival', title: '역', time: '18:00' },
];
const routes = [{ fromIndex: 0, toIndex: 1, durationMinutes: 30 }, { fromIndex: 1, toIndex: 2, durationMinutes: 18 }];

test('a 14:00 reservation 18 minutes away gives the leave time, then leave-now, then late', () => {
  const ok = departureAdvice(items, routes, at('13:00'));
  assert.equal(ok.state, 'ok');
  assert.equal(ok.leaveTime, '13:32');
  assert.equal(ok.reservation.title, '해변열차 탑승');
  assert.equal(ok.from.title, '해운대해수욕장');
  assert.equal(ok.route, routes[1]);
  assert.equal(departureAdvice(items, routes, at('13:32')).state, 'ok');

  const go = departureAdvice(items, routes, at('13:40'));
  assert.equal(go.state, 'go');
  assert.equal(go.spare, 2);
  assert.equal(departureAdvice(items, routes, at('13:42')).state, 'go');

  assert.equal(departureAdvice(items, routes, at('13:50')).state, 'late');
  assert.equal(departureAdvice(items, routes, at('13:43')).state, 'late');
});

test('the buffer is an input and defaults to ten minutes', () => {
  assert.equal(departureAdvice(items, routes, at('13:00'), { buffer: 0 }).leaveTime, '13:42');
});

test('a missing or non-numeric leg shows no leave time', () => {
  for (const legs of [[], undefined, [routes[0]], [{ fromIndex: 1, toIndex: 2, durationMinutes: null }], [{ fromIndex: 1, toIndex: 2, duration: '18분' }]]) {
    const advice = departureAdvice(items, legs, at('13:00'));
    assert.equal(advice.state, 'unknown');
    assert.equal(advice.reservation.title, '해변열차 탑승');
    assert.equal(advice.leaveTime, undefined);
  }
});

test('a reservation that is the first item has no previous stop to leave from', () => {
  const advice = departureAdvice(items.slice(2), [{ fromIndex: 0, toIndex: 1, durationMinutes: 5 }], at('13:00'));
  assert.equal(advice.state, 'unknown');
  assert.equal(advice.from, undefined);
});

test('without a remaining reservation the next visit is shown, and nothing when none is left', () => {
  const next = departureAdvice(items, routes, at('14:10'));
  assert.equal(next.state, 'next');
  assert.equal(next.stop.title, '카페');
  assert.equal(next.leaveTime, undefined);
  // The reservation has started, the cafe has started, and the arrival is not a visit.
  assert.equal(departureAdvice(items, routes, at('15:31')).state, 'hidden');
  assert.equal(departureAdvice([], routes, at('10:00')).state, 'hidden');
  assert.equal(departureAdvice(undefined, routes, at('10:00')).state, 'hidden');
});

test('flexible visits and the arrival are never taken as the reservation', () => {
  const flexible = items.map(item => item.type === 'AnchorSchedule' ? { ...item, flexible: true } : item);
  const advice = departureAdvice(flexible, routes, at('13:00'));
  assert.equal(advice.state, 'next');
  assert.equal(advice.stop.title, '해변열차 탑승');
  const arrivalOnly = [items[0], { type: 'arrival', title: '역', time: '18:00' }];
  assert.equal(departureAdvice(arrivalOnly, [{ fromIndex: 0, toIndex: 1, durationMinutes: 20 }], at('13:00')).state, 'hidden');
});

test('visited stops are skipped', () => {
  assert.equal(departureAdvice(items, routes, at('13:00'), { visited: new Set(['train']) }).stop.title, '카페');
  assert.equal(departureAdvice(items, routes, at('13:00'), { visited: new Set(['train', 'cafe']) }).state, 'hidden');
});

test('not the trip day: no local time, no card', () => {
  assert.equal(departureAdvice(items, routes, null).state, 'hidden');
  assert.equal(departureAdvice(items, routes, undefined).state, 'hidden');
});

test('a reservation just after midnight never gets a leave time on the previous day', () => {
  const night = [items[0], items[1], { type: 'AnchorSchedule', title: '야간 버스', time: '00:05', stopId: 'bus' }];
  const advice = departureAdvice(night, [{ fromIndex: 1, toIndex: 2, durationMinutes: 18 }], at('00:00'));
  assert.equal(advice.state, 'late');
  assert.equal(advice.leaveTime, undefined);
});
