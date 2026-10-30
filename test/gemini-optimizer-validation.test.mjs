import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizePlannerRequest, enforcePlannerConstraints } from '../src/domains/planner/services/planner-constraints.mjs';
import { findPlannerInputIssue, plannerValidationMessage } from '../src/domains/planner/services/planner-validation.js';
import { isValidGeneratedDays } from '../src/domains/planner/services/gemini-fallback.mjs';
import { setLang, t } from '../src/utils/i18n.js';
import { prepareGeneratedPlaces } from '../src/domains/map/services/recommendation-place.mjs';

const source = readFileSync(new URL('../src/domains/planner/services/gemini-optimizer.js', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export /gm, '');
assert.doesNotMatch(source, /^import /m);
function fixture(error, creditBalance = 2, generatedDays = [{ day: 1, scheduleItems: [] }]) {
  const calls = [], verifyOptions = [];
  const context = { normalizePlannerRequest, enforcePlannerConstraints, findPlannerInputIssue, plannerValidationMessage,
    isValidGeneratedDays, prepareGeneratedPlaces, verifyGeneratedItinerary:async (plan,options)=>{calls.push('quality');verifyOptions.push(options);return plan;}, addSelectedWaypoint: days => days,
    app: {}, getLang: () => 'en', t,
    getFunctions: () => { calls.push('functions'); return {}; },
    httpsCallable: (_functions, name) => async () => { calls.push(name === 'getGenerationCredits' ? 'credits' : 'call'); if (error) throw error;
      return { data: name === 'getGenerationCredits' ? creditBalance === 'unlimited' ? { unlimited: true } : creditBalance && typeof creditBalance === 'object' ? creditBalance : { balance: creditBalance } : { days: generatedDays } }; }, console: { log() {}, error() {} } };
  vm.createContext(context);
  const run = vm.runInContext(`${source}\ngenerateOptimizedItinerary`, context);
  const getCredits = vm.runInContext('getGenerationCredits', context);
  return { run, getCredits, calls, verifyOptions };
}
const valid = () => ({ date: '2026-10-01', startTime: '09:00', endTime: '18:00', startLocation: '서울역', endLocation: '호텔', anchorSchedules: [] });

test('multi-day generation leaves sparse gaps for measured recovery rather than inventing a visit', async () => {
  const app=fixture(null,2,[{day:1,date:'2026-10-01',scheduleItems:[]},
    {day:2,date:'2026-10-02',scheduleItems:[]}]);
  const result=await app.run({...valid(),date:['2026-10-01','2026-10-02'],
    overnightLocations:['호텔'],endLocation:'인천공항'});
  assert.deepEqual(result.days.map(day=>day.scheduleItems.filter(item=>item.placeIntent).length),[0,0]);
  assert.equal(result.days[1].scheduleItems[0].location,'호텔');
  assert.deepEqual(app.calls,['functions','call','quality']);
});

test('invalid local input stops before creating or invoking a callable and never returns mock data', async () => {
  const app = fixture();
  await assert.rejects(app.run({}));
  assert.deepEqual(app.calls, []);
});

test('server invalid-argument is a translated failure, not mock success', async () => {
  setLang('en');
  const app = fixture({ code: 'functions/invalid-argument', message: 'untrusted server text', details: { reason: 'anchor-bounds', day: 2 } });
  await assert.rejects(app.run(valid()), /\[Day 2\] A must-visit place must stay within/);
  assert.deepEqual(app.calls, ['functions', 'call']);
  setLang('ko');
});

test('unknown server validation reason gets a safe generic message', async () => {
  const app = fixture({ code: 'functions/invalid-argument', message: '<script>', details: { reason: '<script>' } });
  await assert.rejects(app.run(valid()), error => !error.message.includes('<script>'));
});

test('auth errors fail and are not offered as a retry', async () => {
  for (const code of ['functions/unauthenticated', 'functions/permission-denied']) {
    await assert.rejects(fixture({ code }).run(valid()), error => /session has expired/.test(error.message) && error.retryable !== true);
  }
});

test('AI call failures reject with a retryable message instead of a mock itinerary', async () => {
  setLang('en');
  for (const code of ['functions/internal', 'functions/unavailable', 'functions/resource-exhausted']) {
    await assert.rejects(fixture({ code, message: 'Both models failed.' }).run(valid()), error => error.retryable === true && error.message === t('generationAiFailed'));
  }
  // A timeout or a lost connection (the SDK's bare 'internal') may still finish on the server and hold the credit lease.
  for (const error of [{ code: 'functions/deadline-exceeded', message: 'deadline-exceeded' }, { code: 'functions/internal', message: 'internal' }]) {
    await assert.rejects(fixture(error).run(valid()), rejected => rejected.retryable === false && rejected.outcomeUnknown === true && rejected.message === t('generationOutcomeUnknown'));
  }
  // The server already spent the credit on a returned plan, so a broken plan is not a one-tap retry.
  await assert.rejects(fixture(null, 2, []).run(valid()), error => error.retryable === false && error.message === t('generationAiFailed'));
  setLang('ko');
});

test('generation hands its stage callback to the map verification', async () => {
  const app = fixture();
  const onStage = () => {};
  await app.run(valid(), { onStage });
  assert.equal(app.verifyOptions[0]?.onStage, onStage);
});

test('empty generation credits fail instead of returning a mock itinerary, without promising ads', async () => {
  // Rewarded ads are paused (functions/index.js), so the message must not offer them.
  await assert.rejects(fixture({ code: 'functions/resource-exhausted', details: { reason: 'credits-empty' } }).run(valid()),
    error => /No generation credits remain/.test(error.message) && !/\bads?\b/i.test(error.message));
  const source = readFileSync(new URL('../src/domains/planner/services/gemini-optimizer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /광고/);
});

test('credit balance accepts only a valid nonnegative server integer', async () => {
  assert.equal(await fixture(null, 0).getCredits(), 0);
  // A credit held by a running generation may come back on failure, so the balance is not a known zero yet.
  assert.equal(await fixture(null, { balance: 0, generating: true }).getCredits(), null);
  assert.equal(await fixture(null, 'unlimited').getCredits(), 'unlimited');
  await assert.rejects(fixture(null, -1).getCredits(), /Invalid generation credit balance/);
  await assert.rejects(fixture(null, '1').getCredits(), /Invalid generation credit balance/);
});
