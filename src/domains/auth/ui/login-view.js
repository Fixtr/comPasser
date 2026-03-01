import { loginWithGoogle } from '../services/firebase-auth.js';

export default class LoginView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.setupListeners();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 70vh;
          text-align: center;
          padding: 3rem 2rem;
          background: var(--bg-secondary, #fff);
          border-radius: var(--radius-lg, 16px);
          box-shadow: var(--shadow-lg, 0 10px 15px rgba(0,0,0,0.1));
          margin-top: 2rem;
          container-type: inline-size;
        }

        .header-section {
          margin-bottom: 3rem;
        }

        h2 {
          font-size: 2.5rem;
          color: var(--text-primary);
          margin-bottom: 1rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        p.subtitle {
          color: var(--text-secondary);
          margin: 0 auto;
          font-size: 1.2rem;
          line-height: 1.6;
          max-width: 600px;
          text-align: center;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          margin-bottom: 3.5rem;
          width: 100%;
          max-width: 900px;
        }

        .feature-card {
          background: var(--bg-primary);
          border: 1px solid oklch(90% 0.02 260);
          border-radius: 16px;
          padding: 2rem 1.5rem;
          transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .feature-card:hover {
          transform: translateY(-8px);
          box-shadow: var(--shadow-md, 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1));
          border-color: var(--accent-primary, #7c3aed);
        }

        .feature-icon {
          font-size: 2.5rem;
          margin-bottom: 1rem;
          background: oklch(95% 0.02 260);
          width: 70px;
          height: 70px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .feature-title {
          font-size: 1.2rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 0.75rem;
        }

        .feature-desc {
          font-size: 0.95rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .cta-section {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .cta-btn {
          background: linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335);
          color: white;
          border: none;
          padding: 1.25rem 2.5rem;
          font-size: 1.2rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
        }

        .cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(66, 133, 244, 0.4);
        }

        .cta-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        @container (max-width: 800px) {
          .features-grid {
            grid-template-columns: 1fr;
            max-width: 400px;
          }
        }
      </style>

      <div class="header-section">
        <h2>환영합니다! Compasser 시작하기</h2>
        <p class="subtitle">복잡한 여행 동선과 시간 계산을 AI가 대신해 드립니다.<br>지금 로그인하고 스마트한 여행 계획을 세워보세요.</p>
      </div>

      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">🧠</div>
          <div class="feature-title">스마트 동선 알고리즘</div>
          <div class="feature-desc">이동 시간을 최소화하는 AI 라우팅으로 버려지는 시간 없이 알찬 여행을 즐기세요.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🎯</div>
          <div class="feature-title">이벤트 중심 스케줄링</div>
          <div class="feature-desc">반드시 가야 하는 장소(Anchor)를 기준으로 동선을 낭비 없는 맞춤형 계획을 세워드립니다.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">⚡️</div>
          <div class="feature-title">원클릭 일정 완성</div>
          <div class="feature-desc">복잡한 여행지 검색 없이 단 몇 초 만에 세부 동선이 포함된 스마트 여행 지도가 완성됩니다.</div>
        </div>
      </div>
      
      <div class="cta-section">
        <button id="login-btn" class="cta-btn">
          <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.9c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.13-10.36 7.13-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
          Google 계정으로 3초 만에 시작하기
        </button>
        <div id="error-msg" style="color: #EA4335; margin-top: 1rem; display: none;"></div>
      </div>
    `;
  }

  setupListeners() {
    const btn = this.shadowRoot.getElementById('login-btn');
    const errorMsg = this.shadowRoot.getElementById('error-msg');

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      errorMsg.style.display = 'none';
      try {
        await loginWithGoogle();
        // The auth state change event in main.js will handle UI updates
      } catch (err) {
        btn.disabled = false;
        errorMsg.textContent = '로그인에 실패했습니다. 다시 시도해 주세요.';
        errorMsg.style.display = 'block';
      }
    });
  }
}

customElements.define('login-view', LoginView);
