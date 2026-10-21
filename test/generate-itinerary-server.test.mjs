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
const twoDays = () => normalizePlannerRequest({ date: ['2026-10-01', '2026-10-02'], startTime: '09:00', endTime: '18:00',
  startLocation: '서울역', endLocation: '호텔', anchorSchedules: [] });

// Run the actual exported callback with fake SDK/HTTP boundaries. No credentials,
// account reads, network, paid AI or production initialization are involved.
function fixture({ fail, empty = false, responses, user = {}, recommendationError } = {}) {
  const calls = [];
  const modelUrls = [];
  let responseIndex = 0;
  class HttpsError extends Error {
    constructor(code, message, details) { super(message); Object.assign(this, { code, details }); }
  }
  const modules = {
    'firebase-functions': { https: { onRequest: fn => fn }, logger: { info() {}, warn() {} } },
    'firebase-functions/v2/https': { onCall: (_, fn) => fn, onRequest: (_, fn) => fn, HttpsError },
    'firebase-functions/v2/scheduler': { onSchedule: (_, fn) => fn },
    'firebase-functions/params': { defineSecret: () => ({ value: () => { calls.push('secret'); return 'test-only-key'; } }) },
    'firebase-admin': { initializeApp() {}, firestore() {}, auth: () => ({ getUser: async () => { calls.push('user'); return { metadata: { creationTime: '2026-01-01' }, ...user }; } }) },
    './account-deletion': { createAccountDeletion: () => ({ assertNotDeleting: async () => calls.push('account-check') }) },
    './generation-credits': { createGenerationCredits: () => ({
      balance: async (_uid, _createdAt, unlimited) => ({ balance: 1, generating: false, ...(unlimited ? { unlimited: true } : {}) }),
      reserve: async (_uid, _createdAt, _id, unlimited) => { calls.push('reserve'); if (empty && !unlimited) throw Object.assign(new Error('credits-empty'), { code: 'resource-exhausted', details: { reason: 'credits-empty' } }); },
      settle: async (_uid, _createdAt, _id, succeeded) => { calls.push(succeeded ? 'debit' : 'refund'); },
    }) },
    './itinerary-prompt': { ...prompt, buildPrompt: (...args) => { calls.push('prompt'); return prompt.buildPrompt(...args); } },
    './place-recommendations': {validateRecommendationInput:require('./place-recommendations').validateRecommendationInput,createRecommendationLimiter:()=>()=>{},createPlaceRecommendations:()=>async request=>{calls.push('recommendation');if(recommendationError)throw recommendationError;return {cityId:request.data.cityId};}},
    axios: { post: async url => {
      calls.push('ai');
      modelUrls.push(url);
      if (fail) throw fail;
      const days = responses ? responses[responseIndex++] : [{ day: 1, date: '2026-10-01', scheduleItems: [{ title: '일정' }] }];
      return { data: { candidates: [{ content: { parts: [{ text: JSON.stringify({ days }) }] } }] } };
    } },
    cors: () => () => {},
  };
  const exports = {};
  vm.runInNewContext(source, { exports, console, process: { env: {} }, require: id => Object.hasOwn(modules, id) ? modules[id] : require(id) }, { filename: 'functions/index.js' });
  return { calls, modelUrls, run: (request, auth = { uid: 'test-user', token: { auth_time: 1800000000 } }) => exports.generateItinerary({ data: { request }, auth }), getCredits: () => exports.getGenerationCredits({ auth: { uid: 'test-user', token: { auth_time: 1800000000 } } }), recommend:(auth,data={cityId:'seoul',country:'KOR',date:'2099-10-01',lang:'ko'})=>exports.recommendPlaces({data,auth,rawRequest:{ip:'fixture'}}) };
}

test('recommendation callable allows limited guest browsing and checks signed-in account identity',async()=>{
 const guest=fixture();assert.equal((await guest.recommend(null)).cityId,'seoul');assert.deepEqual(guest.calls,['recommendation']);
 const old=fixture();await assert.rejects(old.recommend({uid:'test-user',token:{auth_time:1}}),{code:'unauthenticated'});assert.deepEqual(old.calls,['account-check','user']);
});
test('recommendation callable maps quota and provider failures without exposing provider errors',async()=>{
 const limited=fixture({recommendationError:Object.assign(new Error('limited'),{code:'resource-exhausted',details:{reason:'recommendation-limit'}})});
 await assert.rejects(limited.recommend(null),{code:'resource-exhausted',details:{reason:'recommendation-limit'}});
 const exhausted=fixture({recommendationError:Object.assign(new Error('recommendation-no-new-places'),{code:'not-found',details:{reason:'recommendation-no-new-places'}})});
 await assert.rejects(exhausted.recommend(null),{code:'not-found',details:{reason:'recommendation-no-new-places'}});
 const failed=fixture({recommendationError:new Error('private provider failure')});await assert.rejects(failed.recommend(null),{code:'unavailable',message:'recommendation-unavailable'});
});
test('recommendation callable rejects malformed input before account reads or external work',async()=>{
 const app=fixture();await assert.rejects(app.recommend({uid:'test-user',token:{auth_time:1800000000}},{}),{code:'invalid-argument'});
 await assert.rejects(app.recommend({uid:'test-user',token:{auth_time:1800000000}},{cityId:'seoul',country:'KOR',date:'2099-10-01',lang:'ko',interest:'untrusted prompt'}),{code:'invalid-argument'});
 await assert.rejects(app.recommend({uid:'test-user',token:{auth_time:1800000000}},{cityId:'seoul',country:'KOR',date:'2099-10-01',lang:'ko',excludedPlaces:[{placeId:'id',displayName:'name',prompt:'injected'}]}),{code:'invalid-argument'});
 assert.deepEqual(app.calls,[]);
});

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

test('an old token cannot spend a recreated account’s starter credit', async () => {
  const app = fixture();
  await assert.rejects(app.run(valid(), { uid: 'test-user', token: { auth_time: 1 } }), { code: 'unauthenticated' });
  assert.deepEqual(app.calls, ['account-check', 'secret', 'prompt', 'user']);
});

test('valid input still passes account guard, prompt and AI exactly once', async () => {
  const app = fixture(), response = await app.run(valid());
  assert.equal(response.days.length, 1);
  assert.deepEqual(app.calls, ['account-check', 'secret', 'prompt', 'user', 'reserve', 'ai', 'debit']);
});

test('an incomplete first model retries; only a complete trip spends a credit', async () => {
  const first = { day: 1, date: '2026-10-01', scheduleItems: [{ title: '첫날' }] };
  const second = { day: 2, date: '2026-10-02', scheduleItems: [{ title: '둘째 날' }] };
  const app = fixture({ responses: [[first], [second, first]] });
  const response = await app.run(twoDays());
  assert.deepEqual(Array.from(response.days, day => day.day), [1, 2]);
  assert.deepEqual(app.calls, ['account-check', 'secret', 'prompt', 'user', 'reserve', 'ai', 'ai', 'debit']);
});

test('an empty recommendation array is valid: fixed stops are inserted by the app', async () => {
  const app = fixture({ responses: [[{ day: 1, date: '2026-10-01', scheduleItems: [] }]] });
  const response = await app.run(valid());
  assert.equal(response.days[0].scheduleItems.length, 0);
  assert.equal(app.modelUrls.length, 1);
});

test('missing, duplicate, or wrong-date days from both models refund the credit', async () => {
  const first = { day: 1, date: '2026-10-01', scheduleItems: [{ title: '첫날' }] };
  const second = { day: 2, date: '2026-10-02', scheduleItems: [{ title: '둘째 날' }] };
  for (const days of [[first], [first, first], [first, { ...second, date: '2026-10-03' }]]) {
    const app = fixture({ responses: [days, days] });
    await assert.rejects(app.run(twoDays()), { code: 'internal' });
    assert.deepEqual(app.calls, ['account-check', 'secret', 'prompt', 'user', 'reserve', 'ai', 'ai', 'refund']);
  }
});

test('model fallback and quota error mapping remain unchanged', async () => {
  const app = fixture({ fail: Object.assign(new Error('quota'), { response: { status: 429 } }) });
  await assert.rejects(app.run(valid()), { code: 'resource-exhausted' });
  assert.deepEqual(app.calls, ['account-check', 'secret', 'prompt', 'user', 'reserve', 'ai', 'ai', 'refund']);
  assert.deepEqual(app.modelUrls.map(url => url.match(/\/models\/(.*):generateContent$/)?.[1]),
    ['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite']);
});

test('empty credits stop generation before paid AI call', async () => {
  const app = fixture({ empty: true });
  await assert.rejects(app.run(valid()), error => error.code === 'resource-exhausted' && error.details.reason === 'credits-empty');
  assert.deepEqual(app.calls, ['account-check', 'secret', 'prompt', 'user', 'reserve']);
});

test('only the verified administrator email bypasses empty credits', async () => {
  const admin = fixture({ empty: true, user: { email: 'sunkyu821@gmail.com', emailVerified: true } });
  assert.equal((await admin.getCredits()).unlimited, true);
  assert.equal((await admin.run(valid())).days.length, 1);
  assert.ok(admin.calls.includes('ai'));
  for (const user of [{ email: 'sunkyu821@gmail.com', emailVerified: false }, { email: 'someone@example.com', emailVerified: true }]) {
    const app = fixture({ empty: true, user });
    assert.equal((await app.getCredits()).unlimited, undefined);
    await assert.rejects(app.run(valid()), { code: 'resource-exhausted' });
    assert.ok(!app.calls.includes('ai'));
  }
});
