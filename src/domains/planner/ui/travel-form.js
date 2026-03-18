import { t } from '../../../utils/i18n.js';
import { getMapsLoader } from '../../map/services/google-maps-loader.js';

const MAX_DAILY_CREDITS = 3;
const USAGE_STORAGE_KEY = 'compasser_usage';

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
      this.addAnchor(); // Initialize first anchor safely
    }
    this.setupEventListeners();
    this.updateTexts(); // Fix i18n flickering on load
    this.initPlaces();
    this.updateCreditStatus(); // Initialize credit status UI

    // Restore Form Data on load if we are not locked in Phase 3
    const savedPhase = sessionStorage.getItem('currentPhase');
    const savedForm = sessionStorage.getItem('currentFormData');
    if (savedPhase !== '3' && savedForm) {
      try {
        this.populateForm(JSON.parse(savedForm));
      } catch (e) {
        console.error('Form parse error', e);
      }
    }

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

  updateTexts() {
    const elements = this.shadowRoot.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
        el.setAttribute('placeholder', t(key));
      } else {
        // preserve child elements like spans if we need to? Or just textContent. 
        // For travel-form, we have one span inside h2. Let's be careful.
        if (el.children.length === 0) {
          el.textContent = t(key);
        } else {
          // If it has children, we might need a safer approach. But in this form, most are simple text labels
          // We can put data-i18n on the exact text node wrapper.
          el.childNodes[0].nodeValue = t(key) + ' ';
        }
      }
    });
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: var(--bg-secondary, #fff);
          padding: 2.5rem;
          border-radius: var(--radius-lg, 16px);
          box-shadow: var(--shadow-lg, 0 10px 15px rgba(0,0,0,0.1));
          container-type: inline-size;
        }

        h2 {
          font-size: 1.5rem;
          color: var(--text-primary);
          margin-bottom: 0.5rem;
          border-bottom: 2px solid oklch(95% 0.02 260);
          padding-bottom: 0.5rem;
        }

        .subtitle {
          color: var(--text-secondary);
          margin-bottom: 2rem;
          font-size: 0.95rem;
        }

        .form-section {
          margin-bottom: 2.5rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        label {
          display: block;
          margin-bottom: 0.4rem;
          font-weight: 600;
          color: var(--text-primary);
          font-size: 0.85rem;
        }

        input {
          width: 100%;
          padding: 0.8rem 1rem;
          border: 1px solid oklch(90% 0.02 260);
          border-radius: 8px;
          font-family: inherit;
          font-size: 0.95rem;
          background: var(--bg-primary);
          color: var(--text-primary);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          box-sizing: border-box;
        }

        input:focus {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px oklch(65% 0.2 260 / 20%);
        }

        /* Google Maps Autocomplete 컴포넌트 스타일링 */
        gmp-place-autocomplete {
          display: block;
          width: 100%;
          box-sizing: border-box;
          overflow: visible; /* 💎 드롭다운 잘림 방지 💎 */

          /* 💎 다크모드 무시 & 라이트 테마 강제 고정 💎 */
          --gmpx-color-surface: #ffffff !important;             /* 폼/드롭다운 배경 무조건 흰색 */
          --gmpx-color-on-surface: #111827 !important;          /* 입력 글씨 무조건 검은색 */
          --gmpx-color-on-surface-variant: #6b7280 !important;   /* 상세 주소 무조건 진회색 */
          color: #111827 !important;
          
          /* 💎 핵심 2: 'X' 버튼 검은 원 크기 축소 (Padding 조절) 💎 */
          --gmp-place-autocomplete-icon-padding: 0px; /* 아이콘 패딩을 없애서 뱃지 크기 최소화 */

          /* 기존 폼 UI와 동일한 외형 */
          border: 1px solid #e5e7eb; 
          border-radius: 8px; 
          min-height: 48px; 
          background-color: #ffffff;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          position: relative;
          z-index: 10;
        }

        /* 앵커(Anchor) 박스 내부의 장소 입력창 전용 */
        .anchor-item gmp-place-autocomplete, 
        .anchor-schedule-item gmp-place-autocomplete {
          /* 앵커 박스 배경에 자연스럽게 묻히도록 투명하게 처리 */
          --gmpx-color-surface: transparent; 
          border: 1px solid #d1d5db; /* 앵커 내부의 다른 인풋과 같은 테두리 색상 */
        }

        gmp-place-autocomplete:focus-within {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px oklch(65% 0.2 260 / 20%);
        }

        .primary-btn {
          background: linear-gradient(135deg, var(--accent-primary), oklch(55% 0.3 280));
          color: white;
          border: none;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          width: 100%;
          margin-top: 1rem;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .primary-btn:disabled {
          background: #d1d5db !important;
          color: #9ca3af !important;
          cursor: not-allowed !important;
          box-shadow: none !important;
          transform: none !important;
        }

        .primary-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: var(--shadow-glow);
        }

        .submit-row {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }

        .submit-row .primary-btn {
          margin-top: 0;
          flex: 1;
        }

        .reset-btn {
          background: transparent;
          color: var(--text-secondary);
          border: 1px solid oklch(85% 0.02 260);
          padding: 1rem 1.5rem;
          font-size: 1.1rem;
          font-weight: 600;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .reset-btn:hover {
          background: oklch(98% 0.02 260);
          color: var(--text-primary);
          border-color: oklch(75% 0.02 260);
        }

        .credit-status {
          text-align: center;
          font-size: 14px;
          color: #6b7280;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .secondary-btn {
          background: oklch(95% 0.02 260);
          color: var(--text-primary);
          border: 1px dashed oklch(80% 0.02 260);
          padding: 0.75rem 1rem;
          font-size: 0.95rem;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          width: 100%;
          margin-bottom: 1.5rem;
          transition: background 0.2s;
        }

        .secondary-btn:hover {
          background: oklch(92% 0.02 260);
        }

        .anchor-item {
          background: oklch(98% 0.01 260);
          border: 1px solid oklch(90% 0.02 260);
          padding: 1.25rem;
          border-radius: 12px;
          margin-bottom: 1rem;
          position: relative;
        }

        .remove-btn {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: none;
          border: none;
          color: oklch(60% 0.15 20); /* Reddish */
          font-size: 1.5rem;
          cursor: pointer;
          line-height: 1;
          padding: 0;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .remove-btn:hover {
          opacity: 1;
        }

        @container (min-width: 500px) {
          .row-3 {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 1rem;
          }
          .row-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
          }
        }
      </style>

      <form id="travel-form">
        
        <div class="form-section">
          <h2 data-i18n="tripBasicsTitle">Trip Basics</h2>
          <div class="row-3">
            <div class="form-group">
              <label for="schedule-date" data-i18n="scheduleDate">Date</label>
              <input type="date" id="schedule-date" required>
            </div>
            <div class="form-group">
              <label for="start-time" data-i18n="startTime">Start Time</label>
              <input type="time" id="start-time" required>
            </div>
            <div class="form-group">
              <label for="end-time" data-i18n="endTime">End Time</label>
              <input type="time" id="end-time" required>
            </div>
          </div>
          
          <div class="row-2">
            <div class="form-group">
              <label for="start-location" data-i18n="startLocation">Start Location (e.g., Hotel)</label>
              <gmp-place-autocomplete id="start-location" data-i18n="startLocationPlaceholder" placeholder="장소를 입력하세요"></gmp-place-autocomplete>
            </div>
            <div class="form-group">
              <label for="end-location" data-i18n="endLocation">End Location (e.g., Hotel/Airport)</label>
              <gmp-place-autocomplete id="end-location" data-i18n="endLocationPlaceholder" placeholder="장소를 입력하세요"></gmp-place-autocomplete>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h2><span data-i18n="anchorTitle">Anchor Schedules</span> <span style="font-size: 0.9rem; font-weight: 400; color: var(--text-secondary);">(Optional)</span></h2>
          <p class="subtitle" data-i18n="anchorSubtitle">Fixed schedule items to build around (e.g., Concert at 7PM, Dinner reservation)</p>
          
          <div id="anchors-container"></div>
          
          <button type="button" id="add-anchor-btn" class="secondary-btn" data-i18n="addAnchor">+ Add Anchor Schedule</button>
        </div>

        <div id="credit-status" class="credit-status"></div>
        <div class="submit-row">
          <button type="button" id="reset-btn" class="reset-btn" data-i18n="resetBtn">🔄 초기화</button>
          <button type="submit" class="primary-btn" data-i18n="generateBtn">Generate AI Itinerary ✨</button>
        </div>
      </form>
    `;

    // Initialize with 1 empty anchor
    // this.addAnchor(); // Move to connectedCallback or let populate logic handle it
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

    const template = document.createElement('div');
    template.className = 'anchor-item';
    template.id = id;
    template.innerHTML = `
      <button type="button" class="remove-btn" title="Remove Anchor">×</button>
      <div class="form-group">
        <label data-i18n="anchorNameLabel">${t('anchorNameLabel')}</label>
        <input type="text" class="anchor-name" data-i18n="anchorNamePlaceholder" placeholder="${t('anchorNamePlaceholder')}" required>
      </div>
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
          <gmp-place-autocomplete class="anchor-location" data-i18n="anchorLocationPlaceholder" placeholder="장소를 입력하세요"></gmp-place-autocomplete>
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
        if (el && val !== undefined && val !== null) el.value = val;
      };

      setVal('schedule-date', requestData?.date);
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
      } else {
        this.addAnchor(); // Leave at least 1 empty anchor line
      }
    } catch (error) {
      console.error("[Auto-fill Error] Failed to populate form:", error);
    }
  }

  getFormData() {
    const anchorsElements = this.shadowRoot.querySelectorAll('.anchor-item');
    const anchors = Array.from(anchorsElements).map(el => ({
      name: el.querySelector('.anchor-name').value,
      time: el.querySelector('.anchor-time').value,
      endTime: el.querySelector('.anchor-end-time').value,
      location: el.querySelector('.anchor-location').value,
    }));

    return {
      date: this.shadowRoot.getElementById('schedule-date').value,
      startTime: this.shadowRoot.getElementById('start-time').value,
      endTime: this.shadowRoot.getElementById('end-time').value,
      startLocation: this.shadowRoot.getElementById('start-location').value,
      endLocation: this.shadowRoot.getElementById('end-location').value,
      anchorSchedules: anchors
    };
  }

  setupEventListeners() {
    this.shadowRoot.getElementById('add-anchor-btn').addEventListener('click', () => {
      this.addAnchor();
      sessionStorage.setItem('currentFormData', JSON.stringify(this.getFormData()));
    });

    const form = this.shadowRoot.getElementById('travel-form');
    
    // Auto-save form data on any input
    form.addEventListener('input', () => {
      sessionStorage.setItem('currentFormData', JSON.stringify(this.getFormData()));
    });

    // Reset Form Event
    this.shadowRoot.getElementById('reset-btn').addEventListener('click', () => {
      // 1. Reset standard inputs and clear native validation states
      form.reset();

      // 2. Clear Google Autocomplete values
      const autocompletes = this.shadowRoot.querySelectorAll('gmp-place-autocomplete');
      autocompletes.forEach(ac => ac.value = '');

      // 3. Clear dynamic anchors entirely and re-add one blank slot
      const container = this.shadowRoot.getElementById('anchors-container');
      container.innerHTML = '';
      this.anchorCount = 0;
      this.addAnchor();

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

      // --- Daily Credit Check ---
      const today = new Date().toDateString();
      let usage = JSON.parse(localStorage.getItem(USAGE_STORAGE_KEY) || 'null');

      if (!usage || usage.date !== today) {
        usage = { date: today, count: 0 };
        localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage));
      }

      if (usage.count >= MAX_DAILY_CREDITS) {
        alert("오늘 제공된 무료 AI 생성 횟수(3회)를 모두 소진했습니다. 내일 다시 이용해 주세요! 🚀");
        return;
      }
      // --------------------------

      this.isSubmitting = true;
      const btn = this.shadowRoot.querySelector('.primary-btn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Planning... ⏳';
        btn.style.opacity = '0.7';
        btn.style.cursor = 'not-allowed';
      }

      const plannerRequest = this.getFormData();

      // --- Time Validation Logic ---
      const tripStart = plannerRequest.startTime;
      const tripEnd = plannerRequest.endTime;

      // Rule D: Basic Trip Start Time >= Basic Trip End Time
      if (tripStart >= tripEnd) {
        alert(t('basicTimeValidationError'));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }

      for (const anchor of plannerRequest.anchorSchedules) {
        // Skip empty anchors if they aren't filled yet (though required attribute should catch most)
        if (!anchor.time || !anchor.endTime) continue;

        // Rule C: Anchor Start Time >= Anchor End Time
        if (anchor.time >= anchor.endTime) {
          const msg = t('invalidAnchorTime').replace('{0}', anchor.name || 'Anchor');
          alert(msg);
          this._resetSubmitButton(btn);
          this.isSubmitting = false;
          return;
        }

        // Rule A: Anchor Start Time < Basic Trip Start Time
        if (anchor.time < tripStart) {
          const msg = t('timeValidationError')
            .replace('{0}', anchor.name || 'Anchor')
            .replace('{1}', tripStart)
            .replace('{2}', tripEnd);
          alert(msg);
          this._resetSubmitButton(btn);
          this.isSubmitting = false;
          return;
        }

        // Rule B: Anchor 종료 시간 > 기본 일정 종료 시간
        if (anchor.endTime > tripEnd) {
          const msg = t('timeValidationError')
            .replace('{0}', anchor.name || 'Anchor')
            .replace('{1}', tripStart)
            .replace('{2}', tripEnd);
          alert(msg);
          this._resetSubmitButton(btn);
          this.isSubmitting = false;
          return;
        }
      }
      // --- End Validation ---

      // Increment credit count after successful validation
      usage.count += 1;
      localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage));
      this.updateCreditStatus();

      console.log('Dispatching generation event:', plannerRequest);

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

  updateCreditStatus() {
    const today = new Date().toDateString();
    let usage = JSON.parse(localStorage.getItem(USAGE_STORAGE_KEY) || 'null');

    if (!usage || usage.date !== today) {
      usage = { date: today, count: 0 };
      localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage));
    }

    const remaining = Math.max(0, MAX_DAILY_CREDITS - usage.count);
    const statusEl = this.shadowRoot.getElementById('credit-status');
    const btn = this.shadowRoot.querySelector('.primary-btn');

    if (statusEl) {
      statusEl.textContent = `💡 오늘 남은 무료 생성 횟수: ${remaining}/${MAX_DAILY_CREDITS}`;
    }

    if (btn && remaining <= 0) {
      btn.disabled = true;
      btn.textContent = "내일 다시 생성할 수 있습니다 🌙";
    } else if (btn && !this.isSubmitting) {
      btn.disabled = false;
      btn.textContent = t('generateBtn');
    }
  }
}

customElements.define('travel-form', TravelForm);
