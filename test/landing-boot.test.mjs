import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stripSourceComments } from './helpers/style-contract.mjs';
import { decideRoute } from '../src/app/route-decision.mjs';

/**
 * 랜딩이 화면에 나타나기까지 무엇에 의존하는가.
 *
 * 이 앱은 첫 화면이 "빈 화면"이 되기 쉬운 구조였다 —
 *  1) `#page-home` 은 CSS 로 감춰져 있고 라우터가 켜 준다.
 *  2) 그런데 라우터(handleRouteChange)를 처음 부르는 곳이 Firebase 의
 *     onAuthStateChanged 콜백 하나뿐이었다.
 *
 * 즉 Firebase 가 답을 안 주거나(오프라인·차단·설정 오류) 앱 스크립트가
 * 뜨기 전에 터지면, 헤더만 남고 그 아래가 통째로 비어 버린다. 사용자
 * 입장에서는 "앱이 멈췄다"로 보인다. 지금 앱 층은 Ionic 셸(ionic-shell.jsx)이다.
 *
 * 랜딩은 앱에서 가장 먼저 보이는 화면이자 로그인으로 가는 유일한 문이다.
 * 바깥 서비스가 어떻든 보여야 한다.
 */
const shell = stripSourceComments(readFileSync(new URL('../src/prototype/ionic-shell.jsx', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../ionic-shell.html', import.meta.url), 'utf8');

test('첫 라우팅이 Firebase 응답을 기다리지 않는다', () => {
  // 인증 모듈은 나중에 들여오고, 라우터는 그 첫 답보다 먼저 그려져야 한다.
  assert.match(shell, /const authService = \(\) => import\(['"]\.\.\/domains\/auth\/services\/firebase-auth\.js['"]\)/,
    '인증 모듈을 지연 import 하지 않는다');
  assert.doesNotMatch(shell, /^import[^\n]*firebase-auth/m, '인증 모듈을 정적으로 들여오면 첫 화면이 그만큼 기다린다');
  const component = shell.slice(shell.indexOf('function Shell()'));
  const beforeRouter = component.slice(0, component.indexOf('<IonApp>'));
  assert.ok(beforeRouter.length > 0, 'Shell 이 라우터(IonApp)를 그리는 곳을 찾지 못했다');
  assert.doesNotMatch(beforeRouter, /if \(\s*!auth\.settled|auth\.settled\s*\?|!auth\.settled\s*&&/,
    '인증 확정 전에는 라우터를 그리지 않는다 — Firebase 가 늦으면 첫 화면이 빈다');
  assert.equal(decideRoute({ path: '/', authSettled: false }).action, 'render',
    '인증을 모르는 동안 홈이 그려지지 않는다');
});

test('JS 가 아예 안 떠도 첫 화면이 비지 않는다', () => {
  // 기본값이 감춤이면, 스크립트가 못 뜬 순간 아무것도 남지 않는다.
  const boot = /<div id="ionic-shell">\s*<div class="boot"[^>]*>[\s\S]*?ComPasser/.exec(html);
  assert.ok(boot, '정적 첫 화면(.boot) 마크업을 찾지 못했다');
  const rule = /\.boot\s*\{([^}]*)\}/.exec(html);
  assert.ok(rule, '.boot 규칙을 찾지 못했다');
  assert.doesNotMatch(rule[1], /display\s*:\s*none/, '.boot 의 기본값이 감춤이면 JS 실패가 곧 빈 화면이 된다');
  assert.doesNotMatch(boot[0], /style="[^"]*display:\s*none/, '마크업에서도 감춰 두면 안 된다');
});

test('홈 경로 판단은 route-decision.mjs 한 곳에만 있다', () => {
  // 렌더 분기와 가드가 홈 경로를 따로 판단하면, 한쪽에만 있는 주소로 들어온 사람이
  // 랜딩을 못 보고 로그인으로 간다. 규칙 자체는 route-decision.test.mjs 가 값으로 본다.
  assert.match(shell, /import \{[^}]*\bdecideRoute\b[^}]*\} from ['"]\.\.\/app\/route-decision\.mjs['"]/, '판단 모듈을 쓰지 않는다');
  assert.match(shell, /decideRoute\(\{\s*path\b/, '라우트 판단을 모듈에 맡기지 않는다');
  assert.ok(!/const isHomePath\s*=|function isHomePath\b/.test(shell), '홈 경로 판단이 셸에 다시 생겼다 — 두 곳이 갈라진다');
  assert.ok(!/if \(!user && path !== '\/login'/.test(shell), '가드가 경로 목록을 직접 들고 있다 — 목록이 두 곳에 생긴다');
});

test('/index.html 로 들어와도 홈을 그린다', () => {
  assert.match(shell, /isHomePath\(path\)|\['\/index\.html',/, '렌더 분기가 route-decision 의 홈 판단을 쓰지 않는다');
});

test('인증을 모르는 동안에는 판단을 미룬다', () => {
  // 이 줄이 없으면 공유 링크(/view/:id)로 들어온 사람이 /login 을 거쳐
  // /preference/1 로 밀려나고, 원래 가려던 주소는 사라진다.
  assert.match(shell, /useState\(\{\s*user:\s*null,\s*settled:\s*false/, '인증 확정 여부를 두지 않는다');
  assert.match(shell, /settled:\s*true/, '인증이 확정돼도 표시하지 않는다 — 라우터가 영영 기다린다');
  assert.match(shell, /authSettled\b[^;]*decideRoute|decideRoute\(\{[^}]*\bauthSettled\b/, '판단에 인증 확정 여부를 넘기지 않는다');
  assert.match(shell, /decision\.action === 'wait'/, '기다리는 갈래가 없다');
});
