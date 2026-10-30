import { verifyEmailCode, resetPassword } from '../services/firebase-auth.js';
import { authStyles } from './auth-style.js';
import { icons } from '../../../ui/icons.js';
import { t, applyTranslations } from '../../../utils/i18n.js';
import { getSafeReturnPath } from '../../../app/route-decision.mjs';

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
        <h1 id="title-text" data-i18n="verifyPendingTitle">${t('verifyPendingTitle')}</h1>
        <p id="subtitle-text" class="subtitle" data-i18n="verifyPendingDesc">${t('verifyPendingDesc')}</p>
      </div>
      
      <div id="loading-spinner" class="spinner"></div>

      <div id="reset-form" class="auth-form" style="display: none; margin-bottom: 0.9rem;">
        <input type="password" id="new-password-input" class="auth-input" data-i18n-placeholder="newPasswordPlaceholder" placeholder="${t('newPasswordPlaceholder')}" autocomplete="new-password" />
        <button id="reset-btn" class="auth-btn" data-i18n="resetPasswordBtn">${t('resetPasswordBtn')}</button>
      </div>
      
      <div id="error-msg" role="alert"></div>

      <button id="go-login-btn" class="auth-btn" data-i18n="verifyGoLoginBtn">${t('verifyGoLoginBtn')}</button>
    `;

    this.shadowRoot.getElementById('go-login-btn').addEventListener('click', () => {
      const params = new URLSearchParams(window.location.search);
      let next = getSafeReturnPath(params.get('next'));
      if (!next && params.get('continueUrl')) {
        try {
          const continuation = new URL(params.get('continueUrl'), window.location.origin);
          next = getSafeReturnPath(continuation.searchParams.get('next'));
        } catch {
          // 잘못된 인증 복귀 주소는 버리고 평범한 로그인 화면으로 간다.
        }
      }
      window.navigate(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
    });
  }

  async verify(oobCode) {
    const titleText = this.shadowRoot.getElementById('title-text');
    const subtitleText = this.shadowRoot.getElementById('subtitle-text');
    const spinner = this.shadowRoot.getElementById('loading-spinner');
    const errorMsg = this.shadowRoot.getElementById('error-msg');
    const goLoginBtn = this.shadowRoot.getElementById('go-login-btn');
    const statusIcon = this.shadowRoot.getElementById('status-icon');

    // data-i18n 도 바꿔야 언어를 바꿨을 때 인증 대기 문구로 돌아가지 않는다.
    const say = (el, key) => { el.dataset.i18n = key; el.textContent = t(key); };
    /** 결과 표시를 한 곳에서. 예전에는 제목 문자열 앞에 ❌ / ✅ 를 붙였다. */
    const setStatus = (tone, icon) => {
      statusIcon.dataset.tone = tone;
      statusIcon.innerHTML = icon;
    };

    if (!oobCode) {
      spinner.style.display = 'none';
      setStatus('danger', icons.warn);
      say(titleText, 'verifyBadRequestTitle');
      say(subtitleText, 'verifyBadRequestDesc');
      say(errorMsg, 'verifyBadAccess');
      errorMsg.style.display = 'block';
      goLoginBtn.style.display = 'inline-block';
      return;
    }

    // 프로젝트의 메일 작업 URL 이 이 화면이라 비밀번호 재설정 링크도 여기로 온다.
    if (new URLSearchParams(window.location.search).get('mode') === 'resetPassword') {
      const form = this.shadowRoot.getElementById('reset-form');
      const input = this.shadowRoot.getElementById('new-password-input');
      const resetBtn = this.shadowRoot.getElementById('reset-btn');
      const fail = (key) => { errorMsg.textContent = t(key); errorMsg.style.display = 'block'; };
      spinner.style.display = 'none';
      say(titleText, 'resetPasswordTitle');
      say(subtitleText, 'resetPasswordDesc');
      form.style.display = '';
      // 라우터가 verify 를 다시 불러도 처리기가 겹치지 않게 대입한다.
      resetBtn.onclick = async () => {
        errorMsg.style.display = 'none';
        if (input.value.length < 6) {
          fail('pwTooShort');
          return;
        }
        resetBtn.disabled = true;
        try {
          await resetPassword(oobCode, input.value);
          form.style.display = 'none';
          setStatus('ok', icons.check);
          say(titleText, 'resetPasswordDoneTitle');
          say(subtitleText, 'resetPasswordDoneDesc');
        } catch (err) {
          console.error('Password reset error:', err.code);
          fail(err.code === 'auth/weak-password' ? 'pwTooShort'
            : err.code === 'auth/expired-action-code' || err.code === 'auth/invalid-action-code' ? 'resetLinkExpired'
            : 'resetPasswordFailed');
        } finally {
          resetBtn.disabled = false;
          input.value = '';
        }
      };
      return;
    }

    try {
      await verifyEmailCode(oobCode);
      spinner.style.display = 'none';
      setStatus('ok', icons.check);
      say(titleText, 'verifyDoneTitle');
      say(subtitleText, 'verifyDoneDesc');
      goLoginBtn.style.display = 'inline-block';
    } catch (err) {
      console.error('Email verification error:', err);
      spinner.style.display = 'none';
      setStatus('danger', icons.warn);
      say(titleText, 'verifyFailedTitle');
      say(subtitleText, 'verifyFailedDesc');
      let msg = err.message;
      if (err.code === 'auth/invalid-action-code') {
        msg = t('verifyCodeInvalid');
      }
      errorMsg.textContent = msg;
      errorMsg.style.display = 'block';
      goLoginBtn.style.display = 'inline-block';
    }
  }
}

customElements.define('verify-view', VerifyView);
