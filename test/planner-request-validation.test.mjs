import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { findPlannerRequestIssue } from '../functions/planner-request-validation.mjs';
import { normalizePlannerRequest } from '../src/domains/planner/services/planner-constraints.mjs';
import { findPlannerInputIssue, plannerValidationMessage } from '../src/domains/planner/services/planner-validation.js';
import { setLang } from '../src/utils/i18n.js';

const { sanitizePlannerRequest, buildPrompt } = createRequire(import.meta.url)('../functions/itinerary-prompt.js');
const flat = () => ({ date: ['2026-10-01', '2026-10-02'], startTime: '09:00', endTime: '18:00',
  startLocation: '서울역', endLocation: { displayName: '호텔', formattedAddress: '서울 중구' },
  dailyTimes: [{ day: 1, startTime: '09:00', endTime: '18:00' }, { day: 2, startTime: '11:00', endTime: '20:00' }],
  anchorSchedules: [{ day: 2, name: '공연', time: '12:00', endTime: '13:00', location: '' }] });
const valid = () => normalizePlannerRequest(flat());

for (const raw of [undefined, null, false, 1, '', 'prompt', [], {}, { dailyData: [] }, { dailyData: {} }]) {
  test(`reject missing/malformed request before defaults: ${JSON.stringify(raw)}`, () => {
    assert.equal(findPlannerRequestIssue(raw).reason, 'missing-days');
  });
}

test('sanitizing an empty request no longer invents a travel day', () => {
  for (const value of [undefined, {}, { dailyData: [] }]) assert.deepEqual(sanitizePlannerRequest(value).dailyData, []);
});

test('valid flat input, canonical input and legacy daily-only data agree without mutation', () => {
  const request = valid(), original = structuredClone(request);
  assert.equal(findPlannerInputIssue(flat()), null);
  assert.equal(findPlannerRequestIssue(request), null);
  assert.equal(findPlannerRequestIssue({ dailyData: request.dailyData }), null);
  const sanitized = sanitizePlannerRequest(request);
  assert.deepEqual(sanitized.dates, request.date);
  assert.equal(sanitized.dailyData[1].anchors[0].name, '공연');
  assert.match(buildPrompt(sanitized, 'ko'), /11:00 to 20:00/);
  assert.deepEqual(request, original);
});

test('overnight boundary must match both adjoining days when supplied', () => {
  const request = normalizePlannerRequest({...flat(),overnightLocations:['서울 호텔']});
  assert.equal(findPlannerRequestIssue(request),null);
  request.dailyData[1].startLocation='다른 곳';
  assert.equal(findPlannerRequestIssue(request)?.reason,'overnight-mismatch');
  request.dailyData[1].startLocation='서울 호텔';
  request.overnightLocations=[];
  assert.equal(findPlannerRequestIssue(request)?.reason,'overnight-length');
  const hotel = {placeId:'hotel-a',displayName:'같은 이름',formattedAddress:'서울',lat:37.5,lng:127};
  const other = {...hotel,placeId:'hotel-b'};
  const selected = normalizePlannerRequest({...flat(),overnightLocations:[hotel]});
  selected.dailyData[1].startLocation=other;
  assert.equal(findPlannerRequestIssue(selected)?.reason,'overnight-mismatch');
});

const cases = [
  ['unknown trip pace', r => { r.pace = 'sprint'; }, 'travel-pace'],
  ['non-string trip pace', r => { r.pace = ['relaxed']; }, 'travel-pace'],
  ['fifth day', r => { r.dailyData.push(...r.dailyData, r.dailyData[0]); }, 'day-limit'],
  ['missing date', r => { r.dailyData[0].date = ''; }, 'invalid-date'],
  ['impossible date', r => { r.dailyData[0].date = '2026-02-30'; }, 'invalid-date'],
  ['non-leap date', r => { r.dailyData[0].date = '2026-02-29'; }, 'invalid-date'],
  ['bad date type', r => { r.dailyData[0].date = 20261001; }, 'invalid-date'],
  ['date list mismatch', r => { r.date = ['2026-10-01']; }, 'date-mismatch'],
  ['conflicting date', r => { r.date[1] = '2026-10-03'; }, 'date-mismatch'],
  ['duplicate date', r => { r.date[1] = r.dailyData[1].date = r.date[0]; }, 'date-order'],
  ['descending date', r => { r.date[1] = r.dailyData[1].date = '2026-09-30'; }, 'date-order'],
  ['missing day entry', r => { r.dailyData[0] = null; }, 'day-order'],
  ['wrong day number', r => { r.dailyData[1].day = 1; }, 'day-order'],
  ['empty time', r => { r.dailyData[0].startTime = ''; }, 'invalid-time'],
  ['hour overflow', r => { r.dailyData[0].endTime = '24:00'; }, 'invalid-time'],
  ['minute overflow', r => { r.dailyData[0].startTime = '09:60'; }, 'invalid-time'],
  ['non-padded time', r => { r.dailyData[0].startTime = '9:00'; }, 'invalid-time'],
  ['zero duration', r => { r.dailyData[0].endTime = '09:00'; }, 'time-order'],
  ['reversed day times', r => { r.dailyData[0].endTime = '08:00'; }, 'time-order'],
  ['blank location', r => { r.dailyData[0].startLocation = ' \n\u0000 '; }, 'missing-location'],
  ['coordinate-only location', r => { r.dailyData[0].endLocation = { lat: 37.5, lng: 127 }; }, 'missing-location'],
  ['malformed anchors', r => { r.dailyData[0].anchors = {}; }, 'invalid-anchors'],
  ['null anchor', r => { r.dailyData[1].anchors = [null]; }, 'incomplete-anchor'],
  ['blank anchor name', r => { r.dailyData[1].anchors[0].name = ' \n '; }, 'incomplete-anchor'],
  ['missing anchor start', r => { delete r.dailyData[1].anchors[0].time; }, 'invalid-anchor-time'],
  ['missing anchor end', r => { delete r.dailyData[1].anchors[0].endTime; }, 'invalid-anchor-time'],
  ['anchor time order', r => { r.dailyData[1].anchors[0].endTime = '11:30'; }, 'anchor-time-order'],
  ['anchor before custom start', r => { r.dailyData[1].anchors[0].time = '10:00'; }, 'anchor-bounds'],
  ['anchor after custom end', r => { r.dailyData[1].anchors[0].endTime = '20:01'; }, 'anchor-bounds'],
  ['out-of-range flat anchor', r => { r.anchorSchedules = [{ ...r.anchorSchedules[0], day: 3 }]; }, 'anchor-day'],
  ['wrong nested anchor day', r => { r.dailyData[1].anchors[0].day = 1; }, 'anchor-day'],
  ['eleventh anchor', r => { r.dailyData[1].anchors = Array.from({ length: 11 }, () => ({ ...r.dailyData[1].anchors[0] })); }, 'anchor-limit'],
];
for (const [label, change, reason] of cases) {
  test(`reject ${label} instead of silently repairing/dropping it`, () => {
    const request = valid(); change(request);
    assert.equal(findPlannerRequestIssue(request)?.reason, reason);
  });
}

test('four days, ten anchors and inclusive day time boundaries are valid', () => {
  const request = valid();
  request.date = ['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02'];
  request.dailyData = request.date.map((date, i) => ({ ...request.dailyData[0], day: i + 1, date,
    anchors: Array.from({ length: 10 }, (_, index) => ({ name: '행사', time: `${String(9+Math.floor(index/2)).padStart(2,'0')}:${index%2?'30':'00'}`, endTime: `${String(9+Math.floor(index/2)).padStart(2,'0')}:${index%2?'50':'20'}` })) }));
  assert.equal(findPlannerRequestIssue(request), null);
});

test('optional anchor location, empty anchor lists, optional theme/budget remain valid', () => {
  const request = valid(); delete request.dailyData[0].anchors;
  assert.equal(findPlannerRequestIssue(request), null);
  assert.equal(sanitizePlannerRequest(request).theme, null);
});

test('custom-day bounds are checked at the client too and explicit empty times stay invalid', () => {
  const request = flat(); request.anchorSchedules[0].time = '10:00';
  assert.equal(findPlannerInputIssue(request).reason, 'anchor-bounds');
  assert.equal(findPlannerInputIssue(request).field, 'time');
  request.anchorSchedules[0].time = '12:00'; request.anchorSchedules[0].endTime = '21:00';
  assert.equal(findPlannerInputIssue(request).field, 'endTime');
  request.anchorSchedules[0].endTime = '13:00';
  request.anchorSchedules[0].time = '12:00'; request.dailyTimes[1].startTime = '';
  assert.equal(findPlannerInputIssue(request).reason, 'invalid-time');
});

test('safe reason codes translate in both languages and untrusted details are not displayed', () => {
  for (const lang of ['ko', 'en']) {
    setLang(lang);
    for (const reason of new Set(cases.map(([, , reason]) => reason))) {
      const text = plannerValidationMessage({ reason, day: 2 });
      assert.match(text, lang === 'en' ? /^\[Day 2\] / : /^\[2일차\] /);
      assert.doesNotMatch(text, /Error$|ValidationError$|^planner/);
    }
    const message = plannerValidationMessage({ reason: '<script>private-input</script>', day: 999 });
    assert.doesNotMatch(message, /private-input|999/);
    assert.equal(plannerValidationMessage({ reason: 'constructor' }), message);
  }
  setLang('ko');
});

test('explicit overrides allow overnight exceptions but reject malformed or conflicting canonical data', () => {
  const request = normalizePlannerRequest({...flat(), overnightLocations:['숙소'], dailyLocations:[
    {day:1,startLocation:'',endLocation:'공연장'}, {day:2,startLocation:'역',endLocation:''},
  ]});
  assert.equal(findPlannerRequestIssue(request), null);
  const prompt = buildPrompt(sanitizePlannerRequest(request), 'ko');
  assert.match(prompt, /공연장/);
  assert.match(prompt, /explicit day overrides may differ/);
  for (const dailyLocations of [{}, [], [null, null], [{day:2}, {day:1}],
    [{day:1,startLocation:42},{day:2}], [{day:1,endLocation:'다른 곳'}, {day:2}]]) {
    assert.ok(findPlannerRequestIssue({...request,dailyLocations}), JSON.stringify(dailyLocations));
  }
  request.dailyData[1].startLocation = '몰래 바꾼 곳';
  assert.equal(findPlannerRequestIssue(request).reason, 'daily-location-mismatch');
});


test('US requests use the selected city timezone at normalization, validation and prompt boundaries', () => {
  const hotel = {placeId:'hotel-us',displayName:'Hotel',formattedAddress:'United States',lat:34.05,lng:-118.24};
  for (const [id, zone] of [['losangeles','America/Los_Angeles'],['chicago','America/Chicago'],['honolulu','Pacific/Honolulu']]) {
    const request = normalizePlannerRequest({destination:{id,country:'USA',name:id},date:['2030-07-01'],startTime:'09:00',endTime:'18:00',startLocation:hotel,endLocation:hotel,anchorSchedules:[]});
    assert.equal(request.dailyData[0].timeZone,zone);
    assert.equal(findPlannerRequestIssue(request),null);
    assert.equal(findPlannerRequestIssue({...request,dailyData:[{...request.dailyData[0],timeZone:'America/New_York'}]}).reason,'invalid-time');
    const prompt=buildPrompt(sanitizePlannerRequest(request));
    assert.ok(JSON.stringify(prompt).includes(zone));
  }
});
