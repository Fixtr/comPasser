/**
 * 선호 선택 화면 스타일.
 *
 * 이 화면은 앱에서 사용자가 처음 무언가를 "고르는" 자리다. 여기서 배운
 * 표기 — 고른 것이 어떻게 보이는가 — 가 폼의 고정 일정, 결과 화면의
 * 일차 탭까지 그대로 이어진다.
 *
 * 그래서 선택 표시를 **반전(잉크 배경)** 으로 통일했다. 예전에는 보라
 * 그라디언트였는데, 보라는 지도에서 "고정 일정"을 뜻하는 색이다. 선택에
 * 그 색을 쓰면 앱 안에서 보라가 두 가지를 뜻하게 된다.
 *
 * 형태(radius 0, 1px 실선, 그림자 없음)의 근거는 다른 화면과 같다 —
 * 야외 가독성, 저사양 안드로이드 렌더 비용, html2canvas 캡처 호환.
 */
export const preferenceStyles = `
        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        :host {
          display: block;
          /* width:100% 에 좌우 여백을 더하면 그만큼 화면 밖으로 나간다.
             폰에서 가로 스크롤이 32px 생기고 있었다. */
          box-sizing: border-box;
          width: 100%;
          max-width: 720px;
          margin: 0 auto;
          padding: 2rem 1.5rem 3rem;
          font-family: var(--cp-font);
          color: var(--cp-ink);
        }

        .preference-header {
          text-align: center;
          margin-bottom: 2.5rem;
        }

        .preference-header h2 {
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--cp-ink);
          margin-bottom: 0.5rem;
          letter-spacing: -0.02em;
          word-break: keep-all;
        }

        .preference-header p {
          font-size: 0.95rem;
          color: var(--cp-muted);
          line-height: 1.6;
          word-break: keep-all;
        }

        /* 결과 화면 .info-label · 폼 label 과 같은 표기(모노·대문자·자간). */
        .section-title {
          font-family: inherit;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: normal;
          text-transform: uppercase;
          color: var(--cp-ink-2);
          margin-bottom: 0.75rem;
          padding-bottom: 0.45rem;
          border-bottom: var(--cp-hair) solid var(--cp-rule);
        }

        .section-title + .section-title {
          margin-top: 1.5rem;
        }

        .destination-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }
        .destination-summary[hidden] { display: none; }
        .destination-summary p { margin: 0; color: var(--cp-muted); }
        .destination-summary .prev-btn { flex: none; min-height: 44px; padding: 0.5rem 0.75rem; font-size: 0.85rem; }

        /* ====== 날짜 · 기간 칩 ====== */
        .date-chip-container {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 1.75rem;
        }

        .date-chip {
          background: var(--cp-surface);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-pill);
          color: var(--cp-ink-2);
          padding: 0.55rem 1rem;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.12s linear, color 0.12s linear, border-color 0.12s linear;
          user-select: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .date-chip:hover {
          border-color: var(--cp-ink);
          color: var(--cp-ink);
        }

        .date-chip.selected {
          background: var(--cp-ink);
          border-color: var(--cp-ink);
          color: var(--cp-surface);
        }

        .custom-date-wrapper {
          position: relative;
          overflow: hidden; /* iOS 달력이 칩 밖으로 삐져나오는 것을 막는다 */
        }

        .hidden-date-input {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          z-index: 10;
        }

        /* 달력을 부르는 아이콘의 클릭 영역을 칩 전체로 넓힌다. */
        .hidden-date-input::-webkit-calendar-picker-indicator {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          opacity: 0;
          cursor: pointer;
        }

        .preference-content {
          max-height: 0;
          opacity: 0;
          overflow: hidden;
          transition: max-height 0.3s ease-in-out, opacity 0.3s ease-in-out;
          pointer-events: none;
        }

        .preference-content.active {
          max-height: 1000px;
          opacity: 1;
          pointer-events: auto;
        }

        /* ====== 선택 카드 ====== */
        .card-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
          margin-bottom: 2rem;
        }

        .preference-card {
          position: relative;
          background: var(--cp-surface);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-radius);
          padding: 1.35rem 1rem;
          cursor: pointer;
          text-align: center;
          color: var(--cp-ink);
          transition: background 0.12s linear, color 0.12s linear, border-color 0.12s linear;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        /* 그림자·이동 대신 선만 진해진다. 저사양 기기에서 리페인트가 가볍다. */
        .preference-card:hover {
          border-color: var(--cp-ink);
        }

        /* 고른 것은 색이 아니라 반전으로. 일차 탭·주 버튼과 같은 어휘다. */
        .preference-card.selected {
          background: var(--cp-ink);
          border-color: var(--cp-ink);
          color: var(--cp-surface);
        }

        .card-icon {
          display: flex;
          justify-content: center;
          margin-bottom: 0.6rem;
          color: var(--cp-ink-2);
        }

        /* 아이콘은 한 벌(기본 15px)이고 크기는 쓰는 자리가 정한다.
           카드를 구분하는 유일한 그림이라 여기서는 크게 그린다. */
        .card-icon svg {
          width: 26px;
          height: 26px;
        }

        .preference-card.selected .card-icon {
          color: var(--cp-surface);
        }

        .card-title {
          font-size: 0.95rem;
          font-weight: 700;
          margin-bottom: 0.3rem;
          word-break: keep-all;
        }

        .card-desc {
          font-size: 0.76rem;
          line-height: 1.45;
          color: var(--cp-muted);
          word-break: keep-all;
        }

        .preference-card.selected .card-desc {
          color: var(--cp-surface);
          opacity: 0.75;
        }

        /* ====== 예산 ======
           💰 💵 🪙 는 셋 다 "돈"이라 어느 쪽이 비싼지 그림만으로는 알 수 없었다.
           채워진 막대 개수로 바꾸면 순서가 그림 자체에 들어간다. */
        .card-grid.budget {
          grid-template-columns: repeat(3, 1fr);
        }

        .budget .preference-card {
          padding: 1.15rem 0.85rem;
        }

        .budget-meter {
          display: inline-flex;
          align-items: flex-end;
          gap: 3px;
          height: 22px;
        }

        .budget-meter i {
          width: 6px;
          border: var(--cp-hair) solid currentColor;
          background: transparent;
        }

        .budget-meter i:nth-child(1) { height: 9px; }
        .budget-meter i:nth-child(2) { height: 15px; }
        .budget-meter i:nth-child(3) { height: 21px; }

        .budget-meter[data-level="1"] i:nth-child(-n+1),
        .budget-meter[data-level="2"] i:nth-child(-n+2),
        .budget-meter[data-level="3"] i:nth-child(-n+3) {
          background: currentColor;
        }

        /* ====== 다음 단계 ====== */
        .submit-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 1rem;
        }

        .submit-row {
          display: flex;
          gap: 0.75rem;
          width: 100%;
          max-width: 400px;
        }

        .next-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: var(--cp-ink);
          color: var(--cp-surface);
          border: var(--cp-hair) solid var(--cp-ink);
          border-radius: var(--cp-radius);
          padding: 0.9rem 2rem;
          font-family: inherit;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          cursor: pointer;
          width: 100%;
          max-width: 400px;
          transition: background 0.12s linear, color 0.12s linear;
        }

        .next-btn:hover:not(:disabled),
        .next-btn:focus-visible:not(:disabled) {
          background: var(--cp-surface);
          color: var(--cp-ink);
        }

        .next-btn:disabled {
          background: var(--cp-sunken);
          border-color: var(--cp-rule);
          color: var(--cp-muted);
          cursor: not-allowed;
        }

        .submit-row .next-btn {
          flex: 2;
          max-width: none;
        }

        .prev-btn {
          flex: 1;
          background: transparent;
          color: var(--cp-ink-2);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-radius);
          padding: 0.9rem 1rem;
          font-family: inherit;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.12s linear, color 0.12s linear, border-color 0.12s linear;
        }

        .prev-btn:hover,
        .prev-btn:focus-visible {
          background: var(--cp-ink);
          border-color: var(--cp-ink);
          color: var(--cp-surface);
        }

        .helper-text {
          font-size: 0.8rem;
          color: var(--cp-muted);
          margin-top: 0.75rem;
          word-break: keep-all;
        }

        .skip-link {
          display: block;
          text-align: center;
          margin-top: 1rem;
          font-size: 0.85rem;
          font-family: inherit;
          font-weight: 600;
          color: var(--cp-muted);
          cursor: pointer;
          background: none;
          border: none;
          text-decoration: underline;
          text-underline-offset: 3px;
          transition: color 0.12s linear;
        }

        .skip-link:hover,
        .skip-link:focus-visible {
          color: var(--cp-ink);
        }

        /* ====== 좁은 화면 ====== */
        @media (max-width: 500px) {
          :host {
            padding: 1.5rem 1rem 2.5rem;
          }

          .preference-header h2 {
            font-size: 1.35rem;
          }

          .card-grid {
            gap: 0.6rem;
          }

          /* 예산은 순서가 있는 선택지라, 좁을 때 한 줄로 세워야
             "위가 비싸고 아래가 싸다"가 그대로 읽힌다. */
          .card-grid.budget {
            grid-template-columns: 1fr;
          }

          .budget .preference-card {
            display: flex;
            align-items: center;
            gap: 0.9rem;
            text-align: left;
            padding: 0.9rem 1rem;
          }

          .budget .card-icon {
            margin-bottom: 0;
          }

          .preference-card {
            padding: 1.15rem 0.85rem;
          }
        }

        /* 이 화면은 통째로 "고르는" 화면이라 탭 대상이 곧 화면 전체다. */
        @media (pointer: coarse) {
          .date-chip {
            min-height: 44px;
          }

          .preference-card {
            min-height: 44px;
          }

          .next-btn,
          .prev-btn {
            min-height: 44px;
          }

          .skip-link {
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
        }
`;
