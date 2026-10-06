import { t, getLang, applyTranslations } from '../../../utils/i18n.js';
import { getMapsLoader } from '../../map/services/google-maps-loader.js';
import { trackEvent } from '../../../utils/analytics.js';
import { travelFormStyles } from './travel-form-style.js';
import { icons } from '../../../ui/icons.js';
import { getFormData, getAutocompleteValue } from './travel-form-data.js';
import { bindPlaceSelection, restorePlaceInput } from '../services/selected-place.mjs';
import { plannerDraftStore, toPlannerDraft } from '../services/planner-draft.mjs';
import { showErrorToast } from '../../../utils/toast.js';
import { findPastDate, todayString } from '../services/trip-date.mjs';
import { findIncompleteAnchor, isAnchorBlank } from '../services/anchor-validation.mjs';
import { findMissingLocation } from '../services/location-validation.mjs';
import { getLocationName } from '../services/planner-constraints.mjs';
import { findPlannerInputIssue, plannerValidationMessage } from '../services/planner-validation.js';
import { scheduleFlexibleVisits } from '../services/schedule-flexible-visits.mjs';
import { createFlexibleVisitChecks } from '../services/flexible-visit-checks.js';

/** 고정 일정의 필수 칸 이름 → 그 칸을 찾는 선택자. */
const ANCHOR_FIELD_SELECTOR = {
  name: '.anchor-name',
  time: '.anchor-time',
  endTime: '.anchor-end-time',
  location: '.anchor-location'
};

/**
 * 사용자가 화면에서 읽은 그 이름으로 칸을 부른다.
 * `aria-label` → 같은 묶음의 <label> → placeholder 순. 셋 다 없으면 이름 없이 말한다
 * ("'' 칸을 채워 주세요" 보다는 스크롤과 초점이 더 정확한 안내다).
 */
function fieldLabelOf(control) {
  if (!control) return '';
  const aria = control.getAttribute?.('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const label = control.closest?.('.form-group')?.querySelector('label');
  if (label && label.textContent.trim()) return label.textContent.trim();
  return control.getAttribute?.('placeholder')?.trim() || '';
}



export default class TravelForm extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.anchorCount = 0;
    this.isSubmitting = false;
    this.generationCredits = undefined;
    this.draft = plannerDraftStore.read();
    this.loader = getMapsLoader();
  }

  connectedCallback() {
    this.render();
    if (this.anchorCount === 0) {
      // 앵커 자동 생성 로직 제거 (Opt-in)
      // this.addAnchor();
    }
    this.setupEventListeners();
    this.updateTexts(); // Fix i18n flickering on load

    // 여기서 initPlaces() 를 부르지 않는다. <travel-form> 은 index.html
    // 마크업에 있어 **모든 경로에서** 붙는데, initPlaces 는 Maps 의 places
    // 라이브러리를 받아 온다 — 랜딩에서도 지도 API 를 받고 있었다는 뜻이다.
    // 폼이 실제로 보일 때 받으면 된다. 마침 아래 옵저버가 그 순간을 이미
    // 알고 있었다.
    this._visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          console.log("[TravelForm] Component became visible. Forcing re-fetch from storage.");
          this.initPlaces();
          this.refreshFromStorage();
        }
      });
    }, { threshold: 0.05 });
    this._visibilityObserver.observe(this);

    // 최초 로드시에도 1회 실행
    this.refreshFromStorage();

    // Listen for completion to reset button state
    window.addEventListener('itinerary-generation-complete', () => {
      this.isSubmitting = false;
      const btn = this.shadowRoot.querySelector('.primary-btn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = t('generateBtn');
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      }
    });

    // Listen for global language changes
    window.addEventListener('i18n-changed', () => {
      this.updateTexts();
    });
  }

  /**
   * 컴포넌트가 다시 화면에 나타날 때마다 저장소에서 최신 데이터를 강제로 리페치합니다.
   */
  /**
   * 날짜 입력의 min 을 오늘로 맞춘다. 컴포넌트가 다시 보일 때마다 갱신해야
   * 탭을 열어둔 채 자정을 넘겨도 어제 날짜를 고를 수 없다.
   */
  syncDateFloor() {
    const dateInput = this.shadowRoot?.getElementById('schedule-date');
    // 여러 날 일정은 읽기 전용 텍스트로 바뀌므로 min 이 의미가 없다.
    if (!dateInput || dateInput.type !== 'date') return;
    dateInput.min = todayString();
  }

  /** 기존 일정 수정도 같은 초안을 교체한다. 화면 재진입·새로고침에 남는다. */
  setPendingFormData(requestData) {
    // Update the hidden controls together with the draft, before navigation.
    // Waiting for IntersectionObserver would briefly pair old UI with new data.
    if (requestData) this.populateForm(requestData);
  }

  refreshFromStorage() {
    this.syncDateFloor();
    this.populateForm(plannerDraftStore.read(), { persist: false });
  }

  /**
   * 현재 입력 초안을 읽어
   * 헤더의 #preference-chips-container에 칩(Badge) UI를 렌더링합니다.
   * 값이 없으면 컨테이너가 빈 채로 숨겨집니다.
   */
  renderPreferenceBadges() {
    try {
      const container = this.shadowRoot.getElementById('preference-chips-container');
      if (!container) return;

      // 기존 DOM 찌꺼기 완벽 초기화 방어 로직 (잔상 방지)
      container.innerHTML = '';

      const makeChip = (key) => {
        const chip = document.createElement('span');
        chip.className = 'pref-chip';
        // 키를 남겨 둬야 언어가 바뀔 때 따라온다. 예전에는 t() 로 한 번 찍고
        // 말아서, 영어로 바꿔도 이 배지만 "선택 없음"으로 남아 있었다.
        chip.dataset.i18n = key;
        chip.textContent = t(key);
        return chip;
      };

      const { theme, budget, date } = this.draft;

      // 선택값이 하나도 없으면 '선택 없음' 배지 노출
      if (!theme && !budget && !date?.length) {
        container.style.display = 'flex';
        container.appendChild(makeChip('no_preference'));
        return;
      }

      container.style.display = 'flex';

      if (date) {
        let displayDate = "";
        if (Array.isArray(date) && date.length > 0) {
          if (date.length > 1) {
            const nights = date.length - 1;
            const days = date.length;
            // i18n에 정의된 duration_n 키 사용 시도, 없으면 폴백
            const durationKey = `duration_${days}`;
            const durationText = t(durationKey) !== durationKey 
              ? t(durationKey) 
              : (getLang() === 'ko' ? `${nights}박 ${days}일` : `${nights}N ${days}D`);
            
            // [렌더링 점검] ${dateArray[0]} ~ ${dateArray[last]} (N박 M일) 형태 준수
            displayDate = `${date[0]} ~ ${date[date.length - 1]} (${durationText})`;
          } else {
            displayDate = date[0];
          }
        } else if (typeof date === 'string') {
          displayDate = date;
        }

        if (displayDate) {
          const dateChip = document.createElement('span');
          dateChip.className = 'pref-chip';
          // 예전에는 이 배지만 초록 그라디언트였다. 초록은 지도에서 "그날의
          // 첫 장소"를 뜻하는 색이라, 날짜 배지가 그 색을 먼저 써 버리면
          // 결과 화면에서 초록의 뜻이 흐려진다. 아이콘으로만 구분한다.
          // 날짜 문자열은 sessionStorage 에서 온다. textContent 로 넣어
          // 값이 마크업으로 해석될 여지를 남기지 않는다.
          const chipIcon = document.createElement('span');
          chipIcon.className = 'chip-icon';
          chipIcon.innerHTML = icons.calendar;
          const chipText = document.createElement('span');
          chipText.textContent = displayDate;
          dateChip.append(chipIcon, chipText);
          container.appendChild(dateChip);
        }
      }
      
      if (theme) container.appendChild(makeChip(`theme_${theme}`));
      if (budget) container.appendChild(makeChip(`budget_${budget}`));
    } catch (error) {
      console.warn('CRITICAL: renderPreferenceBadges failed but prevented crash:', error);
    }
  }

  updateTexts() {
    applyTranslations(this.shadowRoot);
    this.shadowRoot.querySelectorAll('[data-night]').forEach(label => {
      label.textContent = t('overnightLocation').replace('{0}', label.dataset.night);
    });
    this.renderGenerationCredits();
  }

  setGenerationCredits(balance) {
    this.generationCredits = balance;
    this.renderGenerationCredits();
  }

  renderGenerationCredits() {
    const value = this.shadowRoot?.getElementById('generation-credit-balance');
    if (value) value.textContent = this.generationCredits === 'unlimited' ? t('generationCreditsUnlimited') : Number.isSafeInteger(this.generationCredits)
      ? t('generationCreditsCount').replace('{0}', this.generationCredits)
      : t(this.generationCredits === undefined ? 'generationCreditsLoading' : 'generationCreditsUnavailable');
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        ${travelFormStyles}
      </style>

      <form id="travel-form">
        
        <div class="form-section">
          <h2 class="section-head">
            <div class="section-head-main">
              <span data-i18n="tripBasicsTitle">Trip Basics</span>
              <div class="preference-chips" id="preference-chips-container"></div>
            </div>
            <button type="button" id="reselect-preference-btn" class="link-btn" data-i18n="reselectPreference">테마/예산 다시 선택하기</button>
          </h2>
          <div class="row-3" id="global-times-container">
            <div class="form-group">
              <label for="schedule-date" data-i18n="scheduleDate">Date</label>
              <input type="date" id="schedule-date" required>
            </div>
            <div class="form-group global-time-input">
              <label for="start-time" data-i18n="startTime">Start Time</label>
              <input type="time" id="start-time" required>
            </div>
            <div class="form-group global-time-input">
              <label for="end-time" data-i18n="endTime">End Time</label>
              <input type="time" id="end-time" required>
            </div>
          </div>
          
          <div id="daily-times-wrapper" style="display: none;">
            <label class="toggle-container">
              <input type="checkbox" id="daily-times-toggle">
              <span class="toggle-switch"></span>
              <span class="toggle-label" data-i18n="perDayTimeToggle">일자별로 시간 다르게 설정하기</span>
            </label>
            <div id="daily-times-accordion" style="display: none;">
              <!-- 동적으로 데일리 타임 폼이 렌더링됨 -->
            </div>
          </div>
          
          <div class="row-2">
            <div class="form-group">
              <label for="start-location" data-i18n="startLocation">Start Location (e.g., Hotel)</label>
              <gmp-place-autocomplete id="start-location" data-i18n-placeholder="startLocationPlaceholder" placeholder="${t('startLocationPlaceholder')}"></gmp-place-autocomplete>
            </div>
            <div class="form-group">
              <label for="end-location" data-i18n="endLocation">End Location (e.g., Hotel/Airport)</label>
              <gmp-place-autocomplete id="end-location" data-i18n-placeholder="endLocationPlaceholder" placeholder="${t('endLocationPlaceholder')}"></gmp-place-autocomplete>
            </div>
          </div>
          <div id="overnight-wrapper" hidden>
            <p class="subtitle" data-i18n="overnightLocationHelp">Choose where each night ends and the next day begins.</p>
            <div id="overnight-locations"></div>
          </div>
          <p id="selected-waypoint" class="subtitle" hidden><strong data-i18n="discoverWaypointLabel">방문할 곳</strong>: <span id="selected-waypoint-name"></span>
            <button type="button" id="remove-waypoint" class="link-btn" data-i18n="discoverWaypointRemove">제외</button>
          </p>
        </div>

        <div class="form-section">
          <h2><span data-i18n="anchorTitle">Anchor Schedules</span> <span class="optional-note">(Optional)</span></h2>
          <p class="subtitle" data-i18n="anchorSubtitle">Fixed schedule items to build around (e.g., Concert at 7PM, Dinner reservation)</p>
          
          <div id="anchors-container"></div>
          
          <button type="button" id="add-anchor-btn" class="secondary-btn" data-i18n="addAnchor">+ Add Anchor Schedule</button>
        </div>

        
        <p class="credit-balance" role="status">
          <span data-i18n="generationCreditsLabel">${t('generationCreditsLabel')}</span>:
          <strong id="generation-credit-balance">${t('generationCreditsLoading')}</strong>
        </p>
        <div class="submit-row">
          <button type="button" id="reset-btn" class="reset-btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span data-i18n="resetBtn">초기화</span>
          </button>
          <button type="submit" class="primary-btn" data-i18n="generateBtn">Generate AI Itinerary</button>
        </div>
      </form>
    `;

    // Initialize with 1 empty anchor
    // this.addAnchor(); // Opt-in 방식으로 변경됨에 따라 주석 처리
  }

  async initPlaces() {
    // 보일 때마다 불린다. 자동완성을 두 번 붙이면 같은 선택이 두 번 전달된다.
    if (this._placesReady) return;
    this._placesReady = true;
    try {
      // 💎 핵심 1: libraries=['places']가 포함된 로더로부터 places 라이브러리를 명확히 가져옴 💎
      await this.loader.importLibrary("places");

      const startAutocomplete = this.shadowRoot.getElementById('start-location');
      const endAutocomplete = this.shadowRoot.getElementById('end-location');

      if (startAutocomplete) this.setupAutocompleteListener(startAutocomplete);
      if (endAutocomplete) this.setupAutocompleteListener(endAutocomplete);

      // Bind to existing anchors if any
      const anchorAutocompletes = this.shadowRoot.querySelectorAll('.anchor-location');
      anchorAutocompletes.forEach(ac => this.setupAutocompleteListener(ac));
      this.shadowRoot.querySelectorAll('.overnight-location').forEach(ac => this.setupAutocompleteListener(ac));

    } catch (e) {
      console.error("Failed to load Places API:", e);
      // 잠깐 끊겼다 돌아온 사용자가 다시 폼에 들어왔을 때 재시도할 수 있어야 한다.
      this._placesReady = false;
    }
  }

  setupAutocompleteListener(autocomplete) {
    bindPlaceSelection(autocomplete, () => {
      this.shadowRoot.getElementById('travel-form').dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  addAnchor(data = null) {
    this.anchorCount++;
    const container = this.shadowRoot.getElementById('anchors-container');
    const id = `anchor-${Date.now()}`;

    const daysCount = Math.max(this.draft.date.length, 1);

    let daySelectorHTML = '';
    if (daysCount > 1) {
      const options = Array.from({ length: daysCount }, (_, i) => `<option value="${i + 1}">Day ${i + 1}</option>`).join('');
      daySelectorHTML = `
        <div class="form-group">
          <label data-i18n="anchorDayLabel">일정 일차 (Day)</label>
          <select class="anchor-day" required>
            ${options}
          </select>
        </div>
      `;
    }

    const template = document.createElement('div');
    template.className = 'anchor-item';
    template.id = id;
    template.innerHTML = `
      <button type="button" class="remove-btn" title="${t('removeAnchorLabel')}" aria-label="${t('removeAnchorLabel')}">×</button>
      <div class="form-group">
        <label data-i18n="anchorNameLabel">${t('anchorNameLabel')}</label>
        <input type="text" class="anchor-name" data-i18n="anchorNamePlaceholder" placeholder="${t('anchorNamePlaceholder')}" aria-label="${t('anchorNameLabel')}">
      </div>
      ${daySelectorHTML}
      <label class="anchor-flexible-option"><input type="checkbox" class="anchor-flexible"><span data-i18n="anchorFlexibleLabel">${t('anchorFlexibleLabel')}</span></label>
      <p class="anchor-flexible-hint" data-i18n="anchorFlexibleHint">${t('anchorFlexibleHint')}</p>
      <div class="row-3 anchor-fields">
        <div class="form-group anchor-time-field">
          <label data-i18n="anchorStartLabel">${t('anchorStartLabel')}</label>
          <input type="time" class="anchor-time">
        </div>
        <div class="form-group anchor-time-field">
          <label data-i18n="anchorEndLabel">${t('anchorEndLabel')}</label>
          <input type="time" class="anchor-end-time">
        </div>
        <div class="form-group">
          <label data-i18n="anchorLocationLabel">${t('anchorLocationLabel')}</label>
          <gmp-place-autocomplete class="anchor-location" data-i18n-placeholder="anchorLocationPlaceholder" placeholder="${t('anchorLocationPlaceholder')}"></gmp-place-autocomplete>
        </div>
      </div>
    `;

    // Setup remove logic
    template.querySelector('.remove-btn').addEventListener('click', () => {
      container.removeChild(template);
      this.shadowRoot.getElementById('travel-form').dispatchEvent(new Event('input', { bubbles: true }));
    });

    if (data) {
      template.querySelector('.anchor-name').value = data.name || '';
      template.querySelector('.anchor-time').value = data.time || '';
      template.querySelector('.anchor-end-time').value = data.endTime || '';
      const ac = template.querySelector('.anchor-location');
      restorePlaceInput(ac, data.location || '');
      const daySelect = template.querySelector('.anchor-day');
      if (daySelect && data.day) daySelect.value = data.day;
      if (Number.isInteger(data.stayMinutes)) template.dataset.stayMinutes = String(data.stayMinutes);
    }

    const flexibleToggle = template.querySelector('.anchor-flexible');
    flexibleToggle.checked = data?.flexible === true;
    const showFlexible = () => {
      template.classList.toggle('is-flexible', flexibleToggle.checked);
      template.querySelectorAll('.anchor-time, .anchor-end-time').forEach(input => {
        input.disabled = flexibleToggle.checked;
        if (flexibleToggle.checked) input.removeAttribute('aria-invalid');
      });
    };
    showFlexible();
    flexibleToggle.addEventListener('change', () => {
      showFlexible();
      this.shadowRoot.getElementById('travel-form').dispatchEvent(new Event('input', { bubbles: true }));
    });

    container.appendChild(template);

    // Bind autocomplete to the new element
    const newAutocomplete = template.querySelector('.anchor-location');
    if (newAutocomplete) {
      this.setupAutocompleteListener(newAutocomplete);
    }
  }

  populateForm(requestData, { persist = true } = {}) {
    if (!requestData) return;

    this.draft = persist ? plannerDraftStore.save(requestData) : toPlannerDraft(requestData);
    requestData = this.draft;

    try {
      // 1. Reset Form
      const form = this.shadowRoot.getElementById('travel-form');
      if (form) form.reset();

      // 2. Clear old anchors
      const container = this.shadowRoot.getElementById('anchors-container');
      if (container) container.innerHTML = '';
      this.anchorCount = 0;

      // 3. Inject basic fields safely
      const setVal = (id, val) => {
        const el = this.shadowRoot.getElementById(id);
        if (el && val !== undefined && val !== null) {
          // If the field is schedule-date and the value is an array
          if (id === 'schedule-date') {
            if (Array.isArray(val)) {
              if (val.length === 0) {
                el.type = 'date';
                el.value = '';
                el.readOnly = false;
              } else if (val.length > 1) {
                // Multi-day
                const nights = val.length - 1;
                const reqDays = val.length;
                const durationKey = `duration_${reqDays}`;
                const durationText = t(durationKey) !== durationKey 
                  ? t(durationKey) 
                  : (getLang() === 'ko' ? `${nights}박 ${reqDays}일` : `${nights}N ${reqDays}D`);
                el.type = 'text';
                el.value = `${val[0]} ~ ${val[val.length - 1]} (${durationText})`;
                // 회색·not-allowed 는 CSS 의 input[readonly] 가 맡는다.
                // 인라인으로 칠하면 다크 모드에서 흰 글씨 위에 밝은 회색이 남는다.
                el.readOnly = true;
              } else {
                el.type = 'date';
                el.value = val[0];
                el.readOnly = false;
              }
            } else {
              el.type = 'date';
              el.value = val;
              el.readOnly = false;
            }
          } else {
            el.value = val;
          }
        }
      };

      setVal('schedule-date', requestData?.date);
      this.syncDateFloor();
      setVal('start-time', requestData?.startTime);
      setVal('end-time', requestData?.endTime);

      // 💎 핵심 3: Autocomplete 컴포넌트의 가시적인 값도 즉시 업데이트 💎
      const startAC = this.shadowRoot.getElementById('start-location');
      const endAC = this.shadowRoot.getElementById('end-location');
      restorePlaceInput(startAC, requestData?.startLocation || '');
      restorePlaceInput(endAC, requestData?.endLocation || '');
      const waypoint = requestData.selectedWaypoints?.[0];
      this.shadowRoot.getElementById('selected-waypoint').hidden = !waypoint;
      this.shadowRoot.getElementById('selected-waypoint-name').textContent = waypoint?.name || '';

      // 4. Inject Anchors dynamically safely
      if (requestData?.anchorSchedules && Array.isArray(requestData.anchorSchedules) && requestData.anchorSchedules.length > 0) {
        requestData.anchorSchedules.forEach(anchor => {
          if (anchor) this.addAnchor(anchor);
        });
      }

      // 💎 다일차 로직 처리 💎
      const dateVal = requestData?.date || requestData?.datePref;
      const dailyTimesWrapper = this.shadowRoot.getElementById('daily-times-wrapper');
      const dailyTimesAccordion = this.shadowRoot.getElementById('daily-times-accordion');
      const dailyTimesToggle = this.shadowRoot.getElementById('daily-times-toggle');
      const globalInputs = this.shadowRoot.querySelectorAll('.global-time-input');
      
      let isMultiDay = false;
      let daysCount = 1;
      
      if (Array.isArray(dateVal) && dateVal.length > 1) {
        isMultiDay = true;
        daysCount = dateVal.length;
      } else if (typeof dateVal === 'string' && dateVal.includes('~')) {
        // Fallback for some saved string formats if necessary
        isMultiDay = true;
        // Parse days count from string if possible, or leave it. This shouldn't be the case often.
      }
      
      if (dailyTimesWrapper) {
        if (isMultiDay) {
          dailyTimesWrapper.style.display = 'block';
          
          // Render accordion rows
          dailyTimesAccordion.innerHTML = '';
          for (let i = 0; i < daysCount; i++) {
            const dayNum = i + 1;
            const dRow = document.createElement('div');
            dRow.className = 'daily-time-row';
            dRow.dataset.day = dayNum;
            dRow.innerHTML = `
              <div class="daily-time-header">Day ${dayNum}</div>
              <div class="row-2">
                <div class="form-group">
                  <label data-i18n="startTime">Start Time</label>
                  <input type="time" class="daily-start-time" required>
                </div>
                <div class="form-group">
                  <label data-i18n="endTime">End Time</label>
                  <input type="time" class="daily-end-time" required>
                </div>
              </div>
            `;
            dailyTimesAccordion.appendChild(dRow);
          }
          
          // Restore dailyTimes if toggled
          if (requestData?.dailyTimes && Array.isArray(requestData.dailyTimes) && requestData.dailyTimes.length > 0 && requestData.dailyTimes[0].isCustom) {
            dailyTimesToggle.checked = true;
            dailyTimesAccordion.style.display = 'block';
            
            globalInputs.forEach(el => {
              el.style.display = 'none';
              const input = el.querySelector('input');
              if (input) input.required = false;
            });
            
            const dailyInputs = dailyTimesAccordion.querySelectorAll('input');
            dailyInputs.forEach(input => input.required = true);

            const rows = dailyTimesAccordion.querySelectorAll('.daily-time-row');
            requestData.dailyTimes.forEach((dt, idx) => {
              if (rows[idx]) {
                rows[idx].querySelector('.daily-start-time').value = dt.startTime || '';
                rows[idx].querySelector('.daily-end-time').value = dt.endTime || '';
              }
            });
          } else {
            dailyTimesToggle.checked = false;
            dailyTimesAccordion.style.display = 'none';
            
            const dailyInputs = dailyTimesAccordion.querySelectorAll('input');
            dailyInputs.forEach(input => input.required = false);

            globalInputs.forEach(el => {
              el.style.display = 'block';
              const input = el.querySelector('input');
              if (input) input.required = true;
            });
          }
        } else {
          dailyTimesWrapper.style.display = 'none';
          if (dailyTimesToggle) dailyTimesToggle.checked = false;
          if (dailyTimesAccordion) {
            dailyTimesAccordion.innerHTML = '';
            dailyTimesAccordion.style.display = 'none';
          }
          globalInputs.forEach(el => {
            el.style.display = 'block';
            const input = el.querySelector('input');
            if (input) input.required = true;
          });
        }
      }
      const overnightWrapper = this.shadowRoot.getElementById('overnight-wrapper');
      const overnightContainer = this.shadowRoot.getElementById('overnight-locations');
      overnightWrapper.hidden = !isMultiDay;
      overnightContainer.replaceChildren();
      if (isMultiDay) {
        for (let index = 0; index < daysCount - 1; index++) {
          const row = document.createElement('div');
          row.className = 'form-group';
          row.innerHTML = `<label data-i18n="overnightLocation" data-night="${index + 1}"></label>
            <gmp-place-autocomplete class="overnight-location" data-i18n-placeholder="overnightLocationPlaceholder" placeholder="${t('overnightLocationPlaceholder')}"></gmp-place-autocomplete>`;
          overnightContainer.appendChild(row);
          const autocomplete = row.querySelector('.overnight-location');
          restorePlaceInput(autocomplete, this.draft.overnightLocations[index] || '');
          if (this._placesReady) this.setupAutocompleteListener(autocomplete);
        }
      }
      this.renderPreferenceBadges();
      this.updateTexts(); // 번역 텍스트 업데이트
    } catch (error) {
      console.error("[Auto-fill Error] Failed to populate form:", error);
    }
  }

  getFormData() {
    return getFormData(this.shadowRoot, this.draft);
  }

  saveDraft() {
    this.draft = plannerDraftStore.save(this.getFormData());
    this.renderPreferenceBadges();
  }

  setupEventListeners() {
    this.shadowRoot.getElementById('remove-waypoint').addEventListener('click', () => {
      this.draft.selectedWaypoints = [];
      this.shadowRoot.getElementById('selected-waypoint').hidden = true;
      this.saveDraft();
    });
    this.shadowRoot.getElementById('add-anchor-btn').addEventListener('click', () => {
      this.addAnchor();
      this.saveDraft();
    });

    const preferenceBtn = this.shadowRoot.getElementById('reselect-preference-btn');
    if (preferenceBtn) {
      preferenceBtn.addEventListener('click', () => {
        window.navigate('/preference');
      });
    }

    const form = this.shadowRoot.getElementById('travel-form');

    // 브라우저 기본 검사는 Shadow DOM 안에서 사실상 보이지 않는다.
    // `invalid` 는 거품처럼 위로 오르지 않으므로 폼에서 받으려면 캡처 단계여야 한다.
    // 무엇보다 걸린 칸이 접힌 아래에 있으면(실측: top 887 / 화면 높이 932)
    // 사용자 눈에는 버튼이 죽은 것으로 보인다. 그래서 우리가 그 칸까지 데려간다.
    let revealedThisRound = false;
    form.addEventListener('invalid', (e) => {
      e.preventDefault(); // 믿을 수 없는 기본 말풍선 대신 우리 안내를 쓴다
      // 한 번 누르면 걸린 칸마다 하나씩 쏜다 — 첫 칸만 데려가고 나머지는 흘린다.
      // (그 무더기는 한 작업 안에서 연달아 오므로 마이크로태스크면 충분히 뒤다)
      if (revealedThisRound) return;
      revealedThisRound = true;
      queueMicrotask(() => { revealedThisRound = false; });

      const control = e.target;
      const label = fieldLabelOf(control);
      const message = control.validity && !control.validity.valueMissing && control.validationMessage
        ? `${label}: ${control.validationMessage}`
        : t('missingFieldError').replace('{0}', label);
      this._revealInvalidField(control, message);
    }, true);

    // Auto-save form data on any input
    form.addEventListener('input', (e) => {
      // 고치기 시작했으면 걸렸던 표시는 즉시 거둔다.
      if (e.target?.hasAttribute?.('aria-invalid')) e.target.removeAttribute('aria-invalid');
      this.saveDraft();
    });
    
    const dailyToggle = this.shadowRoot.getElementById('daily-times-toggle');
    const dailyAccordion = this.shadowRoot.getElementById('daily-times-accordion');
    const globalInputs = this.shadowRoot.querySelectorAll('.global-time-input');
    
    if (dailyToggle) {
      dailyToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
          dailyAccordion.style.display = 'block';
          
          const dailyInputs = dailyAccordion.querySelectorAll('input');
          dailyInputs.forEach(input => input.required = true);

          globalInputs.forEach(el => {
            el.style.display = 'none';
            const input = el.querySelector('input');
            if (input) input.required = false;
          });
        } else {
          dailyAccordion.style.display = 'none';

          const dailyInputs = dailyAccordion.querySelectorAll('input');
          dailyInputs.forEach(input => input.required = false);

          globalInputs.forEach(el => {
            el.style.display = 'block';
            const input = el.querySelector('input');
            if (input) input.required = true;
          });
        }
        form.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    // Reset Form Event
    this.shadowRoot.getElementById('reset-btn').addEventListener('click', () => {
      // 1. Reset standard inputs and clear native validation states
      form.reset();

      // 2. Clear Google Autocomplete values
      const autocompletes = this.shadowRoot.querySelectorAll('gmp-place-autocomplete');
      autocompletes.forEach(ac => ac.value = '');

      // 3. Clear dynamic anchors entirely (Opt-in)
      const container = this.shadowRoot.getElementById('anchors-container');
      container.innerHTML = '';
      this.anchorCount = 0;

      // 4. Clear specific error classes or inline borders just in case
      const allInputs = this.shadowRoot.querySelectorAll('input');
      allInputs.forEach(input => {
        input.removeAttribute('aria-invalid');
        input.style.borderColor = '';
      });

      // 날짜·선호는 유지하고 상세 입력만 비운다. 복원도 같은 빈 초안을 쓴다.
      this.populateForm(plannerDraftStore.resetDetails(), { persist: false });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (this.isSubmitting) {
        console.log('Already submitting, preventing duplicate request...');
        return;
      }

      

      this.isSubmitting = true;
      const btn = this.shadowRoot.querySelector('.primary-btn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Planning... ⏳';
        btn.style.opacity = '0.7';
        btn.style.cursor = 'not-allowed';
      }

      await Promise.all(Array.from(this.shadowRoot.querySelectorAll('gmp-place-autocomplete'))
        .map(element => element.placeSelectionPending));
      if (Array.from(this.shadowRoot.querySelectorAll('gmp-place-autocomplete')).some(element => element.placeSelectionError)) {
        showErrorToast(getLang() === 'ko' ? '선택한 장소 정보를 가져오지 못했습니다. 장소를 다시 선택해 주세요.'
          : 'Could not load the selected place. Please select it again.');
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }
      let plannerRequest = this.getFormData();
      this.draft = plannerDraftStore.save(plannerRequest);

      // --- Date Validation ---
      // 과거 날짜로 만들면 화면 날짜와 실제 계산되는 경로가 어긋난다
      // (transit-time.mjs 가 지난 출발 시각을 다음 주로 밀어 조회한다).
      const pastDate = findPastDate(plannerRequest.date);
      if (pastDate) {
        showErrorToast(t('pastDateValidationError').replace('{0}', pastDate));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }

      // 출발·도착 장소. 이 칸들은 커스텀 엘리먼트라 브라우저 기본 검사가
      // 못 본다 — required 를 붙여도 소용없다. 여기서 막지 않으면 빈 채로
      // 흘러가, AI 는 출발지를 "Unknown" 으로 듣고 경계 보정은 통째로 꺼진다.
      const missingLocation = findMissingLocation(plannerRequest);
      if (missingLocation) {
        const control = this.shadowRoot.getElementById(missingLocation.id);
        this._revealInvalidField(control, t('missingLocationError')
          .replace('{0}', fieldLabelOf(control) || t(missingLocation.labelKey)));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }
      const missingNight = Array.isArray(plannerRequest.date) && plannerRequest.date.length > 1
        ? plannerRequest.overnightLocations.findIndex(location => !getLocationName(location)) : -1;
      if (missingNight >= 0) {
        const control = this.shadowRoot.querySelectorAll('.overnight-location')[missingNight];
        this._revealInvalidField(control, t('missingLocationError')
          .replace('{0}', t('overnightLocation').replace('{0}', String(missingNight + 1))));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }

      // 손댔지만 덜 찬 고정 일정. 화면에 보이는 줄을 그대로 읽는다 —
      // plannerRequest.anchorSchedules 는 빈 줄이 이미 걸러져 번호가 어긋난다.
      const anchorRows = this._readAnchorRows();
      const incomplete = findIncompleteAnchor(anchorRows);
      if (incomplete) {
        const control = anchorRows[incomplete.index].el
          .querySelector(ANCHOR_FIELD_SELECTOR[incomplete.field]);
        this._revealInvalidField(control, t('incompleteAnchorError')
          .replace('{0}', String(incomplete.index + 1))
          .replace('{1}', fieldLabelOf(control)));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }

      const flexibleCount = plannerRequest.anchorSchedules.filter(anchor => anchor.flexible).length;
      const placement = await scheduleFlexibleVisits(plannerRequest,
        flexibleCount ? createFlexibleVisitChecks(flexibleCount) : {});
      if (placement.issue) {
        const control = anchorRows.filter(row => !isAnchorBlank(row))[placement.issue.anchorIndex]?.el.querySelector('.anchor-name');
        const messageKey = { 'flexible-visit-route': 'flexibleVisitRouteError',
          'flexible-visit-hours': 'flexibleVisitHoursError' }[placement.issue.reason] || 'flexibleVisitSpaceError';
        this._revealInvalidField(control, t(messageKey));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }
      plannerRequest = placement.request;

      // Same canonical contract as the server, including each anchor's own
      // day's custom times. DOM-only checks above preserve precise row feedback.
      const issue = findPlannerInputIssue(plannerRequest);
      if (issue) {
        const fieldIds = { date: 'schedule-date', startTime: 'start-time', endTime: 'end-time',
          startLocation: 'start-location', endLocation: 'end-location' };
        let control = this.shadowRoot.getElementById(fieldIds[issue.field] || 'schedule-date');
        if (issue.field === 'startTime' || issue.field === 'endTime') {
          if (plannerRequest.dailyTimes?.some(dt => dt.isCustom)) {
            const selector = issue.field === 'startTime' ? '.daily-start-time' : '.daily-end-time';
            control = this.shadowRoot.querySelector(`.daily-time-row[data-day="${issue.day}"] ${selector}`) || control;
          }
        }
        if (issue.anchorIndex !== undefined) {
          const row = anchorRows.filter(row => row.day === issue.day && !isAnchorBlank(row))[issue.anchorIndex];
          control = row?.el.querySelector(ANCHOR_FIELD_SELECTOR[issue.field] || '.anchor-day') || control;
        } else if (issue.reason === 'anchor-limit' || issue.reason === 'anchor-day') {
          control = this.shadowRoot.getElementById('add-anchor-btn');
        }
        this._revealInvalidField(control, plannerValidationMessage(issue));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }
      // --- End Validation ---

      

      console.log('Dispatching generation event:', plannerRequest);
      
      trackEvent('generate_itinerary_click');

      // Dispatch custom event reaching up through the DOM
      this.dispatchEvent(new CustomEvent('generate-itinerary', {
        detail: plannerRequest,
        bubbles: true,
        composed: true // Allows event to pass through shadow DOM boundary
      }));
    });
  }

  /**
   * 화면에 보이는 순서 그대로의 고정 일정 줄. 빈 줄도 세어 둔다 —
   * 사용자에게 "두 번째 고정 일정"이라고 말하려면 번호가 화면과 같아야 한다.
   */
  _readAnchorRows() {
    return Array.from(this.shadowRoot.querySelectorAll('.anchor-item')).map((el) => ({
      el,
      day: Number(el.querySelector('.anchor-day')?.value || 1),
      name: el.querySelector('.anchor-name')?.value || '',
      time: el.querySelector('.anchor-time')?.value || '',
      endTime: el.querySelector('.anchor-end-time')?.value || '',
      location: getAutocompleteValue(el.querySelector('.anchor-location')),
      flexible: el.querySelector('.anchor-flexible')?.checked === true
    }));
  }

  /**
   * 막혔다는 사실을 눈에 보이게 한다: 말로 한 번(토스트), 자리로 한 번(스크롤·초점),
   * 그리고 그 칸에 표시를 남긴다(aria-invalid — 보조기기도 읽는다).
   */
  _revealInvalidField(control, message) {
    if (message) showErrorToast(message);
    if (!control) return;
    // 표시는 늘 한 칸에만. 앞서 걸렸던 칸을 그대로 두면 "지금 막고 있는 것"이
    // 둘로 보인다 — 값이 코드로 바뀌어 input 이 안 뜬 경우에도 남는다.
    this.shadowRoot.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    control.setAttribute('aria-invalid', 'true');
    control.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // 스크롤과 다투지 않게 초점만 옮긴다. 장소 칸은 껍데기가 커스텀
    // 엘리먼트라 껍데기에 초점을 줘 봐야 커서가 안 뜬다 — 안쪽 input 을
    // 찾아 준다(getAutocompleteValue 가 값을 읽는 자리와 같은 곳이다).
    const focusTarget = control.shadowRoot?.querySelector('input')
      || control.querySelector?.('input')
      || control;
    focusTarget.focus?.({ preventScroll: true });
  }

  _resetSubmitButton(btn) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = t('generateBtn');
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  }

  }

customElements.define('travel-form', TravelForm);
