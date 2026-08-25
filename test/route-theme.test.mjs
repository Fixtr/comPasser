/**
 * 결과 화면만 어둡게 — 보드의 방향 D 중 "다크 + 상태바 색" 부분.
 *
 * 근거는 취향이 아니다. 이 화면은 지도와 함께 보는 화면이고, 사용자는
 * **이동 중에** 본다. 어두운 화면이 배터리에 유리하고, 밤에 눈이 덜 부시고,
 * 무엇보다 구글 지도 타일과 앱 배경의 밝기 차이가 줄어 지도와 일정이
 * 한 화면으로 읽힌다.
 *
 * 다만 강제는 딱 한 번이다 — 사용자가 이 화면에서 직접 테마를 바꾸면
 * 그 선택이 이긴다. 시스템 다크 모드를 다루는 규칙("고른 적 없을 때만
 * 따라간다")과 같은 어휘를 쓴다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isDarkRoute, ROUTE_THEME_ATTR } from '../src/utils/route-theme.js';

const ROOT = new URL('../', import.meta.url).pathname;
const tokens = readFileSync(`${ROOT}src/styles/tokens.css`, 'utf8');
const main = readFileSync(`${ROOT}src/app/main.js`, 'utf8');
const source = readFileSync(`${ROOT}src/utils/route-theme.js`, 'utf8');
const view = readFileSync(`${ROOT}src/domains/itinerary/ui/itinerary-view.js`, 'utf8');

test('결과 화면만 어두운 경로다', () => {
  assert.equal(isDarkRoute('/view'), true);
  assert.equal(isDarkRoute('/view/abc123'), true);
  assert.equal(isDarkRoute('/'), false);
  assert.equal(isDarkRoute('/plan'), false);
  assert.equal(isDarkRoute('/profile'), false);
  // 앞글자가 겹치는 경로에 걸리면 안 된다.
  assert.equal(isDarkRoute('/viewer'), false);
  assert.equal(isDarkRoute('/verify'), false);
  assert.equal(isDarkRoute(null), false);
});

test('다크 팔레트는 여전히 한 규칙에 모여 있다', () => {
  // 세 표시(첫 페인트 전 html[data-theme], 런타임 body.dark, 경로 강제)가
  // 각자 값을 갖게 되면 한쪽만 고쳐지는 날이 온다.
  const rule = /([^}]*)\{\s*color-scheme:\s*dark;[\s\S]*?--cp-paper:[^}]*\}/.exec(tokens);
  assert.ok(rule, '다크 팔레트 규칙을 찾지 못했다');
  const selectors = rule[1];
  for (const needed of ['data-theme="dark"', 'body.dark', `${ROUTE_THEME_ATTR}="dark"`]) {
    assert.ok(selectors.includes(needed), `다크 규칙에 ${needed} 가 없다`);
  }
});

test('상태바 색은 토큰에서 읽는다', () => {
  // 값을 박아 두면 지면색을 바꿨을 때 화면과 상태바가 조용히 갈라진다.
  // pwa-theme-color 가 지키는 불변식과 같은 이유다.
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(source),
    `route-theme.js 에 색이 박혀 있다:\n${(source.match(/#[0-9a-fA-F]{3,8}\b/g) || []).join(', ')}`);
  assert.match(source, /getPropertyValue\(\s*['"]--cp-paper['"]\s*\)/,
    '지면색 토큰을 읽지 않는다');
});

test('라우터가 경로마다 테마를 다시 정한다', () => {
  assert.match(main, /applyRouteTheme\s*\(/, '라우트 변경에서 경로 테마를 적용하지 않는다');
  assert.match(main, /from\s+['"]\.\.\/utils\/route-theme\.js['"]/, 'route-theme 모듈을 쓰지 않는다');
});

test('직접 테마를 바꾸면 그 선택이 이긴다', () => {
  // 토글을 눌렀는데 화면이 그대로면 사용자에게는 고장으로 보인다.
  assert.match(main, /releaseRouteTheme\s*\(/,
    '토글이 경로 강제를 풀지 않는다 — 눌러도 아무 일이 없다');
});

test('캡처는 경로 강제도 함께 되돌린다', () => {
  // 토큰이 세 곳에서 걸리므로 둘만 되돌리면 여전히 어두운 이미지가 나간다.
  // 앞서 data-theme 와 body.dark 로 같은 실수를 한 적이 있다.
  const fn = view.slice(view.indexOf('async downloadAsImage'), view.indexOf('async shareImage'));
  // 이름을 문자열로 다시 적지 않고 공용 상수를 쓰는지까지 본다. 같은 이름이
  // 두 곳에 적히면 한쪽만 고쳐지는 날이 온다.
  assert.match(fn, /ROUTE_THEME_ATTR/,
    '캡처가 경로 강제를 되돌리지 않는다 — 티켓이 어둡게 찍힌다');
  assert.ok(!fn.includes(`'${ROUTE_THEME_ATTR}'`),
    '속성 이름을 문자열로 다시 적었다. 공용 상수를 쓴다');
  assert.match(fn, /removeAttribute\(ROUTE_THEME_ATTR\)/, '캡처 동안 꺼야 한다');
  assert.match(fn, /setAttribute\(ROUTE_THEME_ATTR/, '캡처가 끝나면 되돌려야 한다');
});
