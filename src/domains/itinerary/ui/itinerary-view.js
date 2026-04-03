import { saveItinerary, createSharedItinerary, getItineraryById } from '../services/firestore-service.js';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { t } from '../../../utils/i18n.js';
import { trackEvent } from '../../../utils/analytics.js';

export default class ItineraryView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.currentItinerary = null;
  }

  connectedCallback() {
    this.render();
    window.addEventListener('transit-info-ready', (e) => this.renderTransitInfo(e.detail));
    
    // Check URL for direct ID access
    this.checkUrlForId();
    
    this.setupSaveListener();
    this.setupShareListener();
    this.setupKakaoShareListener();
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
        trackEvent('save_itinerary_click');
        const user = getCurrentUser();
        if (!user) {
          this.showToast("로그인이 필요합니다.", true);
          return;
        }
        if (!this.currentItinerary) return;

        try {
          saveBtn.disabled = true;
          saveBtn.textContent = t('savingStateBtn') || '저장 중...';
          const newId = await saveItinerary(user.uid, this.currentItinerary);
          this.showToast(t('itinerarySaveToast') || "일정이 성공적으로 저장되었습니다! 🎉");
          
          // 🚀 [Routing] URL 업데이트: /view/:id 로 이동
          if (window.navigate) {
            window.navigate('/view/' + newId);
          }
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

  async checkUrlForId() {
    const path = window.location.pathname;
    const match = path.match(/^\/view\/([a-zA-Z0-9]+)$/);
    if (match && match[1]) {
      const id = match[1];
      console.log(`[ItineraryView] URL-based ID detected: ${id}`);
      await this.loadItineraryById(id);
    }
  }

  async loadItineraryById(id) {
    try {
      this.clear();
      this.setLoading(true);
      
      const itinerary = await getItineraryById(id);
      if (itinerary) {
        this.showResults(itinerary);
        // Dispatch event for map to update
        window.dispatchEvent(new CustomEvent('render-map-route', { detail: itinerary }));
      } else {
        this.setError("일정을 찾을 수 없습니다.");
      }
    } catch (err) {
      console.error("Load by ID error:", err);
      this.setError("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      this.setLoading(false);
    }
  }

  setupShareListener() {
    const shareBtn = this.shadowRoot.getElementById('share-itinerary-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        if (!this.currentItinerary) return;

        const originalText = shareBtn.textContent;
        try {
          shareBtn.textContent = "링크 생성 중...";
          shareBtn.disabled = true;

          const docId = await createSharedItinerary(this.currentItinerary);
          const shareUrl = window.location.origin + window.location.pathname + '?id=' + docId;

          await navigator.clipboard.writeText(shareUrl);
          alert(t('shareSuccessAlert') || "🔗 공유 링크가 클립보드에 복사되었습니다!");
        } catch (error) {
          console.error("Share error:", error);
          this.showToast("링크 생성 중 오류가 발생했습니다.", true);
        } finally {
          shareBtn.textContent = originalText;
          shareBtn.disabled = false;
        }
      });
    }
  }

  setupKakaoShareListener() {
    const kakaoBtn = this.shadowRoot.getElementById('kakao-share-btn');
    if (kakaoBtn) {
      kakaoBtn.addEventListener('click', async () => {
        trackEvent('share_kakao_click');
        if (!this.currentItinerary) return;

        const originalText = kakaoBtn.textContent;
        try {
          kakaoBtn.textContent = "링크 생성 중...";
          kakaoBtn.disabled = true;

          const docId = await createSharedItinerary(this.currentItinerary);
          const shareUrl = window.location.origin + window.location.pathname + '?id=' + docId;

          Kakao.Share.sendDefault({
            objectType: 'feed',
            content: {
              title: "✈️ 나만의 스마트한 여행 일정이 도착했어요!",
              description: "Compasser에서 만든 완벽한 여행 타임라인과 지도를 지금 바로 확인해 보세요.",
              imageUrl: "https://images.unsplash.com/photo-1488646953014-c8c2eb5f2b2b",
              link: {
                mobileWebUrl: shareUrl,
                webUrl: shareUrl,
              },
            },
            buttons: [
              {
                title: "일정 자세히 보기",
                link: {
                  mobileWebUrl: shareUrl,
                  webUrl: shareUrl,
                },
              },
            ],
          });
        } catch (error) {
          console.error("Kakao Share error:", error);
          this.showToast("카카오톡 공유 중 오류가 발생했습니다.", true);
        } finally {
          kakaoBtn.textContent = originalText;
          kakaoBtn.disabled = false;
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
    const originalText = downloadBtn ? downloadBtn.textContent : '';
    
    // 1. 임시 컬러 조작을 위한 변수
    const styleTag = this.shadowRoot.querySelector('style');
    let originalStyleContent = '';
    
    try {
      if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.textContent = "📸 이미지 생성 중...";
      }
      
      // 2. html2canvas 파싱 에러(color-mix 등 최신 CSS 함수) 우회를 위해 안전한 색상으로 치환
      if (styleTag) {
        originalStyleContent = styleTag.textContent;
        // 문제가 되는 color-mix 등 최신 문법을 정적 색상으로 임시 변경
        styleTag.textContent = styleTag.textContent
          .replace(/color-mix\([^;}]+\)/g, 'rgba(124, 58, 237, 0.15)')
          .replace(/color\([^;}]+\)/g, 'rgba(124, 58, 237, 0.15)');
      }
      
      const target = this.shadowRoot.getElementById('results-content');
      
      // html2canvas options
      const options = {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        // 3. 버튼 등 불필요한 요소 캡처 제외
        ignoreElements: (element) => {
          if (element.tagName === 'BUTTON') return true;
          if (element.classList && element.classList.contains('itinerary-actions')) return true;
          if (element.id && (element.id.includes('-btn') || element.id === 'itinerary-actions')) return true;
          return false;
        },
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
      // 4. 에러 핸들링 보강
      console.error("[html2canvas] Image generation failed:", error);
      this.showToast("최신 브라우저 환경에서 캡처 기능이 지원되지 않을 수 있습니다.", true);
    } finally {
      // 5. Cleanup: CSS 원상복구
      if (styleTag && originalStyleContent) {
        styleTag.textContent = originalStyleContent;
      }
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = originalText;
      }
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

  // ========== 이동 수단 시각화 (업그레이드) ==========
  getTransitStyle(mode, vehicleType) {
    if (mode === 'WALKING') {
      return { icon: '🚶', bg: '#f3f4f6', border: '#d1d5db', color: '#4b5563', label: '도보' };
    }
    if (mode === 'TRANSIT' && vehicleType) {
      const vType = vehicleType.toUpperCase();
      if (vType === 'BUS' || vType === 'INTERCITY_BUS') {
        return { icon: '🚌', bg: '#ecfdf5', border: '#a7f3d0', color: '#065f46', label: '버스' };
      }
      if (vType === 'SUBWAY' || vType === 'HEAVY_RAIL' || vType === 'COMMUTER_TRAIN') {
        return { icon: '🚇', bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af', label: '지하철' };
      }
      if (vType === 'TRAIN' || vType === 'HIGH_SPEED_TRAIN') {
        return { icon: '🚆', bg: '#f5f3ff', border: '#ddd6fe', color: '#5b21b6', label: '기차' };
      }
      if (vType === 'TAXI' || vType === 'CAB') {
        return { icon: '🚕', bg: '#fefce8', border: '#fde68a', color: '#92400e', label: '택시' };
      }
    }
    // Default transit
    return { icon: '🚌', bg: '#ecfdf5', border: '#a7f3d0', color: '#065f46', label: '대중교통' };
  }

  renderTransitInfo(transitRoutes) {
    transitRoutes.forEach(detail => {
      const el = this.shadowRoot.getElementById(`transit-info-${detail.fromIndex}`);
      if (el) {
        const style = this.getTransitStyle(detail.mode, detail.vehicleType);
        let modeText = t('transitText') || style.label;

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

        let innerHtml = `
          <div class="transit-card" style="background:${style.bg}; border-color:${style.border};">
            <div class="transit-icon-badge" style="color:${style.color};">${style.icon}</div>
            <div class="transit-detail">
              <span class="transit-mode" style="color:${style.color};">${modeText}</span>
              <span class="transit-duration">${detail.duration}</span>
              <span class="transit-distance">${detail.distance}</span>
            </div>
          </div>
        `;
        
        if (detail.mode === 'TRANSIT' && detail.transitDetailsExtended) {
          const ext = detail.transitDetailsExtended;
          if (ext.departureStop && ext.arrivalStop) {
            const boarding = t('boarding') || '승차';
            const alighting = t('alighting') || '하차';
            
            innerHtml += `
              <div class="transit-extended-info">
                [${boarding}] ${ext.departureStop} ➔ [${alighting}] ${ext.arrivalStop}
              </div>
            `;
          }
        }
        
        el.innerHTML = innerHtml;
        el.classList.remove('hidden');
      }
    });
  }

  // ========== 길찾기 팝업 로직 (버튼 앵커 기반 fixed 포지셔닝) ==========
  openNavPopup(locationName, googleMapsUrl, anchorEl) {
    // 기존 팝업 제거 (Shadow DOM 안 + body 안 둘 다)
    this.shadowRoot.getElementById('nav-popup-overlay')?.remove();
    document.getElementById('nav-popup-global')?.remove();

    const encoded = encodeURIComponent(locationName);
    const POPUP_WIDTH = 320;
    const POPUP_MARGIN = 8; // 버튼과의 간격(px)
    const ARROW_HEIGHT = 10;

    // ── 1. 버튼의 뷰포트 기준 좌표 ──────────────────────
    const rect = anchorEl ? anchorEl.getBoundingClientRect() : null;

    // ── 2. 팝업 DOM 생성 ────────────────────────────────
    const popup = document.createElement('div');
    popup.id = 'nav-popup-global';

    // 기본 스타일 (JS inline — body 레벨이므로 Shadow DOM CSS 영향 없음)
    Object.assign(popup.style, {
      position: 'fixed',
      width: POPUP_WIDTH + 'px',
      background: 'white',
      borderRadius: '16px',
      padding: '1.25rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10)',
      zIndex: '2147483647',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      animation: 'navPopupSlide 0.22s cubic-bezier(0.34,1.56,0.64,1)',
      border: '1px solid #e5e7eb',
    });

    // ── 3. 위치 계산 ─────────────────────────────────────
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    // 대략적 팝업 높이 (옵션 3개 기준)
    const estPopupH = 280;

    let top, left, arrowClass;

    if (rect) {
      // 버튼 아래 공간이 충분하면 아래에, 부족하면 위에
      const spaceBelow = vpH - rect.bottom;
      if (spaceBelow >= estPopupH + POPUP_MARGIN || spaceBelow >= vpH / 2) {
        top = rect.bottom + POPUP_MARGIN;
        arrowClass = 'arrow-top';
      } else {
        top = rect.top - estPopupH - POPUP_MARGIN;
        arrowClass = 'arrow-bottom';
      }
      // 좌우 중앙 정렬 (버튼 기준), 화면 밖으로 나가지 않게 클램프
      left = rect.left + rect.width / 2 - POPUP_WIDTH / 2;
      left = Math.max(8, Math.min(left, vpW - POPUP_WIDTH - 8));
      // top도 화면 밖으로 나가지 않게
      top = Math.max(8, Math.min(top, vpH - estPopupH - 8));
    } else {
      // fallback: 화면 중앙
      top = vpH / 2 - estPopupH / 2;
      left = vpW / 2 - POPUP_WIDTH / 2;
      arrowClass = '';
    }

    popup.style.top = top + 'px';
    popup.style.left = left + 'px';

    // 화살표 위치: 버튼 중앙이 팝업 내 어디인지 계산
    const arrowLeft = rect
      ? Math.min(Math.max(rect.left + rect.width / 2 - left, 20), POPUP_WIDTH - 20)
      : POPUP_WIDTH / 2;

    // ── 4. 팝업 HTML ─────────────────────────────────────
    popup.innerHTML = `
      <style>
        @keyframes navPopupSlide {
          from { opacity: 0; transform: translateY(${arrowClass === 'arrow-top' ? '-8px' : '8px'}) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        #nav-popup-global .arrow-top::before {
          content: '';
          position: absolute;
          top: -${ARROW_HEIGHT}px;
          left: ${arrowLeft}px;
          transform: translateX(-50%);
          border: ${ARROW_HEIGHT}px solid transparent;
          border-bottom-color: white;
          border-top: 0;
          filter: drop-shadow(0 -1px 1px rgba(0,0,0,0.08));
        }
        #nav-popup-global .arrow-bottom::before {
          content: '';
          position: absolute;
          bottom: -${ARROW_HEIGHT}px;
          left: ${arrowLeft}px;
          transform: translateX(-50%);
          border: ${ARROW_HEIGHT}px solid transparent;
          border-top-color: white;
          border-bottom: 0;
          filter: drop-shadow(0 1px 1px rgba(0,0,0,0.08));
        }
        #nav-popup-global .nav-inner {
          position: relative;
        }
        #nav-popup-global .popup-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 0.4rem;
        }
        #nav-popup-global .popup-title {
          font-size: 1.05rem; font-weight: 800; color: #1f2937;
        }
        #nav-popup-global .popup-close {
          background: #f3f4f6; border: none; width: 30px; height: 30px;
          border-radius: 50%; font-size: 0.9rem; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #6b7280; transition: background 0.15s;
        }
        #nav-popup-global .popup-close:hover { background: #e5e7eb; }
        #nav-popup-global .popup-location {
          font-size: 0.8rem; color: #6b7280; margin-bottom: 0.75rem;
          padding-bottom: 0.6rem; border-bottom: 1px solid #f3f4f6;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        #nav-popup-global .popup-options {
          display: flex; flex-direction: column; gap: 0.4rem;
        }
        #nav-popup-global .pop-opt {
          display: flex; align-items: center; gap: 0.65rem;
          padding: 0.7rem 0.85rem; border-radius: 12px;
          text-decoration: none; border: 1px solid #f3f4f6;
          transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
        }
        #nav-popup-global .pop-opt:hover {
          transform: translateX(3px);
          box-shadow: 0 3px 10px rgba(0,0,0,0.07);
        }
        #nav-popup-global .pop-opt.naver  { background: linear-gradient(135deg,#f0fdf4,#ecfdf5); }
        #nav-popup-global .pop-opt.naver:hover  { border-color:#86efac; }
        #nav-popup-global .pop-opt.kakao  { background: linear-gradient(135deg,#fefce8,#fffbeb); }
        #nav-popup-global .pop-opt.kakao:hover  { border-color:#fde68a; }
        #nav-popup-global .pop-opt.google { background: linear-gradient(135deg,#eff6ff,#f0f9ff); }
        #nav-popup-global .pop-opt.google:hover { border-color:#93c5fd; }
        #nav-popup-global .pop-icon { font-size: 1.35rem; flex-shrink: 0; }
        #nav-popup-global .pop-name { font-weight: 700; font-size: 0.88rem; color: #1f2937; }
        #nav-popup-global .pop-desc { font-size: 0.72rem; color: #9ca3af; }
      </style>
      <div class="nav-inner ${arrowClass}">
        <div class="popup-header">
          <span class="popup-title">🗺️ 길찾기</span>
          <button class="popup-close" id="nav-popup-close-btn">✕</button>
        </div>
        <p class="popup-location" title="${locationName}">${locationName}</p>
        <div class="popup-options">
          <a href="https://map.naver.com/v5/search/${encoded}" target="_blank" rel="noopener noreferrer" class="pop-opt naver" data-svc="naver">
            <span class="pop-icon">🟢</span>
            <div><div class="pop-name">네이버 지도</div><div class="pop-desc">Naver Map</div></div>
          </a>
          <a href="https://map.kakao.com/?q=${encoded}" target="_blank" rel="noopener noreferrer" class="pop-opt kakao" data-svc="kakao">
            <span class="pop-icon">🟡</span>
            <div><div class="pop-name">카카오맵</div><div class="pop-desc">Kakao Map</div></div>
          </a>

        </div>
      </div>
    `;

    document.body.appendChild(popup);

    // ── 5. 이벤트 처리 ──────────────────────────────────
    const closePopup = () => popup.remove();

    popup.querySelector('#nav-popup-close-btn').addEventListener('click', closePopup);

    // 바깥 클릭 시 닫기 (click 이벤트 버블링 방지 필요)
    const outsideHandler = (e) => {
      if (!popup.contains(e.target)) {
        closePopup();
        document.removeEventListener('click', outsideHandler, true);
      }
    };
    // 현재 클릭 이벤트가 끝난 뒤 등록 (같은 tick에 바로 닫히지 않도록)
    requestAnimationFrame(() => {
      document.addEventListener('click', outsideHandler, true);
    });

    // 링크 클릭 후 팝업 닫기 + 분석
    popup.querySelectorAll('.pop-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        trackEvent('navigate_map_click', { map_service: opt.dataset.svc || 'unknown', location: locationName });
        setTimeout(closePopup, 300);
      });
    });

    // 스크롤 시 팝업 닫기 (UX 일관성)
    const scrollHandler = () => {
      closePopup();
      window.removeEventListener('scroll', scrollHandler, true);
    };
    window.addEventListener('scroll', scrollHandler, true);
  }

  // ========== Trip Summary Dashboard ==========
  renderTripSummary(scheduleItems, date) {
    const summaryEl = this.shadowRoot.getElementById('trip-summary');
    if (!summaryEl) return;

    const totalPlaces = scheduleItems.length;
    const firstTime = scheduleItems[0]?.time || '—';
    const lastEndTime = scheduleItems[scheduleItems.length - 1]?.endTime || '—';

    // 카테고리 집계
    const categories = {};
    scheduleItems.forEach(item => {
      const type = item.type || 'unknown';
      if (!categories[type]) categories[type] = 0;
      categories[type]++;
    });

    const categoryConfig = {
      'AnchorSchedule': { icon: '🎯', label: '핵심 일정', color: '#7c3aed' },
      'attraction': { icon: '🏛', label: '명소', color: '#2563eb' },
      'dining': { icon: '🍽', label: '맛집', color: '#ea580c' },
      'leisure': { icon: '🎳', label: '레저', color: '#16a34a' },
    };

    const tagsHtml = Object.entries(categories).map(([type, count]) => {
      const cfg = categoryConfig[type] || { icon: '📌', label: type, color: '#6b7280' };
      return `<span class="summary-tag" style="--tag-color: ${cfg.color};">
        <span class="tag-icon">${cfg.icon}</span>
        <span class="tag-label">${cfg.label}</span>
        <span class="tag-count">${count}</span>
      </span>`;
    }).join('');

    summaryEl.innerHTML = `
      <div class="summary-header">
        <span class="summary-emoji">📋</span>
        <span class="summary-title">일정 요약</span>
      </div>
      <div class="summary-grid">
        <div class="summary-stat">
          <div class="stat-icon">📍</div>
          <div class="stat-value">${totalPlaces}</div>
          <div class="stat-label">방문 장소</div>
        </div>
        <div class="summary-stat">
          <div class="stat-icon">⏰</div>
          <div class="stat-value">${firstTime}</div>
          <div class="stat-label">시작 시간</div>
        </div>
        <div class="summary-stat">
          <div class="stat-icon">🏁</div>
          <div class="stat-value">${lastEndTime}</div>
          <div class="stat-label">종료 시간</div>
        </div>
      </div>
      <div class="summary-tags">${tagsHtml}</div>
    `;
    summaryEl.style.display = 'block';
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

        /* ====== Trip Summary Dashboard ====== */
        .trip-summary {
          display: none;
          background: linear-gradient(135deg, #f8faff 0%, #f0f4ff 50%, #f5f3ff 100%);
          border: 1px solid #e0e7ff;
          border-radius: 16px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          animation: summaryFadeIn 0.5s ease-out;
        }

        @keyframes summaryFadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .summary-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .summary-emoji {
          font-size: 1.3rem;
        }

        .summary-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .summary-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(4px);
          padding: 0.75rem 0.5rem;
          border-radius: 12px;
          border: 1px solid rgba(124, 58, 237, 0.08);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .summary-stat:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.1);
        }

        .stat-icon {
          font-size: 1.4rem;
        }

        .stat-value {
          font-size: 1.2rem;
          font-weight: 800;
          color: var(--accent-primary, #7c3aed);
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .summary-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .summary-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.35rem 0.75rem;
          border-radius: 20px;
          background: white;
          border: 1px solid color-mix(in srgb, var(--tag-color) 25%, transparent);
          font-size: 0.8rem;
          font-weight: 600;
          transition: transform 0.15s, box-shadow 0.15s;
        }

        .summary-tag:hover {
          transform: scale(1.05);
          box-shadow: 0 2px 8px color-mix(in srgb, var(--tag-color) 20%, transparent);
        }

        .tag-icon { font-size: 0.9rem; }
        .tag-label { color: var(--tag-color); }
        .tag-count {
          background: color-mix(in srgb, var(--tag-color) 12%, transparent);
          color: var(--tag-color);
          padding: 0 0.4rem;
          border-radius: 10px;
          font-size: 0.75rem;
          font-weight: 700;
        }

        /* ====== Timeline ====== */
        .timeline {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          position: relative;
        }

        .timeline::before {
          content: '';
          position: absolute;
          left: calc(100px + 1rem);
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

        /* ====== Transit Info (Upgraded) ====== */
        .transit-info {
          padding-left: calc(100px + 2rem);
          margin-block: -0.25rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.4rem;
        }

        .transit-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 1rem;
          border-radius: 12px;
          border: 1px solid;
          transition: transform 0.2s, box-shadow 0.2s;
          min-width: 200px;
        }

        .transit-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.06);
        }

        .transit-icon-badge {
          font-size: 1.4rem;
          flex-shrink: 0;
        }

        .transit-detail {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .transit-mode {
          font-weight: 700;
          font-size: 0.85rem;
        }

        .transit-duration {
          font-weight: 800;
          font-size: 0.9rem;
          color: var(--text-primary);
        }

        .transit-distance {
          font-size: 0.8rem;
          color: var(--text-secondary);
          opacity: 0.7;
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

        /* Legacy pill (keep for fallback) */
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

        /* ====== Action Links & Nav Button ====== */
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

        .nav-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.45rem 0.85rem;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 700;
          border: 1.5px solid #10b981;
          background: linear-gradient(135deg, #ecfdf5, #f0fdf4);
          color: #065f46;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .nav-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
          background: linear-gradient(135deg, #d1fae5, #ecfdf5);
        }

        .nav-btn:active {
          transform: translateY(0);
        }

        /* ====== 길찾기 Popup (anchor-positioned, body-level) ====== */
        /* Shadow DOM 안에는 dim overlay 없음 — 팝업 스타일만 정의 */

        .quick-info-box {
          margin-top: 0.85rem;
          margin-bottom: 0.75rem;
          padding: 0.75rem 1rem;
          background: #f8fafc;
          border-left: 3.5px solid var(--accent-primary);
          border-radius: 4px 12px 12px 4px;
          display: flex;
          gap: 0.5rem;
          align-items: flex-start;
          font-size: 0.82rem;
          color: #475569;
          line-height: 1.4;
          animation: quickInfoFade 0.4s ease-out;
        }

        .quick-info-box.structured {
          display: block;
          padding: 1rem 1.25rem;
          background: linear-gradient(to right, #f8fafc, #f1f5f9);
        }

        @keyframes quickInfoFade {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .quick-info-icon {
          font-size: 1rem;
          flex-shrink: 0;
          margin-top: -1px;
        }

        .info-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .info-row {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          font-size: 0.85rem;
        }

        .info-icon {
          font-size: 1.1rem;
          flex-shrink: 0;
          width: 24px;
          text-align: center;
        }

        .info-label {
          font-weight: 800;
          color: #334155;
          min-width: 65px;
          display: inline-block;
        }

        .info-value {
          color: #475569;
          line-height: 1.4;
        }

        /* ====== Buttons ====== */
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
          .summary-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 0.5rem;
          }
          .stat-value {
            font-size: 1rem;
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

        .kakao-share-btn {
          margin-top: 1rem;
          background: #FEE500;
          color: #000000;
          border: none;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          display: none;
          box-shadow: 0 4px 12px rgba(254, 229, 0, 0.2);
        }

        .kakao-share-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(254, 229, 0, 0.4);
          filter: brightness(0.95);
        }

        .kakao-share-btn:active {
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
          <!-- Trip Summary Dashboard -->
          <div id="trip-summary" class="trip-summary"></div>
          
          <h2 id="day-title-header" style="padding-top: 0.5rem; margin-top: 0;">Day 1 Itinerary</h2>
          <div class="timeline" id="timeline-container">
            <!-- Dynamically injected -->
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 2rem;">
          <button id="download-image-btn" class="download-btn">📸 일정 이미지로 저장하기</button>
          <button id="save-itinerary-btn" class="save-btn" data-i18n="saveItineraryBtn" style="margin-top: 0;">이 일정 저장하기 💾</button>
          <button id="share-itinerary-btn" class="share-btn" data-i18n="shareItineraryBtn">🔗 일정 공유하기</button>
          <button id="kakao-share-btn" class="kakao-share-btn" data-i18n="kakaoShareBtn">💬 카카오톡 공유하기</button>
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
    const kakaoBtn = this.shadowRoot.getElementById('kakao-share-btn');
    if (kakaoBtn) kakaoBtn.style.display = 'none';
    const summaryEl = this.shadowRoot.getElementById('trip-summary');
    if (summaryEl) summaryEl.style.display = 'none';
  }

  showResults(itineraryPlan) {
    this.currentItinerary = itineraryPlan;
    this.setLoading(false);

    const dayData = itineraryPlan.days[0]; // Currently mocking single day
    const headerFormat = t('itineraryHeader') || '{0} 여행 일정';
    this.shadowRoot.getElementById('day-title-header').textContent = headerFormat.replace('{0}', dayData.date);

    // Render Trip Summary Dashboard
    this.renderTripSummary(dayData.scheduleItems, dayData.date);

    const container = this.shadowRoot.getElementById('timeline-container');
    container.innerHTML = ''; // Clear old

    const saveBtn = this.shadowRoot.getElementById('save-itinerary-btn');
    if (saveBtn) saveBtn.style.display = 'block';

    const shareBtn = this.shadowRoot.getElementById('share-itinerary-btn');
    if (shareBtn) shareBtn.style.display = 'block';

    const kakaoBtn = this.shadowRoot.getElementById('kakao-share-btn');
    if (kakaoBtn) kakaoBtn.style.display = 'block';

    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');
    if (downloadBtn) downloadBtn.style.display = 'block';

    dayData.scheduleItems.forEach((scheduleItem, idx) => {
      const item = document.createElement('div');
      item.className = 'timeline-item';

      const timeDisplay = scheduleItem.endTime ? `${scheduleItem.time} -<br>${scheduleItem.endTime}` : scheduleItem.time;

      // location이 객체(좌표)일 수 있으므로 안전하게 문자열 변환
      const locationStr = typeof scheduleItem.location === 'string'
        ? scheduleItem.location
        : (scheduleItem.location ? JSON.stringify(scheduleItem.location) : '');
      const gmapsStr = typeof scheduleItem.googleMapsUrl === 'string' ? scheduleItem.googleMapsUrl : '';

      const linksHtml = `
        <div class="action-links">
          ${scheduleItem?.officialWebsiteUrl ? `<a href="${scheduleItem.officialWebsiteUrl}" target="_blank" rel="noopener noreferrer" class="action-link-badge">🌐 홈페이지</a>` : ''}
          ${gmapsStr ? `<a href="${gmapsStr}" target="_blank" rel="noopener noreferrer" class="action-link-badge primary">📍 리뷰 보기</a>` : ''}
          <button class="nav-btn" data-location="${locationStr.replace(/"/g, '&quot;')}" data-gmaps="${gmapsStr.replace(/"/g, '&quot;')}">🗺️ 길찾기</button>
        </div>
      `;

      item.innerHTML = `
        <div class="time-badge">${timeDisplay}</div>
        <div class="schedule-card" data-type="${scheduleItem.type}" data-index="${idx + 1}">
          <div class="schedule-title">${scheduleItem.title}</div>
          <div class="schedule-desc">${scheduleItem.description}</div>
          <div class="schedule-meta">
            <span class="meta-item">📍 ${locationStr}</span>
            <span class="meta-item">⏱ ${scheduleItem.duration}</span>
          </div>
          ${(function() {
            const info = scheduleItem.practicalInfo;
            if (!info) return '';
            
            // Structured Object Format (Phase 4)
            if (typeof info === 'object' && !Array.isArray(info)) {
              return `
                <div class="quick-info-box structured">
                  <div class="info-group">
                    <div class="info-row">
                      <span class="info-icon">💰</span>
                      <span class="info-value"><span class="info-label">예상 비용:</span> ${info.estimatedCost || '—'}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-icon">🕐</span>
                      <span class="info-value"><span class="info-label">영업 시간:</span> ${info.operatingHours || '—'}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-icon">💡</span>
                      <span class="info-value"><span class="info-label">현지 팁:</span> ${info.localTip || '—'}</span>
                    </div>
                  </div>
                </div>
              `;
            }
            
            // Legacy String Format (Phase 3 Fallback)
            return `
              <div class="quick-info-box">
                <span class="quick-info-icon">💡</span>
                <div class="quick-info-text">${info}</div>
              </div>
            `;
          })()}
          ${linksHtml}
        </div>
      `;

      // 길찾기 버튼 이벤트 바인딩 — anchorEl(버튼 자체)을 넘겨 뷰포트 좌표 계산
      const navBtn = item.querySelector('.nav-btn');
      if (navBtn) {
        navBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const loc = navBtn.getAttribute('data-location');
          const gmaps = navBtn.getAttribute('data-gmaps');
          this.openNavPopup(loc, gmaps, navBtn);
        });
      }

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
