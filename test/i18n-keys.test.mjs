/**
 * 두 사전이 같은 열쇠 꾸러미를 갖고 있어야 한다.
 *
 * `t()` 는 없는 키를 만나면 **키 이름을 그대로 돌려준다**:
 *
 *     export function t(key) { return dictionary[currentLang]?.[key] || key; }
 *
 * 그래서 이 저장소에 흔한 `t('someKey') || '한국어 기본값'` 은 **한 번도
 * 동작하지 않는다** — `t()` 가 빈 값을 주는 일이 없으니 `||` 뒤는 죽은 코드고,
 * 화면에는 `someKey` 라는 글자가 그대로 뜬다. 실제로 일정 시트의 손잡이에
 * "sheetExpand" 가 찍혀 있는 것을 렌더로 확인하다 잡았다.
 *
 * 사람이 눈치채기 어려운 실수라(영어로 화면을 볼 일이 드물다) 검사로 막는다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/utils/i18n.js', import.meta.url), 'utf8');

/** `ko:` / `en:` 블록의 키만 뽑는다(중첩 없는 평평한 사전이다). */
function keysOf(lang) {
  const start = source.indexOf(`\n    ${lang}: {`);
  assert.ok(start >= 0, `${lang} 사전을 찾지 못했다`);
  let i = source.indexOf('{', start);
  let depth = 0;
  let end = i;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    else if (source[end] === '}') { depth -= 1; if (depth === 0) break; }
  }
  const body = source.slice(i, end);
  return [...body.matchAll(/^\s{8}([a-zA-Z0-9_]+)\s*:/gm)].map(m => m[1]);
}

const ko = keysOf('ko');
const en = keysOf('en');

test('두 사전이 비어 있지 않다', () => {
  assert.ok(ko.length > 50, `ko 키가 ${ko.length}개뿐이다`);
  assert.ok(en.length > 50, `en 키가 ${en.length}개뿐이다`);
});

test('한쪽에만 있는 키가 없다', () => {
  const onlyKo = ko.filter(k => !en.includes(k));
  const onlyEn = en.filter(k => !ko.includes(k));
  assert.deepEqual(onlyKo, [], '영어 사전에 빠진 키 — 그 화면엔 키 이름이 그대로 뜬다:\n' + onlyKo.join('\n'));
  assert.deepEqual(onlyEn, [], '한국어 사전에 빠진 키:\n' + onlyEn.join('\n'));
});

test('같은 키를 두 번 적지 않았다', () => {
  for (const [lang, keys] of [['ko', ko], ['en', en]]) {
    const seen = new Set();
    const dup = keys.filter(k => (seen.has(k) ? true : (seen.add(k), false)));
    assert.deepEqual(dup, [], `${lang}: 뒤에 적은 값이 앞을 덮는다 — ${dup.join(', ')}`);
  }
});

test('시트 손잡이 문구가 두 사전에 있다', () => {
  for (const key of ['sheetExpand', 'sheetCollapse']) {
    assert.ok(ko.includes(key), `ko 에 ${key} 가 없다`);
    assert.ok(en.includes(key), `en 에 ${key} 가 없다`);
  }
});
