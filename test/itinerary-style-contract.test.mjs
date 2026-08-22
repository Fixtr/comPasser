import test from 'node:test';
import assert from 'node:assert/strict';

import { itineraryStyles } from '../src/domains/itinerary/ui/itinerary-style.js';

/**
 * 결과 화면의 형태 규칙을 코드로 붙잡아 둔다.
 *
 * 이 규칙들은 취향이 아니라 세 가지를 동시에 사기 위한 것이다 —
 *  1) 야외 가독성: 낯선 도시를 걸어다니는 사용자가 햇빛 아래에서 읽는다
 *  2) 렌더 비용: Capacitor 로 저사양 안드로이드에도 올라간다
 *  3) 캡처 호환: html2canvas 는 그림자·그라디언트·최신 색 함수를 제대로 못 읽는다
 *     (PRD 3.7 에 color(display-p3) 로 캡처가 깨진 이력이 있다)
 *
 * 스타일은 시간이 지나면 조용히 되돌아간다. 그림자 하나, 하드코딩 색 하나가
 * 늘어나는 건 리뷰에서 잘 안 보이므로 테스트로 막는다.
 */

/** 주석을 지운 스타일 본문. 주석 안의 예시까지 위반으로 잡지 않기 위해. */
const css = itineraryStyles.replace(/\/\*[\s\S]*?\*\//g, '');

test('그림자를 쓰지 않는다', () => {
  const hits = css.match(/box-shadow\s*:\s*(?!none)[^;]+/g) || [];
  assert.deepEqual(hits, [], `그림자 대신 1px 실선으로 경계를 만든다:\n${hits.join('\n')}`);
});

test('그라디언트를 쓰지 않는다', () => {
  const hits = css.match(/(linear|radial|conic)-gradient\([^)]*\)/g) || [];
  assert.deepEqual(hits, [], `캡처에서 사라지는 표현이다:\n${hits.join('\n')}`);
});

test('색은 전부 토큰에서 온다', () => {
  const hits = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hits, [], `하드코딩된 색은 var(--cp-*) 로 바꾼다:\n${[...new Set(hits)].join(', ')}`);
});

test('최신 색 함수를 쓰지 않는다', () => {
  const hits = css.match(/\b(oklch|oklab|lch|lab|color-mix|color)\s*\(/g) || [];
  assert.deepEqual(hits, [], `html2canvas 가 읽지 못해 공유 이미지가 깨진다:\n${hits.join(', ')}`);
});

test('라운드는 0 이거나 알약 토큰만 쓴다', () => {
  const values = (css.match(/border-radius\s*:\s*[^;]+/g) || [])
    .map(v => v.split(':')[1].trim());
  const bad = values.filter(v => !/^0$/.test(v) && !v.includes('--cp-pill'));
  assert.deepEqual(bad, [], `각진 형태가 이 방향의 핵심이다:\n${[...new Set(bad)].join('\n')}`);
});

test('타임라인과 지도가 같은 색 어휘를 쓴다', () => {
  // 고정 일정 / 첫 장소 / 나머지 — map/COMMAND_GUIDE.md 의 마커 규칙과 같은 토큰.
  assert.ok(css.includes('--cp-anchor'), '고정 일정 색이 지도 핀과 같은 토큰이어야 한다');
});

import { getTransitStyle } from '../src/domains/itinerary/ui/itinerary-render-helpers.js';

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
  // 이모지는 OS 가 정한 자기 색을 갖고 들어와 무채색 규칙을 깨고,
  // 기기마다 모양이 달라 캡처 결과도 달라진다.
  for (const vt of [null, 'BUS', 'SUBWAY', 'TRAIN', 'TAXI']) {
    const { icon } = getTransitStyle(vt ? 'TRANSIT' : 'WALKING', vt);
    assert.match(icon, /^<svg /, '인라인 SVG 여야 한다');
    assert.match(icon, /currentColor/, '감싼 요소의 색을 따라야 한다');
    assert.doesNotMatch(icon, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, '이모지가 남아 있다');
  }
});
