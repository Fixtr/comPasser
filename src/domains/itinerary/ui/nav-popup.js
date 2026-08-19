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
    // 모달 성격의 팝업이라 스크린리더가 이름과 역할을 읽을 수 있어야 한다.
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-label', `${locationName} 길찾기`);

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
          <button class="popup-close" id="nav-popup-close-btn" type="button" aria-label="길찾기 창 닫기">✕</button>
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
    // 팝업을 연 버튼으로 포커스를 돌려줘야 키보드 사용자가 흐름을 잃지 않는다.
    const previouslyFocused = anchorEl && typeof anchorEl.focus === 'function' ? anchorEl : null;

    const closePopup = () => {
      if (!popup.isConnected) return;
      popup.remove();
      document.removeEventListener('keydown', keyHandler, true);
      if (previouslyFocused) previouslyFocused.focus();
    };

    // Escape 로 닫고, Tab 은 팝업 안에서 순환시킨다(모달 밖으로 새지 않도록).
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopup();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = popup.querySelectorAll('a[href], button:not([disabled])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keyHandler, true);

    popup.querySelector('#nav-popup-close-btn').addEventListener('click', closePopup);

    // 열리면 첫 항목으로 포커스를 옮겨 키보드만으로 바로 선택할 수 있게 한다.
    const firstOption = popup.querySelector('.pop-opt');
    if (firstOption) firstOption.focus();

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

