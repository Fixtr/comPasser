import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { travelFormStyles } from '../src/domains/planner/ui/travel-form-style.js';
import {
  stripComments, assertNoShadows, assertNoGradients, assertNoHardcodedColors,
  assertNoModernColorFunctions, assertSquareRadius, assertNoLegacyTokens, assertTouchTargets,
  assertNativeControlScheme,
} from './helpers/style-contract.mjs';

/**
 * 여행 폼은 사용자가 가장 오래 머무는 화면이고 결과 화면 바로 앞이다.
 * 둘이 이어져 보여야 하므로 같은 계약을 적용한다.
 */
const css = stripComments(travelFormStyles);
const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const LABEL = 'travel-form-style';

test('그림자를 쓰지 않는다', () => assertNoShadows(css, LABEL));
test('그라디언트를 쓰지 않는다', () => assertNoGradients(css, LABEL));
test('색은 전부 토큰에서 온다', () => assertNoHardcodedColors(css, LABEL));
test('캡처가 못 읽는 색 함수를 쓰지 않는다', () => assertNoModernColorFunctions(css, LABEL));
test('라운드는 0 이거나 알약 토큰이다', () => assertSquareRadius(css, LABEL, tokens));
test('옛 토큰을 더 이상 읽지 않는다', () => assertNoLegacyTokens(css, LABEL));

test('터치 기기에서 입력과 버튼이 44px 이상이다', () => {
  // 폼은 입력이 많아 오탭 비용이 크다. 날짜·시간 입력이 특히 그렇다.
  // 클래스 이름은 travel-form.js 가 실제로 붙이는 것과 같아야 한다.
  assertTouchTargets(css, LABEL, ['input', '.primary-btn', '.reset-btn', '.remove-btn', '.link-btn']);
});

test('다크 모드에서 시간·날짜 입력의 기본 아이콘이 보인다', () => {
  // 이 화면은 앱에서 네이티브 입력(time/date/select)이 가장 많은 곳이라
  // color-scheme 을 안 뒤집으면 여기서 제일 먼저 티가 난다.
  assertNativeControlScheme(tokens);
});

test('고정 일정 입력은 결과 화면과 같은 색 어휘를 쓴다', () => {
  // 결과 화면에서 고정 일정의 신호를 "왼쪽 띠 하나"로 정했다.
  // 입력 단계에서 다른 표기를 쓰면 사용자가 같은 개념을 두 번 배워야 한다.
  assert.match(css, /\.anchor-item[\s\S]*?--cp-anchor/, '앵커 항목이 지도 핀과 같은 토큰을 써야 한다');
});

/**
 * 스타일 파일만 지키면 반쪽이다. travel-form.js 안의 인라인 style 속성이
 * 옛 색을 그대로 들고 있으면 화면에는 여전히 보라 그라디언트가 남는다.
 * 실제로 이 파일에는 oklch 테두리, 하드코딩 hex, 그라디언트 배지가 있었다.
 */
const logic = stripComments(
  readFileSync(new URL('../src/domains/planner/ui/travel-form.js', import.meta.url), 'utf8')
);
// 스타일 모듈 자체를 import 하는 줄과 CSS 셀렉터 문자열은 검사 대상이 아니다.
const inlineStyles = [...logic.matchAll(/style(?:\s*=\s*"([^"]*)"|\.[a-zA-Z]+\s*=\s*'([^']*)')/g)]
  .map(m => m[1] ?? m[2])
  .join('\n');

test('폼 로직 파일의 인라인 스타일에도 옛 색이 없다', () => {
  assertNoModernColorFunctions(inlineStyles, `${LABEL}(inline)`);
  assertNoHardcodedColors(inlineStyles, `${LABEL}(inline)`);
  assertNoGradients(inlineStyles, `${LABEL}(inline)`);
  assertNoLegacyTokens(inlineStyles, `${LABEL}(inline)`);
});
