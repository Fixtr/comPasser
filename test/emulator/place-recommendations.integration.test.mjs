import './assert-local.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import vm from 'node:vm';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator, doc, getDoc } from 'firebase/firestore';
import { normalizeSelectedPlace } from '../../src/domains/planner/services/selected-place.mjs';
import { validRecommendationWeather } from '../../functions/recommendation-weather.mjs';
const require = createRequire(new URL('../../functions/index.js', import.meta.url));

// Actual client/callable/Firestore boundaries; only paid Google providers and secret values are replaced.
test('AI discovery integrates client contracts, callable CORS/errors, grounded verification, refresh and concurrent durable limits', async t => {
  const axios = require('axios');
  const express = require('express');
  const names = ['Sensoji Temple','River Walk','Local Gallery','Closed Park','Wrong Place','Unbacked Venue'];
  const statements = [
    'Sensoji Temple is a historic temple worth visiting.',
    'River Walk is a riverside walking destination.',
    'Local Gallery hosts Autumn Light from 2099-10-01 to 2099-10-05.',
    'Closed Park is a green visitor destination.',
    'Wrong Place is a visitor destination.',
    'Unbacked Venue is a visitor destination.',
  ];
  const evidenceUrl = 'https://example.test/official-guide';
  const calls = [];
  t.mock.method(axios, 'get', async () => { throw new Error('Unexpected provider GET'); });
  t.mock.method(axios, 'post', async (url, body, options) => {
    calls.push({ url, body });
    if (url === 'https://places.googleapis.com/v1/places:searchText') {
      assert.equal(options.headers['X-Goog-Api-Key'], 'fixture-maps-only');
      const name = body.textQuery.split(',')[0], index = names.indexOf(name);
      assert.ok(index >= 0);
      return { data: { places: [{
        id: `verified-${index}`, displayName: { text: index === 0 ? 'Sensō-ji' : name },
        formattedAddress: 'Tokyo, Japan', location: { latitude: 35.68, longitude: 139.65 }, businessStatus: 'OPERATIONAL',
        addressComponents: [{ types: ['country'], shortText: index === 4 ? 'FR' : 'JP' }, { types: ['administrative_area_level_1'], longText: 'Tokyo' }],
        primaryType: index === 1 || index === 3 ? 'park' : 'museum',
        regularOpeningHours: { periods: index === 3 ? [] : [{ open: { day: 0, hour: 0, minute: 0 } }] },
        googleMapsUri: 'https://maps.google.com/?cid=fixture', attributions: [],
      }] } };
    }
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent');
    assert.equal(options.headers['x-goog-api-key'], 'fixture-ai-only');
    if (body.tools) return { data: { candidates: [{ content: { parts: [{ text: statements.join('\n') }] }, groundingMetadata: {
      groundingChunks: [{ web: { uri: evidenceUrl, title: 'Official guide' } }],
      groundingSupports: statements.slice(0, 5).map(text => ({ segment: { text }, groundingChunkIndices: [0] })),
      searchEntryPoint: { renderedContent: '<a href="https://www.google.com/search?q=Tokyo">Google Search</a>' },
    } }] } };
    const places = names.map((name, index) => ({ name, evidenceIndex: index, event: index === 2 ? { name: 'Autumn Light', startDate: '2099-10-01', endDate: '2099-10-05' } : null }));
    return { data: { candidates: [{ content: { parts: [{ text: JSON.stringify({ places }) }] } }] } };
  });
  const oldSecrets = [process.env.GEMINI_API_KEY, process.env.GOOGLE_MAPS_SERVER_KEY];
  process.env.GEMINI_API_KEY = 'fixture-ai-only';
  process.env.GOOGLE_MAPS_SERVER_KEY = 'fixture-maps-only';
  let time = Date.now();
  t.mock.method(Date, 'now', () => time);
  const endpoints = require('./index');
  const admin = require('firebase-admin');
  const app = initializeApp({ projectId: 'demo-hackerton-deletion', apiKey: 'fixture-key' }, 'ai-integration');
  const serverApp = express();
  serverApp.use(express.json());
  const route = '/demo-hackerton-deletion/us-central1/recommendPlaces';
  serverApp.all(route, endpoints.recommendPlaces);
  const server = serverApp.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const existing = await admin.firestore().collection('ai_place_limits').get();
    await Promise.all(existing.docs.map(record => record.ref.delete()));
    const port = server.address().port;
    connectFunctionsEmulator(getFunctions(app), '127.0.0.1', port);
    const [host, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
    connectFirestoreEmulator(getFirestore(app), host, Number(firestorePort));
    const source = readFileSync(new URL('../../src/domains/planner/services/ai-place-recommendations.js', import.meta.url), 'utf8')
      .replace(/^import .*;\n/gm, '').replace('export async function', 'async function');
    const context = { app, getFunctions, httpsCallable, normalizeSelectedPlace, validRecommendationWeather, URL };
    vm.runInNewContext(source + '\nglobalThis.run=getAIPlaceRecommendations;', context);
    const input = { cityId: 'tokyo', country: 'JPN', date: '2099-10-01', lang: 'en', interest: 'culture', theme: 'healing', budget: 'standard', excludedPlaces: [] };
    const preflight = await fetch(`http://127.0.0.1:${port}${route}`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    await assert.rejects(context.run({ ...input, excludedPlaces: [{}] }), { code: 'functions/invalid-argument' });
    assert.equal(calls.length, 0);
    assert.equal((await admin.firestore().collection('ai_place_limits').get()).size, 0);
    const result = await context.run(input);
    assert.deepEqual(result.places.map(item => item.place.displayName), ['River Walk','Local Gallery','Sensō-ji']);
    assert.equal(result.interest, 'culture');
    for (const item of result.places) {
      assert.deepEqual(item.sources, [{ url: evidenceUrl, title: 'Official guide' }]);
      assert.ok(statements.includes(item.reason));
      assert.deepEqual(item.hours, { status: 'regular', intervals: ['00:00–24:00'] });
    }
    assert.equal(calls.length, 7); // Two model calls plus five eligible identity checks.
    await assert.rejects(context.run(input), { code: 'functions/resource-exhausted' });
    assert.equal(calls.length, 7);
    time += 60001;
    const refresh = { ...input, excludedPlaces: result.places.map(({ place }) => ({ placeId: place.placeId, displayName: place.displayName })) };
    const concurrent = await Promise.allSettled([context.run(refresh), context.run(refresh)]);
    assert.deepEqual(concurrent.map(result => result.reason?.code).sort(), ['functions/not-found','functions/resource-exhausted']);
    assert.equal(calls.length, 11); // Only one admitted refresh: two model calls and two rejected venues.
    const counters = await admin.firestore().collection('ai_place_limits').get();
    assert.equal(counters.size, 2);
    assert.equal(counters.docs.find(record => record.id === 'global').data().count, 2);
    await assert.rejects(getDoc(doc(getFirestore(app), 'ai_place_limits', 'global')), { code: 'permission-denied' });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await deleteApp(app);
    await admin.app().delete();
    for (const [index, name] of ['GEMINI_API_KEY','GOOGLE_MAPS_SERVER_KEY'].entries()) {
      if (oldSecrets[index] === undefined) delete process.env[name];
      else process.env[name] = oldSecrets[index];
    }
  }
});
