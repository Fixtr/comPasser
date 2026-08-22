export const itineraryStyles = `
        :host {
          display: block;
          /* 카드가 흰색이므로 호스트는 한 톤 낮은 지면을 깐다.
             그래야 그림자 없이도 층이 읽힌다. */
          background: var(--cp-paper);
          color: var(--cp-ink);
          font-family: var(--cp-font);
          padding: 2rem;
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
          transform: translateY(-1px);
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
          transform: translateY(-1px);
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
          background: rgba(255, 255, 255, 0.75);
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
          gap: 1rem;
          font-size: 0.85rem;
          color: var(--cp-ink-2);
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
          transform: translateY(-2px);
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
          transform: translateY(-2px);
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
          transform: translateY(-1px);
        }

        .rec-btn.direction {
          color: var(--cp-ink-2);
          border-color: var(--cp-rule);
          background: var(--cp-sunken);
        }

        .rec-btn.direction:hover {
          background: var(--cp-rule);
          transform: translateY(-1px);
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
          font-family: var(--cp-mono);
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.1em;
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
          background: var(--cp-sunken);
          color: var(--cp-ink);
          border: 2px solid var(--cp-ink);
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 0;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          display: none;
        }

        .save-btn:hover {
          background: var(--cp-ink);
          color: var(--cp-surface);
        }

        .save-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .share-btn {
          margin-top: 1rem;
          background: var(--cp-paper);
          color: var(--cp-ink);
          border: 2px solid var(--cp-ink);
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 0;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          display: none;
        }

        .share-btn:hover {
          background: var(--cp-sunken);
          transform: translateY(-2px);
        }

        .share-btn:active {
          transform: translateY(0);
        }

        .kakao-share-btn {
          margin-top: 1rem;
          background: var(--cp-kakao);
          color: var(--cp-kakao-ink);
          border: none;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 0;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          display: none;
        }

        .kakao-share-btn:hover {
          transform: translateY(-2px);
          filter: brightness(0.95);
        }

        .kakao-share-btn:active {
          transform: translateY(0);
        }

        .download-btn {
          margin-top: 1rem;
          background: var(--cp-sunken);
          color: var(--cp-surface);
          border: none;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 0;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          display: none;
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        .download-btn:hover {
          transform: translateY(-2px);
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


      
`;
