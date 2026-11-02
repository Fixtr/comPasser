/**
 * 지도가 경로를 어디에 놓아야 하는지 계산한다.
 *
 * 문제가 둘이었다.
 *  ① 지도가 **고정 일정 한 곳**을 가운데 놓고 배율을 14 로 박았다. 그 날의
 *     나머지 장소가 화면 밖에 있어도 사용자는 알 수 없다.
 *  ② 지도 위에는 일정 시트(폰: 아래 104px / 노트북: 오른쪽 패널)와 버튼 줄이
 *     얹혀 있다. 그것을 모르고 가운데를 잡으면 경로가 시트 뒤로 밀린다.
 *     **지도의 가운데와 사람이 보는 가운데는 다르다.**
 *
 * 여기 있는 것은 전부 순수 계산이다 — 사각형과 좌표만 받는다.
 * `google.maps` 를 부르는 일은 `map-view.js` 가 한다.
 */

/** 핀이 모서리에 딱 붙으면 잘려 보인다. 어느 변이든 이만큼은 비운다(px). */
export const MIN_PADDING = 24;

/** 이보다 좁게 모여 있으면 "같은 자리"로 본다(대략 50m). */
export const SAME_PLACE_SPAN = 0.0005;

/** 여백이 한 축에서 차지해도 되는 최대 비율. 나머지는 지도 몫이다. */
export const MAX_PADDING_RATIO = 0.7;

const positive = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
const EMPTY = () => ({ top: 0, right: 0, bottom: 0, left: 0 });

/**
 * 얹힌 것 하나가 지도의 **어느 변을** 얼마나 덮는지.
 *
 * 네 변에서 각각 얼마나 파고들었는지 재고 **가장 얕은 변**을 고른다.
 * 아래에서 올라온 시트는 아래로 104px, 나머지 변으로는 지도 전체 깊이만큼
 * 파고든 것으로 계산되므로 자연스럽게 "아래"가 뽑힌다.
 *
 * 가장자리에 닿았는지는 따지지 않는다. 버튼 줄은 `top: 0.85rem` 이라 윗변에
 * 닿지 않는데, 닿는지를 조건으로 걸면 그 줄을 영영 못 세고 핀이 버튼 뒤에 숨는다.
 */
export function edgeInsetFor(stage, overlay) {
  if (!stage || !overlay) return EMPTY();

  // 무대 밖에 있는 것은 지도를 가리지 않는다.
  const overlaps = overlay.left < stage.right && overlay.right > stage.left
    && overlay.top < stage.bottom && overlay.bottom > stage.top;
  if (!overlaps) return EMPTY();

  const depths = {
    top: positive(overlay.bottom - stage.top),
    right: positive(stage.right - overlay.left),
    bottom: positive(stage.bottom - overlay.top),
    left: positive(overlay.right - stage.left),
  };

  const entries = Object.entries(depths).filter(([, depth]) => depth > 0);
  if (entries.length === 0) return EMPTY();

  const [edge, depth] = entries.reduce((a, b) => (b[1] < a[1] ? b : a));

  // 네 변이 똑같이 깊다 = 지도를 통째로 덮었다는 뜻이다. 그런 것에 여백을
  // 내주면 지도가 남지 않는다 — 여백으로 풀 수 있는 문제가 아니다.
  const height = positive(stage.bottom - stage.top);
  const width = positive(stage.right - stage.left);
  if ((edge === 'top' || edge === 'bottom') && depth >= height) return EMPTY();
  if ((edge === 'left' || edge === 'right') && depth >= width) return EMPTY();

  return { ...EMPTY(), [edge]: depth };
}

/**
 * 얹힌 것들을 모두 세어 `fitBounds` 에 줄 여백을 만든다.
 * 같은 변을 여럿이 덮으면 **가장 깊은 것**을 쓴다(둘 다 피해야 하므로).
 */
export function framePadding(stage, overlays = [], { min = MIN_PADDING, maxRatio = MAX_PADDING_RATIO } = {}) {
  const total = EMPTY();
  for (const overlay of overlays) {
    const inset = edgeInsetFor(stage, overlay);
    for (const edge of Object.keys(total)) total[edge] = Math.max(total[edge], inset[edge]);
  }
  for (const edge of Object.keys(total)) total[edge] += min;

  // 가로로 누운 폰처럼 무대가 낮으면 시트 + 버튼 줄 + 최소 여백이 화면
  // 높이에 육박한다. 그대로 넘기면 fitBounds 가 맞출 자리가 없다.
  // 비율은 그대로 두고 함께 줄인다 — 더 많이 덮인 쪽이 계속 더 많이 비도록.
  shrinkPair(total, 'top', 'bottom', positive(stage?.bottom - stage?.top), maxRatio);
  shrinkPair(total, 'left', 'right', positive(stage?.right - stage?.left), maxRatio);
  return total;
}

function shrinkPair(padding, a, b, size, maxRatio) {
  if (!size) return;
  const room = size * maxRatio;
  const sum = padding[a] + padding[b];
  if (sum <= room) return;
  const scale = room / sum;
  padding[a] *= scale;
  padding[b] *= scale;
}

/** 휴대폰 결과 시트는 지도를 많이 덮는다. 기본 비율로 줄이면 핀이 다시 시트 뒤로 간다. */
export const SHEET_FRAME_MAX_RATIO = 0.85;

/**
 * Ionic 결과 시트 위로 경로를 올린다. 시트의 기본 높이로 맞춰 두면 더 접어도 경로가 보인다.
 * 시트는 폰 폭보다 높아 `edgeInsetFor` 가 옆에서 덮는다고 판단하므로, 위아래 띠로 바로 계산한다.
 */
export function sheetFramePadding(stage, topBarBottom, sheetFraction, min = MIN_PADDING) {
  const height = positive(stage?.bottom - stage?.top);
  const padding = {
    top: positive(topBarBottom - stage?.top) + min,
    right: min,
    bottom: height * sheetFraction + min,
    left: min,
  };
  shrinkPair(padding, 'top', 'bottom', height, SHEET_FRAME_MAX_RATIO);
  return padding;
}

/**
 * 한 곳만 있어 `fitBounds` 를 못 쓸 때, 그 곳을 **보이는 가운데**로 보내려면
 * 지도를 얼마나 밀어야 하는가.
 *
 * 아래가 128, 위가 24 덮였다면 보이는 자리의 가운데는 지도 가운데보다 52px
 * 위에 있다. `map.panBy(x, y)` 는 중심을 그만큼 옮기므로 그 값을 그대로 준다.
 */
export function centerOffsetFor(padding = {}) {
  const { top = 0, right = 0, bottom = 0, left = 0 } = padding;
  return { x: (right - left) / 2, y: (bottom - top) / 2 };
}

/**
 * 좌표를 값으로 읽는다. `google.maps.LatLng` 는 `lat()`/`lng()` 함수를 주고
 * 지오코딩 결과는 값을 준다 — 둘 다 온다.
 */
export function toPoint(latLng) {
  if (!latLng) return null;
  const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
  const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** 좌표 무리가 위/경도로 얼마나 벌어져 있나. */
export function spanOf(points = []) {
  const list = points.map(toPoint).filter(Boolean);
  if (list.length === 0) return { lat: 0, lng: 0 };
  const lats = list.map(p => p.lat);
  const lngs = list.map(p => p.lng);
  return {
    lat: Math.max(...lats) - Math.min(...lats),
    lng: Math.max(...lngs) - Math.min(...lngs),
  };
}

/**
 * 사실상 한 곳뿐인가. 호텔에서 출발해 호텔로 돌아오는 하루는 두 점이 같은
 * 자리인데, 그대로 `fitBounds` 하면 배율이 끝까지 파고들어 건물 하나만 남는다.
 */
export function isSinglePlace(points = []) {
  const span = spanOf(points);
  return span.lat < SAME_PLACE_SPAN && span.lng < SAME_PLACE_SPAN;
}
