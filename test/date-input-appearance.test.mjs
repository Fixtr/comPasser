import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// iOS Safari keeps native date and time fields content-box whatever the page says, so a padded
// width: 100% field overflows by its padding. Chromium never shows this, so the rule itself is the check.
for (const [file, selector] of [
  ['src/prototype/ionic-shell.css', /\.ai-place-controls input \{[^}]*appearance: none/],
  ['src/domains/planner/ui/travel-form-style.js', /input:is\(\[type="date"\], \[type="time"\]\) \{[^}]*appearance: none/],
]) {
  test(`${file} removes the native look from date fields`, () => {
    assert.match(readFileSync(file, 'utf8'), selector);
  });
}
