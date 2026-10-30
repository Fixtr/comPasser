import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/domains/itinerary/ui/itinerary-style.js', import.meta.url), 'utf8');
const rule = selector => new RegExp(`${selector.replace(/[.:]/g, m => `\\${m}`)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

test('result day actions are neutral buttons, not warnings, and look disabled when disabled', () => {
  // Every new result shows them; the warning colour read as if the plan had a problem.
  assert.doesNotMatch(rule('.end-time-fix-btn'), /--cp-warn/);
  assert.doesNotMatch(rule('.end-time-fix-btn:hover'), /--cp-warn/);
  assert.match(rule('.end-time-fix-btn:disabled'), /opacity\s*:\s*\.5/);
  assert.match(rule('.end-time-fix-btn:disabled'), /cursor\s*:\s*not-allowed/);
});

test('a hidden insert button stays hidden on touch screens, where an author display rule beats [hidden]', () => {
  assert.match(css, /\.insert-slot-btn\[hidden\][^{]*\{\s*display:\s*none/);
});
