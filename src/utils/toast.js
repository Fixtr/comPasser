/**
 * 앱 전역 토스트.
 *
 * 기존에는 알림을 전부 alert() 로 띄웠다. alert 은 실행을 멈추고 OS 다이얼로그를
 * 띄우기 때문에 Capacitor 앱에서 흐름이 끊기고, 브라우저에 따라 차단되기도
 * 하며, 여러 개가 연달아 뜨면 사용자가 계속 닫아야 했다.
 *
 * 이 모듈은 Shadow DOM 밖(document.body)에 하나의 컨테이너를 두고 재사용한다.
 * 화면 위쪽에 띄운다: 아래쪽에는 저장·일정 생성 같은 다음 행동 버튼과 탭 바가 있어 가려진다.
 * 어떤 컴포넌트나 서비스에서도 부를 수 있고, 스타일은 한 번만 주입한다.
 */

const CONTAINER_ID = 'app-toast-container';
const STYLE_ID = 'app-toast-style';
const DEFAULT_DURATION = 3200;

/**
 * 토스트 색.
 *
 * 알림(info)·완료(success)는 무채색으로 둔다. 이 앱에서 색은 지도 마커
 * 규칙(보라=고정 일정 / 초록=첫 장소 / 파랑=나머지)에만 쓰기로 했는데,
 * 초록 토스트가 뜨면 같은 초록이 두 가지를 뜻하게 된다.
 * 반대로 경고·오류는 상태색이라 색을 유지한다 — 놓치면 안 되는 정보다.
 */
const TONE_STYLE = {
  info: { bg: 'var(--cp-ink)', border: 'var(--cp-ink)', fg: 'var(--cp-surface)' },
  success: { bg: 'var(--cp-ink)', border: 'var(--cp-ink)', fg: 'var(--cp-surface)' },
  error: { bg: 'var(--cp-danger)', border: 'var(--cp-danger)', fg: 'var(--cp-surface)' },
  warning: { bg: 'var(--cp-warn)', border: 'var(--cp-warn)', fg: 'var(--cp-surface)' }
};

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${CONTAINER_ID} {
      position: fixed;
      left: 50%;
      /* Below the top row of Back, language and theme buttons. */
      top: calc(max(1rem, env(safe-area-inset-top, 0px)) + 3.5rem);
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      z-index: 2147483647;
      pointer-events: none;
      width: min(92vw, 30rem);
    }
    #${CONTAINER_ID} .app-toast {
      pointer-events: auto;
      width: 100%;
      box-sizing: border-box;
      color: var(--cp-surface);
      padding: 0.8rem 1.05rem;
      border-radius: var(--cp-radius);
      border: var(--cp-hair) solid transparent;
      font-size: 0.92rem;
      font-weight: 600;
      line-height: 1.5;
      word-break: keep-all;
      opacity: 0;
      transform: translateY(-0.75rem);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    #${CONTAINER_ID} .app-toast.visible { opacity: 1; transform: translateY(0); }
    @media (prefers-reduced-motion: reduce) {
      #${CONTAINER_ID} .app-toast { transition: none; }
    }
  `;
  document.head.appendChild(style);
}

function ensureContainer() {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    // 스크린리더가 새 메시지를 읽도록. assertive 는 과하므로 polite.
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * @param {string} message 사용자에게 보여줄 문구
 * @param {object} [options]
 * @param {'info'|'success'|'error'|'warning'} [options.tone] 색상 톤
 * @param {number} [options.duration] 표시 시간(ms)
 * @returns {HTMLElement|null} 만들어진 토스트 요소
 */
export function showToast(message, options = {}) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text || typeof document === 'undefined') return null;

  const { tone = 'info', duration = DEFAULT_DURATION } = options;
  ensureStyle();
  const container = ensureContainer();

  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.textContent = text;
  const palette = TONE_STYLE[tone] || TONE_STYLE.info;
  toast.style.background = palette.bg;
  toast.style.borderColor = palette.border;
  toast.style.color = palette.fg;

  // 탭하면 즉시 닫을 수 있게 한다(모바일에서 화면을 가릴 때).
  toast.addEventListener('click', () => dismiss(toast));

  // One at a time: a stack piles stale errors over the screen.
  container.replaceChildren(toast);
  // requestAnimationFrame 은 탭이 백그라운드면 실행되지 않아, 그 사이 생성된
  // 토스트가 opacity 0 인 채로 남는다. 강제 리플로우 후 동기적으로 클래스를
  // 붙여 전환은 살리면서 표시 자체는 보장한다.
  void toast.offsetWidth;
  toast.classList.add('visible');
  setTimeout(() => dismiss(toast), duration);
  return toast;
}

function dismiss(toast) {
  if (!toast || !toast.isConnected) return;
  toast.classList.remove('visible');
  setTimeout(() => toast.remove(), 220);
}

export const showErrorToast = (message, options) => showToast(message, { ...options, tone: 'error' });
export const showSuccessToast = (message, options) => showToast(message, { ...options, tone: 'success' });
