import { saveItinerary } from '../services/firestore-service.js';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';

export default class ItineraryView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.currentItinerary = null;
  }

  connectedCallback() {
    this.render();
    window.addEventListener('transit-info-ready', (e) => this.renderTransitInfo(e.detail));
    this.setupSaveListener();
  }

  setupSaveListener() {
    const saveBtn = this.shadowRoot.getElementById('save-itinerary-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const user = getCurrentUser();
        if (!user) {
          this.showToast("로그인이 필요합니다.", true);
          return;
        }
        if (!this.currentItinerary) return;

        try {
          saveBtn.disabled = true;
          saveBtn.textContent = '저장 중...';
          await saveItinerary(user.uid, this.currentItinerary);
          this.showToast("일정이 성공적으로 저장되었습니다! 🎉");
        } catch (error) {
          console.error("Save error:", error);
          this.showToast("저장에 실패했습니다.", true);
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = '이 일정 저장하기 💾';
        }
      });
    }
  }

  showToast(message, isError = false) {
    const toast = this.shadowRoot.getElementById('toast');
    toast.textContent = message;
    toast.style.background = isError ? '#ef4444' : '#10b981';
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  renderTransitInfo(transitRoutes) {
    transitRoutes.forEach(detail => {
      const el = this.shadowRoot.getElementById(`transit-info-${detail.fromIndex}`);
      if (el) {
        const icon = detail.mode === 'TRANSIT' ? '🚌' : '🚶‍♂️';
        const modeText = detail.mode === 'TRANSIT' ? 'Transit' : 'Walk';
        el.innerHTML = `<span class="transit-pill">${icon} ${modeText} • ${detail.duration} (${detail.distance})</span>`;
        el.classList.remove('hidden');
      }
    });
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: var(--bg-secondary);
          padding: 2.5rem;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-md);
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.4s ease, transform 0.4s ease;
          container-type: inline-size;
        }

        :host([visible]) {
          opacity: 1;
          transform: translateY(0);
        }

        h2 {
          font-size: 1.5rem;
          color: var(--text-primary);
          margin-bottom: 1.5rem;
          border-bottom: 2px solid oklch(95% 0.02 260);
          padding-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .timeline {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          position: relative;
        }

        .timeline::before {
          content: '';
          position: absolute;
          left: 14px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: oklch(90% 0.02 260);
        }

        .timeline-item {
          display: flex;
          gap: 1.5rem;
          position: relative;
          z-index: 1;
        }

        .time-badge {
          flex-shrink: 0;
          width: 80px;
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--accent-primary);
          text-align: right;
          padding-top: 0.2rem;
        }

        .schedule-card {
          flex-grow: 1;
          background: var(--bg-primary);
          padding: 1.25rem;
          border-radius: 12px;
          border: 1px solid oklch(95% 0.02 260);
          position: relative;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .schedule-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-sm);
          border-color: var(--accent-primary);
        }
        
        /* Node marker */
        .schedule-card::before {
          content: attr(data-index);
          position: absolute;
          left: -1.5rem;
          top: 1rem;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--bg-secondary);
          border: 2px solid var(--accent-primary);
          color: var(--accent-primary);
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.8rem;
          box-shadow: 0 0 0 4px var(--bg-primary);
        }

        .schedule-card[data-type="AnchorSchedule"] {
          background: linear-gradient(to right, oklch(98% 0.02 260), oklch(95% 0.05 280));
          border: 1px solid var(--accent-primary);
          box-shadow: 0 4px 12px oklch(65% 0.2 260 / 15%);
        }
        
        .schedule-card[data-type="AnchorSchedule"]::before {
          background: var(--accent-primary);
          color: white;
          box-shadow: 0 0 0 4px oklch(65% 0.2 260 / 30%);
        }

        .transit-info {
          padding-left: 80px;
          margin-block: -0.5rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
        }

        .transit-info.hidden {
          display: none;
        }

        .transit-pill {
          background: oklch(95% 0.02 260);
          padding: 0.3rem 0.8rem;
          border-radius: 20px;
          border: 1px dashed oklch(85% 0.02 260);
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-weight: 500;
        }

        .schedule-title {
          font-weight: 700;
          font-size: 1.1rem;
          margin-bottom: 0.25rem;
          color: var(--text-primary);
        }

        .schedule-desc {
          color: var(--text-secondary);
          font-size: 0.95rem;
          line-height: 1.4;
          margin-bottom: 0.75rem;
        }

        .schedule-meta {
          display: flex;
          gap: 1rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        
        .meta-item {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .loader {
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 0;
          color: var(--text-secondary);
        }

        .loader.active {
          display: flex;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid oklch(90% 0.02 260);
          border-top-color: var(--accent-primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @container (max-width: 500px) {
          .timeline-item {
            flex-direction: column;
            gap: 0.5rem;
          }
          .time-badge {
            text-align: left;
            width: auto;
          }
          .timeline::before {
            left: 20px;
          }
          .schedule-card {
            margin-left: 1.5rem;
          }
          .schedule-card::before {
            left: -1.5rem;
            transform: none;
          }
        }

        .save-btn {
          margin-top: 2rem;
          background: oklch(95% 0.02 260);
          color: var(--accent-primary, #7c3aed);
          border: 2px solid var(--accent-primary, #7c3aed);
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          display: none;
        }

        .save-btn:hover {
          background: var(--accent-primary, #7c3aed);
          color: white;
        }

        .save-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .toast {
          position: fixed;
          bottom: 2rem;
          left: 50%;
          transform: translateX(-50%) translateY(100px);
          background: #10b981;
          color: white;
          padding: 1rem 2rem;
          border-radius: 30px;
          font-weight: 600;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 1000;
          opacity: 0;
        }

        .toast.show {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      </style>
      
      <div id="loader" class="loader">
        <div class="spinner"></div>
        <p>AI is analyzing routes, venues, and transit times...</p>
      </div>

      <div id="results" style="display: none;">
        <h2><span id="day-title">Day 1</span> Itinerary</h2>
        <div class="timeline" id="timeline-container">
          <!-- Dynamically injected -->
        </div>
        <button id="save-itinerary-btn" class="save-btn">이 일정 저장하기 💾</button>
      </div>

      <div id="toast" class="toast">일정이 저장되었습니다!</div>
    `;
  }

  setLoading(isLoading) {
    this.setAttribute('visible', '');
    const loader = this.shadowRoot.getElementById('loader');
    const results = this.shadowRoot.getElementById('results');

    if (isLoading) {
      loader.classList.add('active');
      results.style.display = 'none';
    } else {
      loader.classList.remove('active');
      results.style.display = 'block';
    }
  }

  setError(msg) {
    this.setLoading(false);
    const container = this.shadowRoot.getElementById('timeline-container');
    container.innerHTML = `<p style="color: red;">${msg}</p>`;
  }

  showResults(itineraryPlan) {
    this.currentItinerary = itineraryPlan;
    this.setLoading(false);

    const dayData = itineraryPlan.days[0]; // Currently mocking single day
    this.shadowRoot.getElementById('day-title').textContent = dayData.date;

    const container = this.shadowRoot.getElementById('timeline-container');
    container.innerHTML = ''; // Clear old

    const saveBtn = this.shadowRoot.getElementById('save-itinerary-btn');
    if (saveBtn) saveBtn.style.display = 'block';

    dayData.scheduleItems.forEach((scheduleItem, idx) => {
      const item = document.createElement('div');
      item.className = 'timeline-item';

      const timeDisplay = scheduleItem.endTime ? `${scheduleItem.time} -<br>${scheduleItem.endTime}` : scheduleItem.time;

      item.innerHTML = `
        <div class="time-badge">${timeDisplay}</div>
        <div class="schedule-card" data-type="${scheduleItem.type}" data-index="${idx + 1}">
          <div class="schedule-title">${scheduleItem.title}</div>
          <div class="schedule-desc">${scheduleItem.description}</div>
          <div class="schedule-meta">
            <span class="meta-item">📍 ${scheduleItem.location}</span>
            <span class="meta-item">⏱ ${scheduleItem.duration}</span>
          </div>
        </div>
      `;

      container.appendChild(item);

      if (idx < dayData.scheduleItems.length - 1) {
        const transit = document.createElement('div');
        transit.className = 'transit-info hidden';
        transit.id = `transit-info-${idx}`;
        container.appendChild(transit);
      }
    });
  }
}

customElements.define('itinerary-view', ItineraryView);
