import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { countCourseMentions } from '../src/domains/planner/services/course-mentions.mjs';

const require = createRequire(import.meta.url);
const { parseCrowd, getSeoulCrowd } = require('../functions/seoul-crowd.js');

test('public course mentions count each course once across Korean and English names', () => {
  const cities = [{ places: [{ id: 'palace', key: 'discoverPalace' }] }];
  const courses = [
    { stops: [{ name: '경복궁' }, { name: '경복궁' }] },
    { stops: [{ name: 'Gyeongbokgung Palace' }] },
    { stops: [{ name: 'Palace visit', location: 'Gyeongbokgung Palace, 161 Sajik-ro, Seoul' }] },
    { stops: [{ name: '서울숲' }] },
  ];
  assert.equal(countCourseMentions(courses, cities).palace, 3);
});

test('Seoul crowd accepts only fresh measurements for the named area', async () => {
  const now = Date.parse('2026-10-04T12:10:00+09:00');
  const payload = { 'SeoulRtd.citydata_ppltn': [{ AREA_NM: '광화문·덕수궁',
    AREA_CONGEST_LVL: '여유', PPLTN_TIME: '2026-10-04 12:00' }] };
  assert.equal(parseCrowd(payload, now).level, '여유');
  assert.equal(parseCrowd(payload, now + 21 * 60 * 1000).delayed, true);
  assert.equal(parseCrowd(payload, now + 61 * 60 * 1000), null);
  assert.equal(parseCrowd({ 'SeoulRtd.citydata_ppltn': [{ ...payload['SeoulRtd.citydata_ppltn'][0], AREA_NM: '서울숲공원' }] }, now), null);
  let url;
  const result = await getSeoulCrowd({ now, fetchImpl: async requestUrl => {
    url = requestUrl;
    return { ok: true, json: async () => payload };
  } });
  assert.match(url, /citydata_ppltn\/1\/1\//);
  assert.equal(result.observedAt, '2026-10-04 12:00');
});
