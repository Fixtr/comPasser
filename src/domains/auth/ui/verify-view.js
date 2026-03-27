import { verifyEmailCode } from '../services/firebase-auth.js';

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

        .header-section { margin-bottom: 2rem; }
        h2 { font-size: 2.2rem; color: var(--text-primary); margin-bottom: 1rem; font-weight: 800; letter-spacing: -0.02em; }
        p.subtitle { color: var(--text-secondary); margin: 0 auto; font-size: 1.1rem; line-height: 1.6; max-width: 600px; }

        .spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #f3f4f6;
          border-top-color: var(--accent-primary, #7c3aed);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 1.5rem auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .auth-btn {
          padding: 1rem 2.5rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          background: var(--accent-primary, #7c3aed);
          color: white;
          box-shadow: 0 4px 6px rgba(124, 58, 237, 0.2);
          margin-top: 2rem;
          display: none;
        }

        .auth-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(124, 58, 237, 0.3);
          background: var(--accent-hover, #6d28d9);
        }

        #error-msg {
          color: #EF4444;
          margin-top: 1rem;
          font-size: 1rem;
          display: none;
        }
      </style>

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

    if (!oobCode) {
      spinner.style.display = 'none';
      titleText.textContent = '❌ 유효하지 않은 요청';
      subtitleText.textContent = '인증 코드가 누락되었습니다.';
      errorMsg.textContent = '잘못된 접근입니다.';
      errorMsg.style.display = 'block';
      goLoginBtn.style.display = 'inline-block';
      return;
    }

    try {
      await verifyEmailCode(oobCode);
      spinner.style.display = 'none';
      titleText.textContent = '✅ 이메일 인증이 완료되었습니다!';
      subtitleText.textContent = '이제 로그인하여 모든 기능을 이용하실 수 있습니다.';
      goLoginBtn.style.display = 'inline-block';
    } catch (err) {
      console.error('Email verification error:', err);
      spinner.style.display = 'none';
      titleText.textContent = '❌ 인증 실패';
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
