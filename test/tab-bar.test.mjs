/**
 * 하단 탭바가 보일 자리와, 지금 어느 탭에 서 있는지.
 *
 * **왜 이제야 만드나.** 탭바는 "동등한 최상위 구역이 여럿 있다"는 뜻이다.
 * 이 앱은 랜딩 → 폼 → 선호 → 결과로 **흐르는** 구조라 그런 구역이 없다고 보고
 * 미뤄 뒀었다. 다시 보니 **처음 오는 사람**에게는 흐름이 맞지만 **다시 찾아온
 * 사람**에게는 갈 곳이 셋이다 — 새로 만들거나, 전에 만든 걸 다시 보거나,
 * 계정을 손보거나. 저장된 일정은 지금 프로필 안 둘째 탭에 묻혀 있다.
 *
 * 그래서 로그인한 사람에게만, 흐름이 아닌 자리에서만 띄운다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { TABS, shouldShowTabBar, activeTabId } from '../src/app/tab-bar.mjs';

const user = { uid: 'u1' };

/**
 * "새 일정"은 **흐름의 처음**으로 간다.
 *
 * 처음에는 `/plan`(폼)으로 보냈다. 사용자가 바로 잡아 줬다 — "내 일정"에 갔다
 * "새 일정"을 누르면 **테마·예산을 고르는 단계를 건너뛰고** 폼이 떴다.
 * 탭 이름이 "새 일정"이면 새로 시작한다는 뜻이지, 지난번 조건을 물고 폼으로
 * 들어간다는 뜻이 아니다. 선호 단계는 이미 같은 탭으로 묶여 있다.
 */
test('새 일정 탭은 선호 단계부터 시작한다', () => {
  const plan = TABS.find(t => t.id === 'plan');
  assert.equal(plan.path, '/preference/1', '폼으로 바로 보내면 테마·예산을 건너뛴다');
  // 그 자리에서도 첫 탭이 켜져 있어야 한다(같은 흐름이다).
  assert.equal(activeTabId(plan.path), 'plan');
});

test('탭은 셋이고 저마다 갈 곳과 사전 키를 갖는다', () => {
  assert.equal(TABS.length, 3);
  assert.deepEqual(TABS.map(t => t.id), ['plan', 'trips', 'profile']);
  for (const tab of TABS) {
    assert.match(tab.path, /^\//, `${tab.id} 의 경로가 이상하다`);
    assert.match(tab.labelKey, /^tab[A-Z]/, `${tab.id} 의 사전 키가 없다`);
  }
});

test('로그인하지 않았으면 띄우지 않는다', () => {
  // 랜딩·로그인·가입은 아직 "내 것"이 없는 사람의 화면이다.
  assert.equal(shouldShowTabBar({ path: '/plan', user: null }), false);
  assert.equal(shouldShowTabBar({ path: '/profile/trips', user: null }), false);
});

test('공개 화면에서는 띄우지 않는다', () => {
  for (const path of ['/', '/index.html', '/login', '/join', '/verify?x=1']) {
    assert.equal(shouldShowTabBar({ path, user }), false, `${path} 에서 떴다`);
  }
});

test('결과 화면에서는 감춘다 — 바닥은 시트가 갖는다', () => {
  // 바닥에 막대가 둘이면 어느 쪽이 지금 화면의 것인지 알 수 없다.
  assert.equal(shouldShowTabBar({ path: '/view', user }), false);
  assert.equal(shouldShowTabBar({ path: '/view/abc123', user }), false);
  assert.equal(shouldShowTabBar({ path: '/share/abc123', user }), false);
  assert.equal(shouldShowTabBar({ path: '/share/abc123', user: null }), false);
});

test('일정을 만드는 자리와 계정 자리에서는 띄운다', () => {
  for (const path of ['/plan', '/preference/1', '/preference/2', '/profile', '/profile/trips', '/profile/security']) {
    assert.equal(shouldShowTabBar({ path, user }), true, `${path} 에서 안 떴다`);
  }
});

test('모르는 경로에서는 띄우지 않는다', () => {
  // 판단이 애매하면 화면을 덜 가리는 쪽이 안전하다.
  assert.equal(shouldShowTabBar({ path: '/what/is/this', user }), false);
  assert.equal(shouldShowTabBar({}), false);
  assert.equal(shouldShowTabBar(), false);
});

test('선호 단계는 "새 일정"의 일부다', () => {
  // 테마·예산을 고르는 것은 일정을 만드는 흐름 안이지 따로 있는 구역이 아니다.
  assert.equal(activeTabId('/preference/1'), 'plan');
  assert.equal(activeTabId('/preference/2'), 'plan');
  assert.equal(activeTabId('/plan'), 'plan');
});

test('저장된 일정과 프로필은 다른 탭이다', () => {
  assert.equal(activeTabId('/profile/trips'), 'trips');
  assert.equal(activeTabId('/profile'), 'profile');
  assert.equal(activeTabId('/profile/personal'), 'profile');
  assert.equal(activeTabId('/profile/security'), 'profile');
});

test('어느 탭도 아닌 자리에서는 아무 탭도 켜지 않는다', () => {
  assert.equal(activeTabId('/view/abc'), null);
  assert.equal(activeTabId('/'), null);
  assert.equal(activeTabId(undefined), null);
});

test('물음표와 뒤 슬래시가 붙어도 같은 판단이다', () => {
  assert.equal(activeTabId('/profile/trips?from=share'), 'trips');
  assert.equal(activeTabId('/plan/'), 'plan');
  assert.equal(shouldShowTabBar({ path: '/plan?x=1', user }), true);
});
