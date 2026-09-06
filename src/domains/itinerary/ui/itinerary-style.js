export const itineraryStyles = `
        :host {
          display: block;
          /* 카드가 흰색이므로 호스트는 한 톤 낮은 지면을 깐다.
             그래야 그림자 없이도 층이 읽힌다. */
          background: var(--cp-paper);
          color: var(--cp-ink);
          font-family: var(--cp-font);
          /* 이 컴포넌트는 결과 화면의 시트 안에 들어간다. 좌우 여백은 시트
             (.sheet-body)가 이미 갖고 있으므로 여기서 또 주면 두 겹이 된다.
             예전에는 전역 리셋이 이 값을 눌러 0 이었는데, 리셋에서 padding 을
             빼면서 비로소 적용되기 시작했다 — 그래서 명시적으로 0 으로 둔다. */
          padding: 0;
          border-radius: 0;
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
          color: var(--cp-ink);
          margin-bottom: 1.5rem;
          border-bottom: 2px solid var(--cp-sunken);
          padding-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .shared-notice {
          background: var(--cp-sunken);
          border: 1px solid var(--cp-rule);
          color: var(--cp-ink-2);
          padding: 0.9rem 1rem;
          margin: 0 0 0.75rem;
          font-size: 0.9rem;
          line-height: 1.55;
        }

        .fallback-warning {
          background: var(--cp-danger-bg);
          border: 1px solid var(--cp-danger);
          border-left: 4px solid var(--cp-danger);
          color: var(--cp-danger);
          border-radius: 0;
          padding: 0.9rem 1rem;
          margin-bottom: 0.75rem;
          font-size: 0.9rem;
          font-weight: 700;
          line-height: 1.55;
        }

        .transit-notice {
          background: var(--cp-sunken);
          border: 1px solid var(--cp-rule);
          border-left: 4px solid var(--cp-ink);
          color: var(--cp-ink-2);
          border-radius: 0;
          padding: 0.85rem 1rem;
          margin-bottom: 0.75rem;
          font-size: 0.88rem;
          font-weight: 600;
          line-height: 1.5;
        }

        .end-time-warning {
          background: var(--cp-warn-bg);
          border: 1px solid var(--cp-warn);
          border-left: 4px solid var(--cp-warn);
          color: var(--cp-warn);
          border-radius: 0;
          padding: 0.85rem 1rem;
          margin-bottom: 1.25rem;
          font-size: 0.9rem;
          font-weight: 600;
          line-height: 1.5;
        }

        .insert-slot {
          padding-left: calc(100px + 2rem);
          margin-block: -0.35rem;
          position: relative;
          z-index: 1;
        }
        .insert-slot-btn {
          background: transparent;
          border: 1px dashed var(--cp-rule);
          color: var(--cp-muted);
          border-radius: 0;
          padding: 0.3rem 0.8rem;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          opacity: 0.5;
          transition: opacity 0.15s, border-color 0.15s, color 0.15s;
        }
        .insert-slot:hover .insert-slot-btn,
        .insert-slot-btn:focus-visible {
          opacity: 1;
          border-color: var(--cp-ink);
          color: var(--cp-ink);
        }
        .insert-form {
          display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem;
          background: var(--cp-surface); border: 1px solid var(--cp-ink);
          border-radius: 0; padding: 0.6rem 0.75rem;
        }
        .insert-input {
          flex: 1; min-width: 9rem; padding: 0.4rem 0.6rem;
          border: 1px solid var(--cp-rule); border-radius: 0;
          font-family: inherit; font-size: 0.88rem;
        }
        .insert-stay { display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; color: var(--cp-ink-2); }
        .insert-stay-select { padding: 0.35rem 0.4rem; border: 1px solid var(--cp-rule); border-radius: 0; font-family: inherit; font-size: 0.82rem; }
        .insert-confirm {
          background: var(--cp-ink); color: var(--cp-surface); border: none;
          border-radius: 0; padding: 0.4rem 0.85rem; font-size: 0.85rem; font-weight: 700; cursor: pointer;
        }
        .insert-cancel {
          background: transparent; color: var(--cp-ink-2); border: 1px solid var(--cp-rule);
          border-radius: 0; padding: 0.4rem 0.75rem; font-size: 0.85rem; font-weight: 600; cursor: pointer;
        }
        /* 왼쪽 띠 자리는 고정 일정이 쓰므로, 사용자가 추가한 항목은
           점선 테두리로 구분한다. 같은 자리에 두 뜻을 겹치지 않는다. */
        .schedule-card[data-added="true"] {
          border-style: dashed;
          border-left-style: solid;
        }

        .resolved-place {
          /* 아이콘과 글자는 이제 별개의 요소다. 주소가 두 줄로 접혀도
             아이콘은 첫 줄 옆에 남아야 하므로 flex-start 로 붙인다. */
          display: flex;
          align-items: flex-start;
          gap: 0.35rem;
          font-size: 0.78rem;
          color: var(--cp-ink-2);
          background: var(--cp-surface);
          border: 1px solid var(--cp-rule);
          border-radius: 0;
          padding: 0.3rem 0.55rem;
          margin-bottom: 0.5rem;
          line-height: 1.45;
          word-break: keep-all;
        }
        /* 위의 display:flex 는 hidden 의 기본 display:none 을 이긴다.
           예전처럼 JS 가 인라인 display 를 껐다 켰다 하면 레이아웃이 두 곳에
           나뉘므로, 감추는 일도 여기서 한다. */
        .resolved-place[hidden] {
          display: none;
        }

        /* 적어둔 이름과 다른 곳을 찾았으면 눈에 띄게 */
        .resolved-place.mismatch {
          background: var(--cp-warn-bg);
          border-color: var(--cp-warn);
          color: var(--cp-warn);
          font-weight: 600;
        }

        .schedule-title-row {
          display: flex; align-items: center; justify-content: space-between;
          gap: 0.5rem; margin-bottom: 0.35rem;
        }
        .item-edit-actions { display: flex; gap: 0.2rem; flex-shrink: 0; }
        .item-edit-btn {
          background: transparent; border: 1px solid var(--cp-rule); color: var(--cp-muted);
          border-radius: 0; width: 1.65rem; height: 1.65rem; line-height: 1;
          font-size: 0.8rem; cursor: pointer; padding: 0;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .item-edit-btn:hover, .item-edit-btn:focus-visible {
          background: var(--cp-sunken); color: var(--cp-ink); border-color: var(--cp-rule);
        }
        .item-edit-btn.danger:hover, .item-edit-btn.danger:focus-visible {
          background: var(--cp-danger-bg); color: var(--cp-danger); border-color: var(--cp-danger);
        }

        .end-time-fix-btn {
          display: inline-block;
          margin-left: 0.6rem;
          background: var(--cp-warn);
          color: var(--cp-surface);
          border: none;
          border-radius: 0;
          padding: 0.35rem 0.8rem;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
        }
        .end-time-fix-btn:hover { background: var(--cp-warn); }

        .cost-summary {
          background: var(--cp-sunken);
          border: 1px solid var(--cp-rule);
          border-left: 4px solid var(--cp-ink-2);
          color: var(--cp-ink-2);
          border-radius: 0;
          padding: 0.8rem 1rem;
          margin-bottom: 1.25rem;
          font-size: 0.92rem;
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
          background: var(--cp-rule);
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
          font-family: var(--cp-mono);
          font-variant-numeric: tabular-nums;
          color: var(--cp-ink-2);
          text-align: right;
          padding-top: 0.2rem;
        }

        .schedule-card {
          flex-grow: 1;
          background: var(--cp-surface);
          padding: 1.15rem 1.25rem;
          border-radius: 0;
          border: var(--cp-hair) solid var(--cp-rule);
          /* 고정 일정이 아닌 카드는 왼쪽 띠를 투명하게 비워 둔다.
             띠가 생겼다 사라지면 글이 좌우로 밀리므로 자리는 늘 잡아 둔다. */
          border-left: 3px solid transparent;
          position: relative;
          transition: border-color 0.12s linear;
        }

        /* 그림자·이동 대신 선만 진해진다. 저사양 기기에서 리페인트가 가볍다. */
        .schedule-card:hover {
          border-color: var(--cp-ink);
          border-left-color: transparent;
        }
        
        /* Node marker */
        .schedule-card::before {
          content: attr(data-index);
          position: absolute;
          left: -1rem;
          top: 1rem;
          width: 24px;
          height: 24px;
          border-radius: 0;
          background: var(--cp-surface);
          border: var(--cp-hair) solid var(--cp-ink);
          color: var(--cp-ink);
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.8rem;
        }

        /* 고정 일정의 신호는 "왼쪽 띠" 하나다.
           예전에는 배경 틴트 + 테두리 + 번호 노드 색까지 셋이 동시에 걸려
           있어서 무엇이 신호인지 흐려졌다. 하나만 남기면 오히려 강해진다.
           띠 색은 지도 핀의 Anchor 색과 같은 토큰이라, 목록과 지도가 같은
           것을 가리킨다는 사실이 색만으로 읽힌다. */
        .schedule-card[data-type="AnchorSchedule"] {
          border-left-color: var(--cp-anchor);
        }

        .schedule-card[data-type="AnchorSchedule"]:hover {
          border-color: var(--cp-ink);
          border-left-color: var(--cp-anchor);
        }

        .schedule-card[data-type="AnchorSchedule"]::before {
          background: var(--cp-anchor);
          border-color: var(--cp-anchor);
          color: var(--cp-surface);
        }

        /* 그날의 첫 장소도 지도 핀과 같은 색을 쓴다. */
        .timeline-item:first-child .schedule-card::before {
          background: var(--cp-start);
          border-color: var(--cp-start);
          color: var(--cp-surface);
        }

        /* ====== Transit Info (Upgraded) ====== */
        .transit-info {
          padding-left: calc(100px + 2rem);
          margin-block: -0.25rem;
          font-size: 0.85rem;
          color: var(--cp-ink-2);
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
          border-radius: 0;
          border: 1px solid;
          transition: transform 0.2s, box-shadow 0.2s;
          min-width: 200px;
        }

        .transit-card:hover {
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
          color: var(--cp-ink);
        }

        .transit-distance {
          font-size: 0.8rem;
          color: var(--cp-ink-2);
          opacity: 0.7;
        }

        .transit-extended-info {
          margin-left: 1rem;
          font-size: 0.8rem;
          color: var(--cp-ink-2);
          background: var(--cp-surface);
          padding: 0.4rem 0.8rem;
          border-radius: 0;
          border: 1px solid var(--cp-rule);
          display: inline-block;
        }

        .transit-info.hidden {
          display: none;
        }

        /* ====== Transit Segment Card (per-step breakdown) ====== */
        .transit-seg-card {
          width: 100%;
          border: 1px solid var(--cp-rule);
          background: var(--cp-sunken);
          border-radius: 0;
          padding: 0.6rem 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          box-sizing: border-box;
        }

        .transit-seg-card.clickable {
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .transit-seg-card.clickable:hover {
        }

        .transit-seg-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.5rem;
          font-weight: 800;
          font-size: 0.8rem;
          color: var(--cp-ink-2);
        }

        .transit-seg-total {
          font-weight: 700;
          font-size: 0.78rem;
          color: var(--cp-ink-2);
          white-space: nowrap;
        }

        .transit-steps {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .transit-step {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.4rem;
          font-size: 0.85rem;
          padding: 0.35rem 0.55rem;
          border-radius: 0;
          border: 1px solid var(--cp-rule);
          /* 예전에는 rgba(255,255,255,0.75) 였다. 다크 모드에서
             밝은 글씨가 거의 흰 상자에 얹혀 읽히지 않았다. */
          background: var(--cp-surface);
        }

        .transit-step .step-icon {
          font-size: 1rem;
        }

        .transit-step .step-main {
          font-weight: 700;
        }

        .transit-step .step-time {
          font-weight: 600;
          font-size: 0.8rem;
          color: var(--cp-ink);
        }

        .transit-step .step-stops {
          flex-basis: 100%;
          font-size: 0.78rem;
          color: var(--cp-ink-2);
          padding-left: 1.6rem;
        }

        .transit-verify {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--cp-ink-2);
        }

        /* Legacy pill (keep for fallback) */
        .transit-pill {
          background: var(--cp-sunken);
          padding: 0.3rem 0.8rem;
          border-radius: 0;
          border: 1px dashed var(--cp-rule);
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-weight: 500;
        }

        .schedule-title {
          font-weight: 700;
          font-size: 1.1rem;
          margin-bottom: 0.25rem;
          color: var(--cp-ink);
        }

        .schedule-desc {
          color: var(--cp-ink-2);
          font-size: 0.95rem;
          line-height: 1.4;
          margin-bottom: 0.75rem;
        }

        .schedule-meta {
          display: flex;
          /* 좁은 화면에서 항목 사이가 아니라 항목 안에서 줄이 바뀌어
             "30 / 분" 처럼 끊기던 문제. 줄바꿈은 항목 경계에서만 일어나게 한다. */
          flex-wrap: wrap;
          gap: 0.35rem 1rem;
          font-size: 0.85rem;
          color: var(--cp-ink-2);
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          /* 장소 이름은 길어서 접혀도 되지만, 시간·거리 같은 짧은 값은
             한 덩어리로 읽혀야 한다. */
          min-width: 0;
        }

        .meta-item > * {
          min-width: 0;
        }

        .meta-item:not(:first-child) {
          white-space: nowrap;
        }

        .gemini-transit-meta {
          white-space: nowrap;
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
          border-radius: 0;
          font-size: 0.8rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s ease;
          background: var(--cp-surface);
          color: var(--cp-ink-2);
          border: 1px solid var(--cp-rule);
        }

        .action-link-badge.primary {
          background: var(--cp-sunken);
          color: var(--cp-ink);
          border-color: var(--cp-sunken);
        }

        .action-link-badge:hover {
          background: var(--cp-surface);
        }

        .nav-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.45rem 0.85rem;
          border-radius: 0;
          font-size: 0.8rem;
          font-weight: 700;
          border: 1.5px solid var(--cp-ink-2);
          background: var(--cp-sunken);
          color: var(--cp-ink-2);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .nav-btn:hover {
          background: var(--cp-sunken);
        }

        /* ====== Top3 추천 리스트 버튼 ====== */
        .rec-list {
          margin-top: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .rec-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.83rem;
          color: var(--cp-ink-2);
          flex-wrap: wrap;
        }

        .rec-rank {
          font-weight: 800;
          color: var(--cp-ink);
          min-width: 1.2rem;
        }

        .rec-name {
          flex: 1;
          font-weight: 600;
        }

        .rec-rating {
          color: var(--cp-warn);
          font-weight: 700;
          font-size: 0.8rem;
        }

        .rec-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.2rem;
          padding: 0.22rem 0.6rem;
          border-radius: 0;
          font-size: 0.75rem;
          font-weight: 700;
          text-decoration: none;
          border: 1.5px solid;
          cursor: pointer;
          background: transparent;
          transition: all 0.18s ease;
          line-height: 1.4;
        }

        .rec-btn.review {
          color: var(--cp-ink-2);
          border-color: var(--cp-rule);
          background: var(--cp-sunken);
        }

        .rec-btn.review:hover {
          background: var(--cp-sunken);
        }

        .rec-btn.direction {
          color: var(--cp-ink-2);
          border-color: var(--cp-rule);
          background: var(--cp-sunken);
        }

        .rec-btn.direction:hover {
          background: var(--cp-rule);
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
          background: var(--cp-sunken);
          border-left: 3px solid var(--cp-rule);
          border-radius: 0;
          display: flex;
          gap: 0.5rem;
          align-items: flex-start;
          font-size: 0.82rem;
          color: var(--cp-ink-2);
          line-height: 1.4;
          animation: quickInfoFade 0.4s ease-out;
        }

        .quick-info-box.structured {
          display: block;
          padding: 1rem 1.25rem;
          background: var(--cp-sunken);
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
          font-family: inherit;
          font-size: 0.68rem;
          font-weight: 600;
          /* 자간을 주지 않는다. 대문자 라틴 라벨에는 어울리는 장식이지만
             한글에는 **음절 사이가 벌어지고 띄어쓰기가 두 칸처럼** 보인다
             ("시작 시간" 이 "시작  시간" 으로 읽혔다). 이 앱의 기본 언어가
             한국어라 여기서는 자간을 빼는 쪽이 맞다. 모노·대문자 표기는
             그대로 두어 "라벨"이라는 성격은 유지한다. */
          letter-spacing: normal;
          text-transform: uppercase;
          color: var(--cp-muted);
          min-width: 0;
          display: inline-block;
        }

        .info-value {
          color: var(--cp-ink-2);
          line-height: 1.5;
        }

        /* 현지 팁은 외국인 사용자에게 방문 여부를 가르는 정보다(영어 메뉴
           유무, 택스프리, 대기시간). 다른 메타 정보와 같은 회색 줄에 두면
           묻히므로 한 칸 올린다. 값이 비면 줄 자체를 감춘다 —
           "현지 팁: —" 는 정보가 없다는 뜻이 아니라 앱이 부실하다는 인상만
           남긴다. 감추는 판단은 itinerary-view 의 렌더 쪽에 있다. */
        .info-row.tip {
          display: block;
          border: var(--cp-hair) solid var(--cp-rule);
          border-left: 3px solid var(--cp-ink);
          background: var(--cp-sunken);
          padding: 0.55rem 0.7rem;
          margin-top: 0.15rem;
        }

        .info-row.tip .info-icon { display: none; }

        .info-row.tip .info-label {
          display: block;
          color: var(--cp-ink);
          margin-bottom: 0.15rem;
        }

        /* ====== 인라인 SVG 아이콘 ====== */
        .meta-item svg,
        .info-icon svg,
        .gemini-transit svg,
        .action-link-badge svg,
        .nav-btn svg,
        #cost-summary svg {
          display: inline-block;
          vertical-align: -0.15em;
          flex-shrink: 0;
        }

        .info-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--cp-muted);
        }

        /* AI 추정 이동 안내. 실제 경로가 도착하면 감춰진다. */
        .gemini-transit {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-top: 0.5rem;
          padding: 0.4rem 0.6rem;
          background: var(--cp-sunken);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: 0;
          color: var(--cp-ink-2);
          font-weight: 500;
          font-size: 0.84rem;
        }

        /* 아이콘 + 문구를 한 줄로. display 는 JS 가 flex 로 켠다. */
        #cost-summary,
        #transit-notice {
          align-items: center;
          gap: 0.5rem;
        }

        #transit-notice svg,
        #cost-summary svg { flex-shrink: 0; }

        .info-row.tip .info-value {
          color: var(--cp-ink);
          font-size: 0.88rem;
        }

        /* ====== Buttons ====== */
        .loader {
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 0;
          color: var(--cp-ink-2);
        }

        .loader.active {
          display: flex;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--cp-sunken);
          border-top-color: var(--cp-ink);
          border-radius: 0;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* ====== 일차 탭 ======
           예전에는 활성 탭이 보라 알약이었다. 보라는 지도에서 "고정 일정"을
           뜻하는 색이라, 탭이 그 색을 먼저 쓰면 화면 안에서 보라가 두 가지를
           뜻하게 된다. 활성 표시는 색이 아니라 반전으로 한다.
           (스타일이 전부 itinerary-view.js 의 인라인이라 이 계약 밖에 있었다.) */
        .day-tabs-container {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          padding-bottom: 0.5rem;
          margin-bottom: 1rem;
          border-bottom: var(--cp-hair) solid var(--cp-rule);
        }

        .day-tab-btn {
          flex-shrink: 0;
          padding: 0.5rem 0.9rem;
          background: var(--cp-surface);
          color: var(--cp-ink-2);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: 0;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 600;
          line-height: 1.3;
          text-align: center;
          cursor: pointer;
          transition: background 0.12s linear, color 0.12s linear, border-color 0.12s linear;
        }

        .day-tab-btn:hover {
          border-color: var(--cp-ink);
          color: var(--cp-ink);
        }

        .day-tab-btn.active {
          background: var(--cp-ink);
          border-color: var(--cp-ink);
          color: var(--cp-surface);
        }

        .day-tab-btn .tab-date {
          display: block;
          font-family: var(--cp-mono);
          font-size: 0.72rem;
          font-weight: 400;
          opacity: 0.75;
        }

        /* ====== 빈 상태 · 오류 상태 ======
           일정을 못 찾았을 때가 이 화면의 첫인상이 되는 경우가 있다.
           나머지 화면과 다른 표기를 쓰면 그 인상이 앱 전체로 번진다. */
        .state-block {
          padding: 2.5rem 1.25rem;
          text-align: center;
          background: var(--cp-surface);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: 0;
          color: var(--cp-ink-2);
        }

        .state-block.danger {
          background: var(--cp-danger-bg);
          border-color: var(--cp-danger);
          color: var(--cp-danger);
        }

        .state-icon {
          display: flex;
          justify-content: center;
          margin-bottom: 0.9rem;
          color: var(--cp-muted);
        }

        /* 기본 아이콘 크기(15px)는 본문 옆에 놓일 때의 값이다.
           빈 화면 한가운데서는 너무 작아 보이지 않는다. */
        .state-icon svg {
          width: 28px;
          height: 28px;
        }

        .state-block.danger .state-icon {
          color: var(--cp-danger);
        }

        .state-title {
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--cp-ink);
          margin-bottom: 0.5rem;
          line-height: 1.45;
          /* 없으면 폰 폭에서 "접근 권 / 한이" 처럼 낱말 가운데가 끊긴다. */
          word-break: keep-all;
        }

        .state-block.danger .state-title {
          color: var(--cp-danger);
        }

        .state-desc {
          font-size: 0.9rem;
          line-height: 1.6;
          margin-bottom: 1.5rem;
          word-break: keep-all;
        }

        .state-desc:last-child {
          margin-bottom: 0;
        }

        .state-action {
          background: var(--cp-ink);
          color: var(--cp-surface);
          border: var(--cp-hair) solid var(--cp-ink);
          border-radius: 0;
          padding: 0.7rem 1.4rem;
          font-family: inherit;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.12s linear, color 0.12s linear;
        }

        .state-action:hover,
        .state-action:focus-visible {
          background: var(--cp-surface);
          color: var(--cp-ink);
        }

        /* ====== 터치 기기 ======
           데스크톱의 밀도와 폰에서 손가락이 닿는 것은 서로 다른 요구다.
           하나의 값으로 타협하면 양쪽 다 잃으므로 포인터 종류로 가른다.
           데스크톱은 그대로 촘촘하게 두고, 터치에서만 넓힌다. */
        @media (pointer: coarse) {
          /* 26px 짜리 이동·삭제 버튼은 손가락으로 누르기엔 작다. 특히
             "빼기"는 잘못 눌렀을 때 되돌릴 수 없으므로 더 그렇다.
             처음엔 ::after 로 탭 영역만 넓혀 봤는데, 절대 배치된 가상 요소가
             오른쪽으로 삐져나가 부모의 scrollWidth 를 늘렸다. 그냥 버튼을
             키우고 제목과 같은 줄을 다투지 않게 아래로 내린다. */
          .schedule-title-row {
            flex-wrap: wrap;
          }
          .item-edit-actions {
            width: 100%;
            justify-content: flex-end;
            gap: 0.25rem;
          }
          .item-edit-btn {
            min-width: 44px;
            min-height: 44px;
          }

          .save-btn,
          .share-btn,
          .download-btn,
          .kakao-share-btn {
            min-height: 44px;
          }

          .nav-btn,
          .action-link-badge,
          .insert-slot-btn,
          .insert-confirm,
          .insert-cancel {
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }

          .insert-input,
          .insert-stay-select {
            min-height: 44px;
          }

          .day-tab-btn {
            min-height: 44px;
          }
        }

        /* ====== hover 가 없는 기기 ======
           "여기에 장소 추가" 는 평소 반투명이다가 hover 때 드러난다.
           터치에는 hover 가 없어서 폰에서는 영영 반투명한 채로 남는다. */
        @media (hover: none) {
          .insert-slot-btn {
            opacity: 1;
            border-style: dashed;
          }
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

        /* ====== 조작 묶음 ======
           예전에는 이 넷이 마크업의 style="display:flex; …" 안에 있었고,
           버튼마다 margin-top 이 따로 붙어 컨테이너의 gap 과 이중으로
           벌어졌다. 배치는 여기 한 곳에 있다. */
        .itinerary-actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 2rem;
        }

        /* 주 버튼은 엄지가 닿는 자리에 머문다.

           이 화면은 하루치 일정이 세로로 길게 이어지는데 "이 일정 저장하기"가
           그 맨 끝에 있었다. 만든 일정을 저장하려면 하루를 전부 스크롤해서
           내려가야 했다는 뜻이다. sticky 라 스크롤 중에는 바닥에 붙어 있다가
           제자리에 닿으면 자연스럽게 앉는다 — fixed 와 달리 마지막에 다른
           버튼을 가리지 않는다. */
        /* sticky 요소는 부모 상자를 벗어나지 못한다. 그래서 이 상자는
           조작 묶음이 아니라 **하루치 타임라인을 품은 #results 의 자식**이다.
           묶음 안에 두면 미끄러질 자리가 버튼 한 개 높이뿐이라 sticky 가
           아무 일도 하지 않는다. */
        .actions-primary {
          position: sticky;
          bottom: 0;
          margin-top: 0.5rem;
          z-index: 2;
          padding: 0.6rem 0 calc(0.6rem + env(safe-area-inset-bottom, 0px));
          /* 반투명이면 밑으로 지나가는 일정이 글자와 겹쳐 둘 다 안 읽힌다. */
          background: var(--cp-paper);
          border-top: var(--cp-hair) solid var(--cp-rule);
        }

        .actions-primary[hidden] {
          display: none;
        }

        /* 버튼 넷의 공통 몸. 예전에는 넷이 각자 같은 값을 따로 적고 있어서
           한 곳만 고쳐지는 날이 오게 돼 있었다. */
        .save-btn,
        .share-btn,
        .download-btn,
        .kakao-share-btn {
          width: 100%;
          padding: 1rem 2rem;
          font-family: inherit;
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          border-radius: var(--cp-radius);
          cursor: pointer;
          /* 들어올리기(translateY)와 brightness() 를 걷어냈다. 그림자가 없는
             방향에서 2px 올라가기만 하면 떠오르는 게 아니라 흔들린다. 게다가
             손가락 기기에는 hover 자체가 없다. */
          transition: background 0.12s linear, color 0.12s linear, border-color 0.12s linear;
        }

        /* 주 버튼 — 로그인 화면의 .auth-btn 과 같은 어휘(잉크로 채우고,
           눌릴 준비가 되면 뒤집는다). */
        .save-btn {
          background: var(--cp-ink);
          color: var(--cp-surface);
          border: var(--cp-hair) solid var(--cp-ink);
        }

        .save-btn:hover:not(:disabled),
        .save-btn:focus-visible:not(:disabled) {
          background: var(--cp-surface);
          color: var(--cp-ink);
        }

        .save-btn:disabled {
          background: var(--cp-sunken);
          border-color: var(--cp-rule);
          color: var(--cp-muted);
          cursor: not-allowed;
        }

        /* 곁 버튼들 — 테두리만 두르고 지면색을 쓴다. */
        .share-btn,
        .download-btn {
          background: var(--cp-surface);
          color: var(--cp-ink);
          border: var(--cp-hair) solid var(--cp-ink);
          display: none;
        }

        .share-btn:hover:not(:disabled),
        .share-btn:focus-visible:not(:disabled),
        .download-btn:hover:not(:disabled),
        .download-btn:focus-visible:not(:disabled) {
          background: var(--cp-sunken);
        }

        .share-btn:disabled,
        .download-btn:disabled {
          color: var(--cp-muted);
          border-color: var(--cp-rule);
          cursor: not-allowed;
        }

        /* 카카오만 색이 남는다 — 브랜드 가이드가 값을 못박고 있어서
           무채색으로 바꾸면 심사에서 막힌다. 로그인 화면의 .social-btn 과
           같은 처리(밝기를 건드리지 않고 테두리 한 겹을 더 두른다). */
        .kakao-share-btn {
          background: var(--cp-kakao);
          color: var(--cp-kakao-ink);
          border: var(--cp-hair) solid var(--cp-kakao);
          display: none;
          outline: 2px solid transparent;
          outline-offset: 2px;
          transition: outline-color 0.12s linear;
        }

        .kakao-share-btn:hover,
        .kakao-share-btn:focus-visible {
          outline-color: var(--cp-ink);
        }



      
`;
