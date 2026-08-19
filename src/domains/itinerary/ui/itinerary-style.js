export const itineraryStyles = `
        :host {
          display: block;
          background: var(--bg-secondary);
          padding: 2.5rem;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-md);
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
          color: var(--text-primary);
          margin-bottom: 1.5rem;
          border-bottom: 2px solid #f3f4f6;
          padding-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

.transit-notice {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-left: 4px solid #3b82f6;
          color: #1e40af;
          border-radius: 8px;
          padding: 0.85rem 1rem;
          margin-bottom: 0.75rem;
          font-size: 0.88rem;
          font-weight: 600;
          line-height: 1.5;
        }

        .end-time-warning {
          background: #fffbeb;
          border: 1px solid #fcd34d;
          border-left: 4px solid #f59e0b;
          color: #92400e;
          border-radius: 8px;
          padding: 0.85rem 1rem;
          margin-bottom: 1.25rem;
          font-size: 0.9rem;
          font-weight: 600;
          line-height: 1.5;
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
          background: #e5e7eb;
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
          color: var(--accent-primary);
          text-align: right;
          padding-top: 0.2rem;
        }

        .schedule-card {
          flex-grow: 1;
          background: var(--bg-primary);
          padding: 1.25rem;
          border-radius: 12px;
          border: 1px solid #f3f4f6;
          position: relative;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .schedule-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-sm);
          border-color: var(--accent-primary);
        }
        
        /* Node marker */
        .schedule-card::before {
          content: attr(data-index);
          position: absolute;
          left: -1rem;
          top: 1rem;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--bg-secondary);
          border: 2px solid var(--accent-primary);
          color: var(--accent-primary);
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.8rem;
          box-shadow: 0 0 0 4px var(--bg-primary);
        }

        .schedule-card[data-type="AnchorSchedule"] {
          background: linear-gradient(to right, #f8faff, #f5f3ff);
          border: 1px solid var(--accent-primary);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.15);
        }
        
        .schedule-card[data-type="AnchorSchedule"]::before {
          background: var(--accent-primary);
          color: white;
          box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.3);
        }

        /* ====== Transit Info (Upgraded) ====== */
        .transit-info {
          padding-left: calc(100px + 2rem);
          margin-block: -0.25rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
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
          border-radius: 12px;
          border: 1px solid;
          transition: transform 0.2s, box-shadow 0.2s;
          min-width: 200px;
        }

        .transit-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.06);
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
          color: var(--text-primary);
        }

        .transit-distance {
          font-size: 0.8rem;
          color: var(--text-secondary);
          opacity: 0.7;
        }

        .transit-extended-info {
          margin-left: 1rem;
          font-size: 0.8rem;
          color: var(--text-secondary);
          background: #f8f9ff;
          padding: 0.4rem 0.8rem;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          display: inline-block;
        }

        .transit-info.hidden {
          display: none;
        }

        /* ====== Transit Segment Card (per-step breakdown) ====== */
        .transit-seg-card {
          width: 100%;
          border: 1px solid #a7f3d0;
          background: #ecfdf5;
          border-radius: 12px;
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
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
        }

        .transit-seg-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.5rem;
          font-weight: 800;
          font-size: 0.8rem;
          color: #065f46;
        }

        .transit-seg-total {
          font-weight: 700;
          font-size: 0.78rem;
          color: #047857;
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
          border-radius: 8px;
          border: 1px solid #e5e7eb;
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
          color: var(--text-primary);
        }

        .transit-step .step-stops {
          flex-basis: 100%;
          font-size: 0.78rem;
          color: var(--text-secondary);
          padding-left: 1.6rem;
        }

        .transit-verify {
          font-size: 0.75rem;
          font-weight: 600;
          color: #2563eb;
        }

        /* Legacy pill (keep for fallback) */
        .transit-pill {
          background: #f3f4f6;
          padding: 0.3rem 0.8rem;
          border-radius: 20px;
          border: 1px dashed #e5e7eb;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-weight: 500;
        }

        .schedule-title {
          font-weight: 700;
          font-size: 1.1rem;
          margin-bottom: 0.25rem;
          color: var(--text-primary);
        }

        .schedule-desc {
          color: var(--text-secondary);
          font-size: 0.95rem;
          line-height: 1.4;
          margin-bottom: 0.75rem;
        }

        .schedule-meta {
          display: flex;
          gap: 1rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
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
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s ease;
          background: #f9fafb;
          color: var(--text-secondary);
          border: 1px solid #e5e7eb;
        }

        .action-link-badge.primary {
          background: #f5f3ff;
          color: var(--accent-primary);
          border-color: #ddd6fe;
        }

        .action-link-badge:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px rgba(0,0,0,0.05);
          background: white;
        }

        .nav-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.45rem 0.85rem;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 700;
          border: 1.5px solid #10b981;
          background: linear-gradient(135deg, #ecfdf5, #f0fdf4);
          color: #065f46;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .nav-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
          background: linear-gradient(135deg, #d1fae5, #ecfdf5);
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
          color: #374151;
          flex-wrap: wrap;
        }

        .rec-rank {
          font-weight: 800;
          color: var(--accent-primary, #7c3aed);
          min-width: 1.2rem;
        }

        .rec-name {
          flex: 1;
          font-weight: 600;
        }

        .rec-rating {
          color: #d97706;
          font-weight: 700;
          font-size: 0.8rem;
        }

        .rec-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.2rem;
          padding: 0.22rem 0.6rem;
          border-radius: 12px;
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
          color: #2563eb;
          border-color: #bfdbfe;
          background: #eff6ff;
        }

        .rec-btn.review:hover {
          background: #dbeafe;
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(37,99,235,0.15);
        }

        .rec-btn.direction {
          color: #065f46;
          border-color: #a7f3d0;
          background: #ecfdf5;
        }

        .rec-btn.direction:hover {
          background: #d1fae5;
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(16,185,129,0.15);
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
          background: #f8fafc;
          border-left: 3.5px solid var(--accent-primary);
          border-radius: 4px 12px 12px 4px;
          display: flex;
          gap: 0.5rem;
          align-items: flex-start;
          font-size: 0.82rem;
          color: #475569;
          line-height: 1.4;
          animation: quickInfoFade 0.4s ease-out;
        }

        .quick-info-box.structured {
          display: block;
          padding: 1rem 1.25rem;
          background: linear-gradient(to right, #f8fafc, #f1f5f9);
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
          font-weight: 800;
          color: #334155;
          min-width: 65px;
          display: inline-block;
        }

        .info-value {
          color: #475569;
          line-height: 1.4;
        }

        /* ====== Buttons ====== */
        .loader {
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 0;
          color: var(--text-secondary);
        }

        .loader.active {
          display: flex;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #f3f4f6;
          border-top-color: var(--accent-primary);
          border-radius: 50%;
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
          background: #f3f4f6;
          color: var(--accent-primary, #7c3aed);
          border: 2px solid var(--accent-primary, #7c3aed);
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          display: none;
        }

        .save-btn:hover {
          background: var(--accent-primary, #7c3aed);
          color: white;
        }

        .save-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .share-btn {
          margin-top: 1rem;
          background: var(--bg-primary);
          color: var(--accent-primary, #7c3aed);
          border: 2px solid var(--accent-primary, #7c3aed);
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          display: none;
        }

        .share-btn:hover {
          background: #f3f4f6;
          transform: translateY(-2px);
          box-shadow: var(--shadow-sm);
        }

        .share-btn:active {
          transform: translateY(0);
        }

        .kakao-share-btn {
          margin-top: 1rem;
          background: #FEE500;
          color: #000000;
          border: none;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          display: none;
          box-shadow: 0 4px 12px rgba(254, 229, 0, 0.2);
        }

        .kakao-share-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(254, 229, 0, 0.4);
          filter: brightness(0.95);
        }

        .kakao-share-btn:active {
          transform: translateY(0);
        }

        .download-btn {
          margin-top: 1rem;
          background: linear-gradient(135deg, var(--accent-primary, #7c3aed), #4f46e5);
          color: white;
          border: none;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          display: none;
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2);
          text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        .download-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(124, 58, 237, 0.3);
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

        .toast {
          position: fixed;
          bottom: 2rem;
          left: 50%;
          transform: translateX(-50%) translateY(100px);
          background: #10b981;
          color: white;
          padding: 1rem 2rem;
          border-radius: 30px;
          font-weight: 600;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 1000;
          opacity: 0;
        }

        .toast.show {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      
`;
