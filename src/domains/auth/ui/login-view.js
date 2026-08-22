import { loginWithGoogle, loginWithEmail, app } from '../services/firebase-auth.js';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { t } from '../../../utils/i18n.js';
import { isInAppBrowser, handleInAppBrowserEscape } from '../../../utils/browser-utils.js';
import { showErrorToast } from '../../../utils/toast.js';
import { authStyles } from './auth-style.js';

const auth = getAuth(app);
const functions = getFunctions(app);
export default class LoginView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    // 네이버 로그인 팝업에서 리다이렉트 된 경우 토큰 추출 후 창 닫기
    if (window.opener && window.location.hash.includes('access_token=')) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const token = hashParams.get('access_token');
      const state = hashParams.get('state');
      if (token) {
        window.opener.postMessage({ type: 'NAVER_OAUTH', token, state }, window.location.origin);
        window.close();
        return;
      }
    }

    this.render();
    this.setupListeners();
    this.updateTexts();

    // 🛡️ 인앱 브라우저 감지 시 경고 배너 표시
    if (isInAppBrowser()) {
      this._showInAppBrowserWarning();
    }

    window.addEventListener('i18n-changed', () => {
      this.updateTexts();
      // 언어 전환 시 인앱 경고 배너 텍스트도 업데이트
      if (isInAppBrowser()) {
        this._updateInAppBannerTexts();
      }
    });
  }

  updateTexts() {
    const elements = this.shadowRoot.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
        el.setAttribute('placeholder', t(key));
      } else {
        if (el.id === 'login-btn') {
          const span = el.querySelector('span');
          if (span) span.textContent = t(key);
        } else {
          el.textContent = t(key);
        }
      }
    });
  }

  /** 인앱 브라우저 경고 배너를 로그인 화면 상단에 삽입 */
  _showInAppBrowserWarning() {
    const banner = document.createElement('div');
    banner.id = 'inapp-browser-warning';
    // 이 배너 안에 .join-link 규칙이 함께 들어 있었다. 배너는 인앱
    // 브라우저일 때만 삽입되므로, 일반 브라우저로 들어온 사용자에게는
    // 회원가입 링크가 아무 스타일 없이 보였다. 규칙은 auth-style.js 로 옮겼다.
    banner.className = 'inapp-warning';
    banner.innerHTML = `
      <div id="inapp-title" class="inapp-title">
        ${t('inAppBrowserTitle')}
      </div>
      <div id="inapp-desc" class="inapp-desc">
        ${t('inAppBrowserDesc')}
      </div>
      <div class="inapp-how">
        iOS: 우측 하단 [ &#10247; ] &rarr; "다른 브라우저로 열기"<br>
        Android: 자동으로 외부 브라우저가 열립니다.
      </div>
    `;

    // Shadow DOM 내부 최상단에 삽입
    const headerSection = this.shadowRoot.querySelector('.header-section');
    if (headerSection) {
      headerSection.parentNode.insertBefore(banner, headerSection);
    }
  }

  /** 인앱 배너 텍스트를 현재 언어로 업데이트 */
  _updateInAppBannerTexts() {
    const banner = this.shadowRoot.getElementById('inapp-browser-warning');
    if (!banner) return;
    const titleEl = banner.querySelector('#inapp-title');
    const descEl = banner.querySelector('#inapp-desc');
    if (titleEl) titleEl.textContent = t('inAppBrowserTitle');
    if (descEl) descEl.textContent = t('inAppBrowserDesc');
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>${authStyles}</style>

      <div class="header-section"><h2>로그인</h2><p class="subtitle">이메일 또는 소셜 계정으로 로그인하세요.</p></div>
      
      <div class="auth-form">
        <div class="input-group">
          <input type="email" id="email-input" class="auth-input" placeholder="이메일 주소" autocomplete="email" />
        </div>
        <div class="input-group">
          <input type="password" id="password-input" class="auth-input" placeholder="비밀번호" autocomplete="current-password" />
        </div>
        <div class="btn-group">
          <button id="email-login-btn" class="auth-btn login-btn">로그인</button>
          
        </div>
        <div id="error-msg"></div>
      </div>

      <div class="divider">또는 소셜 계정으로 로그인</div>

      <div class="social-login-group">
        <button id="google-btn" class="social-btn google-btn">
          <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.9c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.13-10.36 7.13-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
          Google 계정으로 시작하기
        </button>
        <button id="kakao-btn" class="social-btn kakao-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 3C6.47715 3 2 6.40243 2 10.5976C2 13.3444 3.7844 15.7483 6.47161 17.0673L5.59024 20.3164C5.45261 20.8242 6.00287 21.2212 6.45265 20.9419L10.5186 18.4204C11.0023 18.4719 11.4965 18.4984 12 18.4984C17.5228 18.4984 22 15.096 22 10.8984C22 6.70081 17.5228 3 12 3Z"/></svg>
          카카오로 시작하기
        </button>
        <button id="naver-btn" class="social-btn naver-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.0355 12.0128L8.12056 2.00843C7.94326 1.78502 7.67376 1.6521 7.39007 1.6521H2.41844C1.94326 1.6521 1.61348 2.11287 1.74468 2.56588L2.09574 3.8279L9.62411 13.9213L16.0355 12.0128Z" fill="white"/><path d="M16.5177 1.6521H21.4894C21.844 1.6521 22.1277 1.9358 22.1277 2.29043V21.7587C22.1277 22.1133 21.844 22.397 21.4894 22.397H16.5177C16.1631 22.397 15.8794 22.1133 15.8794 21.7587V13.8828L15.9362 12.0135L16.5177 1.6521Z" fill="white"/><path d="M7.39007 22.397H2.41844C2.06383 22.397 1.78014 22.1133 1.78014 21.7587V2.29043C1.78014 1.9358 2.06383 1.6521 2.41844 1.6521H7.39007C7.74468 1.6521 8.02837 1.9358 8.02837 2.29043V21.7587C8.02837 22.1133 7.74468 22.397 7.39007 22.397Z" fill="white"/><path d="M7.87234 11.9865L15.8794 22.0945C16.0567 22.3179 16.3262 22.4508 16.6099 22.4508H21.5816C22.0567 22.4508 22.3865 21.99 22.2553 21.537L21.9043 20.275L14.3759 10.1816L7.87234 11.9865Z" fill="white"/></svg>
          네이버로 시작하기
        </button>
      </div>

      <div class="join-link">
        아직 계정이 없으신가요? <a href="#" id="go-to-join">회원가입</a>
      </div>
    `;
  }

  setupListeners() {
    const googleBtn = this.shadowRoot.getElementById('google-btn');
    const kakaoBtn = this.shadowRoot.getElementById('kakao-btn');
    const naverBtn = this.shadowRoot.getElementById('naver-btn');
    
    const emailLoginBtn = this.shadowRoot.getElementById('email-login-btn');
    const goToJoin = this.shadowRoot.getElementById('go-to-join');
    const emailInput = this.shadowRoot.getElementById('email-input');
    const passwordInput = this.shadowRoot.getElementById('password-input');
    const errorMsg = this.shadowRoot.getElementById('error-msg');

    const checkInApp = () => {
      if (isInAppBrowser()) {
        handleInAppBrowserEscape(t);
        return true;
      }
      return false;
    };

    googleBtn.addEventListener('click', async () => {
      if (checkInApp()) return;
      
      googleBtn.disabled = true;
      errorMsg.style.display = 'none';
      try {
        await loginWithGoogle();
      } catch (err) {
        errorMsg.textContent = '로그인에 실패했습니다. 다시 시도해 주세요.';
        errorMsg.style.display = 'block';
      } finally {
        googleBtn.disabled = false;
      }
    });

    kakaoBtn.addEventListener('click', async () => {
      if (checkInApp()) return;
      
      kakaoBtn.disabled = true;
      const originalHtml = kakaoBtn.innerHTML;
      kakaoBtn.textContent = '로그인 처리 중...';
      errorMsg.style.display = 'none';

      try {
        if (!window.Kakao) {
           throw new Error('Kakao SDK가 로드되지 않았습니다.');
        }
        if (!window.Kakao.isInitialized()) {
           if (import.meta.env.VITE_KAKAO_APP_KEY) {
               window.Kakao.init(import.meta.env.VITE_KAKAO_APP_KEY);
           } else {
               throw new Error('카카오 앱 키가 설정되지 않았습니다. (.env 파일을 확인해주세요)');
           }
        }

        const authObj = await new Promise((resolve, reject) => {
          window.Kakao.Auth.login({
            success: resolve,
            fail: reject
          });
        });

        const access_token = authObj.access_token;
        const verifySocialToken = httpsCallable(functions, 'verifySocialToken');
        const result = await verifySocialToken({ provider: 'kakao', token: access_token });
        
        await signInWithCustomToken(auth, result.data.customToken);
        const targetPath = sessionStorage.getItem('userPreference') ? '/plan' : '/preference';
        window.navigate(targetPath);
      } catch (err) {
        console.error('[Kakao] Social login failed:', err.message || 'Unknown error');
        errorMsg.textContent = '소셜 로그인에 실패했습니다. 다시 시도해 주세요.';
        errorMsg.style.display = 'block';
      } finally {
        kakaoBtn.disabled = false;
        kakaoBtn.innerHTML = originalHtml;
      }
    });

    naverBtn.addEventListener('click', () => {
      if (checkInApp()) return;

      const originalHtml = naverBtn.innerHTML;
      const clientId = import.meta.env.VITE_NAVER_CLIENT_ID;
      if (!clientId) {
          errorMsg.textContent = '네이버 앱 키가 설정되지 않았습니다. (.env 파일을 확인해주세요)';
          errorMsg.style.display = 'block';
          return;
      }

      naverBtn.disabled = true;
      naverBtn.textContent = '로그인 처리 중...';
      errorMsg.style.display = 'none';

      const state = Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('naver_oauth_state', state);
      
      const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
      const authUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=token&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;

      const popup = window.open(authUrl, 'naverLogin', 'width=500,height=600');
      
      const handlePopupMessage = async (e) => {
          if (e.origin !== window.location.origin) return;
          if (e.data && e.data.type === 'NAVER_OAUTH') {
              window.removeEventListener('message', handlePopupMessage);
              
              if (e.data.state !== sessionStorage.getItem('naver_oauth_state')) {
                  errorMsg.textContent = '네이버 로그인 상태 검증에 실패했습니다.';
                  errorMsg.style.display = 'block';
                  naverBtn.disabled = false;
                  naverBtn.innerHTML = originalHtml;
                  return;
              }

              try {
                  const verifySocialToken = httpsCallable(functions, 'verifySocialToken');
                  const result = await verifySocialToken({ provider: 'naver', token: e.data.token });
                  
                  await signInWithCustomToken(auth, result.data.customToken);
                  const targetPath = sessionStorage.getItem('userPreference') ? '/plan' : '/preference';
                  window.navigate(targetPath);
              } catch (err) {
                  console.error('[Naver] Social login failed:', err.message || 'Unknown error');
                  errorMsg.textContent = '소셜 로그인에 실패했습니다. 다시 시도해 주세요.';
                  errorMsg.style.display = 'block';
              } finally {
                  naverBtn.disabled = false;
                  naverBtn.innerHTML = originalHtml;
              }
          }
      };

      window.addEventListener('message', handlePopupMessage);

      const popupCheckInterval = setInterval(() => {
          if (popup && popup.closed) {
              clearInterval(popupCheckInterval);
              if (naverBtn.disabled && naverBtn.textContent === '로그인 처리 중...') {
                  naverBtn.disabled = false;
                  naverBtn.innerHTML = originalHtml;
              }
              window.removeEventListener('message', handlePopupMessage);
          }
      }, 500);
    });

    
    if (goToJoin) {
      goToJoin.addEventListener('click', (e) => {
        e.preventDefault();
        window.navigate('/join');
      });
    }


    emailLoginBtn.addEventListener('click', async () => {
      if (checkInApp()) return;

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        errorMsg.textContent = '이메일과 비밀번호를 입력해주세요.';
        errorMsg.style.display = 'block';
        return;
      }

      emailLoginBtn.disabled = true;
      errorMsg.style.display = 'none';

      try {
        await loginWithEmail(email, password);
      } catch (err) {
        console.error(err);
        if (err.message === 'EMAIL_NOT_VERIFIED') {
          showErrorToast('이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.');
        } else {
          switch (err.code) {
            case 'auth/user-not-found':
              showErrorToast("가입되지 않은 이메일입니다.");
              break;
            case 'auth/wrong-password':
              showErrorToast("비밀번호가 틀립니다.");
              break;
            case 'auth/invalid-credential':
              showErrorToast("이메일 또는 비밀번호가 올바르지 않습니다.");
              break;
            case 'auth/too-many-requests':
              showErrorToast("비밀번호를 여러 번 틀려 계정이 잠겼습니다. 나중에 다시 시도하거나 비밀번호를 재설정해주세요.", { duration: 5000 });
              break;
            default:
              errorMsg.textContent = '로그인에 실패했습니다: ' + err.message;
              errorMsg.style.display = 'block';
          }
        }
      } finally {
        emailLoginBtn.disabled = false;
        passwordInput.value = '';
      }
    });
  }
}

customElements.define('login-view', LoginView);
