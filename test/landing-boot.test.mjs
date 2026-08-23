import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stripComments, stripSourceComments } from './helpers/style-contract.mjs';

/**
 * 랜딩이 화면에 나타나기까지 무엇에 의존하는가.
 *
 * 이 앱은 첫 화면이 "빈 화면"이 되기 쉬운 구조였다 —
 *  1) `#page-home` 은 CSS 로 감춰져 있고 라우터가 켜 준다.
 *  2) 그런데 라우터(handleRouteChange)를 처음 부르는 곳이 Firebase 의
 *     onAuthStateChanged 콜백 하나뿐이었다.
 *
 * 즉 Firebase 가 답을 안 주거나(오프라인·차단·설정 오류) main.js 가
 * 뜨기 전에 터지면, 헤더만 남고 그 아래가 통째로 비어 버린다. 사용자
 * 입장에서는 "앱이 멈췄다"로 보인다.
 *
 * 랜딩은 앱에서 가장 먼저 보이는 화면이자 로그인으로 가는 유일한 문이다.
 * 바깥 서비스가 어떻든 보여야 한다.
 */
const main = stripSourceComments(readFileSync(new URL('../src/app/main.js', import.meta.url), 'utf8'));
const css = stripComments(readFileSync(new URL('../style.css', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('첫 라우팅이 Firebase 응답을 기다리지 않는다', () => {
  // 구독을 "거는 곳"(import 가 아니라 호출부) 앞에서 라우터가 한 번
  // 돌아야 한다. import 줄까지 세면 항상 통과해 버린다.
  const callIdx = main.indexOf('subscribeToAuthChanges((');
  assert.ok(callIdx > 0, 'subscribeToAuthChanges 호출부를 찾지 못했다');

  const before = main.slice(0, callIdx);
  assert.match(before, /\n\s*handleRouteChange\(\)\s*;/,
    '인증 구독보다 먼저 라우터를 한 번 돌려야 한다');
});

test('JS 가 아예 안 떠도 랜딩은 보인다', () => {
  // 기본값이 감춤이면, 스크립트가 못 뜬 순간 헤더만 남고 아래가 빈다.
  const rule = /#page-home\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, '#page-home 규칙을 찾지 못했다');
  assert.doesNotMatch(rule[1], /display\s*:\s*none/,
    '#page-home 의 기본값이 감춤이면 JS 실패가 곧 빈 화면이 된다');
  assert.doesNotMatch(html, /id="page-home"[^>]*style="[^"]*display:\s*none/,
    '마크업에서도 감춰 두면 안 된다');
});

test('랜딩이 아닌 경로에서는 첫 페인트 전에 감춘다', () => {
  // 기본값을 "보임"으로 두면 /plan 같은 딥링크에서 랜딩이 한 번 번쩍인다.
  // head 스크립트가 경로만 보고 먼저 감춘다 — Firebase 도 모듈도 필요 없다.
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /location\.pathname/, 'head 에서 경로를 보지 않는다');
  assert.match(head, /data-route/, 'head 가 경로 표시를 남기지 않는다');
  assert.match(css, /\[data-route="away"\][^{]*#page-home[^{]*\{[^}]*display\s*:\s*none/,
    '랜딩 아닌 경로에서 감추는 규칙이 없다');
});

test('/index.html 로 들어와도 로그인으로 튕기지 않는다', () => {
  // 렌더 분기에는 path.endsWith('/index.html') 이 있는데 가드 목록에는
  // 빠져 있어서, 이 주소로 들어오면 랜딩을 못 보고 로그인으로 갔다.
  // 홈으로 쳐 주는 경로 판단이 한 곳에 모여 있어야 두 곳이 갈라지지 않는다.
  assert.match(main, /const isHomePath = \(path\) =>[\s\S]{0,200}index\.html/,
    '홈 경로 판단이 한 곳에 없다');
  const guard = /if \(!user &&([\s\S]*?)\) \{/.exec(main);
  assert.ok(guard, '라우트 가드를 찾지 못했다');
  assert.match(guard[1], /isHomePath\(path\)/, '가드가 홈 경로 판단을 쓰지 않는다');
  assert.match(main, /\} else if \(isHomePath\(path\)\) \{/, '렌더 분기가 같은 판단을 쓰지 않는다');
});
