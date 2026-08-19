import test from 'node:test';
import assert from 'node:assert/strict';

import { findPastDate, todayString, toLocalDateString } from '../src/domains/planner/services/trip-date.mjs';

// 로컬 시간 기준. UTC 로 바꾸면 자정 근처에서 하루가 밀린다.
const at = (iso) => new Date(iso);

test('today and future dates pass', () => {
  const now = at('2026-08-20T10:00:00');
  assert.equal(findPastDate('2026-08-20', now), null, '오늘은 허용');
  assert.equal(findPastDate('2026-08-21', now), null);
  assert.equal(findPastDate(['2026-08-20', '2026-08-22'], now), null);
});

test('a past date is reported, and the first one wins', () => {
  const now = at('2026-08-20T10:00:00');
  assert.equal(findPastDate('2026-08-19', now), '2026-08-19');
  assert.equal(findPastDate(['2026-08-21', '2026-08-18', '2026-08-01'], now), '2026-08-18');
});

test('a date is still valid late on the same day', () => {
  // 23:59 에 제출해도 그날 일정은 과거가 아니다.
  assert.equal(findPastDate('2026-08-20', at('2026-08-20T23:59:59')), null);
  // 자정을 넘기면 어제가 된다 — 탭을 열어둔 채 넘어가는 실제 상황.
  assert.equal(findPastDate('2026-08-20', at('2026-08-21T00:00:01')), '2026-08-20');
});

test('malformed or empty values are ignored (other validation covers them)', () => {
  const now = at('2026-08-20T10:00:00');
  assert.equal(findPastDate([null, undefined, '', '   ', 'abc', '2026/08/19'], now), null);
  assert.equal(findPastDate(null, now), null);
  assert.equal(findPastDate([], now), null);
});

test('local date formatting does not drift near midnight', () => {
  // UTC 변환을 쓰면 KST 기준 자정 직후가 전날로 밀린다.
  assert.equal(toLocalDateString(at('2026-08-20T00:10:00')), '2026-08-20');
  assert.equal(toLocalDateString(at('2026-08-20T23:50:00')), '2026-08-20');
  assert.equal(todayString(at('2026-01-05T09:00:00')), '2026-01-05', '한 자리 월/일은 0으로 채운다');
});
