/**
 * 고정 일정 한 줄이 "비었나 / 덜 찼나 / 다 찼나".
 *
 * 왜 이 판단을 따로 두는가: 지금까지 세 층이 서로 다른 말을 하고 있었다.
 *
 *   ① travel-form-data.js — `.filter(a => a.name || a.time || ...)` 로
 *      아무것도 안 채운 줄은 **아예 버린다**.
 *   ② travel-form.js 제출 핸들러 — `if (!anchor.time || !anchor.endTime) continue;`
 *      덜 찬 줄은 **건너뛴다**.
 *   ③ 마크업 — `.anchor-name`/`.anchor-time`/`.anchor-end-time` 에 `required`.
 *      브라우저가 **제출 자체를 막는다**.
 *
 * ①②는 "빈 줄은 없는 셈"이라는데 ③만 반대다. `+ 고정 일정 추가` 를 눌러만 보고
 * 안 채운 사용자에게는 버튼이 죽은 것처럼 보인다 — 화면에는 아무 일도 안 일어난다.
 * 세 층이 한 곳을 보게 만든다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isAnchorBlank,
  missingAnchorFields,
  findIncompleteAnchor
} from '../src/domains/planner/services/anchor-validation.mjs';

const full = { name: '아지노야 본점', time: '13:00', endTime: '14:30', location: '아자부주반', day: 1 };

test('아무것도 안 채운 줄은 없는 셈 친다', () => {
  assert.equal(isAnchorBlank({ name: '', time: '', endTime: '', location: '', day: 1 }), true);
  assert.deepEqual(missingAnchorFields({ name: '', time: '', endTime: '', location: '' }), []);
});

test('공백만 친 줄도 빈 줄이다', () => {
  assert.equal(isAnchorBlank({ name: '   ', time: '', endTime: '', location: '  ' }), true);
});

test('day 는 기본값이 늘 들어 있어 채웠다는 근거가 못 된다', () => {
  // <select class="anchor-day"> 는 첫 옵션이 자동 선택된다. 이것까지 세면
  // 모든 줄이 "채워진 줄"이 되어 빈 줄이라는 개념이 사라진다.
  assert.equal(isAnchorBlank({ name: '', time: '', endTime: '', location: '', day: 3 }), true);
});

test('한 칸이라도 채우면 나머지를 요구한다', () => {
  assert.equal(isAnchorBlank({ ...full, time: '', endTime: '', location: '' }), false);
  assert.deepEqual(
    missingAnchorFields({ name: '아지노야 본점', time: '', endTime: '', location: '' }),
    ['time', 'endTime']
  );
});

test('장소만 채운 줄도 이름과 시간을 요구한다', () => {
  assert.deepEqual(
    missingAnchorFields({ name: '', time: '', endTime: '', location: '아자부주반' }),
    ['name', 'time', 'endTime']
  );
});

test('다 채운 줄은 요구할 것이 없다', () => {
  assert.deepEqual(missingAnchorFields(full), []);
  assert.equal(findIncompleteAnchor([full]), null);
});

test('장소는 비어 있어도 된다', () => {
  // 마크업에도 required 가 없다 — 이름과 시간만 있으면 계획을 세울 수 있다.
  assert.deepEqual(missingAnchorFields({ ...full, location: '' }), []);
});

test('시간 미정 방문지는 이름과 위치를 요구하고 시간은 요구하지 않는다', () => {
  const flexible = { name: '서울숲', location: '서울숲, 서울 성동구 뚝섬로 273', flexible: true };
  assert.equal(isAnchorBlank(flexible), false);
  assert.deepEqual(missingAnchorFields(flexible), []);
  assert.deepEqual(missingAnchorFields({ ...flexible, location: '' }), ['location']);
  assert.deepEqual(missingAnchorFields({ name: '', location: '서울숲', flexible: true }), ['name']);
});

test('추가만 하고 안 채운 시간 미정 줄도 빈 줄이다', () => {
  // 길 안내 흐름은 새 줄을 시간 미정으로 연다. 그 체크만으로 "손댄 줄"이 되면 안 된다.
  assert.equal(isAnchorBlank({ name: '', time: '', endTime: '', location: '', flexible: true }), true);
  assert.equal(findIncompleteAnchor([{ name: ' ', location: '', flexible: true }]), null);
  // 시간 미정 줄의 시간 칸은 꺼져 있어 읽지 않는다 — 남은 값으로 채운 줄이 되지 않는다.
  assert.equal(isAnchorBlank({ name: '', time: '10:00', endTime: '11:00', location: '', flexible: true }), true);
});

test('첫 번째 덜 찬 줄과 그 줄의 첫 빈 칸을 집어 준다', () => {
  const found = findIncompleteAnchor([
    full,
    { name: '팀랩 보더리스', time: '', endTime: '', location: '' },
    { name: '', time: '18:00', endTime: '', location: '' }
  ]);
  assert.deepEqual(found, { index: 1, field: 'time', missing: ['time', 'endTime'] });
});

test('빈 줄은 건너뛰고 그 뒤의 덜 찬 줄을 집는다', () => {
  const found = findIncompleteAnchor([
    { name: '', time: '', endTime: '', location: '' },
    { name: '', time: '18:00', endTime: '', location: '' }
  ]);
  // 줄 번호는 사용자가 화면에서 보는 자리여야 하므로 빈 줄도 세어 둔다.
  assert.equal(found.index, 1);
  assert.equal(found.field, 'name');
});

test('빈 줄만 있으면 제출을 막지 않는다', () => {
  assert.equal(findIncompleteAnchor([
    { name: '', time: '', endTime: '', location: '' },
    { name: '', time: '', endTime: '', location: '' }
  ]), null);
});

test('줄이 없거나 배열이 아니어도 터지지 않는다', () => {
  assert.equal(findIncompleteAnchor([]), null);
  assert.equal(findIncompleteAnchor(undefined), null);
  assert.equal(findIncompleteAnchor(null), null);
  assert.equal(isAnchorBlank(null), true);
  assert.deepEqual(missingAnchorFields(null), []);
});
