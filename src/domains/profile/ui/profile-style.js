/**
 * 프로필 화면 스타일.
 *
 * 마지막으로 옮기는 화면이다. 여기까지 끝나야 `style.css` 의 옛 변수
 * (`--bg-primary` 계열)를 지울 수 있다.
 *
 * 이 화면에서 특별히 신경 쓴 것 —
 *  1) "지금 보고 있는 메뉴"를 보라 배경이 아니라 **잉크 반전**으로. 앱
 *     전체(일차 탭·선호 카드·날짜 칩)가 이미 그 표기를 쓴다. 보라는 지도의
 *     "고정 일정" 색이라 다른 뜻으로 쓰면 안 된다.
 *  2) 삭제·탈퇴는 되돌릴 수 없다. 상태색(`--cp-danger`)은 여기서 유지한다 —
 *     무채색으로 눌러 버리면 위험이 안 읽힌다.
 *  3) 모달 가림막은 `--cp-scrim` 토큰. `backdrop-filter: blur()` 는 저사양
 *     안드로이드에서 비싸고 캡처가 못 읽어(PRD 3.7) 빼냈다.
 */
export const profileStyles = `
                *,
                *::before,
                *::after {
                    box-sizing: border-box;
                }

                :host {
                    display: block;
                    width: 100%;
                    min-height: 100vh;
                    background-color: var(--cp-paper);
                    color: var(--cp-ink);
                    font-family: var(--cp-font);
                }

                .profile-wrapper {
                    max-width: 1200px;
                    margin: 0 auto;
                    display: flex;
                    gap: 2rem;
                    padding: 2.5rem 1.5rem;
                }

                /* ====== 사이드바 ====== */
                .sidebar {
                    width: 260px;
                    flex-shrink: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }

                .btn-back-home {
                    display: flex;
                    align-items: center;
                    gap: 0.7rem;
                    padding: 0.8rem 1rem;
                    margin-bottom: 1rem;
                    border-radius: var(--cp-radius);
                    background: var(--cp-surface);
                    border: var(--cp-hair) solid var(--cp-rule);
                    color: var(--cp-ink);
                    font-family: inherit;
                    font-size: 0.92rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: background 0.12s linear, color 0.12s linear, border-color 0.12s linear;
                }

                .btn-back-home:hover,
                .btn-back-home:focus-visible {
                    background: var(--cp-ink);
                    border-color: var(--cp-ink);
                    color: var(--cp-surface);
                }

                .nav-item {
                    /* button 으로 바꾸면서 브라우저 기본 스타일을 지운다 */
                    appearance: none;
                    background: transparent;
                    border: var(--cp-hair) solid transparent;
                    font: inherit;
                    text-align: left;
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 0.8rem;
                    padding: 0.8rem 1rem;
                    border-radius: var(--cp-radius);
                    cursor: pointer;
                    font-size: 0.95rem;
                    font-weight: 600;
                    color: var(--cp-ink-2);
                    transition: background 0.12s linear, color 0.12s linear, border-color 0.12s linear;
                    user-select: none;
                }

                .nav-item:hover {
                    border-color: var(--cp-rule);
                    color: var(--cp-ink);
                }

                /* 앱 전체가 쓰는 "지금 이것" 표기. 색이 아니라 반전이다. */
                .nav-item.active {
                    background: var(--cp-ink);
                    border-color: var(--cp-ink);
                    color: var(--cp-surface);
                }

                .nav-icon {
                    display: inline-flex;
                    flex-shrink: 0;
                }

                .nav-icon svg {
                    width: 17px;
                    height: 17px;
                }

                /* ====== 본문 ====== */
                .main-content {
                    flex-grow: 1;
                    max-width: 800px;
                    min-width: 0;
                }

                .header-banner {
                    text-align: center;
                    margin-bottom: 2.5rem;
                }

                .photo-hero {
                    width: 88px;
                    height: 88px;
                    border-radius: var(--cp-pill);
                    object-fit: cover;
                    margin-bottom: 1.25rem;
                    border: var(--cp-hair) solid var(--cp-rule);
                }

                .header-banner h1 {
                    font-size: 1.7rem;
                    font-weight: 800;
                    margin: 0;
                    letter-spacing: -0.02em;
                    word-break: keep-all;
                }

                .header-banner p {
                    color: var(--cp-muted);
                    margin-top: 0.4rem;
                    font-size: 1rem;
                    word-break: break-all;
                }

                .content-section { display: none; }
                .content-section.active { display: block; }

                .card {
                    background: var(--cp-surface);
                    border: var(--cp-hair) solid var(--cp-rule);
                    border-radius: var(--cp-radius);
                    overflow: hidden;
                    margin-bottom: 1.5rem;
                }

                .card-header {
                    padding: 1.15rem 1.5rem;
                    border-bottom: var(--cp-hair) solid var(--cp-rule);
                }

                .card-header h2 { margin: 0; font-size: 1.15rem; font-weight: 700; }
                .card-header p { margin: 0.4rem 0 0; color: var(--cp-muted); font-size: 0.9rem; word-break: keep-all; }

                .list-item {
                    display: flex;
                    align-items: center;
                    padding: 1.15rem 1.5rem;
                    border-bottom: var(--cp-hair) solid var(--cp-rule);
                }

                .list-item:last-child { border-bottom: none; }

                /* 결과 화면 .info-label · 폼 label 과 같은 표기. */
                .list-label {
                    width: 30%;
                    font-family: inherit;
                    font-weight: 600;
                    color: var(--cp-muted);
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    /* 자간을 주지 않는다. 대문자 라틴 라벨에는 어울리는 장식이지만
             한글에는 **음절 사이가 벌어지고 띄어쓰기가 두 칸처럼** 보인다
             ("시작 시간" 이 "시작  시간" 으로 읽혔다). 이 앱의 기본 언어가
             한국어라 여기서는 자간을 빼는 쪽이 맞다. 모노·대문자 표기는
             그대로 두어 "라벨"이라는 성격은 유지한다. */
          letter-spacing: normal;
                }

                .list-value {
                    width: 70%;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 1rem;
                    min-width: 0;
                }

                .photo-small {
                    width: 52px;
                    height: 52px;
                    border-radius: var(--cp-pill);
                    object-fit: cover;
                    border: var(--cp-hair) solid var(--cp-rule);
                }

                .value-text { font-weight: 600; font-size: 1rem; }
                .not-set { color: var(--cp-muted); font-style: italic; font-size: 0.92rem; }

                /* ====== 인라인 편집 ====== */
                .edit-mode-container {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    width: 100%;
                }

                .inline-input {
                    flex-grow: 1;
                    min-width: 0;
                    padding: 0.6rem 0.85rem;
                    border-radius: var(--cp-radius);
                    border: var(--cp-hair) solid var(--cp-ink);
                    font-family: inherit;
                    font-size: 1rem;
                    outline: none;
                    background: var(--cp-surface);
                    color: var(--cp-ink);
                }

                .inline-input:focus {
                    outline: 2px solid var(--cp-ink);
                    outline-offset: 2px;
                }

                .edit-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }

                .btn-save,
                .btn-cancel,
                .btn-edit-inline {
                    padding: 0.5rem 0.8rem;
                    border-radius: var(--cp-radius);
                    font-family: inherit;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.12s linear, color 0.12s linear, border-color 0.12s linear;
                    border: var(--cp-hair) solid var(--cp-rule);
                    white-space: nowrap;
                }

                .btn-save {
                    background: var(--cp-ink);
                    border-color: var(--cp-ink);
                    color: var(--cp-surface);
                }

                .btn-save:hover,
                .btn-save:focus-visible {
                    background: var(--cp-surface);
                    color: var(--cp-ink);
                }

                .btn-cancel,
                .btn-edit-inline {
                    background: transparent;
                    color: var(--cp-ink-2);
                }

                .btn-cancel:hover,
                .btn-cancel:focus-visible,
                .btn-edit-inline:hover,
                .btn-edit-inline:focus-visible {
                    border-color: var(--cp-ink);
                    color: var(--cp-ink);
                }

                .value-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    min-width: 0;
                }

                /* ====== 내 여행 일정 ====== */
                .itineraries-container {
                    display: flex;
                    flex-direction: column;
                    gap: 0.6rem;
                    padding: 1rem;
                }

                .trip-card {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                    padding: 1.15rem 1.25rem;
                    background: var(--cp-sunken);
                    border: var(--cp-hair) solid var(--cp-rule);
                    border-radius: var(--cp-radius);
                    transition: border-color 0.12s linear;
                }

                .trip-card:hover { border-color: var(--cp-ink); }

                .trip-title-row {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    margin-bottom: 0.25rem;
                    flex-wrap: wrap;
                    min-width: 0;
                }

                .trip-title { font-weight: 700; color: var(--cp-ink); word-break: keep-all; }
                .trip-anchor-suffix { font-size: 0.85rem; color: var(--cp-muted); }
                .trip-date { font-size: 0.82rem; color: var(--cp-muted); font-family: var(--cp-mono); }
                .trip-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; flex-shrink: 0; }
                .public-course-editor { flex: 0 0 100%; display: grid; gap: 0.8rem; padding-top: 1rem; border-top: 1px solid var(--cp-rule); }
                .public-course-editor input[type="text"], .public-course-editor input[type="url"], .public-course-editor textarea { width: 100%; min-width: 0; box-sizing: border-box; min-height: 44px; padding: 0.7rem; font: inherit; color: var(--cp-ink); background: var(--cp-surface); border: 1px solid var(--cp-rule); }
                .public-course-editor textarea { min-height: 90px; resize: vertical; }
                .public-course-options { display: grid; gap: 0.45rem; }
                .public-course-options label { display: flex; align-items: flex-start; gap: 0.5rem; overflow-wrap: anywhere; }
                .public-course-options details { margin: 0 0 1rem; }
                .public-course-options details label { display: grid; margin-top: 0.65rem; }
                .public-course-options select, .public-course-options input[type=date] { min-height: 44px; padding: 0.6rem; font: inherit; color: var(--cp-ink); background: var(--cp-surface); border: 1px solid var(--cp-rule); }
                .public-course-options input { min-width: 20px; min-height: 20px; }
                .public-course-editor button, .btn-public-course { min-height: 44px; cursor: pointer; font: inherit; }

                .btn-rename {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    background: transparent;
                    border: var(--cp-hair) solid transparent;
                    cursor: pointer;
                    padding: 0.25rem;
                    border-radius: var(--cp-radius);
                    color: var(--cp-muted);
                    transition: color 0.12s linear, border-color 0.12s linear;
                }

                .btn-rename:hover,
                .btn-rename:focus-visible {
                    color: var(--cp-ink);
                    border-color: var(--cp-rule);
                }

                .rename-input {
                    flex: 1;
                    min-width: 10rem;
                    padding: 0.4rem 0.6rem;
                    border: var(--cp-hair) solid var(--cp-ink);
                    border-radius: var(--cp-radius);
                    font-family: inherit;
                    font-size: 0.95rem;
                    font-weight: 600;
                    background: var(--cp-surface);
                    color: var(--cp-ink);
                }

                .btn-rename-save {
                    background: var(--cp-ink);
                    color: var(--cp-surface);
                    border: var(--cp-hair) solid var(--cp-ink);
                    padding: 0.4rem 0.8rem;
                    border-radius: var(--cp-radius);
                    font-family: inherit;
                    font-weight: 700;
                    cursor: pointer;
                }

                .btn-rename-save:disabled {
                    background: var(--cp-sunken);
                    border-color: var(--cp-rule);
                    color: var(--cp-muted);
                    cursor: default;
                }

                .btn-rename-cancel {
                    background: transparent;
                    color: var(--cp-ink-2);
                    border: var(--cp-hair) solid var(--cp-rule);
                    padding: 0.4rem 0.8rem;
                    border-radius: var(--cp-radius);
                    font-family: inherit;
                    font-weight: 600;
                    cursor: pointer;
                }

                .btn-view {
                    background: var(--cp-ink);
                    color: var(--cp-surface);
                    border: var(--cp-hair) solid var(--cp-ink);
                    padding: 0.5rem 1.1rem;
                    border-radius: var(--cp-radius);
                    font-family: inherit;
                    font-weight: 700;
                    cursor: pointer;
                    transition: background 0.12s linear, color 0.12s linear;
                }

                .btn-new-trip { display: block; min-height: 44px; margin: 0.75rem auto 0; }

                .btn-view:hover,
                .btn-view:focus-visible {
                    background: var(--cp-surface);
                    color: var(--cp-ink);
                }

                /* 삭제는 되돌릴 수 없다. 여기서 상태색을 빼면 위험이 안 읽힌다. */
                .btn-delete-trip {
                    background: transparent;
                    color: var(--cp-danger);
                    border: var(--cp-hair) solid var(--cp-danger);
                    padding: 0.5rem 0.9rem;
                    border-radius: var(--cp-radius);
                    font-family: inherit;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.12s linear;
                }

                .btn-delete-trip:hover,
                .btn-delete-trip:focus-visible {
                    background: var(--cp-danger-bg);
                }

                /* ====== 위험 구역 ====== */
                .danger-section { border-color: var(--cp-danger); }
                .danger-header {
                    background-color: var(--cp-danger-bg);
                    border-bottom-color: var(--cp-danger);
                }
                .danger-header h2 { color: var(--cp-danger); }

                .btn-danger-trigger {
                    background: transparent;
                    color: var(--cp-danger);
                    border: var(--cp-hair) solid var(--cp-danger);
                    padding: 0.75rem 1.5rem;
                    border-radius: var(--cp-radius);
                    font-family: inherit;
                    font-weight: 700;
                    cursor: pointer;
                    margin: 1.5rem;
                    transition: background 0.12s linear, color 0.12s linear;
                }

                .btn-danger-trigger:not(:disabled):hover,
                .btn-danger-trigger:not(:disabled):focus-visible {
                    background: var(--cp-danger);
                    color: var(--cp-surface);
                }

                .btn-danger-trigger:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                #account-deletion-status:not(:empty) {
                    margin: 0 1.5rem 1.5rem;
                    padding: 0.75rem 1rem;
                    border: var(--cp-hair) solid var(--cp-rule);
                    border-radius: var(--cp-radius);
                    color: var(--cp-ink-2);
                }

                #account-deletion-status[data-state="unknown"],
                #account-deletion-status[data-state="blocked"] {
                    border-color: var(--cp-warn);
                    background: var(--cp-warn-bg);
                    color: var(--cp-warn);
                }

                /* ====== 모달 ====== */
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: var(--cp-scrim);
                    z-index: 2000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.2s ease;
                }

                .modal-overlay.show { opacity: 1; pointer-events: auto; }

                .modal-content {
                    background: var(--cp-surface);
                    color: var(--cp-ink);
                    width: 100%;
                    max-width: 460px;
                    border: var(--cp-hair) solid var(--cp-rule);
                    border-top: 3px solid var(--cp-danger);
                    border-radius: var(--cp-radius);
                    padding: 1.75rem;
                    position: relative;
                }

                .modal-close-x {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: none;
                    border: none;
                    font-family: inherit;
                    font-size: 1.4rem;
                    line-height: 1;
                    cursor: pointer;
                    color: var(--cp-muted);
                    padding: 0.3rem 0.5rem;
                }

                .modal-close-x:hover { color: var(--cp-ink); }

                .modal-content h3 {
                    margin: 0 0 1rem;
                    color: var(--cp-danger);
                    font-size: 1.3rem;
                    font-weight: 800;
                    word-break: keep-all;
                }

                .modal-actions { display: flex; gap: 0.6rem; justify-content: flex-end; margin-top: 1.25rem; }

                .btn-modal-cancel {
                    background: transparent;
                    color: var(--cp-ink-2);
                    border: var(--cp-hair) solid var(--cp-rule);
                    padding: 0.7rem 1.35rem;
                    border-radius: var(--cp-radius);
                    font-family: inherit;
                    font-weight: 700;
                    cursor: pointer;
                }

                .btn-logout { margin: 1.5rem; min-height: 44px; }
                .btn-logout[hidden] { display: none; }

                .btn-modal-confirm {
                    background: var(--cp-danger);
                    color: var(--cp-surface);
                    border: var(--cp-hair) solid var(--cp-danger);
                    padding: 0.7rem 1.35rem;
                    border-radius: var(--cp-radius);
                    font-family: inherit;
                    font-weight: 700;
                    cursor: pointer;
                }

                .loading-state,
                .empty-state,
                .error-state {
                    padding: 2.5rem 1.5rem;
                    text-align: center;
                    color: var(--cp-muted);
                    word-break: keep-all;
                }

                @media (max-width: 768px) {
                    .profile-wrapper {
                        flex-direction: column;
                        padding: 1.5rem 1rem;
                        gap: 1.5rem;
                    }
                    .sidebar { width: 100%; }
                    .main-content { max-width: 100%; }
                    .list-item {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 0.5rem;
                        padding: 1rem 1.25rem;
                    }
                    .list-label { width: 100%; }
                    .list-value { width: 100%; }
                    .value-text,
                    #user-email {
                        word-break: break-all;
                        overflow-wrap: break-word;
                    }
                    .edit-mode-container {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 0.6rem;
                    }
                    .edit-actions { justify-content: flex-end; }
                    .trip-card {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 1rem;
                    }
                    .trip-actions { width: 100%; justify-content: flex-end; }
                    .btn-danger-trigger {
                        margin: 1.25rem;
                        width: calc(100% - 2.5rem);
                    }
                }

                /* 이 화면은 삭제·탈퇴가 모여 있는 곳이다. 오탭 비용이 가장 크다. */
                @media (pointer: coarse) {
                    .nav-item,
                    .btn-back-home,
                    .inline-input,
                    .rename-input {
                        min-height: 44px;
                    }

                    .btn-save,
                    .btn-cancel,
                    .btn-edit-inline,
                    .btn-view,
                    .btn-delete-trip,
                    .btn-rename-save,
                    .btn-rename-cancel,
                    .btn-danger-trigger,
                    .btn-modal-cancel,
                    .btn-modal-confirm {
                        min-height: 44px;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .btn-rename,
                    .modal-close-x {
                        min-width: 44px;
                        min-height: 44px;
                    }
                }
`;
