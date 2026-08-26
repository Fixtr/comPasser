/**
 * 외부 SDK 를 "필요해진 순간"에만 불러온다.
 *
 * 예전에는 index.html <head> 에 html2canvas·Kakao·PortOne 을 async/defer
 * 없이 동기 <script> 로 걸어 두었다. 브라우저는 세 CDN 의 응답을 다 받을
 * 때까지 문서 파싱을 멈추므로, 네트워크가 느리거나 CDN 이 막힌 환경에서는
 * 앱이 아예 뜨지 않았다. 게다가 sw.js 는 외부 요청을 캐시하지 않기 때문에
 * 오프라인에서는 매번 실패한다.
 *
 * 셋 다 첫 화면에는 쓰이지 않는다. 로그인 버튼을 누를 때 Kakao 를,
 * 본인인증을 시작할 때 PortOne 을 불러오면 첫 화면은 두 CDN 과 무관하게
 * 뜬다. 로드에 실패해도 그 기능 하나만 막히고 앱 전체는 살아 있다.
 */

/** src 하나당 Promise 를 한 번만 만들어 재사용한다(중복 로드 방지). */
const pending = new Map();

/**
 * 스크립트를 한 번만 로드한다.
 * @param {string} src
 * @param {{crossOrigin?: string}} [options] 일부 SDK 는 오류 보고를 위해
 *   crossorigin 을 요구한다(애드센스). 없으면 붙이지 않는다.
 * @returns {Promise<void>} 로드 실패 시 reject
 */
export function loadScriptOnce(src, options = {}) {
  if (pending.has(src)) return pending.get(src);

  const promise = new Promise((resolve, reject) => {
    // 다른 경로로 이미 붙어 있으면(예: 캐시된 index.html) 다시 붙이지 않는다.
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') { resolve(); return; }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`스크립트를 불러오지 못했습니다: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    if (options.crossOrigin) script.crossOrigin = options.crossOrigin;
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
    script.addEventListener('error', () => {
      // 실패한 Promise 를 캐시에 남겨 두면 다음 시도까지 영영 막힌다.
      // 잠깐 끊겼다 돌아온 사용자가 새로고침 없이 다시 눌러 볼 수 있어야 한다.
      pending.delete(src);
      script.remove();
      reject(new Error(`스크립트를 불러오지 못했습니다: ${src}`));
    }, { once: true });
    document.head.appendChild(script);
  });

  pending.set(src, promise);
  return promise;
}

const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/1.43.1/kakao.min.js';
const PORTONE_SDK_URL = 'https://cdn.iamport.kr/v1/iamport.js';

/**
 * Kakao SDK 를 불러오고 초기화까지 끝낸 뒤 window.Kakao 를 돌려준다.
 *
 * 초기화를 여기서 하는 이유: 예전에는 main.js 가 하드코딩된 키로,
 * login-view 가 .env 키로 각각 init 했다. 먼저 실행되는 쪽이 이기므로
 * 공유와 로그인이 서로 다른 앱으로 붙을 수 있었다. 키를 아는 곳은 한 곳이면 된다.
 *
 * @returns {Promise<any>}
 */
export async function loadKakaoSdk() {
  await loadScriptOnce(KAKAO_SDK_URL);

  const Kakao = window.Kakao;
  if (!Kakao) throw new Error('Kakao SDK 를 불러오지 못했습니다.');

  if (!Kakao.isInitialized()) {
    const appKey = import.meta.env?.VITE_KAKAO_APP_KEY;
    if (!appKey) throw new Error('카카오 앱 키가 설정되지 않았습니다. (.env 파일을 확인해주세요)');
    Kakao.init(appKey);
  }
  return Kakao;
}

/**
 * PortOne(iamport) SDK 를 불러와 window.IMP 를 돌려준다.
 * @returns {Promise<any>}
 */
export async function loadPortOne() {
  await loadScriptOnce(PORTONE_SDK_URL);
  if (!window.IMP) throw new Error('본인인증 모듈을 불러오지 못했습니다.');
  return window.IMP;
}

/**
 * 캡처 엔진.
 *
 * 이것만 CDN 이 아니라 번들에서 가져온다. npm 에 있는 라이브러리라
 * 번들에 넣으면 오프라인에서도 되고 버전이 고정된다. Vite 가 동적
 * import 를 별도 청크로 잘라 주므로 첫 화면 용량에는 영향이 없다
 * (gzip 기준 70KB 남짓).
 *
 * @returns {Promise<Function>}
 */
let html2canvasPromise;
export function loadHtml2Canvas() {
  html2canvasPromise ??= import('html2canvas-pro').then(m => m.default);
  return html2canvasPromise;
}

/**
 * 애드센스 계정 번호. **이 앱에서 이 번호를 아는 곳은 여기 한 곳이다.**
 *
 * 예전에 카카오 앱 키가 main.js 와 login-view 두 곳에서 나와, 먼저 실행되는
 * 쪽이 이기는 바람에 공유와 로그인이 서로 다른 앱으로 붙을 수 있었다.
 * 같은 실수를 되풀이하지 않으려고 광고 자리 마크업도 이 값을 가져다 쓴다.
 */
export const ADSENSE_CLIENT = 'ca-pub-2887038255405057';

const ADSENSE_URL =
  `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;

/**
 * 애드센스를 불러온다.
 *
 * 예전에는 index.html 에 `<script async>` 로 걸려 있었다. async 라 파싱을
 * 막지는 않았지만, 광고 자리(`<ins class="adsbygoogle">`)는 결과 화면에만
 * 있는데 랜딩·로그인·폼에서도 매번 이 무거운 스크립트를 받아 왔다.
 *
 * 실패해도 던지지 않는다 — 광고가 안 붙는 것과 일정이 안 보이는 것은
 * 전혀 다른 문제다. 부르는 쪽이 try/catch 를 잊어도 화면은 살아 있어야 한다.
 * @returns {Promise<boolean>} 실제로 불러왔는지
 */
export async function loadAdSense() {
  try {
    await loadScriptOnce(ADSENSE_URL, { crossOrigin: 'anonymous' });
    return true;
  } catch (error) {
    console.warn('[ads] 애드센스를 불러오지 못했습니다:', error);
    return false;
  }
}
