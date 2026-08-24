/**
 * 탑승권은 화면이 아니라 캡처 결과물이라 규칙이 더 빡빡하다.
 *
 * html2canvas 는 그라디언트·최신 색 함수·backdrop-filter 를 읽지 못한다
 * (PRD 3.7 에 기록된 이력). 화면이라면 "조금 다르게 보인다"로 끝날 것이
 * 여기서는 **공유 이미지가 통째로 깨진다**로 끝난다.
 *
 * 색 규칙도 같다: 이 티켓에서 색이 허용되는 곳은 고정 일정 표시 하나다.
 * 화면의 타임라인 카드가 쓰는 --cp-anchor 와 같은 값이어야, 화면에서
 * 보라 띠로 배운 뜻이 이미지에서도 통한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  stripComments,
  stripSourceComments,
  extractInlineStyles,
  assertNoShadows,
  assertNoGradients,
  assertNoHardcodedColors,
  assertNoNamedColors,
  assertNoRgbaColors,
  assertNoModernColorFunctions,
  assertSquareRadius,
  assertNoLegacyTokens,
} from './helpers/style-contract.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const source = readFileSync(`${ROOT}src/domains/itinerary/ui/boarding-pass-view.js`, 'utf8');
const tokens = readFileSync(`${ROOT}src/styles/tokens.css`, 'utf8');

const css = stripComments(
  /export const boardingPassStyles = `([\s\S]*?)`;/.exec(source)?.[1] ?? ''
);

test('스타일 문자열을 찾을 수 있다', () => {
  assert.ok(css.trim().length > 0, 'boardingPassStyles 를 읽지 못했다');
});

test('캡처가 읽지 못하는 것은 쓰지 않는다', () => {
  assertNoShadows(css, '탑승권');
  assertNoGradients(css, '탑승권');
  assertNoModernColorFunctions(css, '탑승권');
  assert.deepEqual(css.match(/backdrop-filter/g) || [], [],
    '탑승권: backdrop-filter 는 캡처에서 아예 렌더되지 않는다');
});

test('색은 토큰에서만 온다 — 로직에 박힌 인라인 스타일까지', () => {
  // extractInlineStyles 는 이미 이어 붙인 문자열을 돌려준다.
  const inline = extractInlineStyles(stripSourceComments(source));
  for (const [label, text] of [['탑승권 CSS', css], ['탑승권 인라인', inline]]) {
    assertNoHardcodedColors(text, label);
    assertNoNamedColors(text, label);
    assertNoRgbaColors(text, label);
    assertNoLegacyTokens(text, label);
  }
});

test('각진 형태를 지킨다', () => {
  assertSquareRadius(css, '탑승권', tokens);
});

test('색이 쓰이는 곳은 고정 일정 하나뿐이다', () => {
  const used = [...new Set((css.match(/var\(--cp-(anchor|start|stop)\)/g) || []))];
  assert.deepEqual(used, ['var(--cp-anchor)'],
    '지도 마커 규칙의 세 색 중 티켓이 쓰는 것은 고정 일정(보라)뿐이어야 한다.\n' +
    '초록(첫 장소)·파랑(나머지)은 지도 위에서만 뜻을 갖는다.\n' + used.join(', '));
});

test('폭을 픽셀로 못박는다 — 기기마다 다른 그림이 나가면 안 된다', () => {
  assert.match(css, /\.bp\s*\{[^}]*width\s*:\s*\d+px/,
    '.bp 의 폭이 고정되어 있지 않다');
});

test('막대는 난수가 아니라 코드에서 결정된다', () => {
  const body = stripSourceComments(source);
  assert.ok(!/Math\.random|Date\.now|new Date\(\s*\)/.test(body),
    '같은 일정은 몇 번을 저장해도 같은 티켓이어야 한다');
});
