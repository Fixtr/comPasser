/**
 * 결과 화면의 일정 시트 — 지도 위로 올라오고 내려간다.
 *
 * 왜 시트인가. 지금까지는 지도(500px)와 일정이 위아래로 놓여 스크롤을
 * 공유했다. 지도를 보려면 위로, 일정을 보려면 아래로 — **둘을 함께 보는
 * 순간이 없었다.** "고정 일정을 중심으로 동선을 다시 짠다"는 이 제품의
 * 핵심은 지도와 일정이 같은 화면에 있을 때만 눈에 보인다.
 *
 * 규칙 몇 가지를 일부러 지켰다.
 *
 *  - **손잡이는 진짜 `<button>`.** `<div>` 로 만들면 키보드로는 영영 못
 *    연다. 버튼이면 Enter/Space 가 공짜로 따라오고 포커스 링도 붙는다.
 *  - **마크업의 기본은 펼침.** 이 스크립트가 실패하면 사용자는 손잡이만
 *    있는 빈 지도를 보게 된다. 접는 일은 여기서 한다.
 *  - **드래그는 손잡이에서만.** 시트 전체에서 잡으면 안쪽 일정 목록을
 *    손가락으로 굴릴 수 없다.
 *  - **시계를 따로 읽지 않는다.** 속도는 포인터 이벤트가 주는 `timeStamp`
 *    차이로 낸다.
 */

const PEEK = 'peek';
const FULL = 'full';

/** 이만큼 끌었으면 상태를 바꾼다(px). 그보다 적으면 제자리로 돌아간다. */
const DISTANCE_THRESHOLD = 56;
/** 짧게 끌었어도 이보다 빠르면 그 방향으로 보낸다(px/ms). */
const VELOCITY_THRESHOLD = 0.45;

/**
 * @param {{sheet: HTMLElement, grip: HTMLElement, body: HTMLElement,
 *          labels?: {expand?: string, collapse?: string}}} parts
 */
export function initMapSheet({ sheet, grip, body, labels } = {}) {
  if (!sheet || !grip || !body) return null;

  /**
   * 글자는 **쓸 때마다 다시 읽는다.**
   *
   * 예전에는 초기화 때 한 번 읽어 박아 두었다. 그래서 언어를 영어로 바꿔도
   * 손잡이만 "일정 펼치기"로 남았다 — 사전에는 있는데, 이미 박힌 글자를
   * 되돌릴 방법이 없었던 것이다. 지도 여백(`getFrameInsets`)에서 배운 것과
   * 같은 교훈이다: 화면이 달라지는 값은 미리 재 두지 않는다.
   */
  const readLabels = () => {
    const given = typeof labels === 'function' ? labels() : labels;
    return {
      expand: given?.expand || '일정 펼치기',
      collapse: given?.collapse || '지도 보기',
    };
  };
  const label = grip.querySelector('.sheet-grip-label');

  let state = FULL;
  let drag = null;

  const setState = (next) => {
    state = next === PEEK ? PEEK : FULL;
    sheet.dataset.state = state;
    sheet.style.removeProperty('--sheet-offset');
    grip.setAttribute('aria-expanded', String(state === FULL));
    // 버튼은 "지금 상태"가 아니라 "누르면 갈 곳"을 말한다 — 테마 토글과 같은 규칙.
    const text = readLabels();
    const nextLabel = state === FULL ? text.collapse : text.expand;
    grip.setAttribute('aria-label', nextLabel);
    if (label) label.textContent = nextLabel;
    if (state === PEEK) body.scrollTop = 0;
  };

  const toggle = () => setState(state === FULL ? PEEK : FULL);

  // ---- 누르기 ----
  grip.addEventListener('click', (event) => {
    // 끌어서 상태를 바꾼 직후에는 click 이 한 번 더 온다. 그걸 그대로 받으면
    // 방금 연 시트가 다시 닫힌다.
    if (grip.dataset.justDragged === 'true') {
      grip.dataset.justDragged = 'false';
      event.preventDefault();
      return;
    }
    toggle();
  });

  // ---- 끌기 ----
  const height = () => sheet.getBoundingClientRect().height || 1;

  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    drag = { id: event.pointerId, y: event.clientY, at: event.timeStamp, moved: 0 };
    grip.setPointerCapture?.(event.pointerId);
    sheet.dataset.dragging = 'true';
  });

  grip.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.y;
    drag.moved = dy;
    drag.lastAt = event.timeStamp;

    // 펼침에서는 아래로만, 접힘에서는 위로만 끌린다. 반대 방향으로 늘어지면
    // 시트가 화면 밖으로 나가거나 지도를 덮어 버린다.
    const base = state === FULL ? 0 : height() - peekHeight();
    const offset = Math.min(Math.max(base + dy, 0), height() - peekHeight());
    sheet.style.setProperty('--sheet-offset', `${offset}px`);
  });

  const finish = (event) => {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const dy = drag.moved;
    const elapsed = Math.max((drag.lastAt || drag.at) - drag.at, 1);
    const velocity = dy / elapsed;
    sheet.dataset.dragging = 'false';

    const wentFar = Math.abs(dy) > DISTANCE_THRESHOLD;
    const wentFast = Math.abs(velocity) > VELOCITY_THRESHOLD;
    grip.dataset.justDragged = String(Math.abs(dy) > 4);

    if (wentFar || wentFast) setState(dy > 0 ? PEEK : FULL);
    else setState(state);   // 제자리로

    drag = null;
  };

  grip.addEventListener('pointerup', finish);
  grip.addEventListener('pointercancel', finish);

  /** 접혔을 때 남기는 높이. CSS 가 정한 값을 그대로 읽는다. */
  function peekHeight() {
    const raw = getComputedStyle(sheet).getPropertyValue('--sheet-peek-height').trim();
    const px = Number.parseFloat(raw);
    if (!Number.isFinite(px)) return 96;
    return raw.endsWith('rem')
      ? px * Number.parseFloat(getComputedStyle(document.documentElement).fontSize || '16')
      : px;
  }

  // 펼친 시트는 화면을 거의 덮는다. 닫는 길이 손잡이 하나뿐이면 답답하다.
  sheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state === FULL) {
      setState(PEEK);
      grip.focus();
    }
  });

  // 언어가 바뀌면 지금 상태의 글자를 다시 쓴다. 마크업에는 글자를 두지 않았으므로
  // (상태에 따라 달라져 사전 키 하나로 못 정한다) 이 자리가 유일한 주인이다.
  globalThis.addEventListener?.('i18n-changed', () => setState(state));

  setState(PEEK);
  return { setState, toggle, get state() { return state; } };
}
