/**
 * 지도가 경로를 어디에 놓아야 하는가.
 *
 * 지금까지 지도는 **고정 일정 한 곳**을 가운데 놓고 배율을 14 로 박았다.
 * 그래서 ① 그 날의 나머지 장소가 화면 밖에 있어도 알 수 없었고
 * ② 지도 위에 일정 시트가 얹혀 있는데 그 사실을 모르고 가운데를 잡아,
 * 경로가 시트 뒤로 밀렸다. "지도의 가운데"와 "사람이 보는 가운데"는 다르다.
 *
 * 여기 있는 것은 전부 순수 계산이다 — 사각형과 좌표만 받는다.
 * google.maps 를 부르는 일은 map-view.js 가 한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_PADDING,
  edgeInsetFor,
  framePadding,
  sheetFramePadding,
  SHEET_FRAME_MAX_RATIO,
  centerOffsetFor,
  toPoint,
  spanOf,
  isSinglePlace
} from '../src/domains/map/services/map-framing.mjs';

/** 폰: 무대 390×700, 시트가 아래에서 104px 만 보인다(peek). */
const stage = { top: 0, left: 0, right: 390, bottom: 700, width: 390, height: 700 };
const peekSheet = { top: 596, left: 0, right: 390, bottom: 700, width: 390, height: 104 };
/** 노트북: 무대 1200×800, 시트가 오른쪽 480px 패널. */
const wideStage = { top: 0, left: 0, right: 1200, bottom: 800, width: 1200, height: 800 };
const sidePanel = { top: 0, left: 720, right: 1200, bottom: 800, width: 480, height: 800 };
/** 지도 위에 뜬 버튼 줄 — 위에서 조금 떨어져 있다(top: 0.85rem). */
const actions = { top: 14, left: 14, right: 376, bottom: 58, width: 362, height: 44 };

test('아래에서 올라온 시트는 아래쪽을 덮는다', () => {
  assert.deepEqual(edgeInsetFor(stage, peekSheet), { top: 0, right: 0, bottom: 104, left: 0 });
});

test('오른쪽 패널은 오른쪽을 덮는다', () => {
  assert.deepEqual(edgeInsetFor(wideStage, sidePanel), { top: 0, right: 480, bottom: 0, left: 0 });
});

test('가장자리에 딱 붙지 않아도 어느 변인지 안다', () => {
  // .view-actions 는 top: 0.85rem 이라 무대 윗변에 닿지 않는다. 닿는지를
  // 따지면 이 버튼 줄을 영영 못 세고, 핀이 검은 버튼 뒤에 숨는다.
  assert.deepEqual(edgeInsetFor(stage, actions), { top: 58, right: 0, bottom: 0, left: 0 });
});

test('지도를 통째로 덮는 것은 어느 변으로도 치지 않는다', () => {
  // 네 변에서 똑같이 깊으면 "여백을 주면 해결된다"가 성립하지 않는다.
  // 그런 것에 여백을 내주면 지도가 남지 않는다.
  const full = { ...stage };
  assert.deepEqual(edgeInsetFor(stage, full), { top: 0, right: 0, bottom: 0, left: 0 });
});

test('무대 밖에 있는 것은 세지 않는다', () => {
  const elsewhere = { top: 900, left: 0, right: 390, bottom: 1000, width: 390, height: 100 };
  assert.deepEqual(edgeInsetFor(stage, elsewhere), { top: 0, right: 0, bottom: 0, left: 0 });
});

test('여러 개가 같은 변을 덮으면 더 깊은 쪽을 쓴다', () => {
  const shallow = { top: 650, left: 0, right: 390, bottom: 700, width: 390, height: 50 };
  const padding = framePadding(stage, [shallow, peekSheet]);
  assert.equal(padding.bottom, 104 + MIN_PADDING, '얕은 쪽을 쓰면 시트가 그만큼 경로를 덮는다');
});

test('덮인 변이 없어도 최소 여백은 준다 — 핀이 모서리에 붙으면 잘려 보인다', () => {
  const padding = framePadding(stage, []);
  assert.deepEqual(padding, { top: MIN_PADDING, right: MIN_PADDING, bottom: MIN_PADDING, left: MIN_PADDING });
});

test('덮인 만큼에 최소 여백을 더한다', () => {
  const padding = framePadding(stage, [peekSheet, actions]);
  assert.deepEqual(padding, {
    top: 58 + MIN_PADDING,
    right: MIN_PADDING,
    bottom: 104 + MIN_PADDING,
    left: MIN_PADDING
  });
});

test('여백이 지도를 다 먹지 않게 막는다', () => {
  // 가로로 누운 폰처럼 무대가 낮으면 시트(104) + 버튼 줄(58) + 최소 여백이
  // 화면 높이에 육박한다. 그대로 넘기면 fitBounds 가 맞출 자리가 없다.
  const shortStage = { top: 0, left: 0, right: 700, bottom: 240, width: 700, height: 240 };
  const sheet = { top: 136, left: 0, right: 700, bottom: 240, width: 700, height: 104 };
  const bar = { top: 14, left: 14, right: 686, bottom: 58, width: 672, height: 44 };
  const padding = framePadding(shortStage, [sheet, bar]);
  assert.ok(padding.top + padding.bottom <= 240 * 0.7 + 0.001,
    `세로 여백이 ${padding.top + padding.bottom} 다 — 지도가 남지 않는다`);
  // 줄이더라도 위아래 비율은 그대로 둔다(덮인 쪽이 더 많이 비어야 한다).
  assert.ok(padding.bottom > padding.top);
});

test('넉넉한 무대에서는 줄이지 않는다', () => {
  const padding = framePadding(stage, [peekSheet, actions]);
  assert.equal(padding.bottom, 104 + MIN_PADDING);
  assert.equal(padding.top, 58 + MIN_PADDING);
});

test('없는 사각형은 건너뛴다', () => {
  assert.deepEqual(framePadding(stage, [null, undefined, peekSheet]).bottom, 104 + MIN_PADDING);
  assert.deepEqual(framePadding(null, [peekSheet]), {
    top: MIN_PADDING, right: MIN_PADDING, bottom: MIN_PADDING, left: MIN_PADDING
  });
});

test('한 곳만 있을 때 밀어 줄 거리 — 아래가 덮인 만큼 위로 올린다', () => {
  // 아래 128, 위 24 가 덮였으면 보이는 가운데는 지도 가운데보다 52px 위다.
  assert.deepEqual(centerOffsetFor({ top: 24, right: 24, bottom: 128, left: 24 }), { x: 0, y: 52 });
});

test('오른쪽 패널이면 가로로 밀어 준다', () => {
  assert.deepEqual(centerOffsetFor({ top: 24, right: 504, bottom: 24, left: 24 }), { x: 240, y: 0 });
});

test('아무 데도 안 덮였으면 밀지 않는다', () => {
  assert.deepEqual(centerOffsetFor({ top: 24, right: 24, bottom: 24, left: 24 }), { x: 0, y: 0 });
});

test('좌표는 함수형이든 값형이든 읽는다', () => {
  // google.maps.LatLng 는 lat()/lng() 함수를, 지오코딩 결과는 값을 준다.
  assert.deepEqual(toPoint({ lat: 37.5, lng: 127.0 }), { lat: 37.5, lng: 127.0 });
  assert.deepEqual(toPoint({ lat: () => 37.5, lng: () => 127.0 }), { lat: 37.5, lng: 127.0 });
  assert.equal(toPoint(null), null);
  assert.equal(toPoint({ lat: 'x', lng: 1 }), null);
});

test('좌표 폭을 잰다', () => {
  const span = spanOf([{ lat: 37.5, lng: 127.0 }, { lat: 37.6, lng: 127.2 }]);
  assert.ok(Math.abs(span.lat - 0.1) < 1e-9);
  assert.ok(Math.abs(span.lng - 0.2) < 1e-9);
});

test('같은 자리만 있으면 "한 곳"으로 본다', () => {
  // 호텔에서 출발해 호텔로 돌아오는 하루는 두 점이 같은 자리다.
  // 그대로 fitBounds 하면 배율이 끝까지 파고들어 건물 하나만 남는다.
  assert.equal(isSinglePlace([{ lat: 37.5, lng: 127.0 }]), true);
  assert.equal(isSinglePlace([{ lat: 37.5, lng: 127.0 }, { lat: 37.5, lng: 127.0 }]), true);
  assert.equal(isSinglePlace([{ lat: 37.5, lng: 127.0 }, { lat: 37.5001, lng: 127.0001 }]), true);
  assert.equal(isSinglePlace([{ lat: 37.5, lng: 127.0 }, { lat: 37.55, lng: 127.0 }]), false);
  assert.equal(isSinglePlace([]), true);
});

test('휴대폰 결과 시트는 지도 아래 62% 를 덮고 버튼 줄은 위를 덮는다', () => {
  // 작은 뒤로 버튼을 그대로 재면 왼쪽 여백으로 잡혀 핀이 그 아래로 들어간다. 줄 전체를 위 여백으로 본다.
  const phone = { top: 0, left: 0, right: 402, bottom: 874 };
  const padding = sheetFramePadding(phone, 110, 0.62);
  assert.equal(padding.top, 110 + MIN_PADDING);
  assert.ok(Math.abs(padding.bottom - (874 * 0.62 + MIN_PADDING)) < 0.001);
  assert.equal(padding.left, MIN_PADDING);
  assert.equal(padding.right, MIN_PADDING);
});

test('가로로 눕혀 지도가 낮아도 맞출 자리를 남긴다', () => {
  const low = { top: 0, left: 0, right: 874, bottom: 402 };
  const padding = sheetFramePadding(low, 60, 0.62);
  assert.ok(padding.top + padding.bottom <= 402 * SHEET_FRAME_MAX_RATIO + 0.001);
});
