/**
 * "지금 이 주소에서 무엇을 할 것인가"를 정하는 판단만 떼어 낸 것.
 *
 * 공유 링크가 열리지 않는 버그가 있었다. `/view/:id` 를 주소창에 직접 치거나
 * 새로고침하면 `/preference/1` 로 튕겼다 — 클라이언트 이동은 멀쩡한데
 * 전체 로드만 그랬다.
 *
 * 원인은 가드 한 줄이 아니라 **판단 시점**이었다. 랜딩이 빈 화면이 되던
 * 것을 고치면서 라우터를 인증 구독보다 먼저 한 번 돌리게 했는데, 그 첫
 * 회차에는 아직 `user` 가 `null` 이다. 그래서
 *
 *   ① 첫 회차: 로그인 안 한 사람으로 보고 `/login` 으로 보낸다
 *   ② 인증 확정 후: 이미 `/login` 이므로 "로그인한 사람이 로그인 화면에
 *      있다"고 보고 `/preference/1` 로 보낸다
 *
 * 원래 가려던 `/view/:id` 는 그 사이에 사라진다. 티켓·공유 기능을 만들어
 * 놓고 정작 받는 사람이 링크를 못 여는 상태였다.
 *
 * 고치는 방법은 **모르면 판단하지 않는 것**이다. 인증이 확정되기 전에는
 * 로그인 여부로 갈리는 경로를 아예 판단하지 않고 기다린다. 대신 로그인
 * 여부와 무관한 곳(랜딩·로그인·가입·인증)은 그대로 그린다 — 그래야
 * Firebase 가 답하지 않아도 첫 화면과 로그인 문이 열린다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { decideRoute, isPublicPath, isHomePath, getSafeReturnPath } from '../src/app/route-decision.mjs';

const settled = (path, user, hasPreference = true) =>
  decideRoute({ path, user, authSettled: true, hasPreference });
const pending = (path) =>
  decideRoute({ path, user: null, authSettled: false, hasPreference: true });

test('로그인 여부와 무관한 곳을 안다', () => {
  for (const p of ['/', '/home', '/recommend', '/courses', '/index.html', '/sub/index.html', '/login', '/join', '/account-deletion-status', '/verify', '/verify/abc', '/share/abc123']) {
    assert.equal(isPublicPath(p), true, `${p} 는 로그인 없이 볼 수 있어야 한다`);
  }
  for (const p of ['/plan', '/view', '/view/abc', '/profile', '/preference/1']) {
    assert.equal(isPublicPath(p), false, `${p} 는 인증 확정이 필요하다`);
  }
});

test('홈으로 쳐 주는 경로', () => {
  assert.equal(isHomePath('/'), true);
  assert.equal(isHomePath('/home'), true);
  assert.equal(isHomePath('/index.html'), true);
  assert.equal(isHomePath('/plan'), false);
});

/* ---- 여기가 이 파일의 핵심 ---- */

test('인증을 모르는 동안에는 비공개 경로를 판단하지 않는다', () => {
  // 이 한 줄이 공유 링크를 살린다. 여기서 redirect 를 내면 원래 가려던
  // 주소가 사라지고, 인증이 확정된 뒤에는 되돌릴 방법이 없다.
  assert.deepEqual(pending('/view/abc123'), { action: 'wait' });
  assert.deepEqual(pending('/plan'), { action: 'wait' });
  assert.deepEqual(pending('/profile'), { action: 'wait' });
});

test('인증을 몰라도 랜딩과 로그인 문은 연다', () => {
  // Firebase 가 답하지 않아도 첫 화면은 떠야 한다.
  assert.deepEqual(pending('/'), { action: 'render' });
  assert.deepEqual(pending('/login'), { action: 'render' });
  assert.deepEqual(pending('/join'), { action: 'render' });
  assert.deepEqual(pending('/account-deletion-status'), { action: 'render' });
});

test('공유 전용 링크는 인증을 기다리지 않고 열린다', () => {
  assert.deepEqual(pending('/share/abc123'), { action: 'render' });
  assert.deepEqual(settled('/share/abc123', null), { action: 'render' });
  assert.deepEqual(settled('/share/abc123', { uid: 'u1' }), { action: 'render' });
});

test('예전 일정 링크는 인증 확정 후 게스트도 공유본을 조회할 수 있다', () => {
  assert.deepEqual(settled('/view/abc123', { uid: 'u1' }), { action: 'render' });
  assert.deepEqual(settled('/view/abc123', null), { action: 'render' });
});

test('로그인하지 않았으면 로그인으로 보낸다', () => {
  for (const path of ['/view', '/plan', '/profile', '/preference/1']) {
    assert.deepEqual(settled(path, null), { action: 'redirect', to: '/login' });
  }
});

test('공유 전용 경로와 기존 상세 경로는 유효한 문서 ID만 허용한다', () => {
  for (const path of ['/share', '/share/', '/share/abc/extra', '/view/abc/extra']) {
    assert.deepEqual(settled(path, null), { action: 'redirect', to: '/login' });
  }
});

test('로그인·가입 이후 원래 일정으로 복귀한다', () => {
  for (const path of ['/login', '/join']) {
    for (const returnTo of ['/share/abc123', '/view/ABC123']) {
      assert.deepEqual(decideRoute({ path, user: { uid: 'u1' }, authSettled: true, returnTo }), {
        action: 'redirect', to: returnTo,
      });
    }
  }
});

test('탈퇴 재로그인은 계정 관리 화면으로만 복귀하며 여전히 인증이 필요하다', () => {
  assert.equal(getSafeReturnPath('/profile/security'),'/profile/security');
  assert.equal(isPublicPath('/profile/security'),false);
  assert.deepEqual(settled('/profile/security',null),{action:'redirect',to:'/login'});
  assert.deepEqual(decideRoute({path:'/login',user:{uid:'u1'},authSettled:true,returnTo:'/profile/security'}),{action:'redirect',to:'/profile/security'});
  for(const path of ['/profile','/profile/security?delete=true','/profile/security/','/profile/security\n','//profile/security']) {
    assert.equal(getSafeReturnPath(path),null);
  }
});

test('홈 추천에서 로그인해도 날짜 선택을 건너뛰지 않는다', () => {
  assert.equal(getSafeReturnPath('/preference/1'), '/preference/1');
  assert.equal(isPublicPath('/preference/1'), false);
  assert.deepEqual(decideRoute({ path: '/login', user: { uid: 'u1' }, authSettled: true,
    hasPreference: true, returnTo: '/preference/1' }), { action: 'redirect', to: '/preference/1' });
  for (const value of ['/preference/2', '/preference/1?next=https://evil.example', '/preference/1/']) {
    assert.equal(getSafeReturnPath(value), null);
  }
});

test('커뮤니티 후기·코스 공개 로그인은 지정한 내부 화면으로 복귀한다', () => {
  for (const value of ['/home', '/home?review=route123', '/recommend', '/courses', '/courses?review=route123', '/profile/trips']) {
    assert.equal(getSafeReturnPath(value), value);
    assert.deepEqual(decideRoute({ path: '/login', user: { uid: 'u1' }, authSettled: true, returnTo: value }), { action: 'redirect', to: value });
    assert.equal(getSafeReturnPath(`${value}?delete=true`), null);
  }
});

test('외부 주소·인코딩 우회·일정 외 주소는 복귀 주소로 사용하지 않는다', () => {
  for (const value of [null, undefined, '', 'https://evil.example', '//evil.example', '/\\evil.example',
    '/share/abc?next=https://evil.example', '/view/abc#other', '/share/%2f%2fevil', '/share/../login',
    '/share/abc\n', '/login', '/plan', '/view', '/share/']) {
    assert.equal(getSafeReturnPath(value), null, String(value));
    assert.deepEqual(decideRoute({ path: '/login', user: { uid: 'u1' }, authSettled: true, returnTo: value }), {
      action: 'redirect', to: '/preference/1',
    });
  }
});

test('로그인한 사람이 로그인 화면에 서 있으면 안으로 들여보낸다', () => {
  assert.deepEqual(settled('/login', { uid: 'u1' }, true), { action: 'redirect', to: '/plan' });
  assert.deepEqual(settled('/login', { uid: 'u1' }, false), { action: 'redirect', to: '/preference/1' });
  assert.deepEqual(settled('/join', { uid: 'u1' }, true), { action: 'redirect', to: '/plan' });
});

test('로그인하지 않은 사람에게 로그인 화면은 그냥 로그인 화면이다', () => {
  assert.deepEqual(settled('/login', null), { action: 'render' });
});

test('랜딩은 로그인 여부와 상관없이 그대로 그린다', () => {
  // 로그인했다고 랜딩에서 쫓아내지 않는다 — 로고를 눌러 돌아올 자리다.
  assert.deepEqual(settled('/', { uid: 'u1' }), { action: 'render' });
  assert.deepEqual(settled('/', null), { action: 'render' });
});

test('경로가 없어도 무너지지 않는다', () => {
  assert.deepEqual(decideRoute({}), { action: 'render' });
  assert.equal(isPublicPath(null), true, '알 수 없는 값은 공개로 본다 — 가두는 쪽이 더 위험하다');
});
