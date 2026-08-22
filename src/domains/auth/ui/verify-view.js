import { verifyEmailCode } from '../services/firebase-auth.js';
import { authStyles } from './auth-style.js';
import { icons } from '../../../ui/icons.js';

export default class VerifyView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>${authStyles}</style>

      <div id="status-icon" class="status-icon"></div>

      <div class="header-section">
        <h2 id="title-text">이메일 인증 진행 중...</h2>
        <p id="subtitle-text" class="subtitle">링크 유효성을 확인하고 있습니다. 잠시만 기다려주세요.</p>
      </div>
      
      <div id="loading-spinner" class="spinner"></div>
      
      <div id="error-msg"></div>

      <button id="go-login-btn" class="auth-btn">로그인하러 가기</button>
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
      titleText.textContent = '유효하지 않은 요청';
      subtitleText.textContent = '인증 코드가 누락되었습니다.';
      errorMsg.textContent = '잘못된 접근입니다.';
      errorMsg.style.display = 'block';
      goLoginBtn.style.display = 'inline-block';
      return;
    }

    try {
      await verifyEmailCode(oobCode);
      spinner.style.display = 'none';
      setStatus('ok', icons.check);
      titleText.textContent = '이메일 인증이 완료되었습니다!';
      subtitleText.textContent = '이제 로그인하여 모든 기능을 이용하실 수 있습니다.';
      goLoginBtn.style.display = 'inline-block';
    } catch (err) {
      console.error('Email verification error:', err);
      spinner.style.display = 'none';
      setStatus('danger', icons.warn);
      titleText.textContent = '인증 실패';
      subtitleText.textContent = '이메일 인증 처리에 실패했습니다.';
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
