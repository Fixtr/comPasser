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

    // JS 는 위치만 정한다. 모양은 아래 스타일 블록이 맡는다 — 예전에는
    // 여기서 흰 배경·그림자·둥근 모서리를 통째로 칠했고, body 에 직접
    // 붙는 요소라 어느 화면의 스타일 계약에도 걸리지 않았다.
    Object.assign(popup.style, {
      position: 'fixed',
      width: POPUP_WIDTH + 'px',
      zIndex: '2147483647',
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
        #nav-popup-global {
          box-sizing: border-box;
          padding: 1.1rem 1.15rem;
          background: var(--cp-surface);
          color: var(--cp-ink);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-radius);
          font-family: var(--cp-font);
          animation: navPopupSlide 0.16s ease-out;
        }
        #nav-popup-global *,
        #nav-popup-global *::before,
        #nav-popup-global *::after { box-sizing: border-box; }

        @keyframes navPopupSlide {
          from { opacity: 0; transform: translateY(${arrowClass === 'arrow-top' ? '-6px' : '6px'}); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* 화살표는 삼각형 두 개를 겹쳐 만든다. 바깥은 테두리 색, 안은 지면
           색이라 그림자 없이도 경계가 읽힌다(예전에는 drop-shadow 를 썼다). */
        #nav-popup-global .arrow-top::before,
        #nav-popup-global .arrow-top::after,
        #nav-popup-global .arrow-bottom::before,
        #nav-popup-global .arrow-bottom::after {
          content: '';
          position: absolute;
          left: ${arrowLeft}px;
          transform: translateX(-50%);
          border: ${ARROW_HEIGHT}px solid transparent;
        }
        #nav-popup-global .arrow-top::before {
          top: calc(-1.1rem - ${ARROW_HEIGHT}px - 1px);
          border-bottom-color: var(--cp-rule);
          border-top: 0;
        }
        #nav-popup-global .arrow-top::after {
          top: calc(-1.1rem - ${ARROW_HEIGHT}px + 1px);
          border-bottom-color: var(--cp-surface);
          border-top: 0;
        }
        #nav-popup-global .arrow-bottom::before {
          bottom: calc(-1.1rem - ${ARROW_HEIGHT}px - 1px);
          border-top-color: var(--cp-rule);
          border-bottom: 0;
        }
        #nav-popup-global .arrow-bottom::after {
          bottom: calc(-1.1rem - ${ARROW_HEIGHT}px + 1px);
          border-top-color: var(--cp-surface);
          border-bottom: 0;
        }

        #nav-popup-global .nav-inner { position: relative; }

        #nav-popup-global .popup-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 0.35rem;
        }
        #nav-popup-global .popup-title {
          font-family: inherit;
          font-size: 0.7rem;
          font-weight: 600;
          /* 자간을 주지 않는다. 대문자 라틴 라벨에는 어울리는 장식이지만
             한글에는 **음절 사이가 벌어지고 띄어쓰기가 두 칸처럼** 보인다
             ("시작 시간" 이 "시작  시간" 으로 읽혔다). 이 앱의 기본 언어가
             한국어라 여기서는 자간을 빼는 쪽이 맞다. 모노·대문자 표기는
             그대로 두어 "라벨"이라는 성격은 유지한다. */
          letter-spacing: normal;
          text-transform: uppercase;
          color: var(--cp-ink-2);
        }
        #nav-popup-global .popup-close {
          background: transparent;
          border: var(--cp-hair) solid transparent;
          border-radius: var(--cp-radius);
          width: 28px; height: 28px;
          font-family: inherit;
          font-size: 1.1rem; line-height: 1; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: var(--cp-muted);
          transition: color 0.12s linear, border-color 0.12s linear;
        }
        #nav-popup-global .popup-close:hover,
        #nav-popup-global .popup-close:focus-visible {
          color: var(--cp-ink);
          border-color: var(--cp-rule);
        }

        #nav-popup-global .popup-location {
          font-size: 0.85rem; color: var(--cp-ink); font-weight: 600;
          margin: 0 0 0.75rem;
          padding-bottom: 0.6rem;
          border-bottom: var(--cp-hair) solid var(--cp-rule);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        #nav-popup-global .popup-options {
          display: flex; flex-direction: column; gap: 0.4rem;
        }

        /* 행 자체는 무채색이다. 서비스 구분은 왼쪽 색 조각 하나로 한다 —
           예전에는 파스텔 그라디언트 배경과 🟢🟡 이모지였다. */
        #nav-popup-global .pop-opt {
          display: flex; align-items: center; gap: 0.7rem;
          padding: 0.65rem 0.8rem;
          border-radius: var(--cp-radius);
          text-decoration: none;
          background: var(--cp-surface);
          border: var(--cp-hair) solid var(--cp-rule);
          transition: border-color 0.12s linear;
        }
        #nav-popup-global .pop-opt:hover,
        #nav-popup-global .pop-opt:focus-visible {
          border-color: var(--cp-ink);
        }

        #nav-popup-global .pop-swatch {
          width: 14px; height: 14px;
          flex-shrink: 0;
          border: var(--cp-hair) solid var(--cp-rule);
        }
        #nav-popup-global .pop-opt.naver .pop-swatch { background: var(--cp-naver); border-color: var(--cp-naver); }
        #nav-popup-global .pop-opt.kakao .pop-swatch { background: var(--cp-kakao); border-color: var(--cp-kakao); }

        #nav-popup-global .pop-name { font-weight: 700; font-size: 0.88rem; color: var(--cp-ink); }
        #nav-popup-global .pop-desc { font-family: var(--cp-mono); font-size: 0.68rem; color: var(--cp-muted); }

        /* 낯선 도시에서 한 손으로 누르는 자리다. */
        @media (pointer: coarse) {
          #nav-popup-global .pop-opt { min-height: 44px; }
          #nav-popup-global .popup-close { width: 44px; height: 44px; }
        }
      </style>
      <div class="nav-inner ${arrowClass}">
        <div class="popup-header">
          <span class="popup-title">길찾기</span>
          <button class="popup-close" id="nav-popup-close-btn" type="button" aria-label="길찾기 창 닫기">&times;</button>
        </div>
        <p class="popup-location" title="${locationName}">${locationName}</p>
        <div class="popup-options">
          <a href="https://map.naver.com/v5/search/${encoded}" target="_blank" rel="noopener noreferrer" class="pop-opt naver" data-svc="naver">
            <span class="pop-swatch" aria-hidden="true"></span>
            <div><div class="pop-name">네이버 지도</div><div class="pop-desc">Naver Map</div></div>
          </a>
          <a href="https://map.kakao.com/?q=${encoded}" target="_blank" rel="noopener noreferrer" class="pop-opt kakao" data-svc="kakao">
            <span class="pop-swatch" aria-hidden="true"></span>
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

