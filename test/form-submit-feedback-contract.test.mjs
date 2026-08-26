/**
 * "일정 만들기를 눌렀는데 아무 일도 안 일어난다."
 *
 * 실제 브라우저에서 재현해 보니 원인이 둘이었다.
 *
 *   ① 빈 고정 일정 줄 — `+ 고정 일정 추가` 를 눌러만 보고 안 채운 줄의
 *      `required` 세 칸이 제출을 막았다. 정작 그 줄은 데이터 층에서
 *      버려지고 제출 핸들러도 건너뛴다(anchor-validation.test.mjs 참고).
 *
 *   ② 걸린 칸이 화면 밖 — 실측: 문제 칸 top 887, 화면 높이 932.
 *      브라우저는 제 할 일을 했다(`invalid` 를 쏘고 초점을 옮겼다). 다만
 *      그 칸이 접힌 아래에 있어 사용자 눈에는 아무 변화가 없었다.
 *      Shadow DOM 안에서는 기본 말풍선도 믿을 게 못 된다.
 *
 * 둘 다 "막혔다는 사실이 화면에 안 보인다"는 한 가지 결함이다.
 * 고친 자리가 조용히 되돌아가지 않게 소스에 걸어 둔다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stripSourceComments, extractInlineStyles, assertNoHardcodedColors } from './helpers/style-contract.mjs';

const form = stripSourceComments(
  readFileSync(new URL('../src/domains/planner/ui/travel-form.js', import.meta.url), 'utf8')
);
const style = readFileSync(new URL('../src/domains/planner/ui/travel-form-style.js', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../src/utils/i18n.js', import.meta.url), 'utf8');

test('고정 일정 칸에는 required 가 없다', () => {
  for (const cls of ['anchor-name', 'anchor-time', 'anchor-end-time']) {
    const tag = form.match(new RegExp(`<input[^>]*class="${cls}"[^>]*>`));
    assert.ok(tag, `${cls} 입력 칸을 찾지 못했다`);
    assert.ok(
      !/\brequired\b/.test(tag[0]),
      `${cls} 에 required 가 남아 있다 — 눌러만 본 빈 줄이 제출을 막는다:\n${tag[0]}`
    );
  }
});

test('고정 일정 검사는 순수 모듈 하나가 맡는다', () => {
  assert.match(
    form,
    /import\s*\{[^}]*findIncompleteAnchor[^}]*\}\s*from\s*['"][^'"]*anchor-validation\.mjs['"]/,
    'required 를 뗐으면 덜 찬 줄은 JS 가 잡아야 한다 — 안 그러면 조용히 버려진다'
  );
  assert.match(form, /findIncompleteAnchor\s*\(/, '가져오기만 하고 부르지 않는다');
});

test('덜 찬 줄은 조용히 버리지 않고 사용자에게 말한다', () => {
  assert.match(
    form,
    /_revealInvalidField\([\s\S]{0,80}?t\('incompleteAnchorError'\)/,
    '덜 찬 줄은 말로 알리고 그 칸까지 데려가야 한다'
  );
});

test('브라우저 검사에 걸리면 그 칸을 화면 안으로 끌어온다', () => {
  assert.match(
    form,
    /addEventListener\(\s*'invalid'[\s\S]*?\n\s*\},\s*(true|\{\s*capture:\s*true\s*\})\s*\)/,
    "invalid 는 위로 타고 오르지 않는다 — 폼에서 잡으려면 캡처 단계여야 한다"
  );
  assert.match(form, /scrollIntoView\(/, '화면 밖 칸은 스크롤해 와야 보인다');
  assert.match(form, /\.focus\(/, '초점까지 옮겨야 바로 고쳐 넣을 수 있다');
  assert.match(form, /aria-invalid/, '눈으로도 귀로도 알 수 있어야 한다');
});

test('막혔다는 말은 두 사전에 다 있다', () => {
  for (const key of ['incompleteAnchorError', 'missingFieldError']) {
    const hits = i18n.match(new RegExp(`^\\s{8}${key}\\s*:`, 'gm')) || [];
    assert.equal(hits.length, 2, `${key} 가 ko/en 두 사전에 있어야 한다 (지금 ${hits.length}곳)`);
  }
});

test('틀린 칸 표시도 무채색이다', () => {
  assert.match(style, /\[aria-invalid=["']true["']\]/, '걸린 칸을 알리는 규칙이 없다');
  assertNoHardcodedColors(style, 'travel-form-style.js');
  // extractInlineStyles 는 이미 이어 붙인 문자열을 돌려준다.
  assertNoHardcodedColors(extractInlineStyles(form), 'travel-form.js 인라인');
});
