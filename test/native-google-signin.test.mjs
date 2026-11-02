/**
 * 네이티브에서 구글 로그인이 되는 방식.
 *
 * 안드로이드 WebView 에는 **팝업 창이 없다.** `node_modules/@capacitor/android`
 * 의 `Bridge.java` 는 `setJavaScriptCanOpenWindowsAutomatically(true)` 만 켤 뿐
 * `setSupportMultipleWindows` 도 `onCreateWindow` 도 두지 않는다. 그래서
 * `signInWithPopup` 이 여는 창은 애초에 열리지 않거나(=`auth/popup-blocked`)
 * 같은 WebView 를 덮어써 앱 상태를 통째로 날린다. 로그인이 이 앱의 유일한
 * 문이므로, 그 상태로 올리면 **앱이 아무것도 못 한다.**
 *
 * 네이티브에서는 OS 계정 선택창(Credential Manager)이 idToken 을 돌려주고,
 * 그것으로 JS SDK 세션을 만든다. 화면 전체가 JS SDK 의 `onAuthStateChanged`
 * 를 보고 있으므로 **JS 쪽에 세션이 서야** 로그인한 것으로 친다.
 *
 * 이 모듈은 플러그인도 firebase 도 직접 들여오지 않는다 — 넘겨받는다.
 * 그래야 브라우저 없이 검사된다(`route-decision.mjs`·`boarding-pass.mjs` 와
 * 같은 어휘).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { isNoGoogleAccountError, signInWithNativeGoogle } from '../src/domains/auth/services/native-google-signin.mjs';

/** 성공 경로의 기본 대역. 호출 순서를 적어 둔다. */
function makeDeps(overrides = {}) {
  const calls = [];
  const deps = {
    requestGoogleIdToken: async () => {
      calls.push('native');
      return { credential: { idToken: 'ID_TOKEN' } };
    },
    buildCredential: (idToken) => {
      calls.push(`credential:${idToken}`);
      return { _token: idToken };
    },
    signInWithCredential: async (credential) => {
      calls.push(`signIn:${credential._token}`);
      return { user: { uid: 'u1' } };
    },
    ...overrides,
  };
  return { deps, calls };
}

test('네이티브 로그인은 받은 idToken 으로 JS SDK 세션을 만든다', async () => {
  const { deps, calls } = makeDeps();
  const user = await signInWithNativeGoogle(deps);

  assert.deepEqual(user, { uid: 'u1' });
  assert.deepEqual(calls, ['native', 'credential:ID_TOKEN', 'signIn:ID_TOKEN'],
    'OS 계정 선택 → 자격증명 만들기 → JS SDK 로그인, 이 순서여야 한다');
});

test('idToken 이 없으면 이유를 들고 멈춘다', async () => {
  // 빈손으로 넘기면 firebase 가 알 수 없는 내부 오류를 던진다. 어디서
  // 끊겼는지가 화면에도 로그에도 안 남는다.
  const { deps, calls } = makeDeps({
    requestGoogleIdToken: async () => ({ credential: {} }),
  });

  await assert.rejects(() => signInWithNativeGoogle(deps), /GOOGLE_ID_TOKEN_MISSING/);
  assert.deepEqual(calls, [], 'idToken 이 없으면 firebase 를 부르지 않는다');
});

test('플러그인이 credential 자체를 안 주는 경우도 같은 이유로 멈춘다', async () => {
  // 사용자가 계정 선택창을 닫으면 플러그인이 빈 결과를 준다.
  const { deps } = makeDeps({ requestGoogleIdToken: async () => ({}) });
  await assert.rejects(() => signInWithNativeGoogle(deps), /GOOGLE_ID_TOKEN_MISSING/);

  const nothing = makeDeps({ requestGoogleIdToken: async () => null });
  await assert.rejects(() => signInWithNativeGoogle(nothing.deps), /GOOGLE_ID_TOKEN_MISSING/);
});

test('플러그인이 던진 오류는 그대로 올려 보낸다', async () => {
  // 취소·네트워크·설정 오류를 여기서 삼키면 화면이 "눌러도 아무 일 없음"이 된다.
  const { deps } = makeDeps({
    requestGoogleIdToken: async () => { throw new Error('SIGN_IN_CANCELLED'); },
  });
  await assert.rejects(() => signInWithNativeGoogle(deps), /SIGN_IN_CANCELLED/);
});

test('기기에 구글 계정이 없을 때 나는 오류만 계정 없음으로 본다', () => {
  assert.equal(isNoGoogleAccountError(new Error('No credentials available')), true);
  assert.equal(isNoGoogleAccountError({ message: 'No credentials available' }), true);

  assert.equal(isNoGoogleAccountError(new Error('activity is cancelled by the user.')), false);
  assert.equal(isNoGoogleAccountError(new Error('GOOGLE_ID_TOKEN_MISSING')), false);
  assert.equal(isNoGoogleAccountError(undefined), false);
});
