import test from 'node:test';
import assert from 'node:assert/strict';

import { isValidGeneratedDays } from '../src/domains/planner/services/gemini-fallback.mjs';

test('isValidGeneratedDays rejects anything that is not a non-empty array', () => {
  assert.equal(isValidGeneratedDays([{ day: 1 }]), true);
  assert.equal(isValidGeneratedDays([]), false);
  assert.equal(isValidGeneratedDays(null), false);
  assert.equal(isValidGeneratedDays(undefined), false);
  assert.equal(isValidGeneratedDays('not-an-array'), false);
  assert.equal(isValidGeneratedDays({ days: [] }), false);
});
