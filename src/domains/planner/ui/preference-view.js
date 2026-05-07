/**
 * preference-view.js
 * 
 * 여행 테마 & 예산 스타일 선택 Web Component
 * - 로그인 직후 /preference 경로에서 표시
 * - 선택 완료 후 sessionStorage에 저장 → /plan으로 이동
 */

import { t } from '../../../utils/i18n.js';

export default class PreferenceView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.selectedDates = null;
    this.startDateType = null;
    this.startDateValue = null;
    this.duration = null;
    this.selectedTheme = null;
    this.selectedBudget = null;
  }

  connectedCallback() {
    // 기존에 저장된 preference가 있으면 복원
    const saved = sessionStorage.getItem('userPreference');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.selectedDates = parsed.date || null; // Can be an array
        this.selectedTheme = parsed.theme || null;
        this.selectedBudget = parsed.budget || null;
      } catch (e) { /* ignore */ }
    }
    this.render();
    this.setupEventListeners();
    
    // 언어 변경 리스너
    window.addEventListener('i18n-changed', () => {
      this.updateTexts();
    });
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

        /* ====== Date Chips ====== */
        .date-chip-container {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 2rem;
        }

        .date-chip {
          background: var(--bg-primary, #f8f9ff);
          border: 2px solid transparent;
          color: var(--text-primary, #1f2937);
          padding: 0.6rem 1rem;
          border-radius: 999px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
          user-select: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .date-chip:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.1);
        }

        .date-chip.selected {
          border-color: var(--accent-primary, #7c3aed);
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(79, 70, 229, 0.05));
          color: var(--accent-primary, #7c3aed);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2);
        }

        .custom-date-wrapper {
          position: relative;
          overflow: hidden; /* iOS 달력 침범 방지 */
        }

        .hidden-date-input {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          z-index: 10;
        }

        /* [핵심] 달력 호출 아이콘의 클릭 영역을 버튼 전체로 100% 확장 */
        .hidden-date-input::-webkit-calendar-picker-indicator {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          opacity: 0;
          cursor: pointer;
        }

        .preference-content {
          max-height: 0;
          opacity: 0;
          overflow: hidden;
          transition: all 0.4s ease-in-out;
          pointer-events: none;
        }

        .preference-content.active {
          max-height: 1000px;
          opacity: 1;
          pointer-events: auto;
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
        <p>어떤 여행을 꿈꾸고 계신가요?<br>날짜, 테마, 예산을 선택하면 AI가 맞춤 동선을 설계해 드려요.</p>
      </div>

      <!-- Date Selection -->
      <div class="section-title">
        <span class="icon">📅</span> <span data-i18n="pref_date_title">${t('pref_date_title')}</span>
      </div>
      
      <div class="date-chip-container" id="date-chip-container">
        <!-- '이번 주말' 버튼 유지 (Combo Action) -->
        <div class="date-chip" data-date-type="weekend">
          <span data-i18n="date_weekend">${t('date_weekend')}</span>
        </div>
        <div class="date-chip" data-date-type="today">
          <span data-i18n="date_today">${t('date_today')}</span>
        </div>
        <div class="date-chip" data-date-type="tomorrow">
          <span data-i18n="date_tomorrow">${t('date_tomorrow')}</span>
        </div>
        <div class="date-chip custom-date-wrapper" data-date-type="custom">
          <span class="custom-date-text" id="custom-date-text" data-i18n="date_custom">${t('date_custom')}</span>
          <input type="date" id="custom-date-input" class="hidden-date-input">
        </div>
      </div>

      <!-- Duration Selection -->
      <div class="section-title" style="margin-top: 1.5rem;">
        <span class="icon">⏳</span> <span data-i18n="pref_duration_title">${t('pref_duration_title')}</span>
      </div>
      <div class="date-chip-container" id="duration-chip-container">
        <div class="date-chip" data-duration="1">
          <span data-i18n="duration_1">${t('duration_1')}</span>
        </div>
        <div class="date-chip" data-duration="2">
          <span data-i18n="duration_2">${t('duration_2')}</span>
        </div>
        <div class="date-chip" data-duration="3">
          <span data-i18n="duration_3">${t('duration_3')}</span>
        </div>
        <div class="date-chip" data-duration="4">
          <span data-i18n="duration_4">${t('duration_4')}</span>
        </div>
      </div>

      <div id="preference-content" class="preference-content dimmed">
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
          <p class="helper-text" id="helper-text">모든 항목을 선택해 주세요</p>
          <button class="skip-link" id="skip-btn">선택 없이 바로 일정 짜기 →</button>
        </div>
      </div>
    `;
  }

  getLocalDateString(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  setupEventListeners() {
    const dateChipContainer = this.shadowRoot.getElementById('date-chip-container');
    const durationChipContainer = this.shadowRoot.getElementById('duration-chip-container');
    const customDateInput = this.shadowRoot.getElementById('custom-date-input');
    const customDateText = this.shadowRoot.getElementById('custom-date-text');
    const preferenceContent = this.shadowRoot.getElementById('preference-content');
    const themeGrid = this.shadowRoot.getElementById('theme-grid');
    const budgetGrid = this.shadowRoot.getElementById('budget-grid');
    const nextBtn = this.shadowRoot.getElementById('next-btn');
    const skipBtn = this.shadowRoot.getElementById('skip-btn');
    const helperText = this.shadowRoot.getElementById('helper-text');

    // Date init
    const todayStr = this.getLocalDateString(new Date());
    customDateInput.min = todayStr;

    // Expand step 2
    const expandStep2 = () => {
      preferenceContent.classList.add('active');
    };

    const collapseStep2 = () => {
      preferenceContent.classList.remove('active');
    };

    // Initialize to expanded if already has date
    if (this.selectedDates && this.selectedDates.length > 0) {
      expandStep2();
    } else {
      collapseStep2(); // start hidden
    }

    const computeDateArray = () => {
      // 1. 상태 초기화 방어: 누적 방지를 위해 무조건 빈 배열로 시작
      this.selectedDates = [];

      if (!this.startDateValue || !this.duration) {
        collapseStep2();
        this._updateButtonState(nextBtn, helperText);
        
        // 실시간 동기화 (Clear)
        try {
          const prefs = JSON.parse(sessionStorage.getItem('userPreference') || '{}');
          prefs.date = this.selectedDates;
          sessionStorage.setItem('userPreference', JSON.stringify(prefs));
          console.log("[Storage Sync] Cleared Dates:", this.selectedDates);
        } catch(e) {
          console.error("[Storage Sync] Failed to clear dates:", e);
        }
        return;
      }
      
      const parts = this.startDateValue.split('-');
      // Native JS Date construction (Noon 기준)으로 타임존 밀림 현상 방지
      const startDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);

      for (let i = 0; i < this.duration; i++) {
        // [핵심] 반드시 독립된 복사본을 만든 뒤 날짜를 더함 (Mutation 방지)
        const nextDate = new Date(startDate.getTime());
        nextDate.setDate(nextDate.getDate() + i);
        
        // [Timezone 주의] getLocalDateString은 내부적으로 getFullYear, getMonth, getDate를 사용하여 로컬 시간 보존
        this.selectedDates.push(this.getLocalDateString(nextDate));
      }
      
      expandStep2();
      this._updateButtonState(nextBtn, helperText);

      // 실시간 저장소 동기화: 최종 버튼 누르기 전이라도 최신화
      try {
        const prefs = JSON.parse(sessionStorage.getItem('userPreference') || '{}');
        prefs.date = this.selectedDates;
        sessionStorage.setItem('userPreference', JSON.stringify(prefs));
        console.log("[Storage Sync] Updated Dates:", this.selectedDates);
      } catch(e) {
        console.error("[Storage Sync] Failed to update dates:", e);
      }
    };

    // Date selection
    const applyDateSelection = (type, customValue = null, isToggleClick = false) => {
      const chip = dateChipContainer.querySelector(`[data-date-type="${type}"]`);
      
      // Toggle off mechanism
      if (isToggleClick && chip && chip.classList.contains('selected')) {
        chip.classList.remove('selected');
        this.startDateType = null;
        this.startDateValue = null;
        customDateText.textContent = t('date_custom');
        customDateText.setAttribute('data-i18n', 'date_custom');
        computeDateArray();
        return;
      }

      dateChipContainer.querySelectorAll('.date-chip').forEach(c => c.classList.remove('selected'));
      if (chip) chip.classList.add('selected');

      this.startDateType = type;

      if (type === 'today') {
        this.startDateValue = todayStr;
        customDateText.textContent = t('date_custom');
        customDateText.setAttribute('data-i18n', 'date_custom');
        // Unset combo if not weekend
        durationChipContainer.querySelectorAll('.date-chip').forEach(c => c.classList.remove('combo-locked'));
      } else if (type === 'tomorrow') {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        this.startDateValue = this.getLocalDateString(d);
        customDateText.textContent = t('date_custom');
        customDateText.setAttribute('data-i18n', 'date_custom');
        durationChipContainer.querySelectorAll('.date-chip').forEach(c => c.classList.remove('combo-locked'));
      } else if (type === 'weekend') {
        // [이번 주말 Combo Action]
        const sat = new Date();
        const currentDay = sat.getDay();
        let addDays = 6 - currentDay;
        if (currentDay === 6) addDays = 7; // Next Saturday
        else if (currentDay === 0) addDays = 6; // Next Saturday

        sat.setDate(sat.getDate() + addDays);
        this.startDateValue = this.getLocalDateString(sat);
        
        customDateText.textContent = t('date_custom');
        customDateText.setAttribute('data-i18n', 'date_custom');
        
        // Auto-select duration: 1N2D
        durationChipContainer.querySelectorAll('.date-chip').forEach(c => {
           c.classList.remove('selected');
        });
        const targetDuration = durationChipContainer.querySelector(`[data-duration="2"]`);
        if (targetDuration) {
          targetDuration.classList.add('selected');
        }
        this.duration = 2;

      } else if (type === 'custom' && customValue) {
        this.startDateValue = customValue;
        customDateText.textContent = customValue; 
        customDateText.removeAttribute('data-i18n');
        durationChipContainer.querySelectorAll('.date-chip').forEach(c => c.classList.remove('combo-locked'));
      }

      computeDateArray();
    };

    // Duration selection
    durationChipContainer.addEventListener('click', (e) => {
      // 날짜 배열 생성 및 초기화 보장 (이전 데이터 간섭 원천 차단)
      this.selectedDates = [];

      const chip = e.target.closest('.date-chip');
      if (!chip) return;

      const durValue = parseInt(chip.dataset.duration);
      
      // Toggle off mechanism
      if (chip.classList.contains('selected')) {
        chip.classList.remove('selected');
        this.duration = null;
        computeDateArray();
        return;
      }

      durationChipContainer.querySelectorAll('.date-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      
      this.duration = durValue;
      computeDateArray();
    });

    dateChipContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.date-chip');
      if (!chip) return;

      const type = chip.dataset.dateType;
      // Do not handle 'custom' clicks here, let the input 'change' event handle exact date choices.
      if (type !== 'custom') {
        applyDateSelection(type, null, true);
      }
    });

    customDateInput.addEventListener('click', (e) => {
      try {
        if (typeof customDateInput.showPicker === 'function') {
          customDateInput.showPicker();
        }
      } catch (err) {
        console.warn('[Calendar] showPicker() failed or not supported:', err);
      }
    });

    customDateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        applyDateSelection('custom', e.target.value);
      }
    });

    // Theme card selection
    themeGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.preference-card');
      if (!card) return;

      const isAlreadySelected = card.classList.contains('selected');
      
      themeGrid.querySelectorAll('.preference-card').forEach(c => c.classList.remove('selected'));
      
      if (isAlreadySelected) {
        this.selectedTheme = null;
      } else {
        card.classList.add('selected');
        this.selectedTheme = card.dataset.value;
      }
      
      this._updateButtonState(nextBtn, helperText);
    });

    // Budget card selection
    budgetGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.preference-card');
      if (!card) return;

      const isAlreadySelected = card.classList.contains('selected');

      budgetGrid.querySelectorAll('.preference-card').forEach(c => c.classList.remove('selected'));
      
      if (isAlreadySelected) {
        this.selectedBudget = null;
      } else {
        card.classList.add('selected');
        this.selectedBudget = card.dataset.value;
      }

      this._updateButtonState(nextBtn, helperText);
    });

    // Restore previous selections
    if (this.selectedDates && Array.isArray(this.selectedDates) && this.selectedDates.length > 0) {
      let isStandard = false;
      const firstDate = this.selectedDates[0];
      const length = this.selectedDates.length;

      // Restore duration
      if (length >= 1 && length <= 4) {
        this.duration = length;
        const durChip = durationChipContainer.querySelector(`[data-duration="${length}"]`);
        if (durChip) durChip.classList.add('selected');
      }
      
      const sat = new Date();
      const day = sat.getDay();
      let addDays = 6 - day;
      if (day === 6) addDays = 7;
      else if (day === 0) addDays = 6;
      sat.setDate(sat.getDate() + addDays);

      if (firstDate === todayStr) {
        applyDateSelection('today');
        isStandard = true;
      } else {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        if (firstDate === this.getLocalDateString(d)) {
          applyDateSelection('tomorrow');
          isStandard = true;
        } else if (firstDate === this.getLocalDateString(sat) && length === 2) {
          applyDateSelection('weekend');
          isStandard = true;
        }
      }

      if (!isStandard) {
        applyDateSelection('custom', firstDate);
      }
    }

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
      // Submit 시점의 완벽한 덮어쓰기 보장 (100% 새로 계산)
      computeDateArray();

      if (!this.selectedTheme || !this.selectedBudget || !this.selectedDates) return;

      const preference = {
        date: this.selectedDates,
        theme: this.selectedTheme,
        budget: this.selectedBudget
      };

      sessionStorage.setItem('userPreference', JSON.stringify(preference));
      console.log('[Preference] Saved Final:', preference);

      if (window.navigate) {
        window.navigate('/plan');
      }
    });

    // Skip button
    skipBtn.addEventListener('click', () => {
      // Save defaults / no preference
      sessionStorage.setItem('userPreference', JSON.stringify({ date: null, theme: null, budget: null }));
      console.log('[Preference] Skipped — no preference set.');

      if (window.navigate) {
        window.navigate('/plan');
      }
    });
  }

  _updateButtonState(nextBtn, helperText) {
    if (this.selectedDates && this.selectedTheme && this.selectedBudget) {
      nextBtn.disabled = false;

      const themeLabels = { food: '맛집 탐방', activity: '액티비티', healing: '휴식/힐링', photo: '인생샷' };
      const budgetLabels = { flex: '플렉스', standard: '스탠다드', budget: '짠내투어' };
      helperText.textContent = `✨ ${themeLabels[this.selectedTheme]} + ${budgetLabels[this.selectedBudget]} 스타일로 AI가 맞춤 설계합니다`;
    } else {
      nextBtn.disabled = true;
      if (!this.selectedDates) {
        helperText.textContent = '시작일과 기간을 선택해 주세요';
      } else {
        helperText.textContent = '테마와 예산을 모두 선택해 주세요';
      }
    }
  }

  updateTexts() {
    const elements = this.shadowRoot.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (el.children.length === 0) {
        el.textContent = t(key);
      } else {
        el.childNodes[0].nodeValue = t(key) + ' ';
      }
    });

    // Restore custom date text if needed
    if (this.selectedDates && this.shadowRoot.getElementById('custom-date-text') && !this.shadowRoot.getElementById('custom-date-text').hasAttribute('data-i18n')) {
      // Keep it displaying the chosen date
    }
  }
}

customElements.define('preference-view', PreferenceView);
