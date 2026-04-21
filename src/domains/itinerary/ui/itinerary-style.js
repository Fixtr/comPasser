export const itineraryStyles = `
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
      `;
