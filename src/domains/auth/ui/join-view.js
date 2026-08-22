import { signUpWithEmail } from '../services/firebase-auth.js';
import { t } from '../../../utils/i18n.js';
import { isInAppBrowser, handleInAppBrowserEscape } from '../../../utils/browser-utils.js';
import { showToast } from '../../../utils/toast.js';
import { authStyles } from './auth-style.js';
import { icons } from '../../../ui/icons.js';

export default class JoinView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.setupListeners();
    this.updateTexts();

    if (isInAppBrowser()) {
      this._showInAppBrowserWarning();
    }

    window.addEventListener('i18n-changed', () => {
      this.updateTexts();
      if (isInAppBrowser()) {
        this._updateInAppBannerTexts();
      }
    });
  }

  updateTexts() {
    // Basic i18n support
  }

  _showInAppBrowserWarning() {
    const banner = document.createElement('div');
    banner.id = 'inapp-browser-warning';
    banner.className = 'inapp-warning';
    banner.innerHTML = `
      <div id="inapp-title" class="inapp-title">
        ${t('inAppBrowserTitle') || '외부 브라우저로 접속해주세요'}
      </div>
      <div id="inapp-desc" class="inapp-desc">
        ${t('inAppBrowserDesc') || '원활한 로그인을 위해 외부 브라우저를 이용해주세요.'}
      </div>
    `;
    const headerSection = this.shadowRoot.querySelector('.header-section');
    if (headerSection) {
      headerSection.parentNode.insertBefore(banner, headerSection);
    }
  }

  _updateInAppBannerTexts() {
    const banner = this.shadowRoot.getElementById('inapp-browser-warning');
    if (!banner) return;
    const titleEl = banner.querySelector('#inapp-title');
    const descEl = banner.querySelector('#inapp-desc');
    if (titleEl) titleEl.textContent = t('inAppBrowserTitle') || '외부 브라우저로 접속해주세요';
    if (descEl) descEl.textContent = t('inAppBrowserDesc') || '원활한 로그인을 위해 외부 브라우저를 이용해주세요.';
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>${authStyles}</style>

      <div class="header-section">
        <h2>회원가입</h2>
        <p class="subtitle">1분 만에 가입하고 AI 맞춤형 여행 지도를 받아보세요.</p>
      </div>
      
      <div class="auth-form">
        <div class="input-group">
          <input type="email" id="email-input" class="auth-input" placeholder="이메일을 입력하세요" autocomplete="email" />
        </div>
        
        <div class="input-group">
          <div class="password-wrapper">
            <input type="password" id="password-input" class="auth-input" placeholder="비밀번호" autocomplete="new-password" />
            <button type="button" id="toggle-password-btn" class="toggle-password" aria-label="비밀번호 숨기기/보이기">${icons.eye}</button>
          </div>
          <div id="password-strength" class="strength-indicator"></div>
        </div>

        <div id="error-msg"></div>

        <button id="email-signup-btn" class="auth-btn">이메일로 회원가입</button>
      </div>

      <div class="login-link">
        이미 계정이 있으신가요? <a id="go-to-login">로그인</a>
      </div>
    `;
  }

  setupListeners() {
    const emailSignupBtn = this.shadowRoot.getElementById('email-signup-btn');
    const emailInput = this.shadowRoot.getElementById('email-input');
    const passwordInput = this.shadowRoot.getElementById('password-input');
    const togglePasswordBtn = this.shadowRoot.getElementById('toggle-password-btn');
    const passwordStrength = this.shadowRoot.getElementById('password-strength');
    const errorMsg = this.shadowRoot.getElementById('error-msg');
    const goToLogin = this.shadowRoot.getElementById('go-to-login');

    // Goto Login View
    goToLogin.addEventListener('click', () => {
      window.navigate('/login');
    });

    // Password Toggle
    togglePasswordBtn.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      togglePasswordBtn.innerHTML = type === 'password' ? icons.eye : icons.eyeOff;
    });

    // Password Strength Indicator
    passwordInput.addEventListener('input', () => {
      const val = passwordInput.value;
      // 색은 CSS 의 [data-strength] 가 맡는다. 여기서 직접 칠하면
      // "안전"의 초록(#10B981)이 지도의 "첫 장소" 색과 같아져 버린다.
      if (val.length === 0) {
        passwordStrength.textContent = '';
        passwordStrength.removeAttribute('data-strength');
      } else if (val.length < 6) {
        passwordStrength.textContent = '위험 (6자 이상 필요)';
        passwordStrength.dataset.strength = 'weak';
      } else if (val.length >= 8 && /[A-Za-z]/.test(val) && /[0-9]/.test(val)) {
        passwordStrength.textContent = '안전';
        passwordStrength.dataset.strength = 'strong';
      } else {
        passwordStrength.textContent = '보통';
        passwordStrength.dataset.strength = 'medium';
      }
    });

    const checkInApp = () => {
      if (isInAppBrowser()) {
        handleInAppBrowserEscape(t);
        return true;
      }
      return false;
    };

    emailSignupBtn.addEventListener('click', async () => {
      if (checkInApp()) return;

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        errorMsg.textContent = '이메일과 비밀번호를 입력해주세요.';
        errorMsg.style.display = 'block';
        return;
      }
      if (password.length < 6) {
        errorMsg.textContent = '비밀번호는 6자 이상이어야 합니다.';
        errorMsg.style.display = 'block';
        return;
      }

      emailSignupBtn.disabled = true;
      errorMsg.style.display = 'none';

      try {
        await signUpWithEmail(email, password);
        // Do not redirect, just alert user as requested.
        showToast('이메일로 인증 링크가 발송되었습니다.', { tone: 'success' });
        passwordInput.value = '';
        emailInput.value = '';
        passwordStrength.textContent = '';
      } catch (err) {
        console.error(err);
        let msg = '회원가입에 실패했습니다: ' + err.message;
        if (err.code === 'auth/email-already-in-use') msg = '이미 가입된 이메일입니다.';
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
      } finally {
        emailSignupBtn.disabled = false;
      }
    });
  }
}

customElements.define('join-view', JoinView);
