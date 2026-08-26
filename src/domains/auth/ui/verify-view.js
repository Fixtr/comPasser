import { verifyEmailCode } from '../services/firebase-auth.js';
import { authStyles } from './auth-style.js';
import { icons } from '../../../ui/icons.js';
import { t, applyTranslations } from '../../../utils/i18n.js';

export default class VerifyView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    // 언어를 바꾸면 이 화면도 따라와야 한다.
    this._i18nHandler = () => applyTranslations(this.shadowRoot);
    window.addEventListener('i18n-changed', this._i18nHandler);
  }

  disconnectedCallback() {
    window.removeEventListener('i18n-changed', this._i18nHandler);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>${authStyles}</style>

      <div id="status-icon" class="status-icon"></div>

      <div class="header-section">
        <h2 id="title-text" data-i18n="verifyPendingTitle">${t('verifyPendingTitle')}</h2>
        <p id="subtitle-text" class="subtitle" data-i18n="verifyPendingDesc">${t('verifyPendingDesc')}</p>
      </div>
      
      <div id="loading-spinner" class="spinner"></div>
      
      <div id="error-msg"></div>

      <button id="go-login-btn" class="auth-btn" data-i18n="verifyGoLoginBtn">${t('verifyGoLoginBtn')}</button>
    `;

    this.shadowRoot.getElementById('go-login-btn').addEventListener('click', () => {
      window.navigate('/login');
    });
  }

  async verify(oobCode) {
    const titleText = this.shadowRoot.getElementById('title-text');
    const subtitleText = this.shadowRoot.getElementById('subtitle-text');
    const spinner = this.shadowRoot.getElementById('loading-spinner');
    const errorMsg = this.shadowRoot.getElementById('error-msg');
    const goLoginBtn = this.shadowRoot.getElementById('go-login-btn');
    const statusIcon = this.shadowRoot.getElementById('status-icon');

    /** 결과 표시를 한 곳에서. 예전에는 제목 문자열 앞에 ❌ / ✅ 를 붙였다. */
    const setStatus = (tone, icon) => {
      statusIcon.dataset.tone = tone;
      statusIcon.innerHTML = icon;
    };

    if (!oobCode) {
      spinner.style.display = 'none';
      setStatus('danger', icons.warn);
      titleText.textContent = t('verifyBadRequestTitle');
      subtitleText.textContent = t('verifyBadRequestDesc');
      errorMsg.textContent = t('verifyBadAccess');
      errorMsg.style.display = 'block';
      goLoginBtn.style.display = 'inline-block';
      return;
    }

    try {
      await verifyEmailCode(oobCode);
      spinner.style.display = 'none';
      setStatus('ok', icons.check);
      titleText.textContent = t('verifyDoneTitle');
      subtitleText.textContent = t('verifyDoneDesc');
      goLoginBtn.style.display = 'inline-block';
    } catch (err) {
      console.error('Email verification error:', err);
      spinner.style.display = 'none';
      setStatus('danger', icons.warn);
      titleText.textContent = t('verifyFailedTitle');
      subtitleText.textContent = t('verifyFailedDesc');
      let msg = err.message;
      if (err.code === 'auth/invalid-action-code') {
        msg = '이미 만료되었거나 사용된 인증 코드입니다.';
      }
      errorMsg.textContent = msg;
      errorMsg.style.display = 'block';
      goLoginBtn.style.display = 'inline-block';
    }
  }
}

customElements.define('verify-view', VerifyView);
