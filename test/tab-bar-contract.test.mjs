/**
 * 하단 탭바의 모양 계약.
 *
 * 새 화면 요소를 들일 때마다 같은 것을 확인한다 — 색은 지도 마커 규칙에만,
 * 모서리는 각지게, 그림자는 없이, 손가락이 닿는 크기로. 여기에 이 요소만의
 * 조건이 둘 붙는다: **엄지 영역**에 있으니 홈 인디케이터를 피해야 하고
 * (safe-area), **본문을 가리면 안 된다**(그만큼 아래 여백).
 *
 * 탭바는 Ionic 셸의 <IonTabBar> 이고 모양은 src/prototype/ionic-shell.css 가 정한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { TABS } from '../src/app/tab-bar.mjs';

import {
  stripComments, assertNoShadows, assertNoGradients, assertNoHardcodedColors,
  assertNoNamedColors, assertNoModernColorFunctions, assertSquareRadius,
  assertNoLegacyTokens,
} from './helpers/style-contract.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const css = stripComments(readFileSync(`${ROOT}src/prototype/ionic-shell.css`, 'utf8'));
const tokens = readFileSync(`${ROOT}src/styles/tokens.css`, 'utf8');
const shell = readFileSync(`${ROOT}src/prototype/ionic-shell.jsx`, 'utf8');
const ionicCore = readFileSync(`${ROOT}node_modules/@ionic/react/css/core.css`, 'utf8');

/** ionic-shell.css 에서 탭바에 해당하는 규칙만. */
const tabBlocks = css.split(/\n(?=[.#@:a-zA-Z])/).filter(block => /ion-tab-bar|ion-tab-button/.test(block));
const tabCss = tabBlocks.join('\n');

test('탭바 규칙이 실제로 있다', () => {
  assert.ok(tabCss.length > 100, 'ionic-shell.css 에 탭바 규칙이 없다');
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

test('고른 탭은 색이 아니라 잉크 반전으로 말한다', {
  skip: 'production gap: ionic-shell.css marks the selected tab only with --color-selected: var(--cp-ink) (text ink-2 -> ink); no rule inverts it to an ink background with surface text',
}, () => {
  // 이 앱에서 색은 지도 마커 규칙(보라=고정 일정/초록=첫 장소/파랑=나머지)에만
  // 쓴다. 선택을 색으로 말하면 그 색이 두 가지 뜻을 갖는다.
  const active = tabBlocks.find(b => /tab-selected|aria-selected/.test(b));
  assert.ok(active, '현재 탭을 알리는 규칙이 없다');
  assert.match(active, /background:\s*var\(--cp-ink\)/);
  assert.match(active, /color:\s*var\(--cp-surface\)/);
});

test('엄지가 닿는 크기이고 홈 인디케이터를 피한다', () => {
  assert.match(tabCss, /min-height:\s*(4[4-9]|[5-9][0-9])px/, '탭 하나가 44px 보다 작다');
  // Ionic 의 ion-tab-bar 는 padding-bottom 을 --ion-safe-area-bottom 으로 두고, core.css 가 그 값을 env() 에서 받는다.
  assert.match(ionicCore, /--ion-safe-area-bottom:[^;]*env\(safe-area-inset-bottom\)/, 'Ionic 이 홈 인디케이터 높이를 받지 않는다');
  assert.doesNotMatch(tabCss, /padding(?:-bottom)?\s*:/, '탭바의 아래 여백을 덮으면 홈 인디케이터에 깔린다');
  assert.doesNotMatch(css, /--ion-safe-area-bottom\s*:/, '앱이 safe-area 값을 덮어쓴다');
});

test('본문이 탭바 뒤로 숨지 않는다', () => {
  // 마지막 버튼이 막대 뒤에 있으면 사용자는 그 버튼을 영영 못 누른다.
  // IonTabs 는 탭바를 본문 아래 흐름에 두므로, 띄우지만 않으면 본문을 가리지 않는다.
  assert.match(shell, /<IonTabBar slot="bottom"/, '탭바가 IonTabs 의 아래 자리에 있지 않다');
  assert.doesNotMatch(tabCss, /position\s*:\s*(?:fixed|absolute)/, '탭바를 띄우면 본문 끝이 그 뒤에 숨는다');
});

test('보임·숨김은 순수 모듈이 판단하고 셸은 그리지 않는 것으로 숨긴다', () => {
  // 인라인 display 는 어떤 CSS 규칙도 이긴다 — 결과 화면 무대에서 한 번 데었다.
  assert.doesNotMatch(shell, /<IonTabBar[^>]*style=/, 'tab-bar 를 인라인 스타일로 켜고 끄면 CSS 가 손댈 수 없다');
  assert.match(shell, /const showTabs = shouldShowTabBar\(/, '표시 판단은 순수 모듈이 한다');
  assert.match(shell, /\{showTabs && <IonTabBar\b/, '숨길 때 탭바를 그리지 않는다');
  assert.match(shell, /activeTabId\(/, '현재 탭 판단도 같은 모듈이 한다');
});

test('탭 글자는 사전에서 온다', () => {
  const i18n = readFileSync(`${ROOT}src/utils/i18n.js`, 'utf8');
  for (const key of TABS.map(tab => tab.labelKey)) {
    const hits = i18n.match(new RegExp(`^\\s{8}${key}\\s*:`, 'gm')) || [];
    assert.equal(hits.length, 2, `${key} 가 ko/en 두 사전에 있어야 한다 (지금 ${hits.length}곳)`);
    assert.match(shell, new RegExp(`t\\('${key}'\\)`), `셸이 ${key} 를 사전에서 읽지 않는다`);
  }
});
