/**
 * 프레이밍을 누가 아는가에 대한 계약.
 *
 * 지도는 자기 위에 무엇이 얹혀 있는지 모른다 — 알아야 할 이유도 없다.
 * 시트도 버튼 줄도 앱 층(`main.js`)이 배치한 것이니, **재는 일은 앱이 하고
 * 맞추는 일은 지도가 한다.** 지도가 `#itinerary-sheet` 를 직접 찾기 시작하면
 * 결과 화면 밖(예: 미리보기)에서 쓸 수 없는 컴포넌트가 된다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stripSourceComments } from './helpers/style-contract.mjs';

const mapView = stripSourceComments(
  readFileSync(new URL('../src/domains/map/ui/map-view.js', import.meta.url), 'utf8')
);
const main = stripSourceComments(readFileSync(new URL('../src/app/main.js', import.meta.url), 'utf8'));

test('지도는 경로 전체가 들어오게 맞춘다', () => {
  assert.match(mapView, /fitBounds\(/, '한 곳에 배율을 박으면 나머지 장소는 화면 밖이다');
  assert.match(mapView, /LatLngBounds/);
});

test('맞출 때 덮인 만큼을 여백으로 준다', () => {
  assert.match(
    mapView,
    /getFrameInsets/,
    '여백을 모르면 경로가 시트 뒤로 밀린다'
  );
  assert.match(
    mapView,
    /fitBounds\(\s*bounds\s*,\s*padding\s*\)/,
    'fitBounds 의 둘째 인자가 여백이다 — 안 주면 계산해 놓고 안 쓰는 셈이다'
  );
});

test('지도는 앱의 DOM 을 뒤지지 않는다', () => {
  for (const id of ['itinerary-sheet', 'page-view', 'view-actions']) {
    assert.ok(
      !mapView.includes(id),
      `map-view.js 가 ${id} 를 직접 찾는다 — 재는 일은 앱 층이 해야 한다`
    );
  }
});

test('앱 층이 재서 지도에 알려 준다', () => {
  assert.match(
    main,
    /import\s*\{[^}]*framePadding[^}]*\}\s*from\s*['"][^'"]*map-framing\.mjs['"]/
  );
  assert.match(main, /getFrameInsets\s*=/, '지도에 여백을 알려 주는 자리가 없다');
});

test('여백은 잴 때마다 새로 잰다', () => {
  // 값 하나를 미리 넣어 두면 시트가 움직이거나 창 크기가 바뀐 뒤에 틀린다.
  // 함수로 넘겨 두면 맞추는 그 순간의 화면을 잰다.
  assert.match(main, /getFrameInsets\s*=\s*\(\s*\)\s*=>/);
});

test('아주 가까운 장소들만 있어도 과하게 파고들지 않는다', () => {
  assert.match(mapView, /MAX_FIT_ZOOM/, 'fitBounds 는 두 점이 가까우면 배율을 끝까지 올린다');
  assert.match(mapView, /isSinglePlace\(/, '같은 자리만 있는 하루는 fitBounds 로 맞출 수 없다');
});
