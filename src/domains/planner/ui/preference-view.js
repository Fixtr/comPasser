import { dateRange, travelRegion, localTravelDate } from '../../../../functions/travel-region.mjs';
import { moveTripDates } from '../services/trip-stays.mjs';
import { destinationById } from '../services/travel-destinations.mjs';
/**
 * preference-view.js
 * 
 * 여행 테마 & 예산 스타일 선택 Web Component
 * - 로그인 직후 /preference 경로에서 표시
 * - 선택 완료 후 sessionStorage에 저장 → /plan으로 이동
 */

import { t, applyTranslations } from '../../../utils/i18n.js';
import { preferenceStyles } from './preference-style.js';
import { icons } from '../../../ui/icons.js';
import { plannerDraftStore } from '../services/planner-draft.mjs';

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
    this.restoreSelection();
    this.render();
    this.setupEventListeners();
    
    this._languageHandler = () => this.updateTexts();
    window.addEventListener('i18n-changed', this._languageHandler);
  }

  disconnectedCallback() { window.removeEventListener('i18n-changed', this._languageHandler); }

  restoreSelection() {
    const draft = plannerDraftStore.read();
    this.selectedDates = draft.date;
    this.selectedTheme = draft.theme;
    this.selectedBudget = draft.budget;
    this.startDateType = null;
    this.startDateValue = null;
    this.duration = null;
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
        <h2 data-i18n="prefStyleTitle">${t('prefStyleTitle')}</h2>
        <p><span data-i18n="prefStyleSubtitle1">${t('prefStyleSubtitle1')}</span><br><span data-i18n="prefStyleSubtitle2">${t('prefStyleSubtitle2')}</span></p>
      </div>

      <div id="step1-container" class="step-container">
        <div class="destination-summary" hidden>
          <p><span data-i18n="flowDestination">${t('flowDestination')}</span> · <strong id="preference-destination"></strong></p>
          <button type="button" id="change-destination" class="prev-btn" data-i18n="flowChangeDestination">${t('flowChangeDestination')}</button>
        </div>
        <!-- Date Selection -->
        <div class="section-title">
          <span data-i18n="pref_date_title">${t('pref_date_title')}</span>
        </div>
        
        <div class="date-chip-container" id="date-chip-container">
          <!-- '이번 주말' 버튼 유지 (Combo Action) -->
          <button type="button" class="date-chip" data-date-type="weekend">
            <span data-i18n="date_weekend">${t('date_weekend')}</span>
          </button>
          <button type="button" class="date-chip" data-date-type="today">
            <span data-i18n="date_today">${t('date_today')}</span>
          </button>
          <button type="button" class="date-chip" data-date-type="tomorrow">
            <span data-i18n="date_tomorrow">${t('date_tomorrow')}</span>
          </button>
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
          <button type="button" class="date-chip" data-duration="1">
            <span data-i18n="duration_1">${t('duration_1')}</span>
          </button>
          <button type="button" class="date-chip" data-duration="2">
            <span data-i18n="duration_2">${t('duration_2')}</span>
          </button>
          <button type="button" class="date-chip" data-duration="3">
            <span data-i18n="duration_3">${t('duration_3')}</span>
          </button>
          <button type="button" class="date-chip" data-duration="4">
            <span data-i18n="duration_4">${t('duration_4')}</span>
          </button>
        </div>

        <!-- Step 1 Submit -->
        <div class="submit-section">
          <button class="next-btn" id="next-step-btn" data-i18n="prefNextBtn" disabled>${t('prefNextBtn')}</button>
          <p class="helper-text" id="step1-helper-text" data-i18n="prefStep1Helper">${t('prefStep1Helper')}</p>
        </div>
      </div>

      <div id="step2-container" class="step-container" style="display: none;">
        <!-- Theme Selection -->
        <div class="section-title" data-i18n="prefThemeSection">${t('prefThemeSection')}</div>
        <div class="card-grid" id="theme-grid">
          <button type="button" class="preference-card" data-value="food">
            <span class="card-icon">${icons.dining}</span>
            <div class="card-title" data-i18n="themeFood">${t('themeFood')}</div>
            <div class="card-desc" data-i18n="themeFoodDesc">${t('themeFoodDesc')}</div>
          </button>
          <button type="button" class="preference-card" data-value="activity">
            <span class="card-icon">${icons.activity}</span>
            <div class="card-title" data-i18n="themeActivity">${t('themeActivity')}</div>
            <div class="card-desc" data-i18n="themeActivityDesc">${t('themeActivityDesc')}</div>
          </button>
          <button type="button" class="preference-card" data-value="healing">
            <span class="card-icon">${icons.healing}</span>
            <div class="card-title" data-i18n="themeHealing">${t('themeHealing')}</div>
            <div class="card-desc" data-i18n="themeHealingDesc">${t('themeHealingDesc')}</div>
          </button>
          <button type="button" class="preference-card" data-value="photo">
            <span class="card-icon">${icons.camera}</span>
            <div class="card-title" data-i18n="themePhoto">${t('themePhoto')}</div>
            <div class="card-desc" data-i18n="themePhotoDesc">${t('themePhotoDesc')}</div>
          </button>
        </div>

        <!-- Budget Selection -->
        <div class="section-title" data-i18n="prefBudgetSection">${t('prefBudgetSection')}</div>
        <div class="card-grid budget" id="budget-grid">
          <button type="button" class="preference-card" data-value="flex">
            <span class="card-icon"><span class="budget-meter" data-level="3" aria-hidden="true"><i></i><i></i><i></i></span></span>
            <div class="card-title" data-i18n="budgetFlex">${t('budgetFlex')}</div>
            <div class="card-desc" data-i18n="budgetFlexDesc">${t('budgetFlexDesc')}</div>
          </button>
          <button type="button" class="preference-card" data-value="standard">
            <span class="card-icon"><span class="budget-meter" data-level="2" aria-hidden="true"><i></i><i></i><i></i></span></span>
            <div class="card-title" data-i18n="budgetStandard">${t('budgetStandard')}</div>
            <div class="card-desc" data-i18n="budgetStandardDesc">${t('budgetStandardDesc')}</div>
          </button>
          <button type="button" class="preference-card" data-value="budget">
            <span class="card-icon"><span class="budget-meter" data-level="1" aria-hidden="true"><i></i><i></i><i></i></span></span>
            <div class="card-title" data-i18n="budgetSaver">${t('budgetSaver')}</div>
            <div class="card-desc" data-i18n="budgetSaverDesc">${t('budgetSaverDesc')}</div>
          </button>
        </div>

        <!-- Submit -->
        <div class="submit-section">
          <div class="submit-row">
            <button class="prev-btn" id="prev-step-btn" data-i18n="prefPrevBtn">${t('prefPrevBtn')}</button>
            <button class="next-btn" id="submit-btn" disabled data-i18n="prefSubmitBtn">${t('prefSubmitBtn')}</button>
          </div>
          <p class="helper-text" id="step2-helper-text" data-i18n="prefStep2Helper">${t('prefStep2Helper')}</p>
          <button class="skip-link" id="skip-btn" data-i18n="prefSkipBtn">${t('prefSkipBtn')}</button>
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
    // Reconstructing the controls is not a new preference selection.
    let restoring = true;
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

    durationChipContainer.hidden = !this.selectedDates?.length;
    // Date init
    const todayStr = localTravelDate(new Date(), travelRegion(plannerDraftStore.read()).timeZone);
    const tomorrowStr = dateRange(todayStr, 2)[1];
    const localToday = new Date(`${todayStr}T12:00:00Z`);
    const weekday = localToday.getUTCDay();
    const weekendStr = new Date(localToday.getTime() + (weekday === 6 ? 7 : 6 - weekday) * 86400000).toISOString().slice(0, 10);
    const city = destinationById(plannerDraftStore.read().destination?.id);
    this.shadowRoot.querySelector('.destination-summary').hidden = !city;
    this.shadowRoot.getElementById('preference-destination').textContent = city ? t(city.key) : '';
    this.shadowRoot.getElementById('change-destination').onclick = () => window.navigate('/destination');
    customDateInput.min = todayStr;

    const computeDateArray = () => {
      this.selectedDates = [];

      if (!this.startDateValue || !this.duration) {
        this._updateButtonState(nextStepBtn, submitBtn, step1Helper, step2Helper);
        
        if (!restoring) plannerDraftStore.save(moveTripDates(plannerDraftStore.read(), this.selectedDates));
        return;
      }
      
      this.selectedDates = dateRange(this.startDateValue, this.duration);
      
      this._updateButtonState(nextStepBtn, submitBtn, step1Helper, step2Helper);

      if (!restoring) plannerDraftStore.save(moveTripDates(plannerDraftStore.read(), this.selectedDates));
    };

    const applyDateSelection = (type, customValue = null, isToggleClick = false) => {
      const chip = dateChipContainer.querySelector(`[data-date-type="${type}"]`);
      
      if (isToggleClick && chip && chip.classList.contains('selected')) {
        chip.classList.remove('selected');
        chip.setAttribute('aria-pressed', 'false');
        this.startDateType = null;
        this.startDateValue = null;
        customDateText.textContent = t('date_custom');
        customDateText.setAttribute('data-i18n', 'date_custom');
        computeDateArray();
        return;
      }

      dateChipContainer.querySelectorAll('.date-chip').forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); });
      if (chip) chip.classList.add('selected');
      chip?.setAttribute('aria-pressed', 'true');

      this.startDateType = type;

      if (type === 'today') {
        this.startDateValue = todayStr;
        customDateText.textContent = t('date_custom');
        customDateText.setAttribute('data-i18n', 'date_custom');
      } else if (type === 'tomorrow') {
        this.startDateValue = tomorrowStr;
        customDateText.textContent = t('date_custom');
        customDateText.setAttribute('data-i18n', 'date_custom');
      } else if (type === 'weekend') {
        this.startDateValue = weekendStr;
        
        customDateText.textContent = t('date_custom');
        customDateText.setAttribute('data-i18n', 'date_custom');
        
        durationChipContainer.querySelectorAll('.date-chip').forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); });
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

      durationChipContainer.hidden = false;
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) durationChipContainer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
      computeDateArray();
    };

    durationChipContainer.addEventListener('click', (e) => {
      this.selectedDates = [];

      const chip = e.target.closest('.date-chip');
      if (!chip) return;

      const durValue = parseInt(chip.dataset.duration);
      
      if (chip.classList.contains('selected')) {
        chip.classList.remove('selected');
        chip.setAttribute('aria-pressed', 'false');
        this.duration = null;
        computeDateArray();
        return;
      }

      durationChipContainer.querySelectorAll('.date-chip').forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('selected');
      chip?.setAttribute('aria-pressed', 'true');
      
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
      
      themeGrid.querySelectorAll('.preference-card').forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); });
      
      if (isAlreadySelected) {
        this.selectedTheme = null;
      } else {
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');
        this.selectedTheme = card.dataset.value;
      }
      
      plannerDraftStore.updatePreferences({ theme: this.selectedTheme });
      this._updateButtonState(nextStepBtn, submitBtn, step1Helper, step2Helper);
    });

    budgetGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.preference-card');
      if (!card) return;

      const isAlreadySelected = card.classList.contains('selected');

      budgetGrid.querySelectorAll('.preference-card').forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); });
      
      if (isAlreadySelected) {
        this.selectedBudget = null;
      } else {
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');
        this.selectedBudget = card.dataset.value;
      }

      plannerDraftStore.updatePreferences({ budget: this.selectedBudget });
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
      
      if (firstDate === todayStr) {
        applyDateSelection('today');
        isStandard = true;
      } else {
        if (firstDate === tomorrowStr) {
          applyDateSelection('tomorrow');
          isStandard = true;
        } else if (firstDate === weekendStr && length === 2) {
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
    restoring = false;

    // [Step 1] Next Button
    nextStepBtn.addEventListener('click', () => {
      computeDateArray();
      if (!this.selectedDates || this.selectedDates.length === 0) return;
      
      // Save Step 1 state
      plannerDraftStore.save(moveTripDates(plannerDraftStore.read(), this.selectedDates));
      
      const next = this.returnToPlan ? '/plan' : '/preference/2';
      if (window.navigate) {
        plannerDraftStore.update({ step: next });
        window.navigate(next, this.returnToPlan ? { state: { returnTo: '/plan' } } : undefined);
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
      if (!this.selectedDates?.length) return;

      const preference = {
        date: this.selectedDates,
        theme: this.selectedTheme,
        budget: this.selectedBudget
      };

      plannerDraftStore.updatePreferences(preference);
      plannerDraftStore.update({ step: '/plan' });

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
      this.selectedTheme = null;
      this.selectedBudget = null;
      plannerDraftStore.updatePreferences(preference);
      plannerDraftStore.update({ step: '/plan' });

      if (window.navigate) {
        window.navigate('/plan');
      }
    });
  }

  _updateButtonState(nextStepBtn, submitBtn, step1Helper, step2Helper) {
    // Step 1 check
    if (this.selectedDates && this.selectedDates.length > 0) {
      nextStepBtn.disabled = false;
      step1Helper.textContent = t(this.returnToPlan ? 'prefApplyDatesHelper' : 'prefStep1Done');
    } else {
      nextStepBtn.disabled = true;
      step1Helper.textContent = t('prefStep1Helper');
    }

    // Step 2 check
    if (this.selectedTheme && this.selectedBudget) {
      submitBtn.disabled = false;
      // 카드에 적힌 것과 같은 말을 써야 한다 — 두 곳에 따로 적으면 한쪽만 번역된다.
      const themeLabels = { food: t('themeFood'), activity: t('themeActivity'), healing: t('themeHealing'), photo: t('themePhoto') };
      const budgetLabels = { flex: t('budgetFlex'), standard: t('budgetStandard'), budget: t('budgetSaver') };
      step2Helper.textContent = t('prefStyleSummary')
          .replace('{0}', themeLabels[this.selectedTheme])
          .replace('{1}', budgetLabels[this.selectedBudget]);
    } else {
      submitBtn.disabled = false;
      step2Helper.textContent = [this.selectedTheme ? t('theme_'+this.selectedTheme) : '', this.selectedBudget ? t('budget_'+this.selectedBudget) : ''].filter(Boolean).join(' · ') || t('prefStep2Helper');
    }
  }

  setStep(step, { returnToPlan = this.returnToPlan || false } = {}) {
    this.returnToPlan = returnToPlan;
    this.currentStep = step;
    const { date, theme, budget } = plannerDraftStore.read();
    if (JSON.stringify([date, theme, budget]) !== JSON.stringify([this.selectedDates, this.selectedTheme, this.selectedBudget])) {
      this.restoreSelection();
      this.render();
      this.setupEventListeners();
    }
    const step1 = this.shadowRoot.getElementById('step1-container');
    const step2 = this.shadowRoot.getElementById('step2-container');
    const badge = this.shadowRoot.getElementById('step-badge');
    const progress = this.shadowRoot.getElementById('progress-bar');
    
    if (!step1 || !step2) return;
    const nextButton = this.shadowRoot.getElementById('next-step-btn');
    nextButton.dataset.i18n = returnToPlan ? 'prefApplyDates' : 'prefNextBtn';
    nextButton.textContent = t(nextButton.dataset.i18n);
    this._updateButtonState(nextButton, this.shadowRoot.getElementById('submit-btn'), this.shadowRoot.getElementById('step1-helper-text'), this.shadowRoot.getElementById('step2-helper-text'));
    const city = destinationById(plannerDraftStore.read().destination?.id);
    this.shadowRoot.querySelector('.destination-summary').hidden = !city;
    this.shadowRoot.getElementById('preference-destination').textContent = city ? t(city.key) : '';

    if (step === 1) {
      step1.style.display = 'block';
      step2.style.display = 'none';
      this.shadowRoot.querySelector('.preference-header h2').textContent = t('flowTravelDate');
      if (badge) badge.textContent = '4 / 7';
      if (progress) progress.style.width = '50%';
    } else {
      step1.style.display = 'none';
      step2.style.display = 'block';
      this.shadowRoot.querySelector('.preference-header h2').textContent = t('flowStyle');
      if (badge) badge.textContent = '5 / 7';
      if (progress) progress.style.width = '100%';
    }
  }

  updateTexts() {
    applyTranslations(this.shadowRoot);
    this.setStep(this.currentStep || 1);
  }
}

customElements.define('preference-view', PreferenceView);
