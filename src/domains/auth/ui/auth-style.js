/**
 * 로그인 · 회원가입 · 이메일 인증이 함께 쓰는 스타일.
 *
 * 세 화면은 같은 카드 위에 같은 입력과 같은 버튼을 얹은 것이라, 원래는
 * 같은 CSS 가 세 파일에 그대로 복제돼 있었다. 한 곳만 고치면 나머지 둘이
 * 조용히 갈라진다 — 실제로 `.auth-btn` 의 hover 처리가 파일마다 달랐다.
 *
 * 색 규칙은 다른 화면과 같다: **UI 는 무채색.** 예외는 소셜 로그인 버튼
 * 하나뿐인데, 각 사의 브랜드 가이드가 색을 못박고 있어 무채색으로 바꾸면
 * 심사에서 막힌다. 그 색도 토큰(`--cp-kakao` 등)으로 이름을 줘서, 우연히
 * 들어온 색이 아니라 의도된 예외임을 코드에서 읽을 수 있게 했다.
 */
export const authStyles = `
        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        :host {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: fit-content;
          /* 위의 * 규칙은 호스트에 닿지 않는다. 이게 빠지면 width:100% 에
             좌우 여백이 더해져 그만큼 화면 밖으로 나간다(폰에서 42px). */
          box-sizing: border-box;
          width: 100%;
          text-align: center;
          /* 원래는 !important 가 붙어 있었는데 이길 상대가 없었다.
             바깥의 .page-container 에는 규칙이 아예 없다. */
          padding: 2.5rem 2rem 3rem;
          background: var(--cp-surface);
          color: var(--cp-ink);
          font-family: var(--cp-font);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-radius);
          margin-top: 2rem;
          container-type: inline-size;
        }

        .header-section {
          margin-bottom: 2rem;
        }

        h2 {
          font-size: 1.9rem;
          font-weight: 800;
          color: var(--cp-ink);
          margin: 0 0 0.6rem;
          letter-spacing: -0.02em;
          word-break: keep-all;
        }

        p.subtitle {
          color: var(--cp-muted);
          margin: 0 auto;
          font-size: 0.98rem;
          line-height: 1.6;
          max-width: 600px;
          word-break: keep-all;
        }

        /* ====== 인앱 브라우저 경고 ======
           카카오톡·인스타그램 안의 브라우저에서는 소셜 로그인이 막힌다.
           예전에는 이 배너의 색이 JS 의 cssText 에 노랑 그라디언트로 박혀
           있었다. 경고는 상태색이므로 --cp-warn 을 쓴다. */
        .inapp-warning {
          background: var(--cp-warn-bg);
          border: var(--cp-hair) solid var(--cp-warn);
          border-left: 3px solid var(--cp-warn);
          border-radius: var(--cp-radius);
          color: var(--cp-warn);
          padding: 1.1rem 1.25rem;
          margin-bottom: 1.75rem;
          max-width: 520px;
          width: 100%;
          text-align: left;
        }

        .inapp-warning .inapp-title {
          font-size: 1rem;
          font-weight: 800;
          margin-bottom: 0.5rem;
          word-break: keep-all;
        }

        .inapp-warning .inapp-desc,
        .inapp-warning .inapp-how {
          font-size: 0.88rem;
          line-height: 1.6;
          color: var(--cp-ink-2);
          word-break: keep-all;
        }

        .inapp-warning .inapp-how {
          margin-top: 0.7rem;
          font-family: var(--cp-mono);
          font-size: 0.78rem;
        }

        /* ====== 입력 ====== */
        .auth-form {
          width: 100%;
          max-width: 380px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .auth-input {
          width: 100%;
          padding: 0.85rem 1rem;
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-radius);
          font-size: 1rem;
          font-family: inherit;
          background: var(--cp-surface);
          color: var(--cp-ink);
          transition: border-color 0.12s linear;
        }

        /* 보라 링(box-shadow) 대신 outline 하나. 그림자가 없어야 캡처와
           저사양 기기가 같이 편하다. */
        .auth-input:focus {
          outline: 2px solid var(--cp-ink);
          outline-offset: 2px;
          border-color: var(--cp-ink);
        }

        .password-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .password-wrapper .auth-input {
          padding-right: 3rem;
        }

        .toggle-password {
          position: absolute;
          right: 0.4rem;
          background: none;
          border: none;
          border-radius: var(--cp-radius);
          cursor: pointer;
          color: var(--cp-muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.4rem;
          transition: color 0.12s linear;
        }

        .toggle-password:hover,
        .toggle-password:focus-visible {
          color: var(--cp-ink);
        }

        /* 강도는 상태색이다. 예전에는 "안전"이 #10B981 이었는데, 그 값은
           지도에서 "그날의 첫 장소"를 뜻하는 --cp-start 와 같은 색이다. */
        .strength-indicator {
          margin-top: 0.4rem;
          font-size: 0.8rem;
          text-align: right;
          font-weight: 600;
          min-height: 1rem;
          color: var(--cp-muted);
        }

        .strength-indicator[data-strength="weak"]   { color: var(--cp-danger); }
        .strength-indicator[data-strength="medium"] { color: var(--cp-warn); }
        .strength-indicator[data-strength="strong"] { color: var(--cp-ok); }

        /* ====== 버튼 ====== */
        .btn-group {
          display: flex;
          gap: 0.6rem;
          margin-top: 0.3rem;
        }

        .auth-btn {
          flex: 1;
          width: 100%;
          padding: 0.9rem 1rem;
          font-family: inherit;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          border-radius: var(--cp-radius);
          cursor: pointer;
          border: var(--cp-hair) solid var(--cp-ink);
          background: var(--cp-ink);
          color: var(--cp-surface);
          transition: background 0.12s linear, color 0.12s linear, border-color 0.12s linear;
        }

        .auth-btn:hover:not(:disabled),
        .auth-btn:focus-visible:not(:disabled) {
          background: var(--cp-surface);
          color: var(--cp-ink);
        }

        .auth-btn:disabled {
          background: var(--cp-sunken);
          border-color: var(--cp-rule);
          color: var(--cp-muted);
          cursor: not-allowed;
        }

        .divider {
          display: flex;
          align-items: center;
          text-align: center;
          color: var(--cp-muted);
          font-family: var(--cp-mono);
          font-size: 0.7rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          width: 100%;
          max-width: 380px;
          margin: 2rem auto 1.25rem;
        }

        .divider::before,
        .divider::after {
          content: '';
          flex: 1;
          border-bottom: var(--cp-hair) solid var(--cp-rule);
        }

        .divider::before { margin-right: 0.9rem; }
        .divider::after  { margin-left: 0.9rem; }

        /* ====== 소셜 로그인 ======
           이 화면에서 색이 남는 유일한 곳이다. 브랜드 가이드가 못박은 값이라
           무채색으로 바꾸면 심사에서 막힌다. 값은 tokens.css 의 브랜드 토큰. */
        .social-login-group {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          width: 100%;
          max-width: 380px;
          margin: 0 auto;
        }

        .social-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.7rem;
          padding: 0.9rem 1rem;
          font-family: inherit;
          font-size: 1rem;
          font-weight: 600;
          border-radius: var(--cp-radius);
          border: var(--cp-hair) solid transparent;
          cursor: pointer;
          transition: outline-color 0.12s linear;
          outline: 2px solid transparent;
          outline-offset: 2px;
        }

        /* 그림자로 띄우는 대신 테두리 한 겹을 더 두른다. */
        .social-btn:hover,
        .social-btn:focus-visible {
          outline-color: var(--cp-ink);
        }

        .google-btn {
          background: var(--cp-google-surface);
          color: var(--cp-google-ink);
          border-color: var(--cp-google-rule);
        }

        .kakao-btn {
          background: var(--cp-kakao);
          color: var(--cp-kakao-ink);
          border-color: var(--cp-kakao);
        }

        .naver-btn {
          background: var(--cp-naver);
          color: var(--cp-naver-ink);
          border-color: var(--cp-naver);
        }

        /* ====== 알림 ====== */
        #error-msg {
          display: none;
          color: var(--cp-danger);
          background: var(--cp-danger-bg);
          border: var(--cp-hair) solid var(--cp-danger);
          border-left: 3px solid var(--cp-danger);
          border-radius: var(--cp-radius);
          padding: 0.7rem 0.85rem;
          margin-top: 0.2rem;
          font-size: 0.88rem;
          line-height: 1.5;
          text-align: left;
          word-break: keep-all;
        }

        /* 예전에는 이 두 규칙이 인앱 브라우저 경고 배너 안의 <style> 에
           들어 있었다. 즉 일반 브라우저로 들어온 사용자에게는 이 링크가
           아무 스타일 없이 보였다. */
        .join-link,
        .login-link {
          margin-top: 2rem;
          font-size: 0.9rem;
          color: var(--cp-muted);
        }

        .join-link a,
        .login-link a {
          color: var(--cp-ink);
          font-weight: 700;
          text-decoration: underline;
          text-underline-offset: 3px;
          cursor: pointer;
        }

        /* ====== 이메일 인증 ====== */
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--cp-rule);
          border-top-color: var(--cp-ink);
          border-radius: var(--cp-pill);
          animation: spin 1s linear infinite;
          margin: 0 auto 1.25rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .status-icon {
          display: flex;
          justify-content: center;
          margin-bottom: 0.9rem;
          color: var(--cp-muted);
        }

        .status-icon[data-tone="ok"]     { color: var(--cp-ok); }
        .status-icon[data-tone="danger"] { color: var(--cp-danger); }

        @container (max-width: 520px) {
          .btn-group {
            flex-direction: column;
          }
        }

        /* 로그인은 앱에 들어오는 문이다. 여기서 오탭하면 사용자는
           "안 되는 앱"으로 기억한다. */
        @media (pointer: coarse) {
          .auth-input,
          .auth-btn,
          .social-btn {
            min-height: 44px;
          }

          .toggle-password {
            min-width: 44px;
            min-height: 44px;
          }

          .join-link a,
          .login-link a {
            display: inline-flex;
            align-items: center;
            min-height: 44px;
          }
        }
`;
