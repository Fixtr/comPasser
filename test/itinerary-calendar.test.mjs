import test from 'node:test';
import assert from 'node:assert/strict';
import { buildItineraryCalendar } from '../src/domains/itinerary/services/itinerary-calendar.mjs';

const seoul = {
  request: { destination: { id: 'seoul', country: 'KOR' } },
  days: [
    { day: 1, date: '2026-11-20', scheduleItems: [
      { time: '09:00', endTime: '09:00', type: 'departure', title: '출발', location: '서울역' },
      { time: '10:00', endTime: '12:00', title: '경복궁', location: 'Gyeongbokgung', resolvedAddress: '서울 종로구 사직로 161' },
      { time: '25:70', endTime: '26:00', title: '잘못된 시각' },
      { time: '23:00', endTime: '01:00', title: '야경 투어', location: { lat: 37.5, lng: 127 } },
    ] },
    { day: 2, date: '2026-11-21', scheduleItems: [
      { time: '20:00', endTime: '20:00', type: 'arrival', title: '도착', location: 'Seoul, South Korea', stayUnsetLabel: '숙소 미정' },
    ] },
  ],
};

const events = ics => ics.split('BEGIN:VEVENT').slice(1).map(block => Object.fromEntries(
  block.split('\r\n').filter(line => line.includes(':')).map(line => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)]),
));

test('every timed stop of every day becomes a UTC event; broken times are skipped', () => {
  const ics = buildItineraryCalendar(seoul, new Date('2026-11-09T00:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.doesNotMatch(ics.replace(/\r\n/g, ''), /\n/, 'every line ends in CRLF');
  const list = events(ics);
  assert.deepEqual(list.map(e => e.SUMMARY), ['출발', '경복궁', '야경 투어', '도착']);
  assert.equal(list[1].DTSTART, '20261120T010000Z', '10:00 KST is 01:00 UTC');
  assert.equal(list[1].DTEND, '20261120T030000Z');
  assert.equal(list[1].LOCATION, '서울 종로구 사직로 161', 'the verified address wins over the AI place name');
  assert.equal(list[2].LOCATION, undefined, 'a coordinate object is not written as a location');
  assert.equal(list[3].LOCATION, '숙소 미정', 'a night without a stay shows its label, not the machine city string');
  assert.equal(list[0].DTSTAMP, '20261109T000000Z');
  assert.equal(new Set(list.map(e => e.UID)).size, 4);
});

test('a stop that ends after midnight ends on the next day', () => {
  const night = events(buildItineraryCalendar(seoul))[2];
  assert.equal(night.DTSTART, '20261120T140000Z');
  assert.equal(night.DTEND, '20261120T160000Z', '01:00 KST on 11-21');
});

test('times follow the destination time zone, including daylight saving', () => {
  const paris = date => ({ request: { destination: { id: 'paris', country: 'FRA' } }, days: [{ date, scheduleItems: [{ time: '10:00', endTime: '11:00', title: 'Louvre' }] }] });
  assert.equal(events(buildItineraryCalendar(paris('2026-07-01')))[0].DTSTART, '20260701T080000Z', 'CEST is UTC+2');
  assert.equal(events(buildItineraryCalendar(paris('2026-11-20')))[0].DTSTART, '20261120T090000Z', 'CET is UTC+1');
  const shared = { metadata: { request: paris('x').request }, days: paris('2026-11-20').days };
  assert.equal(events(buildItineraryCalendar(shared))[0].DTSTART, '20261120T090000Z', 'a snapshot keeps its request under metadata');
});

test('text is escaped and long lines are folded at 75 octets', () => {
  const plan = { request: seoul.request, days: [{ date: '2026-11-20', scheduleItems: [
    { time: '10:00', endTime: '11:00', title: 'A, B; C\\D\nE', location: '서울 '.repeat(40) },
  ] }] };
  const ics = buildItineraryCalendar(plan);
  assert.match(ics, /SUMMARY:A\\, B\\; C\\\\D\\nE\r\n/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `too long: ${line}`);
  assert.equal(events(ics.replace(/\r\n /g, ''))[0].LOCATION, '서울 '.repeat(40), 'unfolding restores the text');
});

test('a plan with no timed stops gives no calendar', () => {
  assert.equal(buildItineraryCalendar(null), null);
  assert.equal(buildItineraryCalendar({ days: [{ date: '2026-11-20', scheduleItems: [{ title: 'no time' }] }] }), null);
});
