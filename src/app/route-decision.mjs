/**
 * "지금 이 주소에서 무엇을 할 것인가"만 정하는 순수 판단.
 *
 * 라우터에서 이 판단을 떼어 낸 이유가 있다. 공유 링크가 열리지 않는 버그가
 * 있었는데, 원인이 가드 한 줄이 아니라 **판단 시점**이었기 때문이다.
 *
 * 랜딩이 빈 화면이 되던 것을 고치면서 라우터를 인증 구독보다 먼저 한 번
 * 돌리게 했다. 그런데 그 첫 회차에는 아직 `user` 가 `null` 이다. 그래서
 * `/view/:id` 로 들어온 사람이
 *
 *   ① 첫 회차: 로그인 안 한 사람으로 보여 `/login` 으로 밀리고
 *   ② 인증 확정 후: "로그인한 사람이 로그인 화면에 있다"고 판단돼
 *      `/preference/1` 로 다시 밀렸다
 *
 * 원래 가려던 주소는 그 사이에 사라진다. 티켓·공유를 만들어 놓고 정작
 * 받는 사람이 링크를 못 여는 상태였다.
 *
 * 규칙은 하나다 — **모르면 판단하지 않는다.** 인증이 확정되기 전에는
 * 로그인 여부로 갈리는 경로를 건드리지 않고 기다린다. 대신 로그인 여부와
 * 무관한 곳은 그대로 그린다. 그래야 Firebase 가 답하지 않아도 첫 화면과
 * 로그인 문은 열린다.
 */

/** 홈으로 쳐 주는 경로. 가드와 렌더 분기가 같은 답을 써야 한다. */
export function isHomePath(path) {
  const p = String(path ?? '');
  return p === '/' || p === '/home' || p.endsWith('/index.html');
}

/** 명시한 내부 화면만 복귀를 허용한다. 복귀 자체가 생성·삭제를 실행하지 않는다. */
export function getSafeReturnPath(value) {
  if (value === '/profile/security' || value === '/profile/trips' || value === '/home' || value === '/preference/1') return value;
  if (typeof value === 'string' && /^\/home\?review=[a-zA-Z0-9]+$/.test(value)) return value;
  return typeof value === 'string' && value.match(/^\/(?:share|view)\/[a-zA-Z0-9]+$/)?.[0] === value
    ? value
    : null;
}

/**
 * 로그인 여부와 무관하게 볼 수 있는 곳.
 *
 * 가드와 "인증 대기" 판단이 **같은 목록**을 봐야 한다 — 예전에는 이 목록이
 * 가드 안에 인라인으로 적혀 있어서, 다른 곳에서 같은 판단이 필요해질 때마다
 * 옮겨 적을 수밖에 없었다.
 *
 * 알 수 없는 값은 공개로 본다. 가두는 쪽이 더 위험하다 — 판단이 애매할 때
 * 사용자를 로그인으로 밀어 버리면 정작 갈 곳을 잃는다.
 */
export function isPublicPath(path) {
  if (path == null) return true;
  const p = String(path);
  return isHomePath(p) || p === '/login' || p === '/join' || p === '/account-deletion-status' || p.startsWith('/verify')
    || (/^\/share\//.test(p) && getSafeReturnPath(p) !== null);
}

/**
 * @param {{path?: string, user?: object|null, authSettled?: boolean, hasPreference?: boolean, returnTo?: string|null}} state
 * @returns {{action: 'render'} | {action: 'wait'} | {action: 'redirect', to: string}}
 *   - `wait`  : 아직 판단할 근거가 없다. 화면을 그대로 두고 다음 회차를 기다린다.
 *   - `redirect`: 다른 곳으로 보낸다.
 *   - `render`: 이 주소를 그린다.
 */
export function decideRoute({ path, user = null, authSettled = false, hasPreference = false, returnTo = null } = {}) {
  const target = String(path ?? '/');

  if (isPublicPath(target)) {
    // 로그인한 사람이 로그인·가입 화면에 서 있으면 안으로 들여보낸다.
    // 랜딩은 예외다 — 로고를 눌러 돌아올 자리라 쫓아내지 않는다.
    if (authSettled && user && (target === '/login' || target === '/join')) {
      return { action: 'redirect', to: getSafeReturnPath(returnTo) || (hasPreference ? '/plan' : '/preference/1') };
    }
    return { action: 'render' };
  }

  // 예전 /view/:id 링크는 개인/공유가 섞여 있다. 인증을 확정한 뒤 열고,
  // 게스트는 화면의 데이터 로더가 공개 공유본만 조회한다.
  if (!authSettled) return { action: 'wait' };
  if (/^\/view\//.test(target) && getSafeReturnPath(target)) return { action: 'render' };
  if (!user) return { action: 'redirect', to: '/login' };
  return { action: 'render' };
}
