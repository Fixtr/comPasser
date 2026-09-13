import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const root = new URL('../', import.meta.url);

test('the aggregate command fails fast and includes all four verification layers', () => {
  const { scripts } = JSON.parse(read('package.json'));
  assert.equal(scripts.check, 'npm test && npm run build && npm run test:browser && npm run test:emulator');
  assert.equal(scripts.test, 'node --test test/*.test.mjs', 'keep the fast default suite');
});

test('every existing browser callback participates in the standard runner', () => {
  const spec = read('test/browser/smoke.spec.mjs');
  for (const name of readdirSync(new URL('../test/browser/', import.meta.url)).filter(name => name.endsWith('.js'))) {
    assert.ok(spec.includes(`'${name}'`), `${name} missing from CLI checks`);
    assert.equal(typeof vm.runInThisContext(`(${read('test/browser/' + name)}\n)`), 'function');
  }
});

test('browser setup rejects a remote or wrong page before resetting any storage/routes', async () => {
  const setup = vm.runInThisContext(`(${read('test/browser/refactor-smoke-setup.js')}\n)`);
  let touched = false;
  const page = { unrouteAll() { touched = true; }, url: () => 'https://example.invalid/' };
  await assert.rejects(setup({ ...page, smokeOrigin: 'https://example.invalid' }), /Local smoke origin/);
  await assert.rejects(setup({ ...page, smokeOrigin: 'http://127.0.0.1:4183' }), /isolated local page/);
  assert.equal(touched, false);
});

const localEnv = { GCLOUD_PROJECT: 'demo-hackerton-deletion', FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:19099' };
for (const [label, changes, allowed] of [
  ['correct demo + loopback', {}, true],
  ['missing project', { GCLOUD_PROJECT: '' }, false],
  ['production project', { GCLOUD_PROJECT: 'production-project' }, false],
  ['remote firestore', { FIRESTORE_EMULATOR_HOST: 'example.invalid:8080' }, false],
  ['missing auth emulator', { FIREBASE_AUTH_EMULATOR_HOST: '' }, false],
]) test(`emulator guard: ${label}`, () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import('./test/emulator/assert-local.mjs')"],
    { cwd: root, env: { ...process.env, ...localEnv, ...changes }, encoding: 'utf8' });
  assert.equal(result.status === 0, allowed, result.stderr);
});

test('every emulator test checks isolation before loading SDKs', () => {
  for (const name of readdirSync(new URL('../test/emulator/', import.meta.url)).filter(name => name.endsWith('.test.mjs'))) {
    const source = read('test/emulator/' + name);
    assert.match(source, /import '\.\/assert-local\.mjs'/);
    const sdk = source.indexOf("require('firebase-admin')");
    if (sdk !== -1) assert.ok(source.indexOf("import './assert-local.mjs'") < sdk);
  }
  const config = JSON.parse(read('firebase.test.json'));
  assert.equal(config.functions, undefined, 'do not start live function integrations');
  for (const key of ['auth', 'firestore', 'hub', 'logging']) assert.equal(config.emulators[key].host, '127.0.0.1');
});

test('CI is read-only, credential-free and never deploys', () => {
  const workflow = read('.github/workflows/checks.yml');
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /pull_request_target|secrets\.|run:.*(?:deploy|git push)/);
  assert.match(workflow, /npm ci --prefix functions/);
  for (const script of ['npm test', 'npm run build', 'npm run test:browser', 'npm run test:emulator']) assert.ok(workflow.includes(script));
  for (const [, ref] of workflow.matchAll(/uses: ([^\s]+)/g)) assert.match(ref, /^actions\/[^@]+@[a-f0-9]{40}$/);
});

test('browser installation preserves other tools cached browsers', () => {
  assert.match(read('scripts/install-test-browser.mjs'), /PLAYWRIGHT_SKIP_BROWSER_GC: '1'/);
});
