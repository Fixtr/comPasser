import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import vm from 'node:vm';

// Keep the checked-in MCP callbacks usable by both the CLI and manual tools.
// Only load the fixed, repository-owned filenames below; never external code.
async function scenario(name, page, testInfo) {
  const source = await readFile(new URL(name, import.meta.url), 'utf8');
  const run = vm.runInThisContext(`(${source}\n)`, { filename: name });
  return test.step(name, async () => {
    const result = await run(page);
    await testInfo.attach(name + '.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result.errors ?? []).toEqual([]);
    expect(result.findings ?? []).toEqual([]);
    return result;
  });
}

test.beforeEach(async ({ page, context, baseURL }, testInfo) => {
  page.smokeOrigin = baseURL;
  page.smokeOutputDir = testInfo.outputPath('captures');
  page.exportThemeOutputDir = page.smokeOutputDir;
  page.exportI18nOutputDir = page.smokeOutputDir;
  await mkdir(page.smokeOutputDir, { recursive: true });
  // Stable fixture dates without pausing loading/animation/debounce timers.
  await page.clock.setFixedTime(new Date('2026-09-13T03:00:00.000Z'));
  // Context guard survives setup's page.unrouteAll(), including unexpected tabs.
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL
    ? route.continue() : route.abort('blockedbyclient'));
  await context.routeWebSocket(/.*/, socket => socket.close());
  // Establish local storage origin before setup; no app or external code runs yet.
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated tests</title>' }));
  await page.goto(baseURL);
  await scenario('refactor-smoke-setup.js', page, testInfo);
});

test('generation → save/share/export → profile → account lifecycle', async ({ page }, testInfo) => {
  for (const file of ['refactor-smoke-generation.js', 'refactor-smoke-itinerary.js',
    'refactor-smoke-profile.js', 'refactor-smoke-edge-cases.js']) await scenario(file, page, testInfo);
});

for (const [title, file] of [
  ['account deletion guard and recovery', 'account-deletion-smoke.js'],
  ['image export theme isolation', 'image-export-theme-smoke.js'],
  ['image export translations', 'image-export-i18n-smoke.js'],
  ['planner draft restoration', 'planner-draft-smoke.js'],
  ['overnight connections and legacy trip editing', 'overnight-planner-smoke.js'],
  ['home recommendations through login and planning', 'home-recommendations-smoke.js'],
  ['planner input validation and retry', 'planner-validation-smoke.js'],
  ['planner autocomplete dropdown stacking', 'planner-autocomplete-layer-smoke.js'],
  ['measured transit end-time fitting', 'itinerary-end-fit-smoke.js'],
  ['four-day measured route quality and flexible visits', 'itinerary-routing-quality-smoke.js'],
  ['selected place identity persistence', 'selected-place-smoke.js'],
  ['recommended place verification and persistence', 'recommendation-place-smoke.js'],
  ['partial route fitting and immutable saved times', 'time-snapshot-smoke.js'],
  ['selected place replacement and persistence', 'place-replacement-smoke.js'],
  ['opening-hours conflict and unknown information', 'itinerary-hours-smoke.js'],
  ['backtracking suggestion, confirmation and persistence', 'route-order-smoke.js'],
  ['visit time editing and earliest-start preservation', 'visit-time-smoke.js'],
  ['shared source deletion hides content and preserves independent copies', 'shared-deletion-smoke.js'],
  ['measured transit is authoritative over AI prose and fare', 'transit-authority-smoke.js'],
]) test(title, async ({ page }, testInfo) => { await scenario(file, page, testInfo); });
