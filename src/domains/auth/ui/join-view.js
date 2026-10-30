import { signUpWithEmail } from '../services/firebase-auth.js';
import { t, applyTranslations } from '../../../utils/i18n.js';
import { isInAppBrowser, handleInAppBrowserEscape } from '../../../utils/browser-utils.js';
import { showToast } from '../../../utils/toast.js';
import { authStyles } from './auth-style.js';
import { icons } from '../../../ui/icons.js';
import { getSafeReturnPath } from '../../../app/route-decision.mjs';
import { PRIVACY_POLICY_URL } from '../../itinerary/services/share-url.mjs';

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
    applyTranslations(this.shadowRoot);
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
        <h1 data-i18n="joinTitle">${t('joinTitle')}</h1>
        <p class="subtitle" data-i18n="joinSubtitle">${t('joinSubtitle')}</p>
      </div>
      
      <form class="auth-form" id="join-form" novalidate>
        <div class="input-group">
          <label for="email-input" class="auth-label" data-i18n="emailPlaceholder">${t('emailPlaceholder')}</label>
          <input type="email" id="email-input" class="auth-input" autocomplete="email" required />
        </div>
        
        <div class="input-group">
          <label for="password-input" class="auth-label" data-i18n="passwordPlaceholder">${t('passwordPlaceholder')}</label>
          <div class="password-wrapper">
            <input type="password" id="password-input" class="auth-input" autocomplete="new-password" required />
            <button type="button" id="toggle-password-btn" class="toggle-password" data-i18n-aria="togglePassword" aria-label="${t('togglePassword')}">${icons.eye}</button>
          </div>
          <div id="password-strength" class="strength-indicator"></div>
        </div>

        <div id="error-msg"></div>

        <button id="email-signup-btn" class="auth-btn" data-i18n="joinWithEmail">${t('joinWithEmail')}</button>
      </form>

      <div class="login-link">
        <a href="${PRIVACY_POLICY_URL}" target="_blank" rel="noopener noreferrer" data-i18n="authPrivacyLink">${t('authPrivacyLink')}</a>
      </div>

      <div class="login-link">
        <span data-i18n="joinHaveAccount">${t('joinHaveAccount')}</span> <a href="#" id="go-to-login" data-i18n="joinGoToLogin">${t('joinGoToLogin')}</a>
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
    goToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      const next = getSafeReturnPath(new URLSearchParams(window.location.search).get('next'));
      window.navigate(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
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
        passwordStrength.textContent = t('pwWeak');
        passwordStrength.dataset.strength = 'weak';
      } else if (val.length >= 8 && /[A-Za-z]/.test(val) && /[0-9]/.test(val)) {
        passwordStrength.textContent = t('pwStrong');
        passwordStrength.dataset.strength = 'strong';
      } else {
        passwordStrength.textContent = t('pwFair');
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

    this.shadowRoot.getElementById('join-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (checkInApp()) return;
      const returnTo = getSafeReturnPath(new URLSearchParams(window.location.search).get('next'));

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        errorMsg.textContent = t('emailPasswordRequired');
        errorMsg.style.display = 'block';
        return;
      }
      if (password.length < 6) {
        errorMsg.textContent = t('pwTooShort');
        errorMsg.style.display = 'block';
        return;
      }

      emailSignupBtn.disabled = true;
      errorMsg.style.display = 'none';

      try {
        await signUpWithEmail(email, password, returnTo);
        // Do not redirect, just alert user as requested.
        showToast(t('joinVerificationSent'), { tone: 'success' });
        passwordInput.value = '';
        emailInput.value = '';
        passwordStrength.textContent = '';
      } catch (err) {
        console.error(err);
        let msg = t('joinFailedWith').replace('{0}', err.message);
        if (err.code === 'auth/email-already-in-use') msg = t('joinEmailInUse');
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
      } finally {
        emailSignupBtn.disabled = false;
      }
    });
  }
}

customElements.define('join-view', JoinView);
