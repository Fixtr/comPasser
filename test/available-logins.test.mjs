/**
 * 이 플랫폼에서 실제로 되는 로그인 방법.
 *
 * 카카오·네이버는 둘 다 **팝업 창**에 기대고 있다 —
 * `login-view.js` 의 네이버는 `window.open(authUrl, 'naverLogin', …)` 뒤
 * `postMessage` 로 토큰을 받고, 카카오는 SDK 를 v1.43.1 로 일부러 낮춰
 * 팝업 방식(`Kakao.Auth.login`)을 유지하고 있다(troubleshooting.md 이슈 1).
 *
 * 그런데 안드로이드 WebView 에는 팝업 창이 없다. 버튼을 눌러도 창이 안 뜨거나
 * 같은 WebView 를 덮어써 앱이 통째로 날아간다. **눌러도 아무 일 없는 버튼은
 * 없는 버튼보다 나쁘다** — 사용자는 앱이 고장 났다고 읽는다.
 *
 * 그래서 되는 것만 보여 준다. 판단을 한 곳에 모아 둔 이유는, 나중에 카카오·
 * 네이버를 네이티브로 붙일 때 고칠 자리가 하나여야 하기 때문이다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { availableSocialLogins } from '../src/domains/auth/services/available-logins.mjs';

test('웹에서는 셋 다 쓴다', () => {
  assert.deepEqual(availableSocialLogins({ isNative: false }), ['google', 'kakao', 'naver']);
});

test('네이티브에서는 구글만 남긴다', () => {
  // 구글은 OS 계정 선택창(native-google-signin.mjs)으로 가므로 팝업이 없어도 된다.
  assert.deepEqual(availableSocialLogins({ isNative: true }), ['google']);
});

test('어느 쪽이든 구글은 사라지지 않는다', () => {
  // 이 앱의 주 로그인 수단이다. 목록을 손대다 실수로 빼면 문이 닫힌다.
  for (const isNative of [true, false]) {
    assert.ok(availableSocialLogins({ isNative }).includes('google'));
  }
});
