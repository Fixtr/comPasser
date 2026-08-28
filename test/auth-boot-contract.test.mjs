/**
 * 첫 화면에서 무엇을 받아 오는가 — 인증 쪽.
 *
 * 랜딩에는 로그인 버튼이 없는데도 `apis.google.com/js/api.js`(gapi)를 받고
 * 있었다. 받는 사람은 `getAuth()` 다 — 이 함수는 **팝업 해석기까지 끼워서**
 * 인증을 시작하고, 그 해석기가 구글 로그인용 iframe 을 미리 띄운다.
 * 팝업으로 로그인하는 순간에만 필요한 것을 모든 화면에서 받고 있었던 셈이다.
 *
 * `initializeAuth` 로 해석기 없이 시작하고, `signInWithPopup` 을 부르는 그
 * 자리에서 해석기를 넘긴다. 대신 **지속성(persistence)은 반드시 직접 준다** —
 * `getAuth()` 가 대신 정해 주던 것이라, 빠뜨리면 새로고침 한 번에 로그아웃된다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';

import { stripSourceComments } from './helpers/style-contract.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const authService = stripSourceComments(
  readFileSync(`${ROOT}src/domains/auth/services/firebase-auth.js`, 'utf8')
);

test('첫 화면부터 팝업 해석기를 끼우지 않는다', () => {
  assert.ok(
    !/\bgetAuth\s*\(/.test(authService),
    'getAuth() 는 팝업 해석기까지 끼워 시작한다 — 그 순간 gapi 를 받는다'
  );
  assert.match(authService, /initializeAuth\s*\(/, '해석기 없이 시작하는 쪽을 써야 한다');
});

test('새로고침해도 로그인이 풀리지 않게 지속성을 직접 준다', () => {
  // getAuth() 가 대신 정해 주던 값이다. initializeAuth 로 바꾸면서 빠뜨리면
  // 메모리 저장으로 떨어져 새로고침 한 번에 로그아웃된다 — 데모에서 최악이다.
  // getAuth() 가 쓰던 것과 **같은 세 가지를 같은 순서로**. 눈대중으로 둘만
  // 적었다가 firebase/auth 구현을 열어 보고 맞췄다.
  const order = ['indexedDBLocalPersistence', 'browserLocalPersistence', 'browserSessionPersistence'];
  const used = authService.slice(authService.indexOf('persistence: ['));
  let at = 0;
  for (const name of order) {
    const i = used.indexOf(name, at);
    assert.ok(i > 0, `${name} 이 지속성 목록에 없다`);
    at = i;
  }
});

test('팝업 로그인은 그 자리에서 해석기를 넘긴다', () => {
  assert.match(
    authService,
    // 첫 인자는 auth 이거나 그것을 돌려주는 requireAuth() 다 — 중요한 것은 셋째다.
    /signInWithPopup\([^,]+,\s*googleProvider\s*,\s*browserPopupRedirectResolver\s*\)/,
    '해석기를 안 넘기면 팝업 로그인이 아예 안 된다'
  );
});

/**
 * `src/domains/auth/COMMAND_GUIDE.md` 가 정한 규칙이다:
 * "Firebase Authentication 과의 상호작용은 모두 firebase-auth.js 를 거친다.
 *  UI 컴포넌트에서 firebase/auth 를 직접 들여오지 않는다."
 *
 * 이번에 실제로 문제가 됐다 — `login-view.js` 가 모듈 최상단에서 `getAuth(app)`
 * 를 부르고 있어서, 인증을 어떻게 시작하는지가 **모듈 로딩 순서**에 달려
 * 있었다. 규칙이 지켜졌으면 애초에 생기지 않을 의존이다.
 */
test('UI 컴포넌트는 firebase/auth 를 직접 들여오지 않는다', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.js') && !entry.name.endsWith('.mjs')) continue;
      if (full.includes('/services/')) continue;   // 서비스 층은 들여와도 된다
      const source = stripSourceComments(readFileSync(full, 'utf8'));
      if (/from\s+['"]firebase\/auth['"]/.test(source)) {
        offenders.push(full.replace(ROOT, ''));
      }
    }
  };
  walk(`${ROOT}src`);
  assert.deepEqual(offenders, [],
    'firebase-auth.js 를 거쳐야 한다(COMMAND_GUIDE.md):\n' + offenders.join('\n'));
});

/**
 * ── 네이티브 구글 로그인 ────────────────────────────────────────────────
 *
 * 아래 셋은 전부 **조용히 망가지는** 종류다. 화면에는 오류가 안 뜨고
 * "눌렀는데 아무 일도 안 일어난다"로만 보인다.
 */

test('네이티브에서는 팝업 대신 다른 길로 간다', () => {
  // 안드로이드 WebView 에는 팝업 창이 없다(Bridge.java 가 다중 창을 켜지
  // 않는다). 분기가 사라지면 앱의 유일한 문이 닫힌다.
  assert.match(
    authService,
    /isNativePlatform\s*\(\s*\)/,
    'Capacitor.isNativePlatform() 로 갈라야 한다 — 웹은 팝업, 네이티브는 OS 계정 선택창'
  );
});

test('네이티브 로그인 플러그인은 동적 import 로만 들여온다', () => {
  // 정적 import 로 바꾸면 **웹 사용자도** 이 플러그인을 받는다. 웹에서는
  // 한 줄도 실행되지 않는 코드다. 캡처 엔진(html2canvas-pro)을 정적으로
  // 묶었다가 첫 로드 preload 가 254KB 로 불었던 것과 같은 실수다.
  const PLUGIN = '@capacitor-firebase/authentication';
  assert.ok(
    !new RegExp(`^\\s*import[^\\n]*from\\s+['"]${PLUGIN}['"]`, 'm').test(authService),
    `${PLUGIN} 를 최상단에서 들여오면 웹 번들에 그대로 들어간다`
  );
  assert.match(
    authService,
    new RegExp(`import\\s*\\(\\s*['"]${PLUGIN}['"]\\s*\\)`),
    '네이티브 분기 안에서 await import(...) 로 받아야 한다'
  );
});

test('네이티브 로그인은 skipNativeAuth 로 JS SDK 쪽에 세션을 세운다', () => {
  // 이 값을 빠뜨리면 플러그인이 **네이티브 층에만** 로그인시킨다. 화면은
  // 전부 JS SDK 의 onAuthStateChanged 를 보고 있으므로, 로그인은 성공했는데
  // 앱은 계속 로그인 화면에 머문다 — 사용자에게는 버튼이 죽은 것으로 보인다.
  assert.match(
    authService,
    /skipNativeAuth\s*:\s*true/,
    'skipNativeAuth: true 여야 JS SDK 가 세션의 주인이 된다'
  );
  assert.match(
    authService,
    /signInWithCredential\s*\(/,
    '네이티브가 준 idToken 을 JS SDK 세션으로 바꾸는 자리가 있어야 한다'
  );
});
