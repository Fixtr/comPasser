import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { profileStyles } from '../src/domains/profile/ui/profile-style.js';
import {
  stripComments, stripSourceComments, assertNoShadows, assertNoGradients,
  assertNoHardcodedColors, assertNoNamedColors, assertNoRgbaColors,
  assertNoModernColorFunctions, assertSquareRadius, assertNoLegacyTokens,
  assertTouchTargets,
} from './helpers/style-contract.mjs';

/**
 * 프로필은 마지막으로 남은 화면이다. 여기까지 옮겨야 style.css 의 옛 변수
 * (`--bg-primary` 계열)를 지울 수 있다.
 */
const css = stripComments(profileStyles);
const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const view = stripSourceComments(
  readFileSync(new URL('../src/domains/profile/ui/profile-view.js', import.meta.url), 'utf8')
);
const LABEL = 'profile-style';

test('그림자를 쓰지 않는다', () => assertNoShadows(css, LABEL));
test('그라디언트를 쓰지 않는다', () => assertNoGradients(css, LABEL));
test('색은 전부 토큰에서 온다', () => assertNoHardcodedColors(css, LABEL));
test('이름 있는 색을 쓰지 않는다', () => assertNoNamedColors(css, LABEL));
test('캡처가 못 읽는 색 함수를 쓰지 않는다', () => assertNoModernColorFunctions(css, LABEL));
test('라운드는 0 이거나 알약 토큰이다', () => assertSquareRadius(css, LABEL, tokens));
test('옛 토큰을 더 이상 읽지 않는다', () => assertNoLegacyTokens(css, LABEL));

test('반투명 색도 토큰에서 온다', () => {
  // hex 만 막으면 rgba 로 샌다. 이 화면은 모달 가림막·위험 구역 배경·
  // 보라 hover 가 전부 rgba 로 적혀 있었다.
  assertNoRgbaColors(css, LABEL);
  assert.ok(tokens.includes('--cp-scrim'), '가림막 토큰이 없다');
  assert.match(css, /\.modal-overlay[\s\S]{0,200}--cp-scrim/, '가림막이 토큰을 읽어야 한다');
});

test('backdrop-filter 를 쓰지 않는다', () => {
  // 저사양 안드로이드에서 비싸고, PRD 3.7 에 캡처가 못 읽는 목록으로 적혀 있다.
  assert.doesNotMatch(css, /backdrop-filter/, 'backdrop-filter 가 남아 있다');
});

test('터치 기기에서 누르는 것들이 44px 이상이다', () => {
  assertTouchTargets(css, LABEL, [
    '.nav-item', '.btn-save', '.btn-cancel', '.btn-edit-inline',
    '.btn-view', '.btn-delete-trip', '.btn-rename', '.inline-input',
  ]);
});

test('선택된 메뉴는 색이 아니라 반전으로 표시한다', () => {
  // 앱 전체에서 "지금 보고 있는 것"은 잉크 반전이다(일차 탭, 선호 카드,
  // 날짜 칩). 여기만 보라 배경을 쓰면 같은 뜻에 표기가 둘이 된다.
  assert.match(css, /\.nav-item\.active[^}]*background:\s*var\(--cp-ink\)/,
    '활성 메뉴가 잉크 배경으로 반전되어야 한다');
});

test('일정 제목이 지도 색을 쓰지 않는다', () => {
  // .trip-title 이 --accent-primary(보라)였다. 보라는 "고정 일정"의 색이다.
  assert.doesNotMatch(css, /\.trip-title\s*\{[^}]*--cp-anchor/, '일정 제목에 앵커 색을 쓰고 있다');
});

test('장식 이모지를 쓰지 않는다', () => {
  // 사이드바 아이콘(👤 🗺️ 🛡️)과 버튼 라벨(💾 ❌ 📱 ✏️)이 이모지였다.
  const emoji = view.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu) || [];
  assert.deepEqual(emoji, [], `이모지가 남아 있다: ${[...new Set(emoji)].join(' ')}`);
  assert.match(view, /icons\.\w+/, '공용 아이콘 세트를 써야 한다');
});

test('프로필 파일의 인라인 스타일에도 옛 색이 없다', () => {
  const inline = [
    ...view.matchAll(/style\s*=\s*"([^"]*)"/g),
    ...view.matchAll(/\.style\.[a-zA-Z]+\s*=\s*['"]([^'"]*)['"]/g),
    ...view.matchAll(/\.style\.cssText\s*=\s*`([^`]*)`/g),
  ].map(m => m[1]).join('\n');
  assertNoHardcodedColors(inline, 'profile-view(inline)');
  assertNoNamedColors(inline, 'profile-view(inline)');
  assertNoRgbaColors(inline, 'profile-view(inline)');
  assertNoModernColorFunctions(inline, 'profile-view(inline)');
  assertNoLegacyTokens(inline, 'profile-view(inline)');
  assertSquareRadius(inline, 'profile-view(inline)', tokens);
});
