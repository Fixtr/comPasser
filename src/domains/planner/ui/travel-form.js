import { t, getLang } from '../../../utils/i18n.js';
import { getMapsLoader } from '../../map/services/google-maps-loader.js';
import { trackEvent } from '../../../utils/analytics.js';

export default class TravelForm extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.anchorCount = 0;
    this.isSubmitting = false;
    this.loader = getMapsLoader();
    this.placesMap = new Map();
  }

  connectedCallback() {
    this.render();
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

  refreshFromStorage() {
    this.renderPreferenceBadges();

    const savedPhase = sessionStorage.getItem('currentPhase');
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

    const form = this.shadowRoot.getElementById('travel-form');
    if (form) form.reset();

    if (savedPhase !== '3' && savedForm) {
      try {
        const formData = JSON.parse(savedForm);
        if (prefDate) formData.date = prefDate;
        if (prefTheme) formData.theme = prefTheme;
        if (prefBudget) formData.budget = prefBudget;
        
        this.populateForm(formData);
      } catch (e) {
        console.error('Form parse error', e);
      }
    } else {
      this.populateForm({ date: prefDate, theme: prefTheme, budget: prefBudget });
    }
  }

  renderPreferenceBadges() {
    try {
      const container = this.shadowRoot.getElementById('preference-chips-container');
      if (!container) return;

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
        } catch (e) {}
      }

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
            const durationKey = `duration_${days}`;
            const durationText = t(durationKey) !== durationKey 
              ? t(durationKey) 
              : (getLang() === 'ko' ? `${nights}박 ${days}일` : `${nights}N ${days}D`);
            
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
          dateChip.style.background = 'linear-gradient(135deg, #10b981, #059669)';
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

    const placeholders = this.shadowRoot.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
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
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.25);
        }

        gmp-place-autocomplete {
          display: block;
          width: 100%;
          box-sizing: border-box;
          overflow: visible;
          --gmpx-color-surface: #ffffff !important;
          --gmpx-color-on-surface: #111827 !important;
          --gmpx-color-on-surface-variant: #6b7280 !important;
          color: #111827 !important;
          --gmp-place-autocomplete-icon-padding: 0px;
          border: 1px solid #e5e7eb; 
          border-radius: 8px; 
          min-height: 48px; 
          background-color: #ffffff;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          position: relative;
          z-index: 10;
        }

        .anchor-item gmp-place-autocomplete, 
        .anchor-schedule-item gmp-place-autocomplete {
          --gmpx-color-surface: transparent; 
          border: 1px solid #d1d5db;
        }

        gmp-place-autocomplete:focus-within {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.25);
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
          transition: all 0.2s ease;
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
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: transparent;
          color: #475569;
          border: 1px solid #e2e8f0;
          padding: 0.8rem 1.5rem;
          font-size: 1.05rem;
          font-weight: 600;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .reset-btn:hover {
          background-color: #f8fafc;
          transform: translateY(-2px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          border-color: #cbd5e1;
          color: #334155;
        }

        .reset-btn svg {
          width: 1.25rem;
          height: 1.25rem;
          stroke: currentColor;
          fill: none;
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
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

        .preference-chips {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
        }

        .pref-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.35rem 0.9rem;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--accent-primary, #7c3aed), oklch(60% 0.25 280));
          color: white;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          animation: chipPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          letter-spacing: -0.01em;
          border: none;
        }

        .pref-chip:hover {
          transform: translateY(-2px) scale(1.05);
          box-shadow: 0 6px 16px rgba(124, 58, 237, 0.3);
        }

        @keyframes chipPop {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }

        .anchor-item {
          background: oklch(98% 0.01 260);
          border: 1px solid oklch(90% 0.02 260);
          padding: 1.25rem;
          border-radius: 12px;
          margin-bottom: 1rem;
          position: relative;
          box-shadow: var(--shadow-sm);
          transition: box-shadow 0.2s ease, transform 0.2s ease;
        }
        
        .anchor-item:hover {
          box-shadow: var(--shadow-md);
          transform: translateY(-1px);
        }

        .remove-btn {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: none;
          border: none;
          color: oklch(60% 0.15 20);
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

        /* === Accordion & Day Container Styles === */
        .day-wrapper {
          margin-bottom: 1rem;
        }
        .accordion-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.2rem 1.5rem;
          background: oklch(98% 0.01 260);
          border: 1px solid oklch(90% 0.02 260);
          border-radius: 12px;
          cursor: pointer;
          font-weight: 700;
          color: var(--accent-primary);
          transition: background 0.2s, box-shadow 0.2s;
        }
        .accordion-header:hover {
          background: oklch(95% 0.02 260);
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .accordion-content {
          display: none;
          padding: 1.5rem;
          border: 1px dashed oklch(90% 0.02 260);
          border-top: none;
          border-bottom-left-radius: 12px;
          border-bottom-right-radius: 12px;
          background: var(--bg-primary);
          margin-top: -5px; /* overlap slighty */
        }
        .accordion-content.open {
          display: block;
          animation: slideDown 0.3s ease-out forwards;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        /* Remove border/padding if single day without header */
        .day-wrapper.single-day .accordion-content {
          display: block;
          border: none;
          padding: 0;
          background: transparent;
          margin-top: 0;
        }
        .add-anchor-btn {
           margin-top: 1rem;
        }
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
          
          <div class="form-group" style="margin-bottom: 1.5rem;">
            <label for="schedule-date" data-i18n="scheduleDate">Date</label>
            <input type="date" id="schedule-date" required>
          </div>
          
          <div id="days-container">
             <!-- Daily accordions will be injected here -->
          </div>
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
  }

  async initPlaces() {
    try {
      await this.loader.importLibrary("places");
    } catch (e) {
      console.error("Failed to load Places API:", e);
    }
  }

  extractPlaceData(place) {
    if (!place) return null;
    let lat = null, lng = null;
    if (place.location) {
      if (typeof place.location.lat === 'function') {
        lat = place.location.lat();
        lng = place.location.lng();
      } else {
        lat = place.location.lat;
        lng = place.location.lng;
      }
    }
    return {
      displayName: place.displayName || '',
      formattedAddress: place.formattedAddress || '',
      id: place.id || '',
      location: (lat && lng) ? { lat, lng } : null
    };
  }

  triggerSave() {
      const form = this.shadowRoot.getElementById('travel-form');
      if (form) form.dispatchEvent(new Event('input', { bubbles: true }));
  }

  renderDaysUI(numDays) {
    const container = this.shadowRoot.getElementById('days-container');
    if (!container) return;
    container.innerHTML = '';
    
    const isSingleDay = numDays === 1;

    for (let i = 1; i <= numDays; i++) {
      const dayWrapper = document.createElement('div');
      dayWrapper.className = 'day-wrapper' + (isSingleDay ? ' single-day' : '');
      dayWrapper.dataset.day = i;

      let headerHTML = '';
      if (!isSingleDay) {
        headerHTML = `
          <div class="accordion-header" data-day="${i}">
            <span>Day ${i}</span>
            <span class="icon">${i === 1 ? '▲' : '▼'}</span>
          </div>
        `;
      }

      const contentHTML = `
        <div class="accordion-content ${isSingleDay || i === 1 ? 'open' : ''}" id="day-content-${i}">
          <div class="row-2">
            <div class="form-group">
              <label data-i18n="startTime">Start Time</label>
              <input type="time" class="daily-start-time" id="start-time-day-${i}" value="09:00" required>
            </div>
            <div class="form-group">
              <label data-i18n="endTime">End Time</label>
              <input type="time" class="daily-end-time" id="end-time-day-${i}" value="19:00" required>
            </div>
          </div>
          <div class="row-2">
            <div class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.25rem;">
                <label data-i18n="startLocation" style="margin-bottom: 0;">Start Location (e.g., Hotel)</label>
                ${i >= 2 ? `<button type="button" class="btn-bring-prev" data-day="${i}" style="font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer;">⬇️ 전날 종료 장소 가져오기</button>` : ''}
              </div>
              <gmp-place-autocomplete class="daily-start-location" id="start-location-day-${i}" data-i18n-placeholder="startLocationPlaceholder" placeholder="${t('startLocationPlaceholder')}"></gmp-place-autocomplete>
            </div>
            <div class="form-group">
              <label data-i18n="endLocation">End Location (e.g., Hotel/Airport)</label>
              <gmp-place-autocomplete class="daily-end-location" id="end-location-day-${i}" data-i18n-placeholder="endLocationPlaceholder" placeholder="${t('endLocationPlaceholder')}"></gmp-place-autocomplete>
            </div>
          </div>
          <div class="form-section" style="margin-top: 1.5rem; margin-bottom: 0;">
            <h3 style="font-size: 1rem; color: var(--text-secondary); margin-bottom: 0.5rem;"><span data-i18n="anchorTitle">Anchor Schedules</span> <span style="font-size: 0.85rem; font-weight: 400;">(Optional)</span></h3>
            <div id="anchors-container-day-${i}"></div>
            <button type="button" class="secondary-btn add-anchor-btn" data-day="${i}" data-i18n="addAnchor">+ Add Anchor Schedule</button>
          </div>
        </div>
      `;

      dayWrapper.innerHTML = headerHTML + contentHTML;
      container.appendChild(dayWrapper);

      if (!isSingleDay) {
        const header = dayWrapper.querySelector('.accordion-header');
        const content = dayWrapper.querySelector('.accordion-content');
        header.addEventListener('click', () => {
          content.classList.toggle('open');
          header.querySelector('.icon').textContent = content.classList.contains('open') ? '▲' : '▼';
        });
      }

      // '전날 종료 장소 가져오기' 수동 버튼 로직은 setupEventListeners의 Event Delegation으로 이동되었습니다.
      
      dayWrapper.querySelector('.add-anchor-btn').addEventListener('click', () => {
        this.addAnchorToDay(i);
        this.triggerSave();
      });
    }

    // 렌더링 직후 모든 gmp-place-autocomplete에 gmp-placeselect 직접 부착 (사용자 지침 1)
    const autocompletes = this.shadowRoot.querySelectorAll('gmp-place-autocomplete');
    autocompletes.forEach(ac => {
        ac.addEventListener('gmp-placeselect', (event) => {
            const target = event.target;
            if (target && target.place) {
                const placeData = this.extractPlaceData(target.place);
                if (placeData) {
                    this.placesMap.set(target.id, placeData);
                    this.triggerSave();
                }
            }
        });
    });

    this.updateTexts();
  }

  // setupDailyAutocompleteListener는 Event Delegation으로 대체되어 삭제됨.

  addAnchorToDay(dayIndex, data = null) {
    const container = this.shadowRoot.getElementById(`anchors-container-day-${dayIndex}`);
    if (!container) return;
    
    const id = `anchor-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const template = document.createElement('div');
    template.className = 'anchor-item';
    template.id = id;
    
    template.innerHTML = `
      <button type="button" class="remove-btn">×</button>
      <div class="form-group">
        <label data-i18n="anchorNameLabel">${t('anchorNameLabel')}</label>
        <input type="text" class="anchor-name" data-i18n-placeholder="anchorNamePlaceholder" placeholder="${t('anchorNamePlaceholder')}" required>
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
          <gmp-place-autocomplete class="anchor-location" id="loc-${id}" data-i18n-placeholder="anchorLocationPlaceholder" placeholder="${t('anchorLocationPlaceholder')}"></gmp-place-autocomplete>
        </div>
      </div>
    `;
    
    container.appendChild(template);
    
    template.querySelector('.remove-btn').addEventListener('click', () => {
      container.removeChild(template);
      this.placesMap.delete(`loc-${id}`);
      this.triggerSave();
    });
    
    const ac = template.querySelector('.anchor-location');
    if (ac) {
        // 동적으로 추가된 컴포넌트에도 직접 부착 (사용자 지침 1)
        ac.addEventListener('gmp-placeselect', (event) => {
            const target = event.target;
            if (target && target.place) {
                const placeData = this.extractPlaceData(target.place);
                if (placeData) {
                    this.placesMap.set(target.id, placeData);
                    this.triggerSave();
                }
            }
        });
    }
    
    if (data) {
      template.querySelector('.anchor-name').value = data.name || '';
      template.querySelector('.anchor-time').value = data.time || '';
      template.querySelector('.anchor-end-time').value = data.endTime || '';
      if (ac) {
         ac.value = data.location?.displayName || (typeof data.location === 'string' ? data.location : '');
         if (typeof data.location === 'object' && data.location !== null) {
             this.placesMap.set(`loc-${id}`, data.location);
         }
      }
    }
    this.updateTexts();
  }

  populateForm(requestData) {
    if (!requestData) return;
    try {
      const form = this.shadowRoot.getElementById('travel-form');
      if (form) form.reset();
      this.placesMap.clear();

      let dateVal = requestData.date || null;
      if (!dateVal && sessionStorage.getItem('userPreference')) {
          try {
              const pref = JSON.parse(sessionStorage.getItem('userPreference'));
              dateVal = pref.date || null;
          } catch(e){}
      }

      const dateInput = this.shadowRoot.getElementById('schedule-date');
      if (dateInput && dateVal) {
          if (Array.isArray(dateVal)) {
              if (dateVal.length > 1) {
                  const nights = dateVal.length - 1;
                  const reqDays = dateVal.length;
                  const durationKey = `duration_${reqDays}`;
                  const durationText = t(durationKey) !== durationKey ? t(durationKey) : (getLang() === 'ko' ? `${nights}박 ${reqDays}일` : `${nights}N ${reqDays}D`);
                  dateInput.type = 'text';
                  dateInput.value = `${dateVal[0]} ~ ${dateVal[dateVal.length - 1]} (${durationText})`;
                  dateInput.readOnly = true;
                  dateInput.style.backgroundColor = '#f3f4f6';
                  dateInput.style.cursor = 'not-allowed';
              } else {
                  dateInput.type = 'date';
                  dateInput.value = dateVal[0];
                  dateInput.readOnly = false;
                  dateInput.style.backgroundColor = '';
                  dateInput.style.cursor = '';
              }
          } else {
              dateInput.type = 'date';
              dateInput.value = dateVal;
              dateInput.readOnly = false;
              dateInput.style.backgroundColor = '';
              dateInput.style.cursor = '';
          }
      }

      let numDays = 1;
      if (Array.isArray(dateVal) && dateVal.length > 1) {
          numDays = dateVal.length;
      }

      this.renderDaysUI(numDays);

      if (requestData.dailyData && Array.isArray(requestData.dailyData)) {
          requestData.dailyData.forEach(dayInfo => {
              const d = dayInfo.day;
              const startAc = this.shadowRoot.getElementById(`start-location-day-${d}`);
              const endAc = this.shadowRoot.getElementById(`end-location-day-${d}`);
              const startTime = this.shadowRoot.getElementById(`start-time-day-${d}`);
              const endTime = this.shadowRoot.getElementById(`end-time-day-${d}`);

              if (startTime && dayInfo.startTime) startTime.value = dayInfo.startTime;
              if (endTime && dayInfo.endTime) endTime.value = dayInfo.endTime;
              
              if (startAc && dayInfo.startLocation) {
                  startAc.value = dayInfo.startLocation.displayName || '';
                  if (dayInfo.startLocation.displayName) this.placesMap.set(`start-location-day-${d}`, dayInfo.startLocation);
              }
              if (endAc && dayInfo.endLocation) {
                  endAc.value = dayInfo.endLocation.displayName || '';
                  if (dayInfo.endLocation.displayName) this.placesMap.set(`end-location-day-${d}`, dayInfo.endLocation);
              }

              if (dayInfo.anchors && Array.isArray(dayInfo.anchors)) {
                  dayInfo.anchors.forEach(a => {
                      this.addAnchorToDay(d, a);
                  });
              }
          });
      }
      this.updateTexts();
    } catch (error) {
      console.error("[Auto-fill Error] Failed to populate form:", error);
    }
  }

  getFormData() {
    let theme = null;
    let budget = null;
    let datePref = null;
    try {
      const savedPref = sessionStorage.getItem('userPreference');
      if (savedPref) {
        const pref = JSON.parse(savedPref);
        theme = pref.theme || null;
        budget = pref.budget || null;
        datePref = pref.date || null;
      }
    } catch (e) {}

    const dateInput = this.shadowRoot.getElementById('schedule-date');
    let finalDate = datePref;
    if (dateInput && !dateInput.readOnly) {
      finalDate = dateInput.value || datePref;
    }

    const dailyData = [];
    const daysCount = this.shadowRoot.querySelectorAll('.day-wrapper').length || 1;

    for (let i = 1; i <= daysCount; i++) {
        const startAc = this.shadowRoot.getElementById(`start-location-day-${i}`);
        const endAc = this.shadowRoot.getElementById(`end-location-day-${i}`);
        
        // 타이핑 파편 방지: gmp-placeselect로 획득한 온전한 객체만 사용 (사용자 지침 2)
        let startLocData = this.placesMap.get(`start-location-day-${i}`) || { displayName: startAc ? startAc.value : '' };
        if (startAc && !startAc.value) {
             startLocData = { displayName: '' };
             this.placesMap.delete(`start-location-day-${i}`);
        }
        
        let endLocData = this.placesMap.get(`end-location-day-${i}`) || { displayName: endAc ? endAc.value : '' };
        if (endAc && !endAc.value) {
             endLocData = { displayName: '' };
             this.placesMap.delete(`end-location-day-${i}`);
        }

        const anchors = [];
        const anchorItems = this.shadowRoot.querySelectorAll(`#anchors-container-day-${i} .anchor-item`);
        anchorItems.forEach(item => {
           const ac = item.querySelector('.anchor-location');
           let locData = this.placesMap.get(ac?.id) || { displayName: ac ? ac.value : '' };
           if (ac && !ac.value) {
               locData = { displayName: '' };
               this.placesMap.delete(ac.id);
           }
           anchors.push({
               name: item.querySelector('.anchor-name').value,
               time: item.querySelector('.anchor-time').value,
               endTime: item.querySelector('.anchor-end-time').value,
               location: locData
           });
        });

        dailyData.push({
            day: i,
            startTime: this.shadowRoot.getElementById(`start-time-day-${i}`)?.value || '09:00',
            endTime: this.shadowRoot.getElementById(`end-time-day-${i}`)?.value || '19:00',
            startLocation: startLocData,
            endLocation: endLocData,
            anchors: anchors
        });
    }

    return {
      date: finalDate,
      theme,
      budget,
      dailyData
    };
  }

  setupEventListeners() {
    const preferenceBtn = this.shadowRoot.getElementById('reselect-preference-btn');
    if (preferenceBtn) {
      preferenceBtn.addEventListener('click', () => {
        window.navigate('/preference');
      });
    }

    const form = this.shadowRoot.getElementById('travel-form');

    form.addEventListener('input', (event) => {
      // 오직 입력창이 완전히 비워졌을 때만 상태 갱신
      const target = event.target;
      if (target && target.tagName && target.tagName.toLowerCase() === 'gmp-place-autocomplete') {
          if (!target.value) {
              this.placesMap.delete(target.id);
          }
      }
      
      sessionStorage.setItem('currentFormData', JSON.stringify(this.getFormData()));
    });

    // gmp-placeselect 이벤트는 위임하지 않고 renderDaysUI 등에서 각 컴포넌트에 직접 부착합니다. (사용자 지침 1)

    // 전날 장소 가져오기 버튼 Event Delegation (사용자 지침 1, 3)
    form.addEventListener('click', (event) => {
      const bringBtn = event.target.closest('.btn-bring-prev');
      if (bringBtn) {
          const dayIndex = parseInt(bringBtn.getAttribute('data-day'), 10);
          if (dayIndex >= 2) {
              const prevDay = dayIndex - 1;
              const prevEndLoc = this.placesMap.get(`end-location-day-${prevDay}`);
              
              // 값이 비어있거나 온전한 Place 객체(location/좌표 포함)가 아니라면 차단 (사용자 지침 3)
              if (!prevEndLoc || !prevEndLoc.location) {
                  alert("이전 날짜의 종료 장소를 검색 목록에서 정확히 선택해 주세요.");
                  return;
              }
              
              const startAc = this.shadowRoot.getElementById(`start-location-day-${dayIndex}`);
              if (startAc) {
                  const deepCopied = JSON.parse(JSON.stringify(prevEndLoc));
                  this.placesMap.set(`start-location-day-${dayIndex}`, deepCopied);
                  
                  startAc.value = deepCopied.displayName;
                  
                  const lightInput = startAc.querySelector('input');
                  if (lightInput) lightInput.value = deepCopied.displayName;
                  
                  const innerInput = startAc.shadowRoot?.querySelector('input');
                  if (innerInput) {
                      innerInput.value = deepCopied.displayName;
                      innerInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                      innerInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                  }
                  
                  this.triggerSave();
              }
          }
      }
    });

    this.shadowRoot.getElementById('reset-btn').addEventListener('click', () => {
      form.reset();
      this.placesMap.clear();
      
      const autocompletes = this.shadowRoot.querySelectorAll('gmp-place-autocomplete');
      autocompletes.forEach(ac => ac.value = '');

      for (let i = 1; i <= 10; i++) {
         const container = this.shadowRoot.getElementById(`anchors-container-day-${i}`);
         if (container) container.innerHTML = '';
      }

      sessionStorage.removeItem('currentFormData');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      if (this.isSubmitting) return;
      this.isSubmitting = true;
      const btn = this.shadowRoot.querySelector('.primary-btn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Planning... ⏳';
        btn.style.opacity = '0.7';
      }

      const plannerRequest = this.getFormData();

      for (let day of plannerRequest.dailyData) {
          const d = day.day;
          if (!day.startLocation.displayName || !day.endLocation.displayName) {
              const content = this.shadowRoot.getElementById(`day-content-${d}`);
              if (content && !content.classList.contains('open')) {
                  content.classList.add('open');
                  const headerIcon = this.shadowRoot.querySelector(`.accordion-header[data-day="${d}"] .icon`);
                  if (headerIcon) headerIcon.textContent = '▲';
              }
              if (!day.startLocation.displayName) {
                  alert(`[Day ${d}] 시작 장소를 입력해주세요.`);
                  this.shadowRoot.getElementById(`start-location-day-${d}`)?.focus();
              } else {
                  alert(`[Day ${d}] 종료 장소를 입력해주세요.`);
                  this.shadowRoot.getElementById(`end-location-day-${d}`)?.focus();
              }
              this._resetSubmitButton(btn);
              this.isSubmitting = false;
              return;
          }

          if (day.startTime >= day.endTime) {
              alert(`[Day ${d}] ` + t('basicTimeValidationError'));
              this._resetSubmitButton(btn);
              this.isSubmitting = false;
              return;
          }

          for (let anchor of day.anchors) {
              if (!anchor.time || !anchor.endTime) continue;
              if (anchor.time >= anchor.endTime) {
                  alert(`[Day ${d}] ` + t('invalidAnchorTime').replace('{0}', anchor.name || 'Anchor'));
                  this._resetSubmitButton(btn);
                  this.isSubmitting = false;
                  return;
              }
              if (anchor.time < day.startTime || anchor.endTime > day.endTime) {
                  alert(`[Day ${d}] ` + t('timeValidationError').replace('{0}', anchor.name || 'Anchor').replace('{1}', day.startTime).replace('{2}', day.endTime));
                  this._resetSubmitButton(btn);
                  this.isSubmitting = false;
                  return;
              }
          }
      }

      console.log('Dispatching generation event:', plannerRequest);
      trackEvent('generate_itinerary_click');

      this.dispatchEvent(new CustomEvent('generate-itinerary', {
        detail: plannerRequest,
        bubbles: true,
        composed: true
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
