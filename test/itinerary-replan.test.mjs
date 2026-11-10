import assert from 'node:assert/strict';
import test from 'node:test';
import { replanDeparture, replanOrigin, replanRemaining } from '../src/domains/itinerary/services/itinerary-replan.mjs';
import { shiftItineraryDates } from '../src/domains/itinerary/services/itinerary-duplicate.mjs';
import { stopKeys } from '../src/domains/itinerary/services/visited-stops.mjs';

const day = () => ({ date: '2026-11-10', scheduleItems: [
  { type: 'departure', title: 'Hotel', time: '09:00' },
  { type: 'museum', title: 'Museum', time: '10:00', endTime: '11:00' },
  { type: 'cafe', title: 'Cafe', time: '12:20', endTime: '13:20' },
  { type: 'AnchorSchedule', title: 'Show', time: '13:05', endTime: '13:15' },
  { type: 'arrival', title: 'Station', time: '15:00' },
] });

const request = day => ({
  day, origin: 1, startTime: '12:01', endTime: '15:00',
  locations: day.scheduleItems.map(item => item.title),
  hours: [],
  travelMinutes: async () => 15,
});

test('uses the destination day and the last checked place', () => {
  const tripDay = day();
  const now = new Date('2026-11-09T18:00:00Z');
  assert.equal(replanDeparture(tripDay, 'Asia/Seoul', now).time, '03:01');
  assert.equal(replanDeparture(tripDay, 'America/New_York', now), null);
  assert.equal(replanOrigin(tripDay, new Set([stopKeys(tripDay)[1]])), 1);
  assert.equal(replanOrigin(tripDay, new Set()), 0);
});

test('remeasures the direct route after one omission, retaining visits and bookings', async () => {
  const tripDay = day();
  const calls = [];
  const result = await replanRemaining({ ...request(tripDay), async travelMinutes(...leg) {
    calls.push(leg);
    return 15;
  } });
  assert.equal(result.status, 'ready');
  assert.equal(result.skipped.title, 'Cafe');
  assert.deepEqual(result.items.map(item => item.title), ['Hotel', 'Museum', 'Show', 'Station']);
  assert.deepEqual(result.items[2], tripDay.scheduleItems[3]);
  assert.equal(result.items[1].time, '10:00');
  assert.equal(result.items[1].actualDepartureTime, '12:01');
  assert.equal(result.items[3].time, '15:00');
  assert.ok(calls.some(([from, to, date, time]) => from === 'Museum' && to === 'Show' && date === tripDay.date && time === '12:01'));
  assert.equal(tripDay.scheduleItems[1].actualDepartureTime, undefined);
  const copy = shiftItineraryDates({ days: [{ ...tripDay, scheduleItems: result.items }] }, '2026-12-01');
  assert.equal(copy.days[0].scheduleItems[1].actualDepartureTime, undefined);
});

test('never omits user or required visits or assumes an unmeasured leg', async () => {
  const tripDay = day();
  tripDay.scheduleItems[2].addedByUser = true;
  assert.equal((await replanRemaining(request(tripDay))).status, 'conflict');
  tripDay.scheduleItems[2] = { ...tripDay.scheduleItems[2], type: 'AnchorSchedule', flexible: true };
  assert.equal((await replanRemaining(request(tripDay))).status, 'conflict');
  assert.equal((await replanRemaining({ ...request(tripDay), travelMinutes: async () => null })).status, 'unavailable');
  assert.equal((await replanRemaining({ ...request(tripDay), startTime: '14:00' })).status, 'conflict');
});

test('a move needs known opening hours and remains within the stay window', async () => {
  const tripDay = day();
  tripDay.scheduleItems[2].endTime = '12:45';
  tripDay.scheduleItems[3].time = '14:00';
  tripDay.scheduleItems[3].endTime = '14:10';
  const input = { ...request(tripDay), startTime: '12:15' };
  assert.equal((await replanRemaining(input)).status, 'unavailable');
  input.hours[2] = {
    utcOffsetMinutes: 540, businessStatus: 'OPERATIONAL',
    regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] },
  };
  const result = await replanRemaining(input);
  assert.equal(result.status, 'ready');
  assert.equal(result.items[2].time, '12:30');
  assert.equal(result.items[2].endTime, '12:55');
});
