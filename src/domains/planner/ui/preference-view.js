/**
 * preference-view.js
 * 
 * 여행 테마 & 예산 스타일 선택 Web Component
 * - 로그인 직후 /preference 경로에서 표시
 * - 선택 완료 후 sessionStorage에 저장 → /plan으로 이동
 */

export default class PreferenceView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.selectedTheme = null;
    this.selectedBudget = null;
  }

  connectedCallback() {
    // 기존에 저장된 preference가 있으면 복원
    const saved = sessionStorage.getItem('userPreference');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.selectedTheme = parsed.theme || null;
        this.selectedBudget = parsed.budget || null;
      } catch (e) { /* ignore */ }
    }
    this.render();
    this.setupEventListeners();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          max-width: 720px;
          margin: 0 auto;
          padding: 2rem 1.5rem 3rem;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }

        .preference-header {
          text-align: center;
          margin-bottom: 2.5rem;
        }

        .preference-header .step-badge {
          display: inline-block;
          background: linear-gradient(135deg, var(--accent-primary, #7c3aed), oklch(55% 0.3 280));
          color: white;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.3rem 0.9rem;
          border-radius: 20px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 1rem;
        }

        .preference-header h2 {
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--text-primary, #1f2937);
          margin-bottom: 0.5rem;
          letter-spacing: -0.02em;
        }

        .preference-header p {
          font-size: 1rem;
          color: var(--text-secondary, #4b5563);
          line-height: 1.6;
        }

        .section-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text-primary, #1f2937);
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .section-title .icon {
          font-size: 1.3rem;
        }

        /* ====== Card Grid ====== */
        .card-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.85rem;
          margin-bottom: 2.5rem;
        }

        .preference-card {
          position: relative;
          background: var(--bg-primary, #f8f9ff);
          border: 2px solid transparent;
          border-radius: 16px;
          padding: 1.5rem 1.25rem;
          cursor: pointer;
          text-align: center;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          overflow: hidden;
        }

        .preference-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.05), rgba(79, 70, 229, 0.03));
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .preference-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(124, 58, 237, 0.12);
          border-color: rgba(124, 58, 237, 0.2);
        }

        .preference-card:hover::before {
          opacity: 1;
        }

        .preference-card.selected {
          border-color: var(--accent-primary, #7c3aed);
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.08), rgba(79, 70, 229, 0.04));
          box-shadow: 0 4px 16px rgba(124, 58, 237, 0.2), 0 0 0 3px rgba(124, 58, 237, 0.1);
          transform: translateY(-2px);
        }

        .preference-card .card-check {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--accent-primary, #7c3aed);
          color: white;
          font-size: 0.7rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transform: scale(0.5);
          transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .preference-card.selected .card-check {
          opacity: 1;
          transform: scale(1);
        }

        .card-emoji {
          font-size: 2.2rem;
          margin-bottom: 0.6rem;
          display: block;
          position: relative;
          z-index: 1;
          transition: transform 0.3s ease;
        }

        .preference-card:hover .card-emoji {
          transform: scale(1.15);
        }

        .preference-card.selected .card-emoji {
          transform: scale(1.1);
        }

        .card-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--text-primary, #1f2937);
          margin-bottom: 0.3rem;
          position: relative;
          z-index: 1;
        }

        .card-desc {
          font-size: 0.78rem;
          color: var(--text-secondary, #4b5563);
          line-height: 1.4;
          position: relative;
          z-index: 1;
        }

        /* ====== Budget Cards - wide layout ====== */
        .card-grid.budget {
          grid-template-columns: repeat(3, 1fr);
        }

        .budget .preference-card {
          padding: 1.25rem 1rem;
        }

        /* ====== Submit Button ====== */
        .submit-section {
          text-align: center;
          margin-top: 1rem;
        }

        .next-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: linear-gradient(135deg, var(--accent-primary, #7c3aed), oklch(55% 0.3 280));
          color: white;
          border: none;
          padding: 1rem 2.5rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 14px;
          cursor: pointer;
          width: 100%;
          max-width: 400px;
          transition: all 0.25s ease;
          box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);
          position: relative;
          overflow: hidden;
        }

        .next-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .next-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(124, 58, 237, 0.4);
        }

        .next-btn:hover:not(:disabled)::after {
          opacity: 1;
        }

        .next-btn:disabled {
          background: #d1d5db;
          color: #9ca3af;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .next-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .helper-text {
          font-size: 0.8rem;
          color: var(--text-secondary, #6b7280);
          margin-top: 0.75rem;
        }

        /* ====== Skip link ====== */
        .skip-link {
          display: block;
          text-align: center;
          margin-top: 1.25rem;
          font-size: 0.85rem;
          color: var(--text-secondary, #6b7280);
          cursor: pointer;
          transition: color 0.2s;
          text-decoration: none;
          background: none;
          border: none;
          font-family: inherit;
        }

        .skip-link:hover {
          color: var(--accent-primary, #7c3aed);
          text-decoration: underline;
        }

        /* ====== Responsive ====== */
        @media (max-width: 500px) {
          :host {
            padding: 1.5rem 1rem 2.5rem;
          }

          .preference-header h2 {
            font-size: 1.4rem;
          }

          .card-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 0.65rem;
          }

          .card-grid.budget {
            grid-template-columns: 1fr;
          }

          .preference-card {
            padding: 1.2rem 1rem;
          }

          .card-emoji {
            font-size: 1.8rem;
          }

          .card-title {
            font-size: 0.88rem;
          }

          .card-desc {
            font-size: 0.72rem;
          }
        }

        /* ====== Dark Mode ====== */
        :host-context(body.dark) .preference-card {
          background: var(--bg-secondary, #1f2937);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        :host-context(body.dark) .preference-card:hover {
          box-shadow: 0 8px 24px rgba(167, 139, 250, 0.15);
          border-color: rgba(167, 139, 250, 0.3);
        }

        :host-context(body.dark) .preference-card.selected {
          border-color: var(--accent-primary, #a78bfa);
          background: linear-gradient(135deg, rgba(167, 139, 250, 0.12), rgba(99, 102, 241, 0.06));
          box-shadow: 0 4px 16px rgba(167, 139, 250, 0.25), 0 0 0 3px rgba(167, 139, 250, 0.12);
        }
      </style>

      <div class="preference-header">
        <span class="step-badge">Step 1 / 2</span>
        <h2>나만의 여행 스타일 선택</h2>
        <p>어떤 여행을 꿈꾸고 계신가요?<br>테마와 예산을 선택하면 AI가 맞춤 동선을 설계해 드려요.</p>
      </div>

      <!-- Theme Selection -->
      <div class="section-title">
        <span class="icon">🎨</span> 여행 테마
      </div>
      <div class="card-grid" id="theme-grid">
        <div class="preference-card" data-value="food">
          <span class="card-check">✓</span>
          <span class="card-emoji">🍽️</span>
          <div class="card-title">맛집 탐방</div>
          <div class="card-desc">현지 맛집·카페를 중심으로 미식 여행</div>
        </div>
        <div class="preference-card" data-value="activity">
          <span class="card-check">✓</span>
          <span class="card-emoji">🏄</span>
          <div class="card-title">액티비티</div>
          <div class="card-desc">서핑·트레킹 등 체험 중심 여행</div>
        </div>
        <div class="preference-card" data-value="healing">
          <span class="card-check">✓</span>
          <span class="card-emoji">🧘</span>
          <div class="card-title">휴식 / 힐링</div>
          <div class="card-desc">자연·온천·공원 등 힐링 스팟</div>
        </div>
        <div class="preference-card" data-value="photo">
          <span class="card-check">✓</span>
          <span class="card-emoji">📸</span>
          <div class="card-title">인생샷</div>
          <div class="card-desc">포토스팟·감성 장소 중심 여행</div>
        </div>
      </div>

      <!-- Budget Selection -->
      <div class="section-title">
        <span class="icon">💳</span> 예산 스타일
      </div>
      <div class="card-grid budget" id="budget-grid">
        <div class="preference-card" data-value="flex">
          <span class="card-check">✓</span>
          <span class="card-emoji">💰</span>
          <div class="card-title">플렉스</div>
          <div class="card-desc">고급형 · 렌터카 · 파인다이닝</div>
        </div>
        <div class="preference-card" data-value="standard">
          <span class="card-check">✓</span>
          <span class="card-emoji">💵</span>
          <div class="card-title">스탠다드</div>
          <div class="card-desc">표준형 · 적절한 가성비</div>
        </div>
        <div class="preference-card" data-value="budget">
          <span class="card-check">✓</span>
          <span class="card-emoji">🪙</span>
          <div class="card-title">짠내투어</div>
          <div class="card-desc">절약형 · 대중교통 · 로컬 맛집</div>
        </div>
      </div>

      <!-- Submit -->
      <div class="submit-section">
        <button class="next-btn" id="next-btn" disabled>
          다음으로 →
        </button>
        <p class="helper-text" id="helper-text">테마와 예산을 모두 선택해 주세요</p>
        <button class="skip-link" id="skip-btn">선택 없이 바로 일정 짜기 →</button>
      </div>
    `;
  }

  setupEventListeners() {
    const themeGrid = this.shadowRoot.getElementById('theme-grid');
    const budgetGrid = this.shadowRoot.getElementById('budget-grid');
    const nextBtn = this.shadowRoot.getElementById('next-btn');
    const skipBtn = this.shadowRoot.getElementById('skip-btn');
    const helperText = this.shadowRoot.getElementById('helper-text');

    // Theme card selection
    themeGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.preference-card');
      if (!card) return;

      themeGrid.querySelectorAll('.preference-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      this.selectedTheme = card.dataset.value;
      this._updateButtonState(nextBtn, helperText);
    });

    // Budget card selection
    budgetGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.preference-card');
      if (!card) return;

      budgetGrid.querySelectorAll('.preference-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      this.selectedBudget = card.dataset.value;
      this._updateButtonState(nextBtn, helperText);
    });

    // Restore previous selection highlight
    if (this.selectedTheme) {
      const themeCard = themeGrid.querySelector(`[data-value="${this.selectedTheme}"]`);
      if (themeCard) themeCard.classList.add('selected');
    }
    if (this.selectedBudget) {
      const budgetCard = budgetGrid.querySelector(`[data-value="${this.selectedBudget}"]`);
      if (budgetCard) budgetCard.classList.add('selected');
    }
    this._updateButtonState(nextBtn, helperText);

    // Next button
    nextBtn.addEventListener('click', () => {
      if (!this.selectedTheme || !this.selectedBudget) return;

      const preference = {
        theme: this.selectedTheme,
        budget: this.selectedBudget
      };

      sessionStorage.setItem('userPreference', JSON.stringify(preference));
      console.log('[Preference] Saved:', preference);

      if (window.navigate) {
        window.navigate('/plan');
      }
    });

    // Skip button
    skipBtn.addEventListener('click', () => {
      // Save defaults / no preference
      sessionStorage.setItem('userPreference', JSON.stringify({ theme: null, budget: null }));
      console.log('[Preference] Skipped — no preference set.');

      if (window.navigate) {
        window.navigate('/plan');
      }
    });
  }

  _updateButtonState(nextBtn, helperText) {
    if (this.selectedTheme && this.selectedBudget) {
      nextBtn.disabled = false;

      const themeLabels = { food: '맛집 탐방', activity: '액티비티', healing: '휴식/힐링', photo: '인생샷' };
      const budgetLabels = { flex: '플렉스', standard: '스탠다드', budget: '짠내투어' };
      helperText.textContent = `✨ ${themeLabels[this.selectedTheme]} + ${budgetLabels[this.selectedBudget]} 스타일로 AI가 맞춤 설계합니다`;
    } else {
      nextBtn.disabled = true;
      helperText.textContent = '테마와 예산을 모두 선택해 주세요';
    }
  }
}

customElements.define('preference-view', PreferenceView);
