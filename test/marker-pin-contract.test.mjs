/**
 * 핀을 어떤 어휘로 만드는가에 대한 계약.
 *
 * Maps JS 3.62.11d(2025-10-23)에서 `PinElement` 의 `glyph` 와 `element` 가
 * 둘 다 deprecated 됐다. 지금은 콘솔 경고로만 나오지만, 이 둘은 **경고가
 * 조용한 종류**다 — 핀은 그대로 그려지므로 화면만 봐서는 아무 문제가 없어
 * 보이고, 나중에 제거되는 날 지도에서 번호가 사라지거나 마커가 통째로
 * 안 뜨는 것으로 처음 드러난다.
 *
 * `glyph` 는 문자열·이미지·HTML 을 다 받던 자리라 뜻이 여러 개였다.
 * 새 어휘는 그것을 `glyphText`(글자)와 `glyphSrc`(이미지)로 갈랐다.
 * 이 앱이 핀에 넣는 것은 방문 순번(`1`, `2·3`)이니 `glyphText` 다.
 *
 * `element` 는 PinElement 가 만든 DOM 을 꺼내 쓰던 자리인데, PinElement
 * 자체가 이미 HTMLElement(`<gmp-pin>`)라 꺼낼 이유가 없어졌다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stripSourceComments } from './helpers/style-contract.mjs';

const mapView = stripSourceComments(
  readFileSync(new URL('../src/domains/map/ui/map-view.js', import.meta.url), 'utf8')
);

test('핀의 글자는 glyphText 로 넣는다', () => {
  assert.match(
    mapView,
    /glyphText\s*:/,
    '핀에 넣는 것은 방문 순번(글자)이므로 glyphText 다'
  );
});

test('deprecated 된 glyph 옵션은 쓰지 않는다', () => {
  // glyphColor·glyphText 는 살아 있는 이름이므로 그 뒤에 글자가 오는 경우를
  // 빼고, `glyph` 바로 뒤에 콜론이 오는 자리만 본다.
  assert.ok(
    !/\bglyph\s*:/.test(mapView),
    'glyph 는 deprecated 다 — glyphText 로 바꿔야 한다'
  );
});

test('PinElement 를 그대로 마커 content 로 넘긴다', () => {
  assert.match(
    mapView,
    /content\s*:\s*pinView\s*[,}]/,
    'PinElement 는 이미 HTMLElement 다 — 그대로 넘기면 된다'
  );
});

test('deprecated 된 .element 로 DOM 을 꺼내지 않는다', () => {
  assert.ok(
    !/pinView\s*\.\s*element\b/.test(mapView),
    'PinElement.element 는 deprecated 다 — PinElement 자체를 쓴다'
  );
});
