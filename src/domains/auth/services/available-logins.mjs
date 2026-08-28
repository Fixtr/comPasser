/**
 * 이 플랫폼에서 **실제로 되는** 소셜 로그인만 고른다.
 *
 * 카카오·네이버는 둘 다 팝업 창에 기대고 있다 — 네이버는
 * `window.open(authUrl, 'naverLogin', …)` 뒤 `postMessage` 로 토큰을 받고,
 * 카카오는 SDK 를 v1.43.1 로 일부러 낮춰 팝업 방식(`Kakao.Auth.login`)을
 * 유지하고 있다(docs/troubleshooting.md 이슈 1 — 리다이렉트 방식이 SPA
 * 상태를 날려서 내린 결정이다).
 *
 * 그런데 안드로이드 WebView 에는 팝업 창이 없다. `@capacitor/android` 의
 * `Bridge.java` 가 다중 창을 켜지 않는다. 버튼을 눌러도 창이 안 뜨거나 같은
 * WebView 를 덮어써 앱이 통째로 날아간다. **눌러도 아무 일 없는 버튼은 없는
 * 버튼보다 나쁘다** — 사용자는 앱이 고장 났다고 읽는다.
 *
 * 구글만 남는 이유는 OS 계정 선택창으로 가기 때문이다
 * (`native-google-signin.mjs`). 이메일 로그인은 팝업이 필요 없어 네이티브
 * 에서도 그대로 된다 — 이 목록은 소셜 버튼만 다룬다.
 *
 * 나중에 카카오·네이버를 네이티브 SDK 로 붙이면 고칠 자리는 여기 하나다.
 *
 * @param {{isNative: boolean}} platform
 * @returns {string[]} 보여 줄 소셜 버튼의 id 접두사
 */
export function availableSocialLogins({ isNative }) {
    return isNative ? ['google'] : ['google', 'kakao', 'naver'];
}
