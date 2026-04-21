import { trackEvent } from '../../../utils/analytics.js';

export function openNavPopup(locationName, googleMapsUrl, anchorEl, shadowRoot) {

    // 기존 팝업 제거 (Shadow DOM 안 + body 안 둘 다)
    shadowRoot.getElementById('nav-popup-overlay')?.remove();
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
        ${itineraryStyles}
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

