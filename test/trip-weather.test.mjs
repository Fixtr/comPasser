import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validTripWeather } from '../functions/recommendation-weather.mjs';

const require = createRequire(import.meta.url);
const { createTripWeather, createTripWeatherLimiter, validateTripWeatherInput } = require('../functions/trip-weather.js');
// 2026-09-13 12:00 in Seoul.
const now = new Date('2026-09-13T03:00:00Z');
const input = (extra = {}) => ({ country: 'KOR', cityId: 'seoul', date: '2026-09-13', lat: 37.5512, lng: 126.9882, ...extra });

test('weather input accepts only today or tomorrow in the destination time zone and rounds coordinates', () => {
  assert.deepEqual(validateTripWeatherInput(input(), now), { country: 'KOR', cityId: 'seoul', date: '2026-09-13', lat: 37.6, lng: 127 });
  assert.equal(validateTripWeatherInput(input({ date: '2026-09-14' }), now).date, '2026-09-14');
  // 2026-09-13 23:30 in Seoul is still 2026-09-13 in New York.
  const late = new Date('2026-09-13T14:30:00Z');
  assert.equal(validateTripWeatherInput(input({ country: 'USA', cityId: 'newyork', date: '2026-09-13', lat: 40.7, lng: -74 }), late).date, '2026-09-13');
  for (const bad of [null, [], 'seoul', input({ extra: 1 }), input({ country: 'XXX' }), input({ cityId: 'tokyo' }),
    input({ date: '2026-09-12' }), input({ date: '2026-09-15' }), input({ date: '2026-02-30' }),
    input({ lat: '37.5' }), input({ lat: Number.NaN }), input({ lng: 200 }),
    // Busan is not within 100 km of Seoul: the endpoint is not a general weather proxy.
    input({ lat: 35.18, lng: 129.07 })]) {
    assert.throws(() => validateTripWeatherInput(bad, now), { code: 'invalid-argument' }, JSON.stringify(bad));
  }
});

test('the client and server share one forecast shape; nothing outside it is accepted', () => {
  const hours = [{ hour: 13, rainPercent: 10 }, { hour: 14, rainPercent: null }];
  assert.equal(validTripWeather({ status: 'forecast', date: '2026-09-13', hours }), true);
  assert.equal(validTripWeather({ status: 'unavailable' }), true);
  for (const bad of [null, {}, { status: 'unavailable', hours }, { status: 'forecast', date: '2026-09-13', hours: [] },
    { status: 'forecast', date: '9/13', hours }, { status: 'forecast', date: '2026-09-13', hours: [...hours].reverse() },
    { status: 'forecast', date: '2026-09-13', hours: [{ hour: 24, rainPercent: 1 }] },
    { status: 'forecast', date: '2026-09-13', hours: [{ hour: 1, rainPercent: 101 }] },
    { status: 'forecast', date: '2026-09-13', hours: [{ hour: 1, rainPercent: '50' }] }]) assert.equal(validTripWeather(bad), false, JSON.stringify(bad));
});

function fakeDb() {
  const docs = new Map();
  const ref = (name, id) => ({ path: `${name}/${id}`, get: async () => ({ data: () => docs.get(`${name}/${id}`) }),
    set: async value => { docs.set(`${name}/${id}`, value); } });
  return { docs, collection: name => ({ doc: id => ref(name, id) }),
    runTransaction: async callback => callback({ get: async r => ({ data: () => docs.get(r.path) }), set: (r, value) => docs.set(r.path, value) }) };
}
const hour = (day, hours, percent, type = 'RAIN') => ({ displayDateTime: { year: 2026, month: 9, day, hours },
  precipitation: { probability: { percent, type } } });

test('the forecast keeps only the requested local date and never turns snow or missing values into rain', async () => {
  const requests = [];
  const pages = [
    { forecastHours: [hour(13, 12, 0, 'NONE'), hour(13, 14, 80), hour(13, 15, 70, 'SNOW'), hour(13, 16, undefined)], nextPageToken: 'next' },
    { forecastHours: [hour(13, 23, 40, 'LIGHT_RAIN'), hour(14, 0, 90)] },
  ];
  const axios = { get: async (url, options) => { requests.push({ url, options }); return { data: pages[requests.length - 1] }; } };
  const weather = createTripWeather({ axios, getKey: () => 'server-key', db: fakeDb(), now: () => now });
  const result = await weather('owner', validateTripWeatherInput(input(), now));
  assert.deepEqual(result, { status: 'forecast', date: '2026-09-13', hours: [
    { hour: 12, rainPercent: 0 }, { hour: 14, rainPercent: 80 }, { hour: 15, rainPercent: null },
    { hour: 16, rainPercent: null }, { hour: 23, rainPercent: 40 }] });
  assert.equal(requests[0].url, 'https://weather.googleapis.com/v1/forecast/hours:lookup');
  assert.equal(requests[0].options.headers['X-Goog-Api-Key'], 'server-key');
  assert.deepEqual([requests[0].options.params['location.latitude'], requests[0].options.params['location.longitude']], [37.6, 127]);
  assert.equal(requests[1].options.params.pageToken, 'next');
});

test('provider errors and malformed forecasts become unavailable, not invented weather', async () => {
  for (const get of [async () => { throw new Error('quota'); }, async () => ({ data: { forecastHours: [hour(13, 14, 140)] } }),
    async () => ({ data: { forecastHours: [hour(15, 14, 80)] } }), async () => ({ data: null })]) {
    const weather = createTripWeather({ axios: { get }, getKey: () => 'k', db: fakeDb(), now: () => now });
    assert.deepEqual(await weather('owner', validateTripWeatherInput(input(), now)), { status: 'unavailable' });
  }
});

test('one location and date call the provider at most once per hour, shared by travelers', async () => {
  let calls = 0, time = now.getTime();
  const db = fakeDb();
  const axios = { get: async () => { calls++; return { data: { forecastHours: [hour(13, 14, 80)] } }; } };
  const weather = createTripWeather({ axios, getKey: () => 'k', db, now: () => new Date(time) });
  const request = validateTripWeatherInput(input(), now);
  await weather('owner', request);
  await weather('friend', { ...request });
  assert.equal(calls, 1);
  assert.ok([...db.docs.keys()].some(key => key.startsWith('weather_cache/')));
  time += 3600000;
  await weather('owner', request);
  assert.equal(calls, 2);
});

test('each traveler gets 20 weather lookups an hour and the service 1000', async () => {
  let time = now.getTime();
  const db = fakeDb();
  const reserve = createTripWeatherLimiter({ db, now: () => new Date(time) });
  for (let i = 0; i < 20; i++) await reserve('owner');
  await assert.rejects(reserve('owner'), { code: 'resource-exhausted', details: { reason: 'weather-limit' } });
  assert.ok(![...db.docs.keys()].some(key => key.includes('owner')), 'uid is stored hashed');
  await reserve('friend');
  time += 3600000;
  await reserve('owner');
  db.docs.set('weather_limits/global', { hour: Math.floor(time / 3600000), count: 1000 });
  await assert.rejects(reserve('third'), { code: 'resource-exhausted' });
  await assert.rejects(reserve(''), { code: 'unauthenticated' });
});

test('the limit is charged before cached or provider work', async () => {
  const order = [];
  const weather = createTripWeather({ axios: { get: async () => { order.push('provider'); return { data: {} }; } },
    getKey: () => 'k', db: fakeDb(), now: () => now, reserve: async () => { order.push('limit'); throw Object.assign(new Error('weather-limit'), { code: 'resource-exhausted' }); } });
  await assert.rejects(weather('owner', validateTripWeatherInput(input(), now)), { code: 'resource-exhausted' });
  assert.deepEqual(order, ['limit']);
});
