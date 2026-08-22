import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { preferenceStyles } from '../src/domains/planner/ui/preference-style.js';
import {
  stripComments, assertNoShadows, assertNoGradients, assertNoHardcodedColors,
  assertNoModernColorFunctions, assertNoNamedColors, assertSquareRadius,
  assertNoLegacyTokens, assertTouchTargets,
} from './helpers/style-contract.mjs';

/**
 * 선호 선택은 사용자가 앱에서 처음 무언가를 "고르는" 화면이다.
 * 여기서 배운 표기(고른 것이 어떻게 보이는가)가 폼의 앵커, 결과 화면의
 * 일차 탭까지 이어지므로 같은 계약을 적용한다.
 */
const css = stripComments(preferenceStyles);
const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const LABEL = 'preference-style';

test('그림자를 쓰지 않는다', () => assertNoShadows(css, LABEL));
test('그라디언트를 쓰지 않는다', () => assertNoGradients(css, LABEL));
test('색은 전부 토큰에서 온다', () => assertNoHardcodedColors(css, LABEL));
test('이름 있는 색을 쓰지 않는다', () => assertNoNamedColors(css, LABEL));
test('캡처가 못 읽는 색 함수를 쓰지 않는다', () => assertNoModernColorFunctions(css, LABEL));
test('라운드는 0 이거나 알약 토큰이다', () => assertSquareRadius(css, LABEL, tokens));
test('옛 토큰을 더 이상 읽지 않는다', () => assertNoLegacyTokens(css, LABEL));

test('터치 기기에서 고르는 대상이 44px 이상이다', () => {
  // 이 화면은 통째로 "고르는" 화면이라 탭 대상이 곧 화면 전체다.
  assertTouchTargets(css, LABEL, ['.date-chip', '.preference-card', '.next-btn', '.skip-link']);
});

test('고른 것은 색이 아니라 반전으로 표시한다', () => {
  // 보라로 표시하면 지도에서 "고정 일정"을 뜻하는 색이 여기서 "선택"을
  // 뜻하게 된다. 일차 탭(.day-tab-btn.active)·주 버튼과 같은 어휘로 맞춘다.
  assert.match(css, /\.preference-card\.selected[^}]*background:\s*var\(--cp-ink\)/,
    '선택된 카드는 잉크 배경으로 반전되어야 한다');
  assert.match(css, /\.date-chip\.selected[^}]*background:\s*var\(--cp-ink\)/,
    '선택된 칩도 같은 방식이어야 한다');
});

test('다크 모드를 위한 별도 색 블록이 필요 없다', () => {
  // 색을 토큰에서 읽으면 body.dark 에서 자동으로 뒤집힌다.
  // :host-context 로 카드 색을 따로 칠하던 블록은 토큰과 갈라지기 쉽다.
  assert.doesNotMatch(css, /:host-context\(body\.dark\)\s*\.preference-card/,
    '다크 모드 카드 색을 따로 칠하고 있다');
});

/**
 * 스타일 파일만 지키면 반쪽이다 — 진도율 막대와 "이전으로" 버튼은
 * preference-view.js 안에 인라인으로 칠해져 있었다.
 */
const view = stripComments(
  readFileSync(new URL('../src/domains/planner/ui/preference-view.js', import.meta.url), 'utf8')
);
const inlineStyles = [
  ...view.matchAll(/style\s*=\s*"([^"]*)"/g),
  ...view.matchAll(/\.style\.[a-zA-Z]+\s*=\s*['"]([^'"]*)['"]/g),
].map(m => m[1]).join('\n');

test('선호 화면의 인라인 스타일에도 옛 색이 없다', () => {
  assertNoHardcodedColors(inlineStyles, 'preference-view(inline)');
  assertNoNamedColors(inlineStyles, 'preference-view(inline)');
  assertNoModernColorFunctions(inlineStyles, 'preference-view(inline)');
  assertNoGradients(inlineStyles, 'preference-view(inline)');
  assertNoShadows(inlineStyles, 'preference-view(inline)');
  assertNoLegacyTokens(inlineStyles, 'preference-view(inline)');
  assertSquareRadius(inlineStyles, 'preference-view(inline)', tokens);
});

test('선택 카드의 그림은 이모지가 아니라 인라인 SVG 다', () => {
  // 이 화면은 이모지가 카드를 구분하는 유일한 표시였다(🍽️ 🏄 🧘 📸).
  // 이모지는 OS 가 정한 자기 색을 갖고 들어오므로, 무채색 규칙에서
  // 화면의 유일한 색이 되어 버린다. 기기마다 모양도 다르다.
  const emoji = view.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu) || [];
  assert.deepEqual(emoji, [], `이모지가 남아 있다: ${[...new Set(emoji)].join(' ')}`);
  assert.match(view, /icons\.\w+/, '공용 아이콘 세트를 써야 한다');
});
