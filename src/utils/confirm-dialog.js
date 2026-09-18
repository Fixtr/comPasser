/**
 * 앱 공용 확인 다이얼로그.
 *
 * confirm() 은 실행을 멈추고 OS 다이얼로그를 띄운다. Capacitor 앱에서는
 * 흐름이 끊기고, 브라우저에 따라 차단되며, 앱 디자인과도 따로 논다.
 * toast.js 와 같은 방식으로 Shadow DOM 밖에 하나를 만들어 재사용한다.
 *
 * 되돌릴 수 없는 동작(삭제 등)을 막는 마지막 관문이라 키보드로도 온전히
 * 다룰 수 있어야 한다 — Escape 로 취소, Tab 은 안에서 순환, 열릴 때
 * 취소 버튼에 포커스(실수로 Enter 를 눌러 삭제되지 않도록).
 */

const HOST_ID = 'app-confirm-host';
const STYLE_ID = 'app-confirm-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${HOST_ID} {
      position: fixed; inset: 0; z-index: 2147483646;
      display: flex; align-items: center; justify-content: center;
      background: var(--cp-scrim); padding: 1.25rem;
    }
    #${HOST_ID} .confirm-box {
      background: var(--cp-surface); border: var(--cp-hair) solid var(--cp-rule); border-radius: var(--cp-radius); padding: 1.4rem;
      width: min(92vw, 26rem);
      max-height: 85dvh; overflow-y: auto;
      font-family: inherit;
    }
    #${HOST_ID} .confirm-title {
      font-size: 1.05rem; font-weight: 800; letter-spacing: -0.02em; color: var(--cp-ink); margin: 0 0 0.5rem;
    }
    #${HOST_ID} .confirm-message {
      font-size: 0.92rem; color: var(--cp-ink-2); line-height: 1.6; margin: 0 0 1.25rem; word-break: keep-all;
      word-break: keep-all;
    }
    #${HOST_ID} .confirm-actions { display: flex; gap: 0.6rem; justify-content: flex-end; }
    #${HOST_ID} button {
      border-radius: var(--cp-radius); padding: 0.55rem 1.1rem; font-size: 0.9rem;
      font-weight: 700; cursor: pointer; font-family: inherit;
    }
    #${HOST_ID} .confirm-cancel { background: var(--cp-surface); color: var(--cp-ink); border: var(--cp-hair) solid var(--cp-rule); }
    #${HOST_ID} .confirm-ok { background: var(--cp-danger); color: var(--cp-surface); border: var(--cp-hair) solid var(--cp-danger); }
    #${HOST_ID} .confirm-ok.neutral { background: var(--cp-ink); border-color: var(--cp-ink); }
  `;
  document.head.appendChild(style);
}

/**
 * @param {object} options
 * @param {string} options.message 본문
 * @param {string} [options.title] 제목
 * @param {string} [options.confirmText] 확인 버튼 문구
 * @param {string} [options.cancelText] 취소 버튼 문구
 * @param {boolean} [options.destructive] true 면 확인 버튼을 위험(빨강)으로
 * @returns {Promise<boolean>} 확인이면 true, 취소/Escape/바깥 클릭이면 false
 */
export function showConfirm({
  message,
  title = '확인',
  confirmText = '확인',
  cancelText = '취소',
  destructive = true
} = {}) {
  if (typeof document === 'undefined') return Promise.resolve(false);
  ensureStyle();

  // 이미 열려 있으면 중복으로 띄우지 않는다.
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();

  return new Promise(resolve => {
    const previouslyFocused = document.activeElement;

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('role', 'alertdialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', title);

    const box = document.createElement('div');
    box.className = 'confirm-box';

    const titleEl = document.createElement('p');
    titleEl.className = 'confirm-title';
    titleEl.textContent = title;

    const messageEl = document.createElement('p');
    messageEl.className = 'confirm-message';
    messageEl.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'confirm-cancel';
    cancelBtn.textContent = cancelText;

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = `confirm-ok${destructive ? '' : ' neutral'}`;
    okBtn.textContent = confirmText;

    actions.append(cancelBtn, okBtn);
    box.append(titleEl, messageEl, actions);
    host.appendChild(box);
    document.body.appendChild(host);

    const close = (result) => {
      document.removeEventListener('keydown', keyHandler, true);
      host.remove();
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
      resolve(result);
    };

    const keyHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
      if (e.key !== 'Tab') return;
      // 포커스가 다이얼로그 밖으로 새지 않게 두 버튼 사이에서 순환시킨다.
      const focusables = [cancelBtn, okBtn];
      const active = document.activeElement;
      e.preventDefault();
      const index = focusables.indexOf(active);
      const next = e.shiftKey
        ? focusables[(index - 1 + focusables.length) % focusables.length]
        : focusables[(index + 1) % focusables.length];
      next.focus();
    };

    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    // 바깥(배경)을 누르면 취소. 상자 안 클릭은 통과시킨다.
    host.addEventListener('click', (e) => { if (e.target === host) close(false); });
    document.addEventListener('keydown', keyHandler, true);

    // 위험한 동작이므로 기본 포커스는 취소에 둔다.
    cancelBtn.focus();
  });
}
