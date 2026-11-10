import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftItineraryDates, itineraryStartDate, duplicateTitle } from '../src/domains/itinerary/services/itinerary-duplicate.mjs';

const plan = () => ({
  request: {
    destination: { id: 'seoul', country: 'KOR' },
    date: ['2026-12-30', '2026-12-31', '2027-01-01'],
    stays: [{ location: '호텔', checkin: '2026-12-30', checkout: '2027-01-01' }],
    flights: { arrival: { airport: '인천국제공항', time: '10:00', kind: 'international' }, departure: null },
    anchorSchedules: [{ day: 2, name: '공연', time: '19:00', endTime: '21:00', location: '극장' }],
    dailyData: [
      { day: 1, date: '2026-12-30', startTime: '11:00', endTime: '21:00', anchors: [] },
      { day: 2, date: '2026-12-31', startTime: '09:00', endTime: '22:00', anchors: [{ day: 2, time: '19:00' }] },
      { day: 3, date: '2027-01-01', startTime: '09:00', endTime: '18:00', anchors: [] },
    ],
  },
  days: [
    { day: 1, date: '2026-12-30', scheduleItems: [{ time: '11:00', endTime: '11:00', title: '출발' }] },
    { day: 2, date: '2026-12-31', scheduleItems: [{ time: '19:00', endTime: '21:00', title: '공연', visitNotBefore: '18:30' }] },
    { day: 3, date: '2027-01-01', scheduleItems: [{ time: '18:00', endTime: '18:00', title: '도착' }] },
  ],
});

test('every date moves by the same offset across month and year; times stay', () => {
  const original = plan();
  const before = structuredClone(original);
  const copy = shiftItineraryDates(original, '2027-02-27');
  assert.deepEqual(original, before, 'the original is not mutated');
  assert.deepEqual(copy.days.map(day => day.date), ['2027-02-27', '2027-02-28', '2027-03-01']);
  assert.deepEqual(copy.request.date, ['2027-02-27', '2027-02-28', '2027-03-01']);
  assert.deepEqual(copy.request.dailyData.map(day => day.date), ['2027-02-27', '2027-02-28', '2027-03-01']);
  assert.deepEqual(copy.request.stays, [{ location: '호텔', checkin: '2027-02-27', checkout: '2027-03-01' }]);
  // Times, flights and day-numbered anchors are relative to the day, so they are unchanged.
  const unshifted = structuredClone(copy);
  for (const day of [...unshifted.days, ...unshifted.request.dailyData]) delete day.date;
  delete unshifted.request.date; delete unshifted.request.stays;
  const expected = structuredClone(before);
  for (const day of [...expected.days, ...expected.request.dailyData]) delete day.date;
  delete expected.request.date; delete expected.request.stays;
  assert.deepEqual(unshifted, expected);
  copy.days[1].scheduleItems[0].title = 'changed';
  assert.equal(original.days[1].scheduleItems[0].title, '공연', 'the copy is deep');
});

test('a leap day and backwards moves keep consecutive dates', () => {
  const copy = shiftItineraryDates(plan(), '2028-02-28');
  assert.deepEqual(copy.days.map(day => day.date), ['2028-02-28', '2028-02-29', '2028-03-01']);
  assert.deepEqual(shiftItineraryDates(plan(), '2026-02-27').days.map(day => day.date), ['2026-02-27', '2026-02-28', '2026-03-01']);
});

test('a plan without request or metadata, or with a single string date, still works', () => {
  const bare = { days: [{ day: 1, date: '2026-11-20', scheduleItems: [] }] };
  assert.deepEqual(shiftItineraryDates(bare, '2027-01-05'), { days: [{ day: 1, date: '2027-01-05', scheduleItems: [] }] });
  const single = { request: { date: '2026-11-20' }, days: [{ day: 1, date: '2026-11-20', scheduleItems: [] }] };
  assert.equal(shiftItineraryDates(single, '2026-11-25').request.date, '2026-11-25');
  const legacy = { metadata: { request: { date: ['2026-11-20'] } }, days: [{ date: '2026-11-20' }] };
  assert.deepEqual(shiftItineraryDates(legacy, '2026-11-21').metadata.request.date, ['2026-11-21']);
  // A missing day date is not invented: Firestore rejects undefined fields.
  const undated = shiftItineraryDates({ request: { date: ['2026-11-20', '2026-11-21'] }, days: [{ day: 1 }, { day: 2, date: '2026-11-21' }] }, '2026-12-01');
  assert.deepEqual(undated.days, [{ day: 1 }, { day: 2, date: '2026-12-02' }]);
});

test('an invalid or empty new date, or a plan without dates, is rejected', () => {
  for (const value of ['', undefined, '2027-02-30', '2027-2-3', 'tomorrow']) {
    assert.throws(() => shiftItineraryDates(plan(), value), /date/);
  }
  assert.throws(() => shiftItineraryDates({ days: [{ scheduleItems: [] }] }, '2027-01-01'), /date/);
  assert.equal(itineraryStartDate({ request: { date: '2026-11-20' }, days: [{}] }), '2026-11-20');
  assert.equal(itineraryStartDate(null), '');
});

test('a start date before today, or a shift past year 9999, is rejected', () => {
  assert.throws(() => shiftItineraryDates(plan(), '2026-11-09', '2026-11-10'), /date/);
  assert.equal(shiftItineraryDates(plan(), '2026-11-10', '2026-11-10').days[0].date, '2026-11-10');
  // The first day fits but the last two would land in year 10000.
  assert.throws(() => shiftItineraryDates(plan(), '9999-12-31'), /date/);
});

test('the copy title keeps the suffix and stays within 100 characters', () => {
  assert.equal(duplicateTitle('서울 여행', ' (복사본)'), '서울 여행 (복사본)');
  const long = duplicateTitle('가'.repeat(100), ' (copy)');
  assert.equal(long.length, 100);
  assert.ok(long.endsWith(' (copy)'));
  // An emoji straddling the cut is dropped whole instead of leaving a lone surrogate.
  const emoji = duplicateTitle(`${'가'.repeat(92)}😀끝`, ' (copy)');
  assert.equal(emoji, `${'가'.repeat(92)} (copy)`);
  assert.ok(emoji.length <= 100);
});
