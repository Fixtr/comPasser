export const preferenceStyles = `
        :host {
          display: block;
          width: 100%;
          max-width: 720px;
          margin: 0 auto;
          padding: 2rem 1.5rem 3rem;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }

        .preference-header {
          text-align: center;
          margin-bottom: 2.5rem;
        }

        .preference-header .step-badge {
          display: inline-block;
          background: linear-gradient(135deg, var(--accent-primary, #7c3aed), oklch(55% 0.3 280));
          color: white;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.3rem 0.9rem;
          border-radius: 20px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 1rem;
        }

        .preference-header h2 {
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--text-primary, #1f2937);
          margin-bottom: 0.5rem;
          letter-spacing: -0.02em;
        }

        .preference-header p {
          font-size: 1rem;
          color: var(--text-secondary, #4b5563);
          line-height: 1.6;
        }

        .section-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text-primary, #1f2937);
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .section-title .icon {
          font-size: 1.3rem;
        }

        /* ====== Date Chips ====== */
        .date-chip-container {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 2rem;
        }

        .date-chip {
          background: var(--bg-primary, #f8f9ff);
          border: 2px solid transparent;
          color: var(--text-primary, #1f2937);
          padding: 0.6rem 1rem;
          border-radius: 999px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
          user-select: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .date-chip:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.1);
        }

        .date-chip.selected {
          border-color: var(--accent-primary, #7c3aed);
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(79, 70, 229, 0.05));
          color: var(--accent-primary, #7c3aed);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2);
        }

        .custom-date-wrapper {
          position: relative;
          overflow: hidden; /* iOS 달력 침범 방지 */
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

        /* [핵심] 달력 호출 아이콘의 클릭 영역을 버튼 전체로 100% 확장 */
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
          transition: all 0.4s ease-in-out;
          pointer-events: none;
        }

        .preference-content.active {
          max-height: 1000px;
          opacity: 1;
          pointer-events: auto;
        }

        /* ====== Card Grid ====== */
        .card-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.85rem;
          margin-bottom: 2.5rem;
        }

        .preference-card {
          position: relative;
          background: var(--bg-primary, #f8f9ff);
          border: 2px solid transparent;
          border-radius: 16px;
          padding: 1.5rem 1.25rem;
          cursor: pointer;
          text-align: center;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          overflow: hidden;
        }

        .preference-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.05), rgba(79, 70, 229, 0.03));
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .preference-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(124, 58, 237, 0.12);
          border-color: rgba(124, 58, 237, 0.2);
        }

        .preference-card:hover::before {
          opacity: 1;
        }

        .preference-card.selected {
          border-color: var(--accent-primary, #7c3aed);
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.08), rgba(79, 70, 229, 0.04));
          box-shadow: 0 4px 16px rgba(124, 58, 237, 0.2), 0 0 0 3px rgba(124, 58, 237, 0.1);
          transform: translateY(-2px);
        }

        .preference-card .card-check {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--accent-primary, #7c3aed);
          color: white;
          font-size: 0.7rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transform: scale(0.5);
          transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .preference-card.selected .card-check {
          opacity: 1;
          transform: scale(1);
        }

        .card-emoji {
          font-size: 2.2rem;
          margin-bottom: 0.6rem;
          display: block;
          position: relative;
          z-index: 1;
          transition: transform 0.3s ease;
        }

        .preference-card:hover .card-emoji {
          transform: scale(1.15);
        }

        .preference-card.selected .card-emoji {
          transform: scale(1.1);
        }

        .card-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--text-primary, #1f2937);
          margin-bottom: 0.3rem;
          position: relative;
          z-index: 1;
        }

        .card-desc {
          font-size: 0.78rem;
          color: var(--text-secondary, #4b5563);
          line-height: 1.4;
          position: relative;
          z-index: 1;
        }

        /* ====== Budget Cards - wide layout ====== */
        .card-grid.budget {
          grid-template-columns: repeat(3, 1fr);
        }

        .budget .preference-card {
          padding: 1.25rem 1rem;
        }

        /* ====== Submit Button ====== */
        .submit-section {
          text-align: center;
          margin-top: 1rem;
        }

        .next-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: linear-gradient(135deg, var(--accent-primary, #7c3aed), oklch(55% 0.3 280));
          color: white;
          border: none;
          padding: 1rem 2.5rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 14px;
          cursor: pointer;
          width: 100%;
          max-width: 400px;
          transition: all 0.25s ease;
          box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);
          position: relative;
          overflow: hidden;
        }

        .next-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .next-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(124, 58, 237, 0.4);
        }

        .next-btn:hover:not(:disabled)::after {
          opacity: 1;
        }

        .next-btn:disabled {
          background: #d1d5db;
          color: #9ca3af;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .next-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .helper-text {
          font-size: 0.8rem;
          color: var(--text-secondary, #6b7280);
          margin-top: 0.75rem;
        }

        .skip-link {
          display: block;
          text-align: center;
          margin-top: 1.25rem;
          font-size: 0.85rem;
          color: var(--text-secondary, #6b7280);
          cursor: pointer;
          transition: color 0.2s;
          text-decoration: none;
          background: none;
          border: none;
          font-family: inherit;
        }

        .skip-link:hover {
          color: var(--accent-primary, #7c3aed);
          text-decoration: underline;
        }

        /* ====== Responsive ====== */
        @media (max-width: 500px) {
          :host {
            padding: 1.5rem 1rem 2.5rem;
          }

          .preference-header h2 {
            font-size: 1.4rem;
          }

          .card-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 0.65rem;
          }

          .card-grid.budget {
            grid-template-columns: 1fr;
          }

          .preference-card {
            padding: 1.2rem 1rem;
          }

          .card-emoji {
            font-size: 1.8rem;
          }

          .card-title {
            font-size: 0.88rem;
          }

          .card-desc {
            font-size: 0.72rem;
          }
        }

        /* ====== Dark Mode ====== */
        :host-context(body.dark) .preference-card {
          background: var(--bg-secondary, #1f2937);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        :host-context(body.dark) .preference-card:hover {
          box-shadow: 0 8px 24px rgba(167, 139, 250, 0.15);
          border-color: rgba(167, 139, 250, 0.3);
        }

        :host-context(body.dark) .preference-card.selected {
          border-color: var(--accent-primary, #a78bfa);
          background: linear-gradient(135deg, rgba(167, 139, 250, 0.12), rgba(99, 102, 241, 0.06));
          box-shadow: 0 4px 16px rgba(167, 139, 250, 0.25), 0 0 0 3px rgba(167, 139, 250, 0.12);
        }
`;
