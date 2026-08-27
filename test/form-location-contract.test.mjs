/**
 * 장소 검사가 소스에서 조용히 사라지지 않게 걸어 둔다.
 *
 * 이 결함이 오래 살아남은 이유는 "막는 장치가 있는 것처럼 보였기" 때문이다 —
 * 날짜·시간에는 required 가 붙어 있고, 제출 핸들러에는 검사 블록이 길게 있다.
 * 정작 장소만 그 두 그물을 다 빠져나갔다. 그물의 구멍을 소스에 명시해 둔다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stripSourceComments } from './helpers/style-contract.mjs';

const form = stripSourceComments(
  readFileSync(new URL('../src/domains/planner/ui/travel-form.js', import.meta.url), 'utf8')
);
const style = readFileSync(new URL('../src/domains/planner/ui/travel-form-style.js', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../src/utils/i18n.js', import.meta.url), 'utf8');

test('장소 칸은 커스텀 엘리먼트다 — 브라우저 기본 검사가 못 본다', () => {
  for (const id of ['start-location', 'end-location']) {
    const tag = form.match(new RegExp(`<gmp-place-autocomplete[^>]*id="${id}"[^>]*>`));
    assert.ok(tag, `${id} 를 찾지 못했다`);
    assert.ok(
      !/\brequired\b/.test(tag[0]),
      `${id} 에 required 를 붙여 뒀다 — 커스텀 엘리먼트에는 아무 효과가 없어 ` +
      `"막고 있다"는 착각만 남는다. 막는 일은 JS 가 해야 한다:\n${tag[0]}`
    );
  }
});

test('장소 검사는 순수 모듈 하나가 맡는다', () => {
  assert.match(
    form,
    /import\s*\{[^}]*findMissingLocation[^}]*\}\s*from\s*['"][^'"]*location-validation\.mjs['"]/,
    '장소 검사 모듈을 가져오지 않는다'
  );
  assert.match(form, /findMissingLocation\s*\(/, '가져오기만 하고 부르지 않는다');
});

test('빈 장소는 계획 요청을 내보내기 전에 막는다', () => {
  const submit = form.slice(form.indexOf("form.addEventListener('submit'"));
  assert.ok(submit, '제출 핸들러를 찾지 못했다');

  const check = submit.indexOf('findMissingLocation');
  const dispatch = submit.indexOf("new CustomEvent('generate-itinerary'");
  assert.ok(check !== -1, '제출 핸들러 안에서 장소를 검사하지 않는다');
  assert.ok(dispatch !== -1, 'generate-itinerary 를 쏘는 자리를 찾지 못했다');
  assert.ok(
    check < dispatch,
    '검사가 요청을 내보낸 뒤에 있다 — 막는 시늉만 하고 이미 나간 뒤다'
  );
});

test('막았으면 말로 알리고 그 칸까지 데려간다', () => {
  assert.match(
    form,
    /_revealInvalidField\([\s\S]{0,120}?t\('missingLocationError'\)/,
    '조용히 return 하면 사용자 눈에는 버튼이 죽은 것으로 보인다'
  );
});

test('막은 뒤 버튼은 다시 눌리는 상태로 돌아온다', () => {
  const submit = form.slice(form.indexOf("form.addEventListener('submit'"));
  const block = submit.slice(submit.indexOf('findMissingLocation'), submit.indexOf('findMissingLocation') + 600);
  assert.match(block, /_resetSubmitButton\(btn\)/, '버튼이 "Planning... ⏳" 로 굳는다');
  assert.match(block, /this\.isSubmitting\s*=\s*false/, '다음 제출이 통째로 막힌다');
});

test('걸린 장소 칸도 눈에 보이게 표시된다', () => {
  assert.match(
    style,
    /gmp-place-autocomplete\[aria-invalid="true"\]/,
    'input·select 에만 표시 규칙이 있다 — 장소 칸은 걸려도 아무 변화가 없다'
  );
});

test('안내 문구는 두 언어에 다 있다', () => {
  const count = (i18n.match(/missingLocationError\s*:/g) || []).length;
  assert.equal(count, 2, `missingLocationError 가 ko/en 두 곳에 있어야 한다 (지금 ${count}곳)`);
});
