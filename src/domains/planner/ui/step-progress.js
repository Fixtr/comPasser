// The planner is seven steps: country, city and places on /destination, then dates and style
// (/preference/1 and /2), the details form and the review on /plan. The counter shows 4 to 7, and
// the bar is drawn from the same count, so the two cannot disagree.
export const PLANNER_STEPS = 7;

export const stepProgressStyles = `
        /* 진도 표시. 예전에는 보라 그라디언트 알약이었다. */
        .progress-track {
          max-width: 200px;
          height: 4px;
          margin: 0 auto 1.25rem;
          background: var(--cp-sunken);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-radius);
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: var(--cp-ink);
          transition: width 0.25s linear;
        }

        .step-badge {
          display: inline-block;
          background: transparent;
          color: var(--cp-muted);
          border: var(--cp-hair) solid var(--cp-rule);
          border-radius: var(--cp-pill);
          font-family: inherit;
          font-size: 0.68rem;
          font-weight: 600;
          padding: 0.25rem 0.75rem;
          /* 자간을 주지 않는다. 대문자 라틴 라벨에는 어울리는 장식이지만
             한글에는 **음절 사이가 벌어지고 띄어쓰기가 두 칸처럼** 보인다
             ("시작 시간" 이 "시작  시간" 으로 읽혔다). 이 앱의 기본 언어가
             한국어라 여기서는 자간을 빼는 쪽이 맞다. 모노·대문자 표기는
             그대로 두어 "라벨"이라는 성격은 유지한다. */
          letter-spacing: normal;
          text-transform: uppercase;
          margin-bottom: 1rem;
        }
        .step-progress { text-align: center; }
`;

const width = step => `${(step * 100 / PLANNER_STEPS).toFixed(2)}%`;

export const stepProgressHtml = step => `<div class="step-progress"><div class="progress-track"><div class="progress-fill" style="width: ${width(step)};"></div></div><span class="step-badge">${step} / ${PLANNER_STEPS}</span></div>`;

export function setStepProgress(fill, badge, step) {
  if (fill) fill.style.width = width(step);
  if (badge) badge.textContent = `${step} / ${PLANNER_STEPS}`;
}
