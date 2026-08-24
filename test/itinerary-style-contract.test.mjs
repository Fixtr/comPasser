import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { itineraryStyles } from '../src/domains/itinerary/ui/itinerary-style.js';
import { getTransitStyle } from '../src/domains/itinerary/ui/itinerary-render-helpers.js';
import {
  stripComments, assertNoShadows, assertNoGradients, assertNoHardcodedColors,
  assertNoModernColorFunctions, assertNoNamedColors, assertSquareRadius,
  assertNoLegacyTokens, assertTouchTargets, extractInlineStyles, stripSourceComments,
  assertNoRgbaColors,
} from './helpers/style-contract.mjs';

/**
 * 결과 화면의 형태 규칙을 코드로 붙잡아 둔다.
 *
 * 규칙의 근거는 취향이 아니라 셋이다 —
 *  1) 야외 가독성 2) 저사양 안드로이드 렌더 비용 3) html2canvas 캡처 호환.
 *
 * 스타일은 시간이 지나면 조용히 되돌아간다. 그림자 하나, 하드코딩 색 하나가
 * 늘어나는 건 리뷰에서 잘 안 보이므로 테스트로 막는다.
 */
const css = stripComments(itineraryStyles);
const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const LABEL = 'itinerary-style';

test('그림자를 쓰지 않는다', () => assertNoShadows(css, LABEL));
test('그라디언트를 쓰지 않는다', () => assertNoGradients(css, LABEL));
test('색은 전부 토큰에서 온다', () => assertNoHardcodedColors(css, LABEL));
test('이름 있는 색을 쓰지 않는다', () => assertNoNamedColors(css, LABEL));
test('캡처가 못 읽는 색 함수를 쓰지 않는다', () => assertNoModernColorFunctions(css, LABEL));
test('라운드는 0 이거나 알약 토큰이다', () => assertSquareRadius(css, LABEL, tokens));
test('옛 토큰을 더 이상 읽지 않는다', () => assertNoLegacyTokens(css, LABEL));

/**
 * rgba 검사가 이 화면에만 빠져 있었다. 그 틈으로 두 가지가 새어 들어왔다 —
 * 이동 구간 상자의 `rgba(255,255,255,0.75)`(다크 모드에서 밝은 글씨가
 * 밝은 상자에 얹혀 사라진다)와 저장 버튼의 text-shadow.
 */
test('반투명 색도 토큰에서 온다', () => assertNoRgbaColors(css, LABEL));

test('글자에도 그림자를 쓰지 않는다', () => {
  // box-shadow 만 막으면 text-shadow 로 새어 나간다. 이 방향에 그림자는 없다.
  const hits = css.match(/text-shadow\s*:\s*(?!none)[^;]+/g) || [];
  assert.deepEqual(hits, [], `${LABEL}: 글자 그림자도 쓰지 않는다\n${hits.join('\n')}`);
});

test('타임라인과 지도가 같은 색 어휘를 쓴다', () => {
  // 고정 일정 / 첫 장소 / 나머지 — map/COMMAND_GUIDE.md 의 마커 규칙과 같은 토큰.
  assert.ok(css.includes('--cp-anchor'), '고정 일정 색이 지도 핀과 같은 토큰이어야 한다');
});

test('터치 기기에서는 탭 대상을 44px 이상으로 넓힌다', () => {
  assertTouchTargets(css, LABEL, ['.item-edit-btn', '.nav-btn', '.insert-slot-btn', '.day-tab-btn']);
});

test('hover 가 없는 기기에서는 숨은 버튼이 드러난다', () => {
  // "여기에 장소 추가" 는 opacity 0.5 로 두고 hover 때만 드러난다.
  // 터치에는 hover 가 없으므로 폰에서는 영영 반투명한 채로 남는다.
  const noHover = css.match(/@media\s*\([^)]*hover:\s*none[^)]*\)\s*\{[\s\S]*?\n        \}/);
  assert.ok(noHover, '(hover: none) 블록이 있어야 한다');
  assert.match(noHover[0], /\.insert-slot-btn[\s\S]*opacity\s*:\s*1/, '터치에서는 완전히 보여야 한다');
});

test('이동 수단 칩은 색을 쓰지 않는다', () => {
  // 색은 지도 마커 규칙(보라=고정 / 초록=첫 장소 / 파랑=나머지)에만 쓴다.
  // 수단마다 색을 주면 같은 초록이 "첫 장소"와 "버스" 두 가지를 뜻하게 된다.
  const modes = [
    getTransitStyle('WALKING'),
    getTransitStyle('TRANSIT', 'BUS'),
    getTransitStyle('TRANSIT', 'SUBWAY'),
    getTransitStyle('TRANSIT', 'TRAIN'),
    getTransitStyle('TRANSIT', 'TAXI'),
    getTransitStyle('TRANSIT'),
  ];
  for (const m of modes) {
    for (const key of ['bg', 'border', 'color']) {
      assert.match(m[key], /^var\(--cp-/, `${key} 는 토큰이어야 한다 (받은 값: ${m[key]})`);
    }
  }
  const palettes = new Set(modes.map(m => `${m.bg}|${m.border}|${m.color}`));
  assert.equal(palettes.size, 1, '모든 수단이 같은 무채색 칩을 쓴다');
});

test('이동 수단 아이콘은 이모지가 아니라 인라인 SVG 다', () => {
  for (const vt of [null, 'BUS', 'SUBWAY', 'TRAIN', 'TAXI']) {
    const { icon } = getTransitStyle(vt ? 'TRANSIT' : 'WALKING', vt);
    assert.match(icon, /^<svg /, '인라인 SVG 여야 한다');
    assert.match(icon, /currentColor/, '감싼 요소의 색을 따라야 한다');
    assert.doesNotMatch(icon, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, '이모지가 남아 있다');
  }
});

/**
 * 스타일 파일만 검사하면 반쪽이다.
 *
 * 실제로 이 계약이 itinerary-style.js 만 보고 있는 동안, itinerary-view.js
 * 안의 인라인 스타일에는 일차 탭의 보라 배경(`var(--accent-primary, #7c3aed)`)이
 * 그대로 남아 있었다. 화면에서 가장 눈에 띄는 자리인데 테스트는 통과했다.
 */
const view = stripSourceComments(
  readFileSync(new URL('../src/domains/itinerary/ui/itinerary-view.js', import.meta.url), 'utf8')
);
const inlineStyles = extractInlineStyles(view);

test('결과 화면의 인라인 스타일에도 옛 색이 없다', () => {
  assertNoHardcodedColors(inlineStyles, 'itinerary-view(inline)');
  assertNoNamedColors(inlineStyles, 'itinerary-view(inline)');
  assertNoModernColorFunctions(inlineStyles, 'itinerary-view(inline)');
  assertNoShadows(inlineStyles, 'itinerary-view(inline)');
  assertNoLegacyTokens(inlineStyles, 'itinerary-view(inline)');
  assertSquareRadius(inlineStyles, 'itinerary-view(inline)', tokens);
});

/**
 * 이미지 저장 경로.
 *
 * onclone 안의 색 강제 규칙은 `clonedDoc.querySelector('#results-content')` 로
 * 대상을 찾는데, 그 요소는 shadow DOM 안에 있어 광명 DOM 검색으로는 잡히지
 * 않는다. 즉 그 블록은 한 번도 실행된 적이 없는 죽은 코드였고, 담긴 값
 * (`#f5f3ff` 보라 틴트)은 지금 디자인과도 어긋난다.
 *
 * 스타일 태그를 정규식으로 치환하던 우회도 같이 없앤다. 지금은 스타일에
 * color-mix 가 없다는 것을 위 계약이 보장한다.
 */
const capture = view;

test('캡처 경로에 죽은 색 강제 코드가 없다', () => {
  assert.doesNotMatch(capture, /overrideStyle/, 'onclone 의 색 강제 블록이 남아 있다');
  assert.doesNotMatch(capture, /#f5f3ff/, '지금 디자인과 어긋나는 보라 틴트가 남아 있다');
});

test('캡처를 위해 스타일 태그를 정규식으로 고치지 않는다', () => {
  // 화면을 예쁘게 고칠수록 캡처가 깨지던 구조의 원인이다.
  assert.doesNotMatch(capture, /styleTag\.textContent\s*=/, '스타일 태그를 런타임에 덮어쓰고 있다');
  assert.doesNotMatch(capture, /replace\(\/color-mix/, 'color-mix 치환 우회가 남아 있다');
});

test('일차 탭을 인라인으로 칠하지 않는다', () => {
  // 탭 모양은 .day-tab-btn / .active 가 맡는다. 클릭할 때 인라인으로 다시
  // 칠하면, 최초 렌더만 고쳐 놓고 "고쳤다"고 믿게 된다. 실제로 그랬다.
  assert.doesNotMatch(view, /tab\.style\.(background|color)\s*=/,
    '탭을 클릭할 때 인라인으로 색을 덮어쓰고 있다');
  assert.match(view, /classList\.toggle\('active'/,
    '활성 탭은 클래스로 표시해야 한다');
});
