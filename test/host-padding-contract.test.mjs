/**
 * 컴포넌트가 자기 안쪽 여백을 줄 수 있어야 한다.
 *
 * 사용자가 "글씨 위치가 안 맞고 빽빽하다"고 보내 준 폼 화면을 재 보니
 * `travel-form` 의 안쪽 여백이 **0** 이었다. 그런데 스타일에는 분명히
 * `:host { padding: 2rem }` 이 적혀 있었다. **한 번도 적용된 적이 없었다.**
 *
 * 원인은 `style.css` 의 전역 리셋이다:
 *
 *     *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
 *
 * 이 `*` 는 커스텀 요소(= shadow 호스트)에도 걸린다. 그리고 **바깥 문서의
 * 규칙은 shadow 안의 `:host` 규칙을 이긴다**(특이도 문제가 아니라 트리 순서
 * 규칙이다). 그래서 컴포넌트가 아무리 여백을 적어도 0 으로 눌렸다.
 *
 * 눈으로는 절대 못 찾는 종류다 — 스타일 파일만 보면 멀쩡하다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stripComments } from './helpers/style-contract.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const css = stripComments(readFileSync(`${ROOT}style.css`, 'utf8'));

test('전역 리셋이 모든 요소의 padding 을 0 으로 누르지 않는다', () => {
  const reset = /\*,\s*\*::before,\s*\*::after\s*\{([^}]*)\}/.exec(css);
  assert.ok(reset, '전역 리셋을 찾지 못했다');
  assert.ok(
    !/\bpadding\s*:/.test(reset[1]),
    '`* { padding: 0 }` 은 커스텀 요소의 :host 여백까지 죽인다:\n' + reset[1].trim()
  );
});

test('여백이 필요한 라이트 DOM 요소는 각자 적어 둔다', () => {
  // 리셋에서 padding 을 뺐으니, 브라우저 기본 여백이 있는 요소는 직접 정해야
  // 한다. 이 앱의 라이트 DOM 에는 목록도 fieldset 도 없고 버튼뿐이다.
  const html = readFileSync(`${ROOT}index.html`, 'utf8');
  assert.ok(!/<(ul|ol|fieldset|menu)[\s>]/.test(html),
    '기본 여백이 있는 요소가 생겼다 — 리셋에서 뺀 padding 을 여기에 직접 줘야 한다');
});
