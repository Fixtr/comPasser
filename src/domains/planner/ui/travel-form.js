import { t, getLang } from '../../../utils/i18n.js';
import { getMapsLoader } from '../../map/services/google-maps-loader.js';
import { trackEvent } from '../../../utils/analytics.js';
import { travelFormStyles } from './travel-form-style.js';
import { getFormData } from './travel-form-data.js';
import { showErrorToast } from '../../../utils/toast.js';
import { findPastDate, todayString } from '../services/trip-date.mjs';



export default class TravelForm extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.anchorCount = 0;
    this.isSubmitting = false;
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
    this.initPlaces();
    // SPA 캐싱 대응: 화면 표시 감지 옵저버 설정
    this._visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          console.log("[TravelForm] Component became visible. Forcing re-fetch from storage.");
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

  /**
   * 다음에 폼이 보일 때 채울 데이터를 예약한다.
   *
   * populateForm() 을 직접 부르고 곧바로 /plan 으로 이동하면, 폼이 보이는
   * 순간 refreshFromStorage() 가 form.reset() 후 sessionStorage 값으로 다시
   * 채우면서 방금 넣은 값을 지운다. 그래서 "무엇으로 채울지"를 예약해 두고
   * refreshFromStorage() 가 그것을 우선 쓰도록 한다.
   */
  setPendingFormData(requestData) {
    this._pendingFormData = requestData || null;
  }

  refreshFromStorage() {
    this.syncDateFloor();
    this.renderPreferenceBadges();

    // 예약된 데이터가 있으면 그것으로 채우고 한 번 쓰고 버린다.
    if (this._pendingFormData) {
      const pending = this._pendingFormData;
      this._pendingFormData = null;
      const form = this.shadowRoot.getElementById('travel-form');
      if (form) form.reset();
      this.populateForm(pending);
      return;
    }

    const savedForm = sessionStorage.getItem('currentFormData');
    const savedPrefStr = sessionStorage.getItem('userPreference');
    
    let prefDate = null;
    let prefTheme = null;
    let prefBudget = null;
    
    if (savedPrefStr) {
      try {
        const pref = JSON.parse(savedPrefStr);
        prefDate = pref.date || null;
        prefTheme = pref.theme || null;
        prefBudget = pref.budget || null;
      } catch (e) {}
    }

    // 폼 입력 데이터 찌꺼기 방어를 위해 reset() 호출 (populateForm 내부에서도 호출되지만 이중 방어)
    const form = this.shadowRoot.getElementById('travel-form');
    if (form) form.reset();

    // 예전에는 sessionStorage 의 currentPhase 가 '3'(생성 완료)이면 상세 입력을
    // 복원하지 않아, /view 에서 폼으로 돌아오면 출발지·도착지·시간·필수 일정이
    // 통째로 비워졌다. 그 플래그는 제거했고, 저장된 폼이 있으면 항상 복원한다.
    if (savedForm) {
      try {
        const formData = JSON.parse(savedForm);
        // 데이터 수신부 강제 초기화: 무조건 최신 userPreference 값으로 덮어씌움
        if (prefDate) formData.date = prefDate;
        if (prefTheme) formData.theme = prefTheme;
        if (prefBudget) formData.budget = prefBudget;
        
        this.populateForm(formData);
      } catch (e) {
        console.error('Form parse error', e);
      }
    } else {
      // 저장된 폼이 없을 경우, preference에서 가져온 데이터로 초기 폼 세팅
      this.populateForm({ date: prefDate, theme: prefTheme, budget: prefBudget });
    }
  }

  /**
   * sessionStorage의 userPreference를 읽어
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
        chip.textContent = t(key);
        return chip;
      };

      let theme = null;
      let budget = null;
      let date = null;
      
      const saved = sessionStorage.getItem('userPreference');
      if (saved) {
        try {
          const pref = JSON.parse(saved);
          if (pref && typeof pref === 'object') {
            theme = pref.theme || null;
            budget = pref.budget || null;
            date = pref.date || null;
          }
        } catch (e) {
          console.warn('Failed to parse userPreference from sessionStorage', e);
        }
      }

      // 선택값이 하나도 없으면 '선택 없음' 배지 노출
      if (!theme && !budget && !date) {
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
          dateChip.style.background = 'linear-gradient(135deg, #10b981, #059669)'; // Date 배지는 초록
          dateChip.innerHTML = `<span class="chip-icon">📅</span> ${displayDate}`;
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
    const elements = this.shadowRoot.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
        el.setAttribute('placeholder', t(key));
      } else {
        if (el.children.length === 0) {
          el.textContent = t(key);
        } else {
          el.childNodes[0].nodeValue = t(key) + ' ';
        }
      }
    });

    // placeholder 전용 업데이트 로직 추가
    const placeholders = this.shadowRoot.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        ${travelFormStyles}
      </style>

      <form id="travel-form">
        
        <div class="form-section">
          <h2 style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap;">
              <span data-i18n="tripBasicsTitle">Trip Basics</span>
              <div class="preference-chips" id="preference-chips-container"></div>
            </div>
            <button type="button" id="reselect-preference-btn" style="background: none; border: none; color: var(--accent-primary); cursor: pointer; text-decoration: underline; font-size: 0.85rem; font-weight: 600; white-space: nowrap;">테마/예산 다시 선택하기</button>
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
          
          <div id="daily-times-wrapper" style="display: none; margin-top: 1rem;">
            <label class="toggle-container">
              <input type="checkbox" id="daily-times-toggle">
              <span class="toggle-switch"></span>
              <span class="toggle-label" data-i18n="perDayTimeToggle">일자별로 시간 다르게 설정하기</span>
            </label>
            <div id="daily-times-accordion" style="display: none; margin-top: 1rem; border-top: 1px dashed oklch(90% 0.02 260); padding-top: 1rem;">
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
        </div>

        <div class="form-section">
          <h2><span data-i18n="anchorTitle">Anchor Schedules</span> <span style="font-size: 0.9rem; font-weight: 400; color: var(--text-secondary);">(Optional)</span></h2>
          <p class="subtitle" data-i18n="anchorSubtitle">Fixed schedule items to build around (e.g., Concert at 7PM, Dinner reservation)</p>
          
          <div id="anchors-container"></div>
          
          <button type="button" id="add-anchor-btn" class="secondary-btn" data-i18n="addAnchor">+ Add Anchor Schedule</button>
        </div>

        
        <div class="submit-row">
          <button type="button" id="reset-btn" class="reset-btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span data-i18n="resetBtn">초기화</span>
          </button>
          <button type="submit" class="primary-btn" data-i18n="generateBtn">Generate AI Itinerary ✨</button>
        </div>
      </form>
    `;

    // Initialize with 1 empty anchor
    // this.addAnchor(); // Opt-in 방식으로 변경됨에 따라 주석 처리
  }

  async initPlaces() {
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

    } catch (e) {
      console.error("Failed to load Places API:", e);
    }
  }

  setupAutocompleteListener(autocomplete) {
    if (!autocomplete) return;

    // Safety check to prevent duplicate listeners
    if (autocomplete.dataset.listenerBound) return;

    // 💎 핵심 2: 최신 규격인 gmp-placeselect 이벤트를 사용 💎
    autocomplete.addEventListener('gmp-placeselect', (event) => {
      const place = event.place;

      // 장소 선택 시 내부 value에 명칭을 동기화 (getFormData에서 읽기 위함)
      if (place && place.displayName) {
        // gmp-place-autocomplete는 .value를 프로퍼티로 갖거나 
        // 혹은 내부 input의 가시적인 값을 string으로 유지합니다.
        // 선택된 값으로 명시적으로 업데이트
        autocomplete.value = place.displayName;
      }

      // 폼 자동 저장 트리거
      this.shadowRoot.getElementById('travel-form').dispatchEvent(new Event('input', { bubbles: true }));
    });

    // 사용자가 수동으로 타이핑하는 경우도 반영
    autocomplete.addEventListener('input', () => {
      // value가 알아서 업데이트되겠지만 확실히 하기 위해 커스텀 로직 추가 가능
    });

    autocomplete.dataset.listenerBound = "true";
  }

  addAnchor(data = null) {
    this.anchorCount++;
    const container = this.shadowRoot.getElementById('anchors-container');
    const id = `anchor-${Date.now()}`;

    let daysCount = 1;
    try {
      const savedPrefStr = sessionStorage.getItem('userPreference');
      if (savedPrefStr) {
        const pref = JSON.parse(savedPrefStr);
        if (Array.isArray(pref.date) && pref.date.length > 1) {
          daysCount = pref.date.length;
        }
      }
    } catch (e) {}

    let daySelectorHTML = '';
    if (daysCount > 1) {
      const options = Array.from({ length: daysCount }, (_, i) => `<option value="${i + 1}">Day ${i + 1}</option>`).join('');
      daySelectorHTML = `
        <div class="form-group" style="margin-bottom: 0.5rem;">
          <label data-i18n="anchorDayLabel">일정 일차 (Day)</label>
          <select class="anchor-day" required style="width: 100%; padding: 0.8rem 1rem; border: 1px solid oklch(90% 0.02 260); border-radius: 8px; font-family: inherit; font-size: 0.95rem;">
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
        <input type="text" class="anchor-name" data-i18n="anchorNamePlaceholder" placeholder="${t('anchorNamePlaceholder')}" aria-label="${t('anchorNameLabel')}" required>
      </div>
      ${daySelectorHTML}
      <div class="row-3">
        <div class="form-group">
          <label data-i18n="anchorStartLabel">${t('anchorStartLabel')}</label>
          <input type="time" class="anchor-time" required>
        </div>
        <div class="form-group">
          <label data-i18n="anchorEndLabel">${t('anchorEndLabel')}</label>
          <input type="time" class="anchor-end-time" required>
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
      if (ac) ac.value = data.location || '';
      const daySelect = template.querySelector('.anchor-day');
      if (daySelect && data.day) daySelect.value = data.day;
    }

    container.appendChild(template);

    // Bind autocomplete to the new element
    const newAutocomplete = template.querySelector('.anchor-location');
    if (newAutocomplete) {
      this.setupAutocompleteListener(newAutocomplete);
    }
  }

  populateForm(requestData) {
    if (!requestData) return;

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
              if (val.length > 1) {
                // Multi-day
                const nights = val.length - 1;
                const reqDays = val.length;
                const durationKey = `duration_${reqDays}`;
                const durationText = t(durationKey) !== durationKey 
                  ? t(durationKey) 
                  : (getLang() === 'ko' ? `${nights}박 ${reqDays}일` : `${nights}N ${reqDays}D`);
                el.type = 'text';
                el.value = `${val[0]} ~ ${val[val.length - 1]} (${durationText})`;
                el.readOnly = true;
                el.style.backgroundColor = '#f3f4f6';
                el.style.cursor = 'not-allowed';
              } else {
                el.type = 'date';
                el.value = val[0];
                el.readOnly = false;
                el.style.backgroundColor = '';
                el.style.cursor = '';
              }
            } else {
              el.type = 'date';
              el.value = val;
              el.readOnly = false;
              el.style.backgroundColor = '';
              el.style.cursor = '';
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
      setVal('start-location', requestData?.startLocation);
      setVal('end-location', requestData?.endLocation);

      // 💎 핵심 3: Autocomplete 컴포넌트의 가시적인 값도 즉시 업데이트 💎
      const startAC = this.shadowRoot.getElementById('start-location');
      const endAC = this.shadowRoot.getElementById('end-location');
      if (startAC) startAC.value = requestData?.startLocation || '';
      if (endAC) endAC.value = requestData?.endLocation || '';

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
      this.updateTexts(); // 번역 텍스트 업데이트
    } catch (error) {
      console.error("[Auto-fill Error] Failed to populate form:", error);
    }
  }

  getFormData() {
    return getFormData(this.shadowRoot);
  }

  setupEventListeners() {
    this.shadowRoot.getElementById('add-anchor-btn').addEventListener('click', () => {
      this.addAnchor();
      sessionStorage.setItem('currentFormData', JSON.stringify(this.getFormData()));
    });

    const preferenceBtn = this.shadowRoot.getElementById('reselect-preference-btn');
    if (preferenceBtn) {
      preferenceBtn.addEventListener('click', () => {
        window.navigate('/preference');
      });
    }

    const form = this.shadowRoot.getElementById('travel-form');

    // Auto-save form data on any input
    form.addEventListener('input', () => {
      sessionStorage.setItem('currentFormData', JSON.stringify(this.getFormData()));
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
        input.classList.remove('error');
        input.style.borderColor = '';
      });

      // 5. Purge the internal storage backup
      sessionStorage.removeItem('currentFormData');
    });

    form.addEventListener('submit', (e) => {
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

      const plannerRequest = this.getFormData();

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

      // --- Time Validation Logic ---
      const tripStart = plannerRequest.startTime;
      const tripEnd = plannerRequest.endTime;

      if (plannerRequest.dailyTimes && plannerRequest.dailyTimes.some(dt => dt.isCustom)) {
        for (const dt of plannerRequest.dailyTimes) {
          if (!dt.startTime || !dt.endTime) {
            showErrorToast(`[Day ${dt.day}] ` + t('emptyTimeValidationError'));
            this._resetSubmitButton(btn);
            this.isSubmitting = false;
            return;
          }
          if (dt.startTime >= dt.endTime) {
            showErrorToast(`[Day ${dt.day}] ` + t('basicTimeValidationError'));
            this._resetSubmitButton(btn);
            this.isSubmitting = false;
            return;
          }
        }
      } else {
        if (!tripStart || !tripEnd) {
          showErrorToast(t('emptyTimeValidationError'));
          this._resetSubmitButton(btn);
          this.isSubmitting = false;
          return;
        }
        // Rule D: Basic Trip Start Time >= Basic Trip End Time
        if (tripStart >= tripEnd) {
          showErrorToast(t('basicTimeValidationError'));
          this._resetSubmitButton(btn);
          this.isSubmitting = false;
          return;
        }
      }

      for (const anchor of plannerRequest.anchorSchedules) {
        // Skip empty anchors if they aren't filled yet
        if (!anchor.time || !anchor.endTime) continue;

        // Rule C: Anchor Start Time >= Anchor End Time
        if (anchor.time >= anchor.endTime) {
          const msg = t('invalidAnchorTime').replace('{0}', anchor.name || 'Anchor');
          showErrorToast(msg);
          this._resetSubmitButton(btn);
          this.isSubmitting = false;
          return;
        }

        // Rule A & B: We only apply global time constraint if daily times are NOT custom.
        // If daily times are custom, anchor time bounds check is relaxed since we don't know the exact day.
        if (!plannerRequest.dailyTimes || !plannerRequest.dailyTimes[0]?.isCustom) {
          if (anchor.time < tripStart || anchor.endTime > tripEnd) {
            const msg = t('timeValidationError')
              .replace('{0}', anchor.name || 'Anchor')
              .replace('{1}', tripStart)
              .replace('{2}', tripEnd);
            showErrorToast(msg);
            this._resetSubmitButton(btn);
            this.isSubmitting = false;
            return;
          }
        }
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
