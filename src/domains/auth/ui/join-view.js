import { signUpWithEmail } from '../services/firebase-auth.js';
import { t } from '../../../utils/i18n.js';
import { isInAppBrowser, handleInAppBrowserEscape } from '../../../utils/browser-utils.js';

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
    banner.style.cssText = `
      background: linear-gradient(135deg, #fef3c7, #fde68a);
      border: 2px solid #f59e0b;
      border-radius: 16px;
      padding: 1.5rem 2rem;
      margin-bottom: 2rem;
      text-align: center;
      max-width: 520px;
      width: 100%;
      box-sizing: border-box;
      animation: slideDown 0.4s ease-out;
    `;
    banner.innerHTML = `
      <div id="inapp-title" style="font-size: 1.3rem; font-weight: 800; color: #92400e; margin-bottom: 0.75rem;">
        ${t('inAppBrowserTitle') || '⚠️ 외부 브라우저로 접속해주세요'}
      </div>
      <div id="inapp-desc" style="font-size: 0.95rem; color: #78350f; line-height: 1.6;">
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
    if (titleEl) titleEl.textContent = t('inAppBrowserTitle') || '⚠️ 외부 브라우저로 접속해주세요';
    if (descEl) descEl.textContent = t('inAppBrowserDesc') || '원활한 로그인을 위해 외부 브라우저를 이용해주세요.';
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: fit-content;
          width: 100%;
          box-sizing: border-box;
          text-align: center;
          padding: 3rem 2rem 4rem 2rem !important;
          background: var(--bg-secondary, #fff);
          border-radius: var(--radius-lg, 16px);
          box-shadow: var(--shadow-lg, 0 10px 15px rgba(0,0,0,0.1));
          margin-top: 2rem;
          container-type: inline-size;
        }

        .header-section { margin-bottom: 2.5rem; }
        h2 { font-size: 2.2rem; color: var(--text-primary); margin-bottom: 0.5rem; font-weight: 800; letter-spacing: -0.02em; }
        p.subtitle { color: var(--text-secondary); margin: 0 auto; font-size: 1.1rem; line-height: 1.6; max-width: 600px; }

        .auth-form {
          width: 100%;
          max-width: 380px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .auth-input {
          width: 100%;
          padding: 1rem 1.25rem;
          border: 1px solid oklch(85% 0.02 260);
          border-radius: 12px;
          font-size: 1rem;
          font-family: inherit;
          background: var(--bg-primary);
          color: var(--text-primary);
          transition: all 0.2s ease;
          box-sizing: border-box;
        }

        .auth-input:focus {
          outline: none;
          background: var(--bg-secondary);
          border-color: var(--accent-primary, #7c3aed);
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.2);
        }

        /* Password Wrapper for Eye Icon */
        .password-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .password-wrapper .auth-input {
          padding-right: 3rem; /* space for icon */
        }

        .toggle-password {
          position: absolute;
          right: 1rem;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 1.2rem;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }

        .strength-indicator {
          margin-top: 0.5rem;
          font-size: 0.85rem;
          text-align: right;
          font-weight: 600;
          transition: color 0.3s;
          height: 1rem;
        }

        .auth-btn {
          width: 100%;
          padding: 1rem;
          font-size: 1.05rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          background: var(--accent-primary, #7c3aed);
          color: white;
          box-shadow: 0 4px 6px rgba(124, 58, 237, 0.2);
          margin-top: 0.5rem;
        }

        .auth-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(124, 58, 237, 0.3);
          background: var(--accent-hover, #6d28d9);
        }

        .auth-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .login-link {
          margin-top: 2rem;
          font-size: 0.95rem;
          color: var(--text-secondary);
        }

        .login-link a {
          color: var(--accent-primary, #7c3aed);
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
        }
        
        .login-link a:hover {
          text-decoration: underline;
        }

        #error-msg {
          color: #EF4444;
          margin-top: 0.5rem;
          font-size: 0.9rem;
          display: none;
          text-align: left;
        }
      </style>

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
            <button type="button" id="toggle-password-btn" class="toggle-password" aria-label="비밀번호 숨기기/보이기">👁️</button>
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
      togglePasswordBtn.textContent = type === 'password' ? '👁️' : '🙈';
    });

    // Password Strength Indicator
    passwordInput.addEventListener('input', () => {
      const val = passwordInput.value;
      if (val.length === 0) {
        passwordStrength.textContent = '';
      } else if (val.length < 6) {
        passwordStrength.textContent = '위험 (6자 이상 필요)';
        passwordStrength.style.color = '#EF4444'; // Red
      } else if (val.length >= 8 && /[A-Za-z]/.test(val) && /[0-9]/.test(val)) {
        passwordStrength.textContent = '안전';
        passwordStrength.style.color = '#10B981'; // Green
      } else {
        passwordStrength.textContent = '보통';
        passwordStrength.style.color = '#F59E0B'; // Orange/Yellow
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
        alert('이메일로 인증 링크가 발송되었습니다.');
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
