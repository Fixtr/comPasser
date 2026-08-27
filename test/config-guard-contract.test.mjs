/**
 * 설정이 빠졌을 때 **왜 안 되는지 화면이 말해야 한다.**
 *
 * Cloudflare Pages 미리보기 배포에서 버튼이 하나도 안 먹는다는 제보를 받고
 * 재현해 봤다. 환경 변수를 다 비운 채로 빌드해서 띄우니 이렇게 나왔다:
 *
 *   pageerror: FirebaseError: Firebase: Error (auth/invalid-api-key)
 *   window.navigate → undefined
 *   customElements 정의된 것 → **하나도 없음**
 *   랜딩 글자는 보임(그건 index.html 의 정적 마크업이다)
 *
 * 즉 `initializeApp` 이 모듈을 읽는 도중 터지면서 `main.js` 가 통째로 죽었다.
 * 화면에는 글자가 멀쩡히 떠 있으니 **멀쩡한 화면에 죽은 버튼**만 남는다 —
 * 원인을 짐작할 단서가 화면에 하나도 없다.
 *
 * 설정이 없는 것 자체는 코드가 고칠 수 없다(배포 설정이다). 대신 **무엇이
 * 빠졌는지 화면에 적는 것**은 코드가 할 수 있고, 그게 다음 30분을 아낀다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stripSourceComments } from './helpers/style-contract.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const authService = stripSourceComments(
  readFileSync(`${ROOT}src/domains/auth/services/firebase-auth.js`, 'utf8')
);
const main = stripSourceComments(readFileSync(`${ROOT}src/app/main.js`, 'utf8'));

test('설정이 비었으면 Firebase 를 시작하지 않는다', () => {
  // 시작하면 그 자리에서 터지고, 터지면 이 모듈을 들여오는 main.js 가 죽는다.
  assert.match(authService, /missingFirebaseConfig/,
    '무엇이 빠졌는지 알려 주는 값이 없다');
  assert.match(
    authService,
    /missingFirebaseConfig\.length\s*(===|==)\s*0\s*\?\s*initializeApp|missingFirebaseConfig\.length\s*\?\s*null\s*:\s*initializeApp/,
    '설정이 빠졌는데도 initializeApp 을 부르면 모듈이 터진다'
  );
});

test('빠진 변수 이름을 화면에 적을 수 있어야 한다', () => {
  // VITE_ 이름 그대로 보여 줘야 배포 설정에서 바로 찾을 수 있다.
  assert.match(authService, /VITE_FIREBASE_/, '변수 이름을 들고 있지 않다');
  assert.match(main, /missingFirebaseConfig/, '앱이 그 사실을 화면에 알리지 않는다');
});

test('설정이 없으면 인증을 부르지 않고 멈춘다', () => {
  assert.match(
    main,
    /missingFirebaseConfig[\s\S]{0,400}?return|if\s*\([^)]*missingFirebaseConfig[^)]*\)/,
    '설정이 없는데 그대로 진행하면 다음 줄에서 또 터진다'
  );
});
