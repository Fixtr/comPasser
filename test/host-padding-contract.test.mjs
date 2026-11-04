/**
 * 컴포넌트가 자기 안쪽 여백을 줄 수 있어야 한다.
 *
 * 사용자가 "글씨 위치가 안 맞고 빽빽하다"고 보내 준 폼 화면을 재 보니
 * `travel-form` 의 안쪽 여백이 **0** 이었다. 그런데 스타일에는 분명히
 * `:host { padding: 2rem }` 이 적혀 있었다. **한 번도 적용된 적이 없었다.**
 *
 * 원인은 옛 셸 `style.css` 의 전역 리셋이었다:
 *
 *     *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
 *
 * 이 `*` 는 커스텀 요소(= shadow 호스트)에도 걸린다. 그리고 **바깥 문서의
 * 규칙은 shadow 안의 `:host` 규칙을 이긴다**(특이도 문제가 아니라 트리 순서
 * 규칙이다). 그래서 컴포넌트가 아무리 여백을 적어도 0 으로 눌렸다.
 *
 * 눈으로는 절대 못 찾는 종류다 — 스타일 파일만 보면 멀쩡하다.
 *
 * 지금 바깥 문서의 스타일은 Ionic 셸이 들여오는 Ionic CSS 와 tokens.css,
 * ionic-shell.css 다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stripComments } from './helpers/style-contract.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const read = (path) => readFileSync(`${ROOT}${path}`, 'utf8');
const shellCss = stripComments(read('src/prototype/ionic-shell.css'));
/** ionic-shell.jsx 가 들여오는 전역 스타일 전부. */
const GLOBAL_CSS = [
  ...[...read('src/prototype/ionic-shell.jsx').matchAll(/^import '(@ionic\/react\/css\/[^']+\.css)';/gm)].map(m => `node_modules/${m[1]}`),
  'src/styles/tokens.css',
  'src/prototype/ionic-shell.css',
];
const LIGHT_DOM_JSX = ['ionic-shell', 'ionic-screens', 'home-screen', 'destination-screen',
  'ai-place-recommendations', 'country-picker', 'travel-globe'].map(name => `src/prototype/${name}.jsx`);

test('전역 리셋이 모든 요소의 padding 을 0 으로 누르지 않는다', () => {
  assert.ok(GLOBAL_CSS.length > 3, '셸이 들여오는 Ionic CSS 를 찾지 못했다');
  const offenders = [];
  for (const file of GLOBAL_CSS) {
    for (const [, selectors, body] of stripComments(read(file)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      // `*` 로 끝나는 선택자는 커스텀 요소(= shadow 호스트)에도 걸린다.
      const universal = selectors.split(',').some(sel => /(^|[\s>+~])\*(::?[a-z-]+)?$/.test(sel.trim()));
      if (universal && /(^|[;\s])padding(-[a-z]+)?\s*:/.test(body)) offenders.push(`${file}: ${selectors.trim()} {${body.trim()}}`);
    }
  }
  assert.deepEqual(offenders, [], '`* { padding: 0 }` 은 커스텀 요소의 :host 여백까지 죽인다:\n' + offenders.join('\n'));
});

test('여백이 필요한 라이트 DOM 요소는 각자 적어 둔다', () => {
  // 리셋이 padding 을 누르지 않으니, 브라우저 기본 여백이 있는 요소는 직접 정해야 한다.
  const html = read('ionic-shell.html');
  assert.ok(!/<(ul|ol|fieldset|menu)[\s>]/.test(html),
    '정적 마크업에 기본 여백이 있는 요소가 생겼다 — 여백을 직접 줘야 한다');
  for (const file of LIGHT_DOM_JSX) {
    for (const [tag, name, attrs] of read(file).matchAll(/<(ul|ol|fieldset|menu)\b([^>]*)>/g)) {
      const cls = /className="([^"]+)"/.exec(attrs)?.[1];
      assert.ok(cls, `${file}: ${tag} 에 여백을 정할 클래스가 없다`);
      const rule = new RegExp(`\\.${cls.split(/\s+/)[0]}\\s*\\{[^}]*\\bpadding\\s*:`).test(shellCss);
      assert.ok(rule, `${file}: <${name} class="${cls}"> 의 여백을 ionic-shell.css 가 정하지 않는다`);
    }
  }
});
