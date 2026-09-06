/**
 * 화면 하나만 어둡게 한다 — 결과·지도 화면(`/view`).
 *
 * 왜 이 화면만인가. 사용자는 이 화면을 **이동 중에** 본다. 어두운 화면이
 * 배터리에 유리하고 밤에 눈이 덜 부시다. 무엇보다 구글 지도 타일은 우리
 * 테마를 따르지 않고 늘 어두운 편이라, 밝은 앱 배경 위에 얹히면 지도와
 * 일정이 서로 다른 두 물건으로 보인다. 이 화면만 어둡게 하면 둘의 밝기가
 * 붙어 한 화면으로 읽힌다.
 *
 * 강제는 딱 한 번이다. 이 화면에서 사용자가 직접 테마를 바꾸면 그 선택이
 * 이기고, 그 뒤로는 다시 강제하지 않는다 — 시스템 다크 모드를 다루는 규칙
 * ("고른 적 없을 때만 따라간다")과 같은 어휘다. 토글을 눌렀는데 화면이
 * 그대로면 사용자에게는 고장으로 보인다.
 */

/** 다크 팔레트를 강제로 켜는 표시. tokens.css 의 다크 규칙이 이 값을 본다. */
export const ROUTE_THEME_ATTR = 'data-route-theme';

/**
 * 이 경로가 어두운 화면인가.
 * `/viewer` 나 `/verify` 처럼 앞글자만 겹치는 경로에 걸리지 않도록
 * 경계(`/` 또는 끝)를 요구한다.
 */
export function isDarkRoute(path) {
  return /^\/(?:view|share)(\/|$)/.test(String(path || ''));
}

/** 사용자가 이 화면에서 직접 바꿨는가. 한 번 바꾸면 이 세션 동안 강제하지 않는다. */
let userChose = false;

/** 원래의 theme-color 값들. 처음 한 번만 기억한다. */
let originalColors = null;

function themeColorMetas() {
  return Array.from(document.querySelectorAll('meta[name="theme-color"]'));
}

function enter() {
  const root = document.documentElement;
  if (root.getAttribute(ROUTE_THEME_ATTR) === 'dark') return;

  const metas = themeColorMetas();
  if (originalColors === null) originalColors = metas.map(m => m.getAttribute('content'));

  root.setAttribute(ROUTE_THEME_ATTR, 'dark');

  // 속성을 먼저 붙여야 다크 팔레트가 켜진다. 그 뒤에 읽어야 지금 화면이
  // 실제로 쓰는 지면색이 나온다 — 값을 여기 박아 두면 tokens.css 를 고쳤을 때
  // 화면과 상태바가 조용히 갈라진다.
  const paper = getComputedStyle(root).getPropertyValue('--cp-paper').trim();
  if (!paper) return;

  // 라이트/다크 두 선언 모두를 덮는다. 시스템이 라이트인 폰에서도 이 화면의
  // 상태 표시줄은 어두워야 하기 때문이다.
  for (const meta of metas) meta.setAttribute('content', paper);
}

function leave() {
  const root = document.documentElement;
  if (!root.hasAttribute(ROUTE_THEME_ATTR)) return;
  root.removeAttribute(ROUTE_THEME_ATTR);
  if (originalColors === null) return;
  themeColorMetas().forEach((meta, i) => {
    const value = originalColors[i];
    if (value != null) meta.setAttribute('content', value);
  });
}

/** 경로에 맞춰 테마를 정한다. 라우터가 매 이동마다 부른다. */
export function applyRouteTheme(path) {
  if (!userChose && isDarkRoute(path)) enter();
  else leave();
}

/**
 * 사용자가 테마 토글을 눌렀다. 지금 화면의 강제를 풀고, 이 세션 동안
 * 다시 강제하지 않는다.
 */
export function releaseRouteTheme() {
  userChose = true;
  leave();
}
