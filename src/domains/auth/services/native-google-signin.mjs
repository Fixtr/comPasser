/**
 * 네이티브(안드로이드·iOS)에서 구글로 로그인하는 순서.
 *
 * **왜 웹과 다른 길이 필요한가.** 안드로이드 WebView 에는 팝업 창이 없다.
 * `@capacitor/android` 의 `Bridge.java` 는 `setJavaScriptCanOpenWindows-
 * Automatically(true)` 만 켜고 `setSupportMultipleWindows` 도
 * `onCreateWindow` 도 두지 않는다. 그래서 `signInWithPopup` 이 여는 창은
 * 열리지 않거나(`auth/popup-blocked`) 같은 WebView 를 덮어써 앱 상태를 통째로
 * 날린다. 로그인이 이 앱의 유일한 문이라 그대로 두면 앱이 아무것도 못 한다.
 *
 * 네이티브에서는 OS 계정 선택창이 idToken 을 돌려주고, 그것으로 **JS SDK**
 * 세션을 만든다. 화면 전체가 JS SDK 의 `onAuthStateChanged` 를 보고 있으므로
 * 네이티브 층에만 로그인하면 앱은 계속 로그인 화면에 머문다.
 *
 * 플러그인도 firebase 도 여기서 직접 들여오지 않는다 — 넘겨받는다. 그래야
 * 브라우저 없이 검사된다(`route-decision.mjs`·`boarding-pass.mjs` 와 같은
 * 어휘). 넘기는 쪽은 `firebase-auth.js` 다.
 *
 * @param {object} deps
 * @param {() => Promise<{credential?: {idToken?: string}}>} deps.requestGoogleIdToken
 *        OS 계정 선택창을 띄우고 결과를 돌려준다.
 * @param {(idToken: string) => unknown} deps.buildCredential
 *        idToken 을 firebase 자격증명으로 바꾼다.
 * @param {(credential: unknown) => Promise<{user: unknown}>} deps.signInWithCredential
 *        그 자격증명으로 JS SDK 세션을 만든다.
 * @returns {Promise<unknown>} 로그인한 사용자
 */
export async function signInWithNativeGoogle({
  requestGoogleIdToken,
  buildCredential,
  signInWithCredential,
}) {
  const result = await requestGoogleIdToken();
  const idToken = result?.credential?.idToken;

  // 사용자가 계정 선택창을 닫으면 플러그인이 빈 결과를 준다. 그대로 넘기면
  // firebase 가 알 수 없는 내부 오류를 던져, 어디서 끊겼는지가 화면에도
  // 로그에도 안 남는다.
  if (!idToken) {
    throw new Error('GOOGLE_ID_TOKEN_MISSING');
  }

  const { user } = await signInWithCredential(buildCredential(idToken));
  return user;
}
