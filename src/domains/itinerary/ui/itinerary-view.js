import { saveItinerary } from '../services/firestore-service.js';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { t } from '../../../utils/i18n.js';

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
    this.setupShareListener();
    this.setupDownloadListener();
    this.updateTexts();

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
        el.textContent = t(key);
      }
    });

    if (this.currentItinerary && this.currentItinerary.days && this.currentItinerary.days.length > 0) {
      const dayData = this.currentItinerary.days[0];
      const headerFormat = t('itineraryHeader') || '{0} 여행 일정';
      const headerEl = this.shadowRoot.getElementById('day-title-header');
      if (headerEl) {
        headerEl.textContent = headerFormat.replace('{0}', dayData.date);
      }
    }
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
          saveBtn.textContent = t('savingStateBtn') || '저장 중...';
          await saveItinerary(user.uid, this.currentItinerary);
          this.showToast(t('itinerarySaveToast') || "일정이 성공적으로 저장되었습니다! 🎉");
        } catch (error) {
          console.error("Save error:", error);
          this.showToast(t('saveFailToast') || "저장에 실패했습니다.", true);
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = t('saveItineraryBtn') || '이 일정 저장하기 💾';
        }
      });
    }
  }

  setupShareListener() {
    const shareBtn = this.shadowRoot.getElementById('share-itinerary-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        if (!this.currentItinerary) return;

        try {
          // 1. Convert itinerary data to string
          const dataStr = JSON.stringify(this.currentItinerary);
          // 2. Compress using LZString
          const compressed = LZString.compressToEncodedURIComponent(dataStr);
          // 3. Create full URL
          const shareUrl = window.location.origin + window.location.pathname + '?share=' + compressed;

          // 4. Copy to clipboard
          navigator.clipboard.writeText(shareUrl).then(() => {
            alert(t('shareSuccessAlert') || "🔗 공유 링크가 클립보드에 복사되었습니다!");
          }).catch(err => {
            console.error('Clipboard copy failed:', err);
            this.showToast("클립보드 복사에 실패했습니다.", true);
          });
        } catch (error) {
          console.error("Compression error:", error);
          this.showToast("링크 생성 중 오류가 발생했습니다.", true);
        }
      });
    }
  }

  setupDownloadListener() {
    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadAsImage());
    }
  }

  async downloadAsImage() {
    if (!this.currentItinerary) return;
    
    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');
    const originalText = downloadBtn.textContent;
    
    try {
      downloadBtn.disabled = true;
      downloadBtn.textContent = "📸 이미지 생성 중...";
      
      const target = this.shadowRoot.getElementById('results-content');
      
      // html2canvas options
      const options = {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          const clonedResults = clonedDoc.querySelector('#results-content');
          if (clonedResults) {
            clonedResults.style.padding = '40px';
            clonedResults.style.borderRadius = '0';
            clonedResults.style.background = '#ffffff';

            // Ensure specific standard colors for capture
            const overrideStyle = clonedDoc.createElement('style');
            overrideStyle.textContent = `
              .timeline::before { background: #e5e7eb !important; }
              .schedule-card { border-color: #e5e7eb !important; background: #ffffff !important; color: #1f2937 !important; }
              .schedule-card[data-type="AnchorSchedule"] { border-color: #7c3aed !important; background: #f5f3ff !important; }
              .time-badge { color: #7c3aed !important; }
              .schedule-title { color: #1f2937 !important; }
              .schedule-desc { color: #4b5563 !important; }
              .schedule-meta { color: #6b7280 !important; }
              .transit-pill { background: #f3f4f6 !important; border-color: #e5e7eb !important; color: #4b5563 !important; }
              h2 { color: #1f2937 !important; border-bottom: 2px solid #f3f4f6 !important; margin-bottom: 20px !important; }
            `;
            clonedResults.appendChild(overrideStyle);
          }
        }
      };
      
      const canvas = await html2canvas(target, options);
      const dataUrl = canvas.toDataURL("image/png");
      
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `my-trip-itinerary-${new Date().getTime()}.png`;
      link.click();
      
      this.showToast("이미지가 성공적으로 저장되었습니다! 📸");
    } catch (error) {
      console.error("Image generation failed:", error);
      this.showToast("이미지 생성에 실패했습니다.", true);
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = originalText;
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
        let modeText = t('transitText') || '대중교통';

        if (detail.mode === 'TRANSIT' && detail.vehicleType) {
          const vType = detail.vehicleType.toUpperCase();
          const lineName = detail.lineName || '';

          if (vType === 'BUS' || vType === 'INTERCITY_BUS') {
            const format = t('busFormat');
            modeText = format ? format.replace('{0}', lineName) : `${lineName} Bus`;
          } else if (vType === 'SUBWAY' || vType === 'HEAVY_RAIL' || vType === 'COMMUTER_TRAIN') {
            const format = t('subwayFormat');
            modeText = format ? format.replace('{0}', lineName) : `Line ${lineName}`;
          } else if (vType === 'TRAIN' || vType === 'HIGH_SPEED_TRAIN') {
            const format = t('trainFormat');
            modeText = format ? format.replace('{0}', lineName) : `Train ${lineName}`;
          }
        } else if (detail.mode === 'WALKING') {
          modeText = t('walkText') || '도보';
        }

        // Only show bullet point if modeText is valid otherwise fallback to basic
        let innerHtml = `<span class="transit-pill">${icon} ${modeText} • ${detail.duration} (${detail.distance})</span>`;
        
        if (detail.mode === 'TRANSIT' && detail.transitDetailsExtended) {
          const ext = detail.transitDetailsExtended;
          if (ext.departureStop && ext.arrivalStop) {
            const boarding = t('boarding') || '승차';
            const alighting = t('alighting') || '하차';
            
            let extHtml = `<div class="transit-extended-info">`;
            extHtml += `[${boarding}] ${ext.departureStop} ➔ [${alighting}] ${ext.arrivalStop}`;
            extHtml += `</div>`;
            innerHtml += extHtml;
          }
        }
        
        el.innerHTML = innerHtml;
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
          border-bottom: 2px solid #f3f4f6;
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
          left: calc(100px + 1rem); /* Middle of the 2rem gap */
          top: 0;
          bottom: 0;
          width: 2px;
          background: #e5e7eb;
        }

        .timeline-item {
          display: flex;
          gap: 2rem;
          position: relative;
          z-index: 1;
        }

        .time-badge {
          flex-shrink: 0;
          width: 100px;
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
          border: 1px solid #f3f4f6;
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
          left: -1rem;
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
          background: linear-gradient(to right, #f8faff, #f5f3ff);
          border: 1px solid var(--accent-primary);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.15);
        }
        
        .schedule-card[data-type="AnchorSchedule"]::before {
          background: var(--accent-primary);
          color: white;
          box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.3);
        }

        .transit-info {
          padding-left: calc(100px + 2rem);
          margin-block: -0.5rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.4rem;
        }

        .transit-extended-info {
          margin-left: 1rem;
          font-size: 0.8rem;
          color: var(--text-secondary);
          background: #f8f9ff;
          padding: 0.4rem 0.8rem;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          display: inline-block;
        }

        .transit-info.hidden {
          display: none;
        }

        .transit-pill {
          background: #f3f4f6;
          padding: 0.3rem 0.8rem;
          border-radius: 20px;
          border: 1px dashed #e5e7eb;
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

        .action-links {
          margin-top: 1rem;
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .action-link-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.4rem 0.8rem;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s ease;
          background: #f9fafb;
          color: var(--text-secondary);
          border: 1px solid #e5e7eb;
        }

        .action-link-badge.primary {
          background: #f5f3ff;
          color: var(--accent-primary);
          border-color: #ddd6fe;
        }

        .action-link-badge:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px rgba(0,0,0,0.05);
          background: white;
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
          border: 3px solid #f3f4f6;
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
            gap: 1.5rem;
          }
          .time-badge {
            text-align: left;
            width: auto;
            padding-left: 2rem;
          }
          .timeline::before {
            left: 11px;
          }
          .schedule-card {
            margin-left: 2rem;
          }
          .schedule-card::before {
            left: -2rem;
            transform: none;
          }
          .transit-info {
            padding-left: 2rem;
          }
        }

        .save-btn {
          margin-top: 2rem;
          background: #f3f4f6;
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

        .share-btn {
          margin-top: 1rem;
          background: var(--bg-primary);
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

        .share-btn:hover {
          background: #f3f4f6;
          transform: translateY(-2px);
          box-shadow: var(--shadow-sm);
        }

        .share-btn:active {
          transform: translateY(0);
        }

        .download-btn {
          margin-top: 1rem;
          background: linear-gradient(135deg, var(--accent-primary, #7c3aed), #4f46e5);
          color: white;
          border: none;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          display: none;
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2);
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        .download-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(124, 58, 237, 0.3);
          filter: brightness(1.1);
        }

        .download-btn:active {
          transform: translateY(0);
        }

        .download-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
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
      
      <!-- Global loader handles loading state -->

      <div id="results" style="display: none;">
        <div id="results-content" style="background: white;">
          <h2 id="day-title-header" style="padding-top: 0.5rem; margin-top: 0;">Day 1 Itinerary</h2>
          <div class="timeline" id="timeline-container">
            <!-- Dynamically injected -->
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 2rem;">
          <button id="download-image-btn" class="download-btn">📸 일정 이미지로 저장하기</button>
          <button id="save-itinerary-btn" class="save-btn" data-i18n="saveItineraryBtn" style="margin-top: 0;">이 일정 저장하기 💾</button>
          <button id="share-itinerary-btn" class="share-btn" data-i18n="shareItineraryBtn">🔗 일정 공유하기</button>
        </div>
      </div>

      <div id="toast" class="toast" data-i18n="itinerarySaveToast">일정이 저장되었습니다! 🎉</div>
    `;
  }

  setLoading(isLoading) {
    this.setAttribute('visible', '');
    const results = this.shadowRoot.getElementById('results');

    if (isLoading) {
      results.style.display = 'none';
    } else {
      results.style.display = 'block';
    }
  }

  setError(msg) {
    this.setLoading(false);
    const container = this.shadowRoot.getElementById('timeline-container');
    container.innerHTML = `<p style="color: red;">${msg}</p>`;
  }

  clear() {
    this.currentItinerary = null;
    const container = this.shadowRoot.getElementById('timeline-container');
    if (container) container.innerHTML = '';
    const saveBtn = this.shadowRoot.getElementById('save-itinerary-btn');
    if (saveBtn) saveBtn.style.display = 'none';
    const shareBtn = this.shadowRoot.getElementById('share-itinerary-btn');
    if (shareBtn) shareBtn.style.display = 'none';
    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');
    if (downloadBtn) downloadBtn.style.display = 'none';
  }

  showResults(itineraryPlan) {
    this.currentItinerary = itineraryPlan;
    this.setLoading(false);

    const dayData = itineraryPlan.days[0]; // Currently mocking single day
    const headerFormat = t('itineraryHeader') || '{0} 여행 일정';
    this.shadowRoot.getElementById('day-title-header').textContent = headerFormat.replace('{0}', dayData.date);

    const container = this.shadowRoot.getElementById('timeline-container');
    container.innerHTML = ''; // Clear old

    const saveBtn = this.shadowRoot.getElementById('save-itinerary-btn');
    if (saveBtn) saveBtn.style.display = 'block';

    const shareBtn = this.shadowRoot.getElementById('share-itinerary-btn');
    if (shareBtn) shareBtn.style.display = 'block';

    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');
    if (downloadBtn) downloadBtn.style.display = 'block';

    dayData.scheduleItems.forEach((scheduleItem, idx) => {
      const item = document.createElement('div');
      item.className = 'timeline-item';

      const timeDisplay = scheduleItem.endTime ? `${scheduleItem.time} -<br>${scheduleItem.endTime}` : scheduleItem.time;

      const linksHtml = `
        <div class="link-buttons" style="margin-top: 8px; display: flex; gap: 8px;">
          ${scheduleItem?.officialWebsiteUrl ? `<a href="${scheduleItem.officialWebsiteUrl}" target="_blank" rel="noopener noreferrer" style="background: #eef2ff; color: #4f46e5; padding: 4px 8px; border-radius: 4px; text-decoration: none; font-size: 12px; font-weight: bold;">🌐 홈페이지</a>` : ''}
          ${scheduleItem?.googleMapsUrl ? `<a href="${scheduleItem.googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="background: #eef2ff; color: #4f46e5; padding: 4px 8px; border-radius: 4px; text-decoration: none; font-size: 12px; font-weight: bold;">📍 구글맵 보기</a>` : ''}
        </div>
      `;

      item.innerHTML = `
        <div class="time-badge">${timeDisplay}</div>
        <div class="schedule-card" data-type="${scheduleItem.type}" data-index="${idx + 1}">
          <div class="schedule-title">${scheduleItem.title}</div>
          <div class="schedule-desc">${scheduleItem.description}</div>
          <div class="schedule-meta">
            <span class="meta-item">📍 ${scheduleItem.location}</span>
            <span class="meta-item">⏱ ${scheduleItem.duration}</span>
          </div>
          ${linksHtml}
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
