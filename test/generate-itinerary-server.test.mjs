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
function fixture({ fail, empty = false, responses, user = {}, recommendationError, socialProfile } = {}) {
  const calls = [];
  const modelUrls = [];
  const recovered = new Map();
  let responseIndex = 0;
  class HttpsError extends Error {
    constructor(code, message, details) { super(message); Object.assign(this, { code, details }); }
  }
  const modules = {
    'firebase-functions': { https: { onRequest: fn => fn }, logger: { info() {}, warn() {} } },
    'firebase-functions/v2/https': { onCall: (_, fn) => fn, onRequest: (_, fn) => fn, HttpsError },
    'firebase-functions/v2/scheduler': { onSchedule: (_, fn) => fn },
    'firebase-functions/params': { defineSecret: () => ({ value: () => { calls.push('secret'); return 'test-only-key'; } }) },
    'firebase-admin': { initializeApp() {}, firestore() {}, auth: () => ({ getUser: async () => { calls.push('user'); return { metadata: { creationTime: '2026-01-01' }, ...user }; }, createCustomToken: async uid => { calls.push(`token:${uid}`); return 'custom-token'; } }) },
    './account-deletion': { createAccountDeletion: () => ({ assertNotDeleting: async () => calls.push('account-check') }) },
    './generation-credits': { generationRecovery: require('./generation-credits').generationRecovery, createGenerationCredits: () => ({
      balance: async (_uid, _createdAt, unlimited) => ({ balance: 1, generating: false, ...(unlimited ? { unlimited: true } : {}) }),
      reserve: async (_uid, _createdAt, _id, unlimited, recovery) => {
        calls.push('reserve');
        if (recovered.has(recovery?.id)) return recovered.get(recovery.id);
        if (empty && !unlimited) throw Object.assign(new Error('credits-empty'), { code: 'resource-exhausted', details: { reason: 'credits-empty' } });
        return null;
      },
      settle: async (_uid, _createdAt, _id, succeeded, recovery, resultJson) => {
        calls.push(succeeded ? 'debit' : 'refund');
        if (succeeded && recovery) recovered.set(recovery.id, JSON.parse(resultJson));
        return true;
      },
    }) },
    './itinerary-prompt': { ...prompt, buildPrompt: (...args) => { calls.push('prompt'); return prompt.buildPrompt(...args); } },
    './place-recommendations': {validateRecommendationInput:require('./place-recommendations').validateRecommendationInput,createRecommendationLimiter:()=>()=>{},createPlaceRecommendations:()=>async request=>{calls.push('recommendation');if(recommendationError)throw recommendationError;return {cityId:request.data.cityId};}},
    axios: { get: async () => { if (socialProfile instanceof Error) throw socialProfile; return { data: socialProfile }; }, post: async url => {
      calls.push('ai');
      modelUrls.push(url);
      if (fail) throw fail;
      const days = responses ? responses[responseIndex++] : [{ day: 1, date: '2026-10-01', scheduleItems: [{ title: '일정' }] }];
      return { data: { candidates: [{ content: { parts: [{ text: JSON.stringify({ days }) }] } }] } };
    } },
    cors: () => (_req, _res, next) => next(),
  };
  const exports = {};
  vm.runInNewContext(source, { exports, console, Buffer, process: { env: {} }, require: id => Object.hasOwn(modules, id) ? modules[id] : require(id) }, { filename: 'functions/index.js' });
  return { calls, modelUrls,
    recover: (request, requestId) => exports.generateItinerary({ data: { recoverableRequest: request, requestId },
      auth: { uid: 'test-user', token: { auth_time: 1800000000 } } }),
    run: (request, auth = { uid: 'test-user', token: { auth_time: 1800000000 } }) => exports.generateItinerary({ data: { request }, auth }), getCredits: () => exports.getGenerationCredits({ auth: { uid: 'test-user', token: { auth_time: 1800000000 } } }), recommend:(auth,data={cityId:'seoul',country:'KOR',date:'2099-10-01',lang:'ko'})=>exports.recommendPlaces({data,auth,rawRequest:{ip:'fixture'}}),
    social: provider => new Promise(resolve => exports.verifySocialToken({ body: { data: { provider, token: 'social-token' } } }, { status: code => ({ send: body => resolve({ code, body }) }) })) };
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
  assert.deepEqual(app.calls, ['account-check', 'user']);
});

test('valid input still passes account guard, prompt and AI exactly once', async () => {
  const app = fixture(), response = await app.run(valid());
  assert.equal(response.days.length, 1);
  assert.deepEqual(app.calls, ['account-check', 'user', 'reserve', 'secret', 'prompt', 'ai', 'debit']);
});

test('an incomplete first model retries; only a complete trip spends a credit', async () => {
  const first = { day: 1, date: '2026-10-01', scheduleItems: [{ title: '첫날' }] };
  const second = { day: 2, date: '2026-10-02', scheduleItems: [{ title: '둘째 날' }] };
  const app = fixture({ responses: [[first], [second, first]] });
  const response = await app.run(twoDays());
  assert.deepEqual(Array.from(response.days, day => day.day), [1, 2]);
  assert.deepEqual(app.calls, ['account-check', 'user', 'reserve', 'secret', 'prompt', 'ai', 'ai', 'debit']);
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
    assert.deepEqual(app.calls, ['account-check', 'user', 'reserve', 'secret', 'prompt', 'ai', 'ai', 'refund']);
  }
});

test('model fallback and quota error mapping remain unchanged', async () => {
  const app = fixture({ fail: Object.assign(new Error('quota'), { response: { status: 429 } }) });
  await assert.rejects(app.run(valid()), { code: 'resource-exhausted' });
  assert.deepEqual(app.calls, ['account-check', 'user', 'reserve', 'secret', 'prompt', 'ai', 'ai', 'refund']);
  assert.deepEqual(app.modelUrls.map(url => url.match(/\/models\/(.*):generateContent$/)?.[1]),
    ['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite']);
});

test('empty credits stop generation before paid AI call', async () => {
  const app = fixture({ empty: true });
  await assert.rejects(app.run(valid()), error => error.code === 'resource-exhausted' && error.details.reason === 'credits-empty');
  assert.deepEqual(app.calls, ['account-check', 'user', 'reserve']);
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

test('social login issues a token only for a provider profile with an id', async () => {
  const kakao = fixture({ socialProfile: { id: 42, properties: { nickname: 'traveler' } } });
  const ok = await kakao.social('kakao');
  assert.equal(ok.code, 200);
  assert.equal(ok.body.data.customToken, 'custom-token');
  assert.ok(kakao.calls.includes('token:kakao:42'));

  // Without an id every such caller would share one real account named kakao:undefined.
  for (const [provider, socialProfile] of [['kakao', {}], ['naver', { resultcode: '024', message: 'Authentication failed' }], ['naver', { resultcode: '00', response: {} }]]) {
    const app = fixture({ socialProfile });
    const { code, body } = await app.social(provider);
    assert.equal(code, 500, provider);
    assert.equal(body.data.error, '소셜 계정 정보를 확인할 수 없습니다.', provider);
    assert.ok(!app.calls.some(call => call.startsWith('token:')), provider);
  }

  // Provider/library errors carry internal detail (URLs, status text); the client gets a fixed message.
  const down = await fixture({ socialProfile: new Error('connect ECONNREFUSED 10.0.0.1:443 kapi.kakao.com') }).social('kakao');
  assert.equal(down.code, 500);
  assert.equal(down.body.data.error, '소셜 로그인을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  const unsupported = await fixture().social('google');
  assert.equal(unsupported.body.data.error, "지원하지 않는 소셜 로그인 플랫폼입니다. ('kakao' 또는 'naver' 만 가능)");
});


test('email verification is required before allocating resources for a password sign-in', async () => {
  const auth = sign_in_provider => ({ uid: 'test-user', token: { auth_time: 1800000000, firebase: { sign_in_provider } } });
  const unverified = fixture({ user: { emailVerified: false } });
  await assert.rejects(unverified.run(valid(), auth('password')),
    error => error.code === 'permission-denied' && error.details.reason === 'email-not-verified');
  assert.deepEqual(unverified.calls, ['account-check', 'user']);
  const verified = fixture({ user: { emailVerified: true } });
  assert.equal((await verified.run(valid(), auth('password'))).days.length, 1);
  const social = fixture({ user: { emailVerified: false } });
  assert.equal((await social.run(valid(), auth('custom'))).days.length, 1);
});

test('an identical recovery request returns the committed result without a second model call', async () => {
  const app = fixture();
  const id = `${Date.now()}.50ac3d3c-e8e6-420c-8133-c249c483382c`;
  const first = await app.recover(valid(), id);
  const retry = await app.recover(valid(), id);
  assert.equal(JSON.stringify(retry), JSON.stringify(first));
  assert.deepEqual(app.calls, ['account-check', 'user', 'reserve', 'secret', 'prompt', 'ai', 'debit',
    'account-check', 'user', 'reserve']);
});
