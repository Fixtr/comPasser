/**
 * 하단 탭바가 보일 자리와, 지금 어느 탭에 서 있는지.
 *
 * **왜 이제야 만드나.** 탭바는 "동등한 최상위 구역이 여럿 있다"는 뜻이다.
 * 이 앱은 랜딩 → 폼 → 선호 → 결과로 **흐르는** 구조라 그런 구역이 없다고 보고
 * 한 번 미뤄 뒀었다. 다시 보니 그 판단은 **처음 오는 사람** 기준이었다.
 * 다시 찾아온 사람에게는 갈 곳이 셋이다 — 새로 만들거나, 전에 만든 걸 다시
 * 보거나, 계정을 손보거나. 그중 "전에 만든 것"은 지금 프로필 안 둘째 탭에
 * 묻혀 있어 두 번 눌러야 닿는다.
 *
 * DOM 도 라우터도 모르는 순수 판단이라 표로 검사할 수 있다.
 */
import { isPublicPath } from './route-decision.mjs';

/** 탭 셋. 순서가 화면 순서다(왼쪽부터 만들기 → 보기 → 나). */
export const TABS = [
  { id: 'plan', path: '/plan', labelKey: 'tabPlan', icon: 'calendar' },
  { id: 'trips', path: '/profile/trips', labelKey: 'tabTrips', icon: 'list' },
  { id: 'profile', path: '/profile/personal', labelKey: 'tabProfile', icon: 'user' },
];

/** 물음표와 뒤 슬래시를 걷어 낸 경로. `/plan?x=1` 과 `/plan/` 은 같은 자리다. */
function normalize(path) {
  if (typeof path !== 'string') return '';
  const clean = path.split('?')[0].split('#')[0];
  return clean.length > 1 ? clean.replace(/\/+$/, '') : clean;
}

/**
 * 이 화면에 탭바를 띄울 것인가.
 *
 * 감추는 자리가 셋이다.
 *  - **로그인 전** — 아직 "내 것"이 없는 사람에게 내 일정·프로필은 빈 방이다.
 *  - **공개 화면**(랜딩·로그인·가입·인증) — 흐름의 입구이지 구역이 아니다.
 *  - **결과 화면** — 그 화면의 바닥은 이미 일정 시트가 갖고 있다. 바닥에
 *    막대가 둘이면 어느 쪽이 지금 화면의 것인지 알 수 없다.
 */
export function shouldShowTabBar({ path, user = null } = {}) {
  if (!user) return false;
  const target = normalize(path);
  if (!target) return false;
  if (isPublicPath(target)) return false;
  if (target.startsWith('/view')) return false;
  return activeTabId(target) !== null;
}

/**
 * 지금 켜 둘 탭. 어느 탭도 아니면 `null`.
 *
 * 선호 단계(`/preference/*`)는 **"새 일정"의 일부**로 본다 — 테마와 예산을
 * 고르는 것은 일정을 만드는 흐름 안이지 따로 있는 구역이 아니다.
 */
export function activeTabId(path) {
  const target = normalize(path);
  if (!target) return null;
  if (target === '/plan' || target.startsWith('/preference')) return 'plan';
  if (target === '/profile/trips') return 'trips';
  if (target === '/profile' || target.startsWith('/profile/')) return 'profile';
  return null;
}
