import { t } from '../../../utils/i18n.js';

export default class TravelForm extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.anchorCount = 0;
    this.isSubmitting = false;
  }

  connectedCallback() {
    this.render();
    if (this.anchorCount === 0) {
      this.addAnchor(); // Initialize first anchor safely
    }
    this.setupEventListeners();
    this.updateTexts(); // Fix i18n flickering on load

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

        .primary-btn:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-glow);
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
              <input type="text" id="start-location" data-i18n="startLocationPlaceholder" placeholder="Myeongdong Lotte Hotel" required>
            </div>
            <div class="form-group">
              <label for="end-location" data-i18n="endLocation">End Location (e.g., Hotel/Airport)</label>
              <input type="text" id="end-location" data-i18n="endLocationPlaceholder" placeholder="Incheon Airport" required>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h2><span data-i18n="anchorTitle">Anchor Schedules</span> <span style="font-size: 0.9rem; font-weight: 400; color: var(--text-secondary);">(Optional)</span></h2>
          <p class="subtitle" data-i18n="anchorSubtitle">Fixed schedule items to build around (e.g., Concert at 7PM, Dinner reservation)</p>
          
          <div id="anchors-container"></div>
          
          <button type="button" id="add-anchor-btn" class="secondary-btn" data-i18n="addAnchor">+ Add Anchor Schedule</button>
        </div>

        <button type="submit" class="primary-btn" data-i18n="generateBtn">Generate AI Itinerary ✨</button>
      </form>
    `;

    // Initialize with 1 empty anchor
    // this.addAnchor(); // Move to connectedCallback or let populate logic handle it
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
          <input type="text" class="anchor-location" data-i18n="anchorLocationPlaceholder" placeholder="${t('anchorLocationPlaceholder')}" required>
        </div>
      </div>
    `;

    // Setup remove logic
    template.querySelector('.remove-btn').addEventListener('click', () => {
      container.removeChild(template);
    });

    if (data) {
      template.querySelector('.anchor-name').value = data.name || '';
      template.querySelector('.anchor-time').value = data.time || '';
      template.querySelector('.anchor-end-time').value = data.endTime || '';
      template.querySelector('.anchor-location').value = data.location || '';
    }

    container.appendChild(template);
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

      console.log('Dispatching generation event:', plannerRequest);

      // Dispatch custom event reaching up through the DOM
      this.dispatchEvent(new CustomEvent('generate-itinerary', {
        detail: plannerRequest,
        bubbles: true,
        composed: true // Allows event to pass through shadow DOM boundary
      }));
    });
  }
}

customElements.define('travel-form', TravelForm);
