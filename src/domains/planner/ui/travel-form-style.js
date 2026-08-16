export const travelFormStyles = `
        :host {
          display: block;
          background: var(--bg-secondary, #fff);
          padding: 2.5rem;
          border-radius: var(--radius-lg, 16px);
          box-shadow: var(--shadow-lg, 0 10px 15px rgba(0,0,0,0.1));
          container-type: inline-size;
        }

        h2 {
          font-size: 1.5rem;
          color: var(--text-primary);
          margin-bottom: 0.5rem;
          border-bottom: 2px solid oklch(95% 0.02 260);
          padding-bottom: 0.5rem;
        }

        .subtitle {
          color: var(--text-secondary);
          margin-bottom: 2rem;
          font-size: 0.95rem;
        }

        .form-section {
          margin-bottom: 2.5rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        label {
          display: block;
          margin-bottom: 0.4rem;
          font-weight: 600;
          color: var(--text-primary);
          font-size: 0.85rem;
        }

        input {
          width: 100%;
          padding: 0.8rem 1rem;
          border: 1px solid oklch(90% 0.02 260);
          border-radius: 8px;
          font-family: inherit;
          font-size: 0.95rem;
          background: var(--bg-primary);
          color: var(--text-primary);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          box-sizing: border-box;
        }

        input:focus {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.25);
        }

        /* Google Maps Autocomplete 컴포넌트 스타일링 */
        gmp-place-autocomplete,
        gmp-basic-place-autocomplete {
          display: block;
          width: 100%;
          box-sizing: border-box;
          overflow: visible; /* 💎 드롭다운 잘림 방지 💎 */
          color-scheme: light !important; /* 💎 OS 다크모드 무시하고 라이트 테마 강제 고정 💎 */

          /* 💎 다크모드 무시 & 라이트 테마 강제 고정 💎 */
          --gmpx-color-surface: #ffffff !important;             /* 폼/드롭다운 배경 무조건 흰색 */
          --gmpx-color-on-surface: #111827 !important;          /* 입력 글씨 무조건 검은색 */
          --gmpx-color-on-surface-variant: #6b7280 !important;   /* 상세 주소 무조건 진회색 */
          color: #111827 !important;
          
          /* 💎 핵심 2: 'X' 버튼 검은 원 크기 축소 (Padding 조절) 💎 */
          --gmp-place-autocomplete-icon-padding: 0px; /* 아이콘 패딩을 없애서 뱃지 크기 최소화 */

          /* 기존 폼 UI와 동일한 외형 */
          border: 1px solid #e5e7eb; 
          border-radius: 8px; 
          min-height: 48px; 
          background-color: #ffffff;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          position: relative;
          z-index: 10;
        }

        /* 앵커(Anchor) 박스 내부의 장소 입력창 전용 */
        .anchor-item gmp-place-autocomplete, 
        .anchor-schedule-item gmp-place-autocomplete {
          /* 앵커 박스 배경에 자연스럽게 묻히도록 투명하게 처리 */
          --gmpx-color-surface: transparent; 
          border: 1px solid #d1d5db; /* 앵커 내부의 다른 인풋과 같은 테두리 색상 */
        }

        gmp-place-autocomplete:focus-within {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.25);
        }

        .primary-btn {
          background: linear-gradient(135deg, var(--accent-primary), oklch(55% 0.3 280));
          color: white;
          border: none;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          width: 100%;
          margin-top: 1rem;
          transition: all 0.2s ease;
        }

        .primary-btn:disabled {
          background: #d1d5db !important;
          color: #9ca3af !important;
          cursor: not-allowed !important;
          box-shadow: none !important;
          transform: none !important;
        }

        .primary-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: var(--shadow-glow);
        }

        .submit-row {
          display: flex;
          gap: 1rem;
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
          color: #475569;
          border: 1px solid #e2e8f0;
          padding: 0.8rem 1.5rem;
          font-size: 1.05rem;
          font-weight: 600;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .reset-btn:hover {
          background-color: #f8fafc;
          transform: translateY(-2px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          border-color: #cbd5e1;
          color: #334155;
        }

        .reset-btn svg {
          width: 1.25rem;
          height: 1.25rem;
          stroke: currentColor;
          fill: none;
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        
        .secondary-btn {
          background: oklch(95% 0.02 260);
          color: var(--text-primary);
          border: 1px dashed oklch(80% 0.02 260);
          padding: 0.75rem 1rem;
          font-size: 0.95rem;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          width: 100%;
          margin-bottom: 1.5rem;
          transition: background 0.2s;
        }

        .secondary-btn:hover {
          background: oklch(92% 0.02 260);
        }

        /* ====== Preference Badges ====== */
        .preference-chips {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
        }

        .pref-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.35rem 0.9rem;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--accent-primary, #7c3aed), oklch(60% 0.25 280));
          color: white;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          animation: chipPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          letter-spacing: -0.01em;
          border: none;
        }

        .pref-chip:hover {
          transform: translateY(-2px) scale(1.05);
          box-shadow: 0 6px 16px rgba(124, 58, 237, 0.3);
        }

        .pref-chip .chip-icon {
          font-size: 0.9rem;
          line-height: 1;
        }

        @keyframes chipPop {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }

        .anchor-item {
          background: oklch(98% 0.01 260);
          border: 1px solid oklch(90% 0.02 260);
          padding: 1.25rem;
          border-radius: 12px;
          margin-bottom: 1rem;
          position: relative;
          box-shadow: var(--shadow-sm); /* 추가적인 카드 느낌 */
          transition: box-shadow 0.2s ease, transform 0.2s ease;
        }
        
        .anchor-item:hover {
          box-shadow: var(--shadow-md);
          transform: translateY(-1px);
        }

        .remove-btn {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: none;
          border: none;
          color: oklch(60% 0.15 20); /* Reddish */
          font-size: 1.5rem;
          cursor: pointer;
          line-height: 1;
          padding: 0;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .remove-btn:hover {
          opacity: 1;
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

        /* Toggle Switch Styles */
        .toggle-container {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
          user-select: none;
          padding: 0.5rem 0;
        }

        .toggle-container input {
          display: none;
        }

        .toggle-switch {
          position: relative;
          width: 44px;
          height: 24px;
          background-color: #cbd5e1;
          border-radius: 999px;
          transition: background-color 0.2s ease;
        }

        .toggle-switch::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          background-color: white;
          border-radius: 50%;
          transition: transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .toggle-container input:checked + .toggle-switch {
          background-color: var(--accent-primary, #7c3aed);
        }

        .toggle-container input:checked + .toggle-switch::after {
          transform: translateX(20px);
        }

        .toggle-label {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        #daily-times-accordion {
          transition: max-height 0.3s ease-in-out, opacity 0.3s ease-in-out;
          overflow: hidden;
        }

        .daily-time-row {
          background: oklch(98% 0.01 260);
          border: 1px solid oklch(90% 0.02 260);
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 0.75rem;
        }
        
        .daily-time-row:last-child {
          margin-bottom: 0;
        }

        .daily-time-header {
          font-weight: 700;
          font-size: 1rem;
          color: var(--accent-primary);
          margin-bottom: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
`;
