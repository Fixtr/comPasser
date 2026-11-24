// 스펙 9: only route shapes reach analytics. Ids, tokens, query strings and hashes never do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { analyticsPagePath } from '../src/app/analytics-path.mjs';

// The shell's own route table, so a route added there is covered here without a second list.
const shell = readFileSync(new URL('../src/prototype/ionic-shell.jsx', import.meta.url), 'utf8');
const table = shell.slice(shell.indexOf('const pages = ['), shell.indexOf('];', shell.indexOf('const pages = [')));
const routes = [...table.matchAll(/\['(\/[^']*)',/g)].map(match => match[1]);

test('the shell route table was read', () => {
  assert.ok(routes.length >= 20, routes.join());
  for (const path of ['/', '/view/:id', '/share/:id', '/verify', '/account-deletion-status', '/courses']) assert.ok(routes.includes(path), path);
});

test('only /view and /share carry an id in the path', () => {
  assert.deepEqual(routes.filter(path => path.includes(':')), ['/view/:id', '/share/:id']);
});

test('static routes are sent as they are', () => {
  for (const path of routes.filter(path => !path.includes(':'))) assert.equal(analyticsPagePath(path, routes), path);
});

test('trip and share ids are masked', () => {
  assert.equal(analyticsPagePath('/view/AbC123xyz', routes), '/view/:id');
  assert.equal(analyticsPagePath('/share/AbC123xyz', routes), '/share/:id');
  assert.equal(analyticsPagePath('/share/AbC123xyz/', routes), '/share/:id');
  // An id the app itself rejects is still not sent.
  assert.equal(analyticsPagePath('/view/한글 id', routes), '/view/:id');
});

test('query strings and hashes are dropped', () => {
  assert.equal(analyticsPagePath('/verify?mode=resetPassword&oobCode=SECRET', routes), '/verify');
  assert.equal(analyticsPagePath('/account-deletion-status?receipt=SECRET#SECRET', routes), '/account-deletion-status');
  assert.equal(analyticsPagePath('/courses?country=KOR&city=busan&review=SECRET', routes), '/courses');
  assert.equal(analyticsPagePath('/share/SECRET?next=/view/SECRET#SECRET', routes), '/share/:id');
});

test('an address outside the route table is one fixed name', () => {
  for (const path of ['/nope', '/view/a/b', '/verify/SECRET', '/account-deletion-status/SECRET', '/reset/SECRET', '/profile/SECRET', '', null, undefined]) {
    assert.equal(analyticsPagePath(path, routes), '/not-found', String(path));
  }
});

test('nothing from the address survives masking', () => {
  for (const path of ['/view/SECRET', '/share/SECRET', '/x/SECRET', '/SECRET', '/verify?oobCode=SECRET', '/home#SECRET']) {
    assert.ok(!analyticsPagePath(path, routes).includes('SECRET'), path);
  }
});
