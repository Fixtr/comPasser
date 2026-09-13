import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { normalizePlannerRequest } from '../src/domains/planner/services/planner-constraints.mjs';

const require = createRequire(new URL('../functions/index.js', import.meta.url));
const prompt = require('./itinerary-prompt.js');
const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
const valid = () => normalizePlannerRequest({ date: '2026-10-01', startTime: '09:00', endTime: '18:00',
  startLocation: '서울역', endLocation: '호텔', anchorSchedules: [] });

// Run the actual exported callback with fake SDK/HTTP boundaries. No credentials,
// account reads, network, paid AI or production initialization are involved.
function fixture({ fail } = {}) {
  const calls = [];
  class HttpsError extends Error {
    constructor(code, message, details) { super(message); Object.assign(this, { code, details }); }
  }
  const modules = {
    'firebase-functions': { https: { onRequest: fn => fn }, logger: { info() {}, warn() {} } },
    'firebase-functions/v2/https': { onCall: (_, fn) => fn, HttpsError },
    'firebase-functions/v2/scheduler': { onSchedule: (_, fn) => fn },
    'firebase-functions/params': { defineSecret: () => ({ value: () => { calls.push('secret'); return 'test-only-key'; } }) },
    'firebase-admin': { initializeApp() {}, firestore() {}, auth() {} },
    './account-deletion': { createAccountDeletion: () => ({ assertNotDeleting: async () => calls.push('account-check') }) },
    './itinerary-prompt': { ...prompt, buildPrompt: (...args) => { calls.push('prompt'); return prompt.buildPrompt(...args); } },
    axios: { post: async () => { calls.push('ai'); if (fail) throw fail; return { data: { candidates: [{ content: { parts: [{ text: JSON.stringify({ days: [{ day: 1, scheduleItems: [{ title: '일정' }] }] }) }] } }] } }; } },
    cors: () => () => {},
  };
  const exports = {};
  vm.runInNewContext(source, { exports, console, require: id => Object.hasOwn(modules, id) ? modules[id] : require(id) }, { filename: 'functions/index.js' });
  return { calls, run: (request, auth = { uid: 'test-user' }) => exports.generateItinerary({ data: { request }, auth }) };
}

test('actual server callback rejects malformed input before any account/secret/prompt/AI work', async () => {
  for (const request of [undefined, null, {}, { dailyData: [] }, { dailyData: [{}] },
    { ...valid(), dailyData: [{ ...valid().dailyData[0], startLocation: '' }] }]) {
    const app = fixture();
    await assert.rejects(app.run(request), error => error.code === 'invalid-argument' && typeof error.details.reason === 'string');
    assert.deepEqual(app.calls, []);
  }
});

test('actual server callback rejects oversized requests before sanitizer truncation', async () => {
  const app = fixture(), request = valid();
  request.dailyData = Array.from({ length: 5 }, (_, i) => ({ ...request.dailyData[0], day: i + 1 }));
  await assert.rejects(app.run(request), error => error.details.reason === 'day-limit');
  assert.deepEqual(app.calls, []);
});

test('authentication remains required, even for valid input', async () => {
  const app = fixture();
  await assert.rejects(app.run(valid(), null), { code: 'unauthenticated' });
  assert.deepEqual(app.calls, []);
});

test('valid input still passes account guard, prompt and AI exactly once', async () => {
  const app = fixture(), response = await app.run(valid());
  assert.equal(response.days.length, 1);
  assert.deepEqual(app.calls, ['account-check', 'secret', 'prompt', 'ai']);
});

test('model fallback and quota error mapping remain unchanged', async () => {
  const app = fixture({ fail: Object.assign(new Error('quota'), { response: { status: 429 } }) });
  await assert.rejects(app.run(valid()), { code: 'resource-exhausted' });
  assert.deepEqual(app.calls, ['account-check', 'secret', 'prompt', 'ai', 'ai']);
});
