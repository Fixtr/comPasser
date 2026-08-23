import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  stripSourceComments, assertNoShadows, assertNoGradients, assertNoHardcodedColors,
  assertNoNamedColors, assertNoRgbaColors, assertNoModernColorFunctions,
  assertSquareRadius, assertNoLegacyTokens, extractInlineStyles,
} from './helpers/style-contract.mjs';

/**
 * 길찾기 팝업.
 *
 * 결과 화면의 각 장소에서 열리는데, `document.body` 에 직접 붙는 탓에
 * 어느 화면의 스타일 계약에도 걸리지 않았다. 다른 화면을 전부 무채색으로
 * 옮기는 동안 여기만 흰 상자 + 그림자 + 파스텔 그라디언트로 남아 있었다.
 */
const src = stripSourceComments(
  readFileSync(new URL('../src/domains/itinerary/ui/nav-popup.js', import.meta.url), 'utf8')
);
const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const LABEL = 'nav-popup';

test('그림자를 쓰지 않는다', () => {
  assertNoShadows(src, LABEL);
  // filter: drop-shadow() 도 같은 이유로 막는다(캡처·저사양 렌더).
  assert.doesNotMatch(src, /drop-shadow\(/, 'drop-shadow 가 남아 있다');
  assert.doesNotMatch(src, /boxShadow/, 'JS 로 그림자를 넣고 있다');
});

test('그라디언트를 쓰지 않는다', () => assertNoGradients(src, LABEL));
test('색은 전부 토큰에서 온다', () => assertNoHardcodedColors(src, LABEL));
test('이름 있는 색을 쓰지 않는다', () => assertNoNamedColors(src, LABEL));
test('반투명 색도 토큰에서 온다', () => assertNoRgbaColors(src, LABEL));
test('캡처가 못 읽는 색 함수를 쓰지 않는다', () => assertNoModernColorFunctions(src, LABEL));
test('옛 토큰을 읽지 않는다', () => assertNoLegacyTokens(src, LABEL));

test('라운드는 0 이거나 알약 토큰이다', () => {
  assertSquareRadius(src, LABEL, tokens);
  // JS 쪽 borderRadius 도 함께 본다.
  const inline = extractInlineStyles(src);
  const bad = [...inline.matchAll(/borderRadius\s*:\s*'([^']+)'/g)].map(m => m[1])
    .filter(v => !/^0(px)?$/.test(v) && !v.includes('--cp-'));
  assert.deepEqual(bad, [], `JS 에서 준 라운드: ${bad.join(', ')}`);
});

test('상자를 JS 로 칠하지 않는다', () => {
  // Object.assign(popup.style, {...}) 안에 흰 배경·테두리·그림자가 들어 있었다.
  // 위치(top/left)만 JS 가 정하고 모양은 CSS 가 맡아야 한다.
  const inline = extractInlineStyles(src);
  const colored = inline.split('\n')
    .filter(v => /background|border(?!Radius)|boxShadow|color/i.test(v))
    .filter(v => !/borderRadius/.test(v));
  assert.deepEqual(colored, [], `JS 가 상자를 칠하고 있다:\n${colored.join('\n')}`);
});

test('장식 이모지를 쓰지 않는다', () => {
  // 🗺️ ✕ 🟢 🟡 — 특히 🟢🟡 는 서비스 구분의 유일한 표시였는데,
  // OS 마다 모양과 색이 달라 브랜드 식별에 기대기 어렵다.
  const emoji = src.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu) || [];
  assert.deepEqual(emoji, [], `이모지가 남아 있다: ${[...new Set(emoji)].join(' ')}`);
});

test('서비스 구분은 브랜드 토큰으로 한다', () => {
  // 네이버 초록·카카오 노랑은 브랜드 값이라 토큰으로 이름을 준다.
  assert.match(src, /--cp-naver/, '네이버 표시가 브랜드 토큰을 써야 한다');
  assert.match(src, /--cp-kakao/, '카카오 표시가 브랜드 토큰을 써야 한다');
});

test('쓰이지 않는 규칙을 들고 있지 않다', () => {
  // 구글 지도 항목은 마크업에서 빠졌는데 CSS 만 남아 있었다.
  const hasGoogleMarkup = /class="pop-opt google"/.test(src);
  if (!hasGoogleMarkup) {
    assert.doesNotMatch(src, /\.pop-opt\.google/, '.pop-opt.google 규칙이 쓰이지 않는다');
  }
});

test('터치 기기에서 누르는 것들이 44px 이상이다', () => {
  assert.match(src, /@media\s*\([^)]*pointer:\s*coarse/, '(pointer: coarse) 블록이 없다');
  for (const sel of ['.pop-opt', '.popup-close']) {
    assert.ok(src.includes(sel), `${sel} 규칙이 없다`);
  }
});
