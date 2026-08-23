/**
 * 여행 폼 스타일 — 결과 화면(itinerary-style.js)과 같은 계약을 따른다.
 *
 * 규칙 하나: **UI 는 무채색, 색은 지도 마커 규칙에만.**
 * 그래서 이 파일에서 유일하게 색이 나오는 곳은 `.anchor-item` 의 왼쪽 띠다.
 * 결과 화면의 고정 일정 카드가 쓰는 --cp-anchor 와 같은 값이라, 입력할 때
 * 본 보라 띠가 결과 타임라인과 지도 핀에서 그대로 다시 나온다.
 *
 * 형태(radius 0, 1px 실선, 그림자 없음)는 세 가지를 동시에 산다 —
 * 야외 가독성, 저사양 안드로이드 렌더 비용, html2canvas 캡처 호환.
 */
export const travelFormStyles = `
        :host {
          display: block;
          background: var(--cp-surface);
          color: var(--cp-ink);
          font-family: var(--cp-font);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-radius);
          padding: 2rem;
          container-type: inline-size;
        }

        /* 폰에서는 2rem 이 양쪽으로 64px 를 먹는다. 390px 화면에서 그 폭이면
           날짜 문자열이 칸을 넘는다. 컨테이너 쿼리로는 자기 자신을 못 고치니
           여기만 미디어 쿼리를 쓴다. */
        @media (max-width: 480px) {
          :host {
            padding: 1.25rem 1rem;
          }
        }

        h2 {
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--cp-ink);
          margin: 0 0 0.5rem;
          border-bottom: 2px solid var(--cp-sunken);
          padding-bottom: 0.6rem;
        }

        /* 첫 섹션 제목만 오른쪽에 "다시 선택하기"를 함께 얹는다.
           예전에는 이 배치가 travel-form.js 의 인라인 style 로 들어 있어
           스타일을 여기서 고쳐도 화면이 안 따라오는 곳이 있었다. */
        .section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .section-head-main {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .optional-note {
          font-size: 0.85rem;
          font-weight: 400;
          color: var(--cp-muted);
        }

        .link-btn {
          background: none;
          border: none;
          padding: 0;
          color: var(--cp-ink-2);
          font-family: inherit;
          font-size: 0.82rem;
          font-weight: 600;
          text-decoration: underline;
          text-underline-offset: 3px;
          white-space: nowrap;
          cursor: pointer;
        }

        .link-btn:hover,
        .link-btn:focus-visible {
          color: var(--cp-ink);
        }

        .subtitle {
          color: var(--cp-muted);
          margin: 0 0 1.5rem;
          font-size: 0.9rem;
          line-height: 1.55;
        }

        .form-section {
          margin-bottom: 2.25rem;
        }

        .form-group {
          margin-bottom: 0.9rem;
        }

        /* 라벨은 결과 화면의 .info-label 과 같은 표기(모노·대문자·자간)를 쓴다.
           영문이 한글보다 1.6배 길어지는 문자열이 60% 라, 라벨을 작게 눌러
           입력 칸이 먼저 보이게 한다. */
        label {
          display: block;
          margin-bottom: 0.4rem;
          font-family: var(--cp-mono);
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--cp-ink-2);
        }

        input,
        select {
          width: 100%;
          padding: 0.75rem 0.9rem;
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-radius);
          font-family: inherit;
          font-size: 0.95rem;
          background: var(--cp-surface);
          color: var(--cp-ink);
          transition: border-color 0.12s linear;
          box-sizing: border-box;
        }

        /* 보라 링(box-shadow) 대신 outline 하나로 초점을 알린다.
           그림자가 없어야 캡처와 저사양 기기가 같이 편하다. */
        input:focus,
        select:focus {
          outline: 2px solid var(--cp-ink);
          outline-offset: 2px;
          border-color: var(--cp-ink);
        }

        /* 선호 단계에서 날짜를 이미 고른 경우 날짜 칸은 읽기 전용이 된다.
           예전에는 이 회색을 travel-form.js 가 인라인으로 칠했다. */
        input[readonly] {
          background: var(--cp-sunken);
          color: var(--cp-ink-2);
          cursor: not-allowed;
          /* "2026-09-14 ~ 2026-09-16 (2박 3일)" 는 폰 폭에서 칸을 넘는다.
             그냥 잘리면 값이 끝났는지 더 있는지 알 수 없다. */
          text-overflow: ellipsis;
        }

        /* Google Maps Autocomplete 웹 컴포넌트.
           색은 전부 앱 토큰에서 내려보낸다 — OS 다크모드가 아니라 앱 테마를
           따라가게 하려는 것이 원래 의도였다. color-scheme 만 상속되지 않아
           :host-context 로 따로 맞춘다(미지원 브라우저는 라이트로 남는다). */
        gmp-place-autocomplete,
        gmp-basic-place-autocomplete {
          display: block;
          width: 100%;
          box-sizing: border-box;
          overflow: visible; /* 드롭다운 잘림 방지 */
          color-scheme: light;

          --gmpx-color-surface: var(--cp-surface);
          --gmpx-color-on-surface: var(--cp-ink);
          --gmpx-color-on-surface-variant: var(--cp-muted);
          color: var(--cp-ink);

          /* 'X' 버튼 배지 크기 최소화 */
          --gmp-place-autocomplete-icon-padding: 0px;

          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-radius);
          min-height: 48px;
          background-color: var(--cp-surface);
          transition: border-color 0.12s linear;
          position: relative;
          z-index: 10;
        }

        :host-context(body.dark) gmp-place-autocomplete,
        :host-context(body.dark) gmp-basic-place-autocomplete {
          color-scheme: dark;
        }

        /* 앵커 박스 안에서는 배경에 묻히도록 */
        .anchor-item gmp-place-autocomplete,
        .anchor-schedule-item gmp-place-autocomplete {
          --gmpx-color-surface: transparent;
          background-color: transparent;
        }

        gmp-place-autocomplete:focus-within {
          border-color: var(--cp-ink);
          outline: 2px solid var(--cp-ink);
          outline-offset: 2px;
        }

        .primary-btn {
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
          margin-top: 1rem;
          transition: background 0.12s linear, color 0.12s linear;
        }

        .primary-btn:hover:not(:disabled),
        .primary-btn:focus-visible:not(:disabled) {
          background: var(--cp-surface);
          color: var(--cp-ink);
        }

        .primary-btn:disabled {
          background: var(--cp-sunken);
          color: var(--cp-muted);
          border-color: var(--cp-rule);
          cursor: not-allowed;
        }

        .submit-row {
          display: flex;
          gap: 0.75rem;
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
          color: var(--cp-ink-2);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-radius);
          padding: 0.9rem 1.4rem;
          font-family: inherit;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.12s linear, color 0.12s linear, border-color 0.12s linear;
          white-space: nowrap;
        }

        .reset-btn:hover,
        .reset-btn:focus-visible {
          background: var(--cp-ink);
          color: var(--cp-surface);
          border-color: var(--cp-ink);
        }

        .reset-btn svg {
          width: 1.1rem;
          height: 1.1rem;
          stroke: currentColor;
          fill: none;
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        /* 앵커 추가는 "아직 비어 있는 자리"라 점선으로 둔다.
           결과 화면에서 사이에 장소를 끼워 넣는 버튼과 같은 표기다. */
        .secondary-btn {
          background: transparent;
          color: var(--cp-ink-2);
          border: var(--cp-hair) dashed var(--cp-rule);
          border-radius: var(--cp-radius);
          padding: 0.8rem 1rem;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          margin-bottom: 1rem;
          transition: border-color 0.12s linear, color 0.12s linear;
        }

        .secondary-btn:hover,
        .secondary-btn:focus-visible {
          border-color: var(--cp-ink);
          border-style: solid;
          color: var(--cp-ink);
        }

        /* ====== Preference Badges ====== */
        .preference-chips {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }

        /* 예전에는 보라 그라디언트 알약이었다. 색을 지도에만 남기기로 한
           이상, 앞 단계에서 고른 값은 테두리만으로 충분히 읽힌다. */
        .pref-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.28rem 0.7rem;
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-pill);
          background: var(--cp-surface);
          color: var(--cp-ink-2);
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: -0.01em;
          white-space: nowrap;
        }

        .pref-chip .chip-icon {
          display: inline-flex;
          align-items: center;
          color: var(--cp-muted);
        }

        .pref-chip .chip-icon svg {
          display: block;
          width: 13px;
          height: 13px;
        }

        /* 고정 일정. 왼쪽 보라 띠는 결과 화면의 카드·지도 핀과 같은 토큰이다. */
        .anchor-item {
          background: var(--cp-sunken);
          border: var(--cp-hair) solid var(--cp-rule);
          border-left: 3px solid var(--cp-anchor);
          border-radius: var(--cp-radius);
          padding: 1.15rem 1.25rem;
          margin-bottom: 0.75rem;
          position: relative;
          transition: border-color 0.12s linear;
        }

        .anchor-item:hover {
          border-color: var(--cp-ink);
          border-left-color: var(--cp-anchor);
        }

        .remove-btn {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          background: none;
          border: none;
          border-radius: var(--cp-radius);
          color: var(--cp-muted);
          font-size: 1.3rem;
          font-family: inherit;
          cursor: pointer;
          line-height: 1;
          padding: 0.3rem 0.55rem;
          transition: color 0.12s linear;
        }

        .remove-btn:hover,
        .remove-btn:focus-visible {
          color: var(--cp-danger);
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

        /* 좁은 화면에서는 "생성"이 위로 온다. 되돌리기 힘든 초기화 버튼이
           엄지 기본 위치에 오지 않게 하려는 것이다. */
        @container (max-width: 380px) {
          .submit-row {
            flex-direction: column-reverse;
          }
        }

        /* ====== Toggle Switch ====== */
        .toggle-container {
          display: inline-flex;
          align-items: center;
          gap: 0.7rem;
          cursor: pointer;
          user-select: none;
          padding: 0.4rem 0;
          margin-bottom: 0;
        }

        .toggle-container input {
          display: none;
        }

        .toggle-switch {
          position: relative;
          flex: 0 0 auto;
          width: 44px;
          height: 24px;
          background: var(--cp-surface);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-pill);
          transition: background-color 0.12s linear, border-color 0.12s linear;
        }

        .toggle-switch::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 18px;
          height: 18px;
          background: var(--cp-ink-2);
          border-radius: var(--cp-pill);
          transition: transform 0.12s linear, background-color 0.12s linear;
        }

        .toggle-container input:checked + .toggle-switch {
          background: var(--cp-ink);
          border-color: var(--cp-ink);
        }

        .toggle-container input:checked + .toggle-switch::after {
          background: var(--cp-surface);
          transform: translateX(20px);
        }

        /* label 규칙(모노·대문자)이 여기까지 상속되면 문장이 읽기 어려워진다. */
        .toggle-label {
          font-family: var(--cp-font);
          font-size: 0.92rem;
          font-weight: 600;
          letter-spacing: normal;
          text-transform: none;
          color: var(--cp-ink);
        }

        #daily-times-wrapper {
          margin-top: 1rem;
        }

        #daily-times-accordion {
          margin-top: 1rem;
          border-top: var(--cp-hair) dashed var(--cp-rule);
          padding-top: 1rem;
          transition: max-height 0.3s ease-in-out, opacity 0.3s ease-in-out;
          overflow: hidden;
        }

        .daily-time-row {
          background: var(--cp-sunken);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-radius);
          padding: 1rem;
          margin-bottom: 0.6rem;
        }

        .daily-time-row:last-child {
          margin-bottom: 0;
        }

        .daily-time-header {
          font-family: var(--cp-mono);
          font-weight: 700;
          font-size: 0.75rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--cp-ink);
          margin-bottom: 0.7rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        /* 손가락은 마우스보다 크다. 폼은 입력이 많아 오탭 비용이 특히 크고,
           앵커 삭제(×)는 되돌릴 수 없어 더 그렇다. */
        @media (pointer: coarse) {
          input,
          select {
            min-height: 44px;
            font-size: 16px; /* iOS Safari 가 16px 미만이면 초점 시 확대한다 */
          }

          gmp-place-autocomplete,
          gmp-basic-place-autocomplete {
            min-height: 44px;
          }

          .primary-btn,
          .reset-btn,
          .secondary-btn {
            min-height: 44px;
          }

          .remove-btn {
            min-width: 44px;
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            top: 0.35rem;
            right: 0.35rem;
          }

          .anchor-item {
            padding-right: 3.25rem;
          }

          .toggle-container {
            min-height: 44px;
          }

          /* 밑줄 글씨라 눈에는 18px 높이로 보인다. 손가락은 그 두 배가 필요하다. */
          .link-btn {
            min-height: 44px;
            display: inline-flex;
            align-items: center;
          }
        }
`;
