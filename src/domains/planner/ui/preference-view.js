/**
 * preference-view.js
 * 
 * 여행 테마 & 예산 스타일 선택 Web Component
 * - 로그인 직후 /preference 경로에서 표시
 * - 선택 완료 후 sessionStorage에 저장 → /plan으로 이동
 */

import { t } from '../../../utils/i18n.js';
import { preferenceStyles } from './preference-style.js';
import { icons } from '../../../ui/icons.js';

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
        ${preferenceStyles}
      </style>

      <div class="preference-header">
        <div class="progress-track">
          <div id="progress-bar" class="progress-fill" style="width: 50%;"></div>
        </div>
        <span class="step-badge" id="step-badge">Step 1 / 2</span>
        <h2>나만의 여행 스타일 선택</h2>
        <p>어떤 여행을 꿈꾸고 계신가요?<br>날짜, 테마, 예산을 선택하면 AI가 맞춤 동선을 설계해 드려요.</p>
      </div>

      <div id="step1-container" class="step-container">
        <!-- Date Selection -->
        <div class="section-title">
          <span data-i18n="pref_date_title">${t('pref_date_title')}</span>
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
        <div class="section-title">
          <span data-i18n="pref_duration_title">${t('pref_duration_title')}</span>
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

        <!-- Step 1 Submit -->
        <div class="submit-section">
          <button class="next-btn" id="next-step-btn" disabled>
            다음으로 →
          </button>
          <p class="helper-text" id="step1-helper-text">시작일과 기간을 선택해 주세요</p>
        </div>
      </div>

      <div id="step2-container" class="step-container" style="display: none;">
        <!-- Theme Selection -->
        <div class="section-title">여행 테마</div>
        <div class="card-grid" id="theme-grid">
          <div class="preference-card" data-value="food">
            <span class="card-icon">${icons.dining}</span>
            <div class="card-title">맛집 탐방</div>
            <div class="card-desc">현지 맛집·카페를 중심으로 미식 여행</div>
          </div>
          <div class="preference-card" data-value="activity">
            <span class="card-icon">${icons.activity}</span>
            <div class="card-title">액티비티</div>
            <div class="card-desc">서핑·트레킹 등 체험 중심 여행</div>
          </div>
          <div class="preference-card" data-value="healing">
            <span class="card-icon">${icons.healing}</span>
            <div class="card-title">휴식 / 힐링</div>
            <div class="card-desc">자연·온천·공원 등 힐링 스팟</div>
          </div>
          <div class="preference-card" data-value="photo">
            <span class="card-icon">${icons.camera}</span>
            <div class="card-title">인생샷</div>
            <div class="card-desc">포토스팟·감성 장소 중심 여행</div>
          </div>
        </div>

        <!-- Budget Selection -->
        <div class="section-title">예산 스타일</div>
        <div class="card-grid budget" id="budget-grid">
          <div class="preference-card" data-value="flex">
            <span class="card-icon"><span class="budget-meter" data-level="3" aria-hidden="true"><i></i><i></i><i></i></span></span>
            <div class="card-title">플렉스</div>
            <div class="card-desc">고급형 · 렌터카 · 파인다이닝</div>
          </div>
          <div class="preference-card" data-value="standard">
            <span class="card-icon"><span class="budget-meter" data-level="2" aria-hidden="true"><i></i><i></i><i></i></span></span>
            <div class="card-title">스탠다드</div>
            <div class="card-desc">표준형 · 적절한 가성비</div>
          </div>
          <div class="preference-card" data-value="budget">
            <span class="card-icon"><span class="budget-meter" data-level="1" aria-hidden="true"><i></i><i></i><i></i></span></span>
            <div class="card-title">짠내투어</div>
            <div class="card-desc">절약형 · 대중교통 · 로컬 맛집</div>
          </div>
        </div>

        <!-- Submit -->
        <div class="submit-section">
          <div class="submit-row">
            <button class="prev-btn" id="prev-step-btn">이전으로</button>
            <button class="next-btn" id="submit-btn" disabled>일정 생성하기</button>
          </div>
          <p class="helper-text" id="step2-helper-text">테마와 예산을 모두 선택해 주세요</p>
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
    const themeGrid = this.shadowRoot.getElementById('theme-grid');
    const budgetGrid = this.shadowRoot.getElementById('budget-grid');
    
    const nextStepBtn = this.shadowRoot.getElementById('next-step-btn');
    const prevStepBtn = this.shadowRoot.getElementById('prev-step-btn');
    const submitBtn = this.shadowRoot.getElementById('submit-btn');
    const skipBtn = this.shadowRoot.getElementById('skip-btn');
    
    const step1Helper = this.shadowRoot.getElementById('step1-helper-text');
    const step2Helper = this.shadowRoot.getElementById('step2-helper-text');

    // Date init
    const todayStr = this.getLocalDateString(new Date());
    customDateInput.min = todayStr;

    const computeDateArray = () => {
      this.selectedDates = [];

      if (!this.startDateValue || !this.duration) {
        this._updateButtonState(nextStepBtn, submitBtn, step1Helper, step2Helper);
        
        try {
          const prefs = JSON.parse(sessionStorage.getItem('userPreference') || '{}');
          prefs.date = this.selectedDates;
          sessionStorage.setItem('userPreference', JSON.stringify(prefs));
        } catch(e) {}
        return;
      }
      
      const parts = this.startDateValue.split('-');
      const startDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);

      for (let i = 0; i < this.duration; i++) {
        const nextDate = new Date(startDate.getTime());
        nextDate.setDate(nextDate.getDate() + i);
        this.selectedDates.push(this.getLocalDateString(nextDate));
      }
      
      this._updateButtonState(nextStepBtn, submitBtn, step1Helper, step2Helper);

      try {
        const prefs = JSON.parse(sessionStorage.getItem('userPreference') || '{}');
        prefs.date = this.selectedDates;
        sessionStorage.setItem('userPreference', JSON.stringify(prefs));
      } catch(e) {}
    };

    const applyDateSelection = (type, customValue = null, isToggleClick = false) => {
      const chip = dateChipContainer.querySelector(`[data-date-type="${type}"]`);
      
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
      } else if (type === 'tomorrow') {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        this.startDateValue = this.getLocalDateString(d);
        customDateText.textContent = t('date_custom');
        customDateText.setAttribute('data-i18n', 'date_custom');
      } else if (type === 'weekend') {
        const sat = new Date();
        const currentDay = sat.getDay();
        let addDays = 6 - currentDay;
        if (currentDay === 6) addDays = 7; 
        else if (currentDay === 0) addDays = 6; 

        sat.setDate(sat.getDate() + addDays);
        this.startDateValue = this.getLocalDateString(sat);
        
        customDateText.textContent = t('date_custom');
        customDateText.setAttribute('data-i18n', 'date_custom');
        
        durationChipContainer.querySelectorAll('.date-chip').forEach(c => c.classList.remove('selected'));
        const targetDuration = durationChipContainer.querySelector(`[data-duration="2"]`);
        if (targetDuration) {
          targetDuration.classList.add('selected');
        }
        this.duration = 2;

      } else if (type === 'custom' && customValue) {
        this.startDateValue = customValue;
        customDateText.textContent = customValue; 
        customDateText.removeAttribute('data-i18n');
      }

      computeDateArray();
    };

    durationChipContainer.addEventListener('click', (e) => {
      this.selectedDates = [];

      const chip = e.target.closest('.date-chip');
      if (!chip) return;

      const durValue = parseInt(chip.dataset.duration);
      
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
      if (type !== 'custom') {
        applyDateSelection(type, null, true);
      }
    });

    customDateInput.addEventListener('click', (e) => {
      try {
        if (typeof customDateInput.showPicker === 'function') {
          customDateInput.showPicker();
        }
      } catch (err) { }
    });

    customDateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        applyDateSelection('custom', e.target.value);
      }
    });

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
      
      this._updateButtonState(nextStepBtn, submitBtn, step1Helper, step2Helper);
    });

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

      this._updateButtonState(nextStepBtn, submitBtn, step1Helper, step2Helper);
    });

    if (this.selectedDates && Array.isArray(this.selectedDates) && this.selectedDates.length > 0) {
      let isStandard = false;
      const firstDate = this.selectedDates[0];
      const length = this.selectedDates.length;

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
    this._updateButtonState(nextStepBtn, submitBtn, step1Helper, step2Helper);

    // [Step 1] Next Button
    nextStepBtn.addEventListener('click', () => {
      computeDateArray();
      if (!this.selectedDates || this.selectedDates.length === 0) return;
      
      // Save Step 1 state
      const currentPref = JSON.parse(sessionStorage.getItem('userPreference') || '{}');
      currentPref.date = this.selectedDates;
      sessionStorage.setItem('userPreference', JSON.stringify(currentPref));
      
      // Navigate to Step 2
      if (window.navigate) {
        window.navigate('/preference/2');
      }
    });

    // [Step 2] Prev Button
    prevStepBtn.addEventListener('click', () => {
      // Navigate to Step 1 without losing state
      if (window.navigate) {
        window.navigate('/preference/1');
      }
    });

    // [Step 2] Submit Button
    submitBtn.addEventListener('click', () => {
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

    // [Step 2] Skip Button
    skipBtn.addEventListener('click', () => {
      // Save what we have in Step 1, but null for theme/budget
      const preference = {
        date: this.selectedDates,
        theme: null,
        budget: null
      };
      sessionStorage.setItem('userPreference', JSON.stringify(preference));
      console.log('[Preference] Skipped theme/budget — continuing to plan.');

      if (window.navigate) {
        window.navigate('/plan');
      }
    });
  }

  _updateButtonState(nextStepBtn, submitBtn, step1Helper, step2Helper) {
    // Step 1 check
    if (this.selectedDates && this.selectedDates.length > 0) {
      nextStepBtn.disabled = false;
      step1Helper.textContent = '날짜가 선택되었습니다. 다음으로 이동하세요.';
    } else {
      nextStepBtn.disabled = true;
      step1Helper.textContent = '시작일과 기간을 선택해 주세요';
    }

    // Step 2 check
    if (this.selectedTheme && this.selectedBudget) {
      submitBtn.disabled = false;
      const themeLabels = { food: '맛집 탐방', activity: '액티비티', healing: '휴식/힐링', photo: '인생샷' };
      const budgetLabels = { flex: '플렉스', standard: '스탠다드', budget: '짠내투어' };
      step2Helper.textContent = `${themeLabels[this.selectedTheme]} + ${budgetLabels[this.selectedBudget]} 스타일로 설계합니다`;
    } else {
      submitBtn.disabled = true;
      step2Helper.textContent = '테마와 예산을 모두 선택해 주세요';
    }
  }

  setStep(step) {
    const step1 = this.shadowRoot.getElementById('step1-container');
    const step2 = this.shadowRoot.getElementById('step2-container');
    const badge = this.shadowRoot.getElementById('step-badge');
    const progress = this.shadowRoot.getElementById('progress-bar');
    
    if (!step1 || !step2) return;

    if (step === 1) {
      step1.style.display = 'block';
      step2.style.display = 'none';
      if (badge) badge.textContent = 'Step 1 / 2';
      if (progress) progress.style.width = '50%';
    } else {
      step1.style.display = 'none';
      step2.style.display = 'block';
      if (badge) badge.textContent = 'Step 2 / 2';
      if (progress) progress.style.width = '100%';
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
