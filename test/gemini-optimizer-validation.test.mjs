import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizePlannerRequest, enforcePlannerConstraints } from '../src/domains/planner/services/planner-constraints.mjs';
import { findPlannerInputIssue, plannerValidationMessage } from '../src/domains/planner/services/planner-validation.js';
import { buildMockItinerary, isValidGeneratedDays } from '../src/domains/planner/services/gemini-fallback.mjs';
import { setLang } from '../src/utils/i18n.js';
import { prepareGeneratedPlaces } from '../src/domains/map/services/recommendation-place.mjs';

const source = readFileSync(new URL('../src/domains/planner/services/gemini-optimizer.js', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export /gm, '');
assert.doesNotMatch(source, /^import /m);
function fixture(error, creditBalance = 2, generatedDays = [{ day: 1, scheduleItems: [] }]) {
  const calls = [];
  const context = { normalizePlannerRequest, enforcePlannerConstraints, findPlannerInputIssue, plannerValidationMessage,
    buildMockItinerary, isValidGeneratedDays, prepareGeneratedPlaces, verifyGeneratedItinerary:async plan=>{calls.push('quality');return plan;}, addSelectedWaypoint: days => days,
    app: {}, getLang: () => 'en',
    getFunctions: () => { calls.push('functions'); return {}; },
    httpsCallable: (_functions, name) => async () => { calls.push(name === 'getGenerationCredits' ? 'credits' : 'call'); if (error) throw error;
      return { data: name === 'getGenerationCredits' ? creditBalance === 'unlimited' ? { unlimited: true } : { balance: creditBalance } : { days: generatedDays } }; }, console: { log() {}, error() {} } };
  vm.createContext(context);
  const run = vm.runInContext(`${source}\ngenerateOptimizedItinerary`, context);
  const getCredits = vm.runInContext('getGenerationCredits', context);
  return { run, getCredits, calls };
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
  await assert.rejects(app.run(valid()), /\[Day 2\] An anchor must stay within/);
  assert.deepEqual(app.calls, ['functions', 'call']);
  setLang('ko');
});

test('unknown server validation reason gets a safe generic message', async () => {
  const app = fixture({ code: 'functions/invalid-argument', message: '<script>', details: { reason: '<script>' } });
  await assert.rejects(app.run(valid()), error => !error.message.includes('<script>'));
});

test('auth errors still fail; network/quota errors still yield marked fallback results', async () => {
  for (const code of ['functions/unauthenticated', 'functions/permission-denied']) {
    await assert.rejects(fixture({ code }).run(valid()), /session has expired/);
  }
  for (const code of ['functions/unavailable', 'functions/resource-exhausted']) {
    const result = await fixture({ code }).run(valid());
    assert.equal(result.isFallback, true);
    assert.equal(result.fallbackReason, code.endsWith('resource-exhausted') ? 'quota' : 'error');
  }
});

test('empty generation credits fail instead of returning a mock itinerary', async () => {
  await assert.rejects(fixture({ code: 'functions/resource-exhausted', details: { reason: 'credits-empty' } }).run(valid()), /No generation credits remain/);
});

test('credit balance accepts only a valid nonnegative server integer', async () => {
  assert.equal(await fixture(null, 0).getCredits(), 0);
  assert.equal(await fixture(null, 'unlimited').getCredits(), 'unlimited');
  await assert.rejects(fixture(null, -1).getCredits(), /Invalid generation credit balance/);
  await assert.rejects(fixture(null, '1').getCredits(), /Invalid generation credit balance/);
});
