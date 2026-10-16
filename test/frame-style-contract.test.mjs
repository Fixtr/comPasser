import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { extractInlineStyles, assertNoRgbaColors } from './helpers/style-contract.mjs';

/**
 * 공통 프레임(헤더·랜딩·로딩·광고 배너·토스트·확인창)의 형태 규칙.
 *
 * 이 층은 웹 컴포넌트가 아니라 index.html 과 style.css, 그리고 모든 화면에
 * 뜨는 유틸 두 개다. 헤더는 /profile 을 뺀 모든 경로에 뜨므로(main.js:377),
 * 여기가 어긋나 있으면 어떤 화면을 고쳐도 위쪽에서 계속 부딪힌다.
 *
 * 결과 화면과 같은 규칙을 쓴다 — UI 는 무채색, 색은 지도 마커 규칙에만.
 */
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

const html = strip(read('../index.html'));
const cssRaw = read('../style.css');
const css = strip(cssRaw);
const toast = strip(read('../src/utils/toast.js'));
const dialog = strip(read('../src/utils/confirm-dialog.js'));

test('캡처가 못 읽는 색 함수를 쓰지 않는다', () => {
  // oklch()/color-mix() 는 html2canvas 가 파싱하지 못한다(PRD 3.7).
  for (const [name, src] of [['index.html', html], ['style.css', css]]) {
    const hits = src.match(/\b(oklch|oklab|lch|lab|color-mix)\s*\(/g) || [];
    assert.deepEqual(hits, [], `${name} 에 남아 있다: ${hits.join(', ')}`);
  }
});

test('그라디언트 글씨를 쓰지 않는다', () => {
  // background-clip:text 는 캡처에서 글자가 통째로 사라진다.
  // 그리고 파랑→보라 그라디언트는 "AI 가 만든 앱" 목록의 첫 항목이다.
  for (const [name, src] of [['index.html', html], ['style.css', css]]) {
    assert.doesNotMatch(src, /background-clip\s*:\s*text/, `${name} 에 그라디언트 글씨가 있다`);
  }
});

test('프레임 CSS 에 그림자와 그라디언트가 없다', () => {
  const shadows = css.match(/box-shadow\s*:\s*(?!none)[^;]+/g) || [];
  assert.deepEqual(shadows, [], `그림자 대신 1px 실선으로:\n${shadows.join('\n')}`);
  const grads = css.match(/(linear|radial|conic)-gradient\(/g) || [];
  assert.deepEqual(grads, [], `그라디언트가 남아 있다: ${grads.length}건`);
});

test('index.html 의 인라인 style 에 색이 없다', () => {
  // 색을 마크업에 박아 두면 토큰이 무슨 값인지와 무관하게 화면이 어긋난다.
  const inline = extractInlineStyles(html).split('\n');
  const colored = inline.filter(v => /#[0-9a-fA-F]{3,8}|rgba?\(|\b(background|color|border-color)\s*:/.test(v));
  assert.deepEqual(colored, [], `색을 담은 인라인 style 이 남아 있다:\n${colored.join('\n')}`);
});

test('main.js 가 화면을 인라인으로 칠하지 않는다', () => {
  // 첫 방문 안내 오버레이가 cssText 안에 보라 버튼과 backdrop-filter 를
  // 담고 있었다. JS 안에 있으면 어떤 스타일 계약에도 걸리지 않는다.
  const main = readFileSync(new URL('../src/app/main.js', import.meta.url), 'utf8')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const inline = extractInlineStyles(strip(main));
  const colored = inline.split('\n')
    .filter(v => /#[0-9a-fA-F]{3,8}|rgba?\(|var\(\s*--(bg|text|accent|shadow|radius)-/.test(v))
    // 광고 배너 색은 데이터에서 온다(운영자가 넣는 값이라 토큰이 아니다).
    .filter(v => !v.includes('ad.bgColor'));
  assert.deepEqual(colored, [], `색을 담은 인라인 style 이 남아 있다:\n${colored.join('\n')}`);
  assert.doesNotMatch(main, /backdrop-filter/, 'backdrop-filter 가 남아 있다');
});

test('모든 화면에 뜨는 토스트·확인창은 프레임 규칙을 따른다', () => {
  for (const [name, src] of [['toast.js', toast], ['confirm-dialog.js', dialog]]) {
    const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    assert.deepEqual(hex, [], `${name} 에 하드코딩된 색: ${[...new Set(hex)].join(', ')}`);

    const shadows = src.match(/box-shadow\s*:\s*(?!none)[^;]+/g) || [];
    assert.deepEqual(shadows, [], `${name} 에 그림자가 남아 있다:\n${shadows.join('\n')}`);

    const radii = (src.match(/border-radius\s*:\s*[^;]+/g) || []).map(v => v.split(':')[1].trim());
    const bad = radii.filter(v => !/^0(px)?$/.test(v) && !v.includes('--cp-pill') && !v.includes('--cp-radius'));
    assert.deepEqual(bad, [], `${name} 의 라운드: ${[...new Set(bad)].join(', ')}`);

    // 확인창의 가림막이 rgba(15,23,42,.55) 로 박혀 있었다. 다크 모드에서
    // 같은 값이면 뒤가 덜 가려진다. --cp-scrim 토큰을 쓴다.
    assertNoRgbaColors(src, name);
  }
});

test('프레임의 라운드는 0 이거나 알약 토큰이다', () => {
  // --cp-radius 를 허용하되, 그 값이 실제로 0 인지 먼저 확인한다.
  // 토큰만 보고 통과시키면 나중에 값이 바뀌어도 이 테스트가 눈치채지 못한다.
  const tokens = read('../src/styles/tokens.css');
  const radius = /--cp-radius\s*:\s*([^;]+);/.exec(tokens);
  assert.ok(radius, '--cp-radius 토큰이 없다');
  assert.equal(radius[1].trim(), '8px', `--cp-radius 가 0 이 아니다: ${radius[1].trim()}`);

  const values = (css.match(/border-radius\s*:\s*[^;]+/g) || []).map(v => v.split(':')[1].trim());
  const bad = values.filter(v => !/^0(px)?$/.test(v) && !v.includes('--cp-pill') && !v.includes('--cp-radius'));
  assert.deepEqual(bad, [], `각진 형태가 이 방향의 핵심이다:\n${[...new Set(bad)].join('\n')}`);
});
