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
function fixture(error) {
  const calls = [];
  const context = { normalizePlannerRequest, enforcePlannerConstraints, findPlannerInputIssue, plannerValidationMessage,
    buildMockItinerary, isValidGeneratedDays, prepareGeneratedPlaces, app: {}, getLang: () => 'en',
    getFunctions: () => { calls.push('functions'); return {}; },
    httpsCallable: () => async () => { calls.push('call'); if (error) throw error;
      return { data: { days: [{ day: 1, scheduleItems: [] }] } }; }, console: { log() {}, error() {} } };
  vm.createContext(context);
  const run = vm.runInContext(`${source}\ngenerateOptimizedItinerary`, context);
  return { run, calls };
}
const valid = () => ({ date: '2026-10-01', startTime: '09:00', endTime: '18:00', startLocation: '서울역', endLocation: '호텔', anchorSchedules: [] });

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
