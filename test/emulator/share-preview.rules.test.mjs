import './assert-local.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../../src/server/public-routes-worker.mjs';

const project = 'demo-hackerton-deletion';
const root = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents`;
const field = value => Array.isArray(value) ? { arrayValue: { values: value.map(field) } }
  : value && typeof value === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, field(entry)])) } }
    : { stringValue: value };
const write = (path, data) => fetch(`${root}/${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
  body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, field(value)])) }) });

test('the worker reads a live share through guest rules and drops the preview once the trip is deleted', async t => {
  const shell = readFileSync(new URL('../../ionic-shell.html', import.meta.url), 'utf8');
  const env = { PUBLIC_APP_URL: 'https://example.com', FIREBASE_PROJECT_ID: project, ASSETS: { fetch: () => new Response(shell) } };
  const realFetch = globalThis.fetch;
  // The worker always calls production Firestore; point the same REST request at the emulator.
  t.mock.method(globalThis, 'fetch', (url, options) => realFetch(String(url).replace('https://firestore.googleapis.com', `http://${process.env.FIRESTORE_EMULATOR_HOST}`), options));
  assert.equal((await write('itineraries/previewSource', { userId: 'previewOwner' })).status, 200);
  assert.equal((await write('shared_itineraries/previewShare', { sourceId: 'previewSource', ownerId: 'previewOwner', itineraryPlan: {
    request: { destination: { id: 'seoul', name: '서울 마포구 비밀주소 1' }, date: ['2026-08-20', '2026-08-21', '2026-08-22'] },
    days: [{ scheduleItems: [{ title: '호텔', location: '비밀호텔' }] }],
  } })).status, 200);
  const html = await (await worker.fetch(new Request('https://example.com/share/previewShare'), env)).text();
  assert.match(html, /<meta property="og:title" content="서울 3일 여행 일정 · ComPasser" \/>/);
  assert.doesNotMatch(html, /비밀|previewOwner|previewSource|2026-08/);
  assert.equal((await realFetch(`${root}/itineraries/previewSource`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })).status, 200);
  assert.match(await (await worker.fetch(new Request('https://example.com/share/previewShare'), env)).text(), /<meta property="og:title" content="ComPasser" \/>/);
});
