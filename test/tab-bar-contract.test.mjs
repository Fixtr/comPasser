/**
 * 하단 탭바의 모양 계약.
 *
 * 새 화면 요소를 들일 때마다 같은 것을 확인한다 — 색은 지도 마커 규칙에만,
 * 모서리는 각지게, 그림자는 없이, 손가락이 닿는 크기로. 여기에 이 요소만의
 * 조건이 둘 붙는다: **엄지 영역**에 있으니 홈 인디케이터를 피해야 하고
 * (safe-area), **본문을 가리면 안 된다**(그만큼 아래 여백).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  stripComments, assertNoShadows, assertNoGradients, assertNoHardcodedColors,
  assertNoNamedColors, assertNoModernColorFunctions, assertSquareRadius,
  assertNoLegacyTokens,
} from './helpers/style-contract.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const html = readFileSync(`${ROOT}index.html`, 'utf8');
const css = stripComments(readFileSync(`${ROOT}style.css`, 'utf8'));
const tokens = readFileSync(`${ROOT}src/styles/tokens.css`, 'utf8');
const main = readFileSync(`${ROOT}src/app/main.js`, 'utf8');

/** style.css 에서 탭바에 해당하는 규칙만. */
const tabCss = css
  .split(/\n(?=[.#@:a-zA-Z])/)
  .filter(block => /tab-bar|has-tab-bar/.test(block))
  .join('\n');

test('탭바 규칙이 실제로 있다', () => {
  assert.ok(tabCss.length > 100, 'style.css 에 탭바 규칙이 없다');
});

test('탭바도 같은 형태 규칙을 지킨다', () => {
  assertNoShadows(tabCss, '탭바');
  assertNoGradients(tabCss, '탭바');
  assertNoHardcodedColors(tabCss, '탭바');
  assertNoNamedColors(tabCss, '탭바');
  assertNoModernColorFunctions(tabCss, '탭바');
  assertSquareRadius(tabCss, '탭바', tokens);
  assertNoLegacyTokens(tabCss, '탭바');
});

test('고른 탭은 색이 아니라 잉크 반전으로 말한다', () => {
  // 이 앱에서 색은 지도 마커 규칙(보라=고정 일정/초록=첫 장소/파랑=나머지)에만
  // 쓴다. 선택을 색으로 말하면 그 색이 두 가지 뜻을 갖는다.
  const active = tabCss.split(/\n(?=[.#@:a-zA-Z])/).find(b => /\[aria-current/.test(b));
  assert.ok(active, '현재 탭을 알리는 규칙이 없다');
  assert.match(active, /background:\s*var\(--cp-ink\)/);
  assert.match(active, /color:\s*var\(--cp-surface\)/);
});

test('엄지가 닿는 크기이고 홈 인디케이터를 피한다', () => {
  assert.match(tabCss, /min-height:\s*(4[4-9]|[5-9][0-9])px/, '탭 하나가 44px 보다 작다');
  assert.match(tabCss, /env\(safe-area-inset-bottom/, '아이폰 홈 인디케이터에 깔린다');
});

test('본문이 탭바 뒤로 숨지 않는다', () => {
  // 마지막 버튼이 막대 뒤에 있으면 사용자는 그 버튼을 영영 못 누른다.
  const pad = tabCss.split(/\n(?=[.#@:a-zA-Z])/).find(b => /has-tab-bar/.test(b) && /padding-bottom/.test(b));
  assert.ok(pad, '탭바가 있는 화면에 아래 여백을 주는 규칙이 없다');
});

test('탭바는 마크업에 있고 JS 가 죽어도 자리를 안 차지한다', () => {
  assert.match(html, /id="tab-bar"/, 'index.html 에 탭바가 없다');
  // 기본은 숨김이다. 로그인 여부와 경로를 아는 것은 JS 뿐이라, 마크업이
  // 먼저 보이면 로그아웃한 사람의 랜딩에 남의 메뉴가 잠깐 뜬다.
  assert.match(html, /id="tab-bar"[^>]*\bhidden\b/, '탭바의 기본이 숨김이 아니다');
});

test('보임·숨김은 hidden 속성으로 한다', () => {
  // 인라인 display 는 어떤 CSS 규칙도 이긴다 — 결과 화면 무대에서 한 번 데었다.
  assert.ok(
    !/tabBar\.style\.display/.test(main),
    'tab-bar 를 인라인 display 로 켜고 끄면 CSS 가 손댈 수 없다'
  );
  assert.match(main, /shouldShowTabBar\(/, '표시 판단은 순수 모듈이 한다');
  // 실제 빌드에서 `Cannot access '…' before initialization` 으로 터진 자리다.
  // syncTabBar 는 호이스팅돼 라우터가 먼저 부르는데, 바깥의 const 는 아직
  // 초기화 전(TDZ)이었다. 요소는 쓰는 자리에서 찾는다.
  const body = main.slice(main.indexOf('function syncTabBar'));
  assert.match(
    body.slice(0, 400),
    /getElementById\('tab-bar'\)/,
    'syncTabBar 가 바깥 변수를 붙들면 초기화 순서에 기대게 된다'
  );
  assert.match(main, /activeTabId\(/, '현재 탭 판단도 같은 모듈이 한다');
});

test('탭 글자는 사전에서 온다', () => {
  const i18n = readFileSync(`${ROOT}src/utils/i18n.js`, 'utf8');
  for (const key of ['tabPlan', 'tabTrips', 'tabProfile']) {
    const hits = i18n.match(new RegExp(`^\\s{8}${key}\\s*:`, 'gm')) || [];
    assert.equal(hits.length, 2, `${key} 가 ko/en 두 사전에 있어야 한다 (지금 ${hits.length}곳)`);
  }
});
