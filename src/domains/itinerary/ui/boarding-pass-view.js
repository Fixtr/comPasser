/**
 * 탑승권 모양의 공유 이미지를 그린다.
 *
 * 화면이 아니라 **출력물**이다. 사용자는 이걸 스크롤하지도 누르지도 않는다.
 * 그래서 폭을 픽셀로 못박는다 — 기기마다 다른 폭으로 찍히면 같은 일정이
 * 매번 다른 그림이 되고, 받는 사람 쪽에서 글자 크기가 들쭉날쭉해진다.
 *
 * 형태 규칙은 화면과 같다(각진 모서리, 1px 실선, 그림자 없음). 여기서는
 * 이유가 하나 더 있다: html2canvas 는 그라디언트·backdrop-filter·최신 색
 * 함수를 읽지 못한다(PRD 3.7). 이 티켓은 애초에 그런 걸 쓰지 않는다.
 *
 * 색은 딱 한 군데 — 고정 일정의 왼쪽 띠. 화면의 타임라인 카드가 쓰는
 * 것과 같은 --cp-anchor 다. 화면에서 보라 띠로 배운 뜻이 공유 이미지에서도
 * 그대로 통해야 한다.
 */

export const boardingPassStyles = `
  .bp {
    box-sizing: border-box;
    width: 720px;
    padding: 40px 44px 36px;
    background: var(--cp-surface);
    color: var(--cp-ink);
    font-family: var(--cp-font);
    border: 1px solid var(--cp-rule-hard);
    border-radius: var(--cp-radius);
    line-height: 1.5;
  }
  .bp * { box-sizing: border-box; }

  /* ---- 머리 ---- */
  .bp-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    /* 채운 띠 대신 굵은 선 하나. 잉크 반전은 이 앱에서 "지금 이것"을
       뜻하므로, 장식으로 쓰면 그 뜻이 흐려진다. */
    border-bottom: 2px solid var(--cp-rule-hard);
  }
  .bp-brand {
    font-family: var(--cp-mono);
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.22em;
  }
  .bp-code {
    font-family: var(--cp-mono);
    font-size: 13px;
    letter-spacing: 0.1em;
    color: var(--cp-muted);
  }

  /* ---- 여정 ---- */
  .bp-route {
    margin-top: 26px;
    font-size: 30px;
    font-weight: 800;
    letter-spacing: -0.02em;
    word-break: keep-all;
  }
  .bp-when {
    margin-top: 6px;
    font-family: var(--cp-mono);
    font-size: 13px;
    letter-spacing: 0.14em;
    color: var(--cp-muted);
  }

  .bp-leg {
    display: flex;
    align-items: flex-end;
    gap: 18px;
    margin-top: 26px;
    padding: 18px 0;
    border-top: 1px solid var(--cp-rule);
    border-bottom: 1px solid var(--cp-rule);
  }
  .bp-leg-end { flex: 1; min-width: 0; }
  .bp-leg-end.to { text-align: right; }
  .bp-leg-label {
    font-family: var(--cp-mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--cp-muted);
  }
  .bp-leg-place {
    margin-top: 4px;
    font-size: 19px;
    font-weight: 700;
    word-break: keep-all;
  }
  /* 화살표는 글꼴에 기대지 않는다 — 기기마다 모양이 다르고 없을 수도 있다.
     선 두 개로 직접 그린다. */
  .bp-leg-arrow {
    flex-shrink: 0;
    width: 56px;
    height: 1px;
    margin-bottom: 12px;
    background: var(--cp-ink);
    position: relative;
  }
  .bp-leg-arrow::after {
    content: '';
    position: absolute;
    right: 0;
    top: -3px;
    width: 7px;
    height: 7px;
    border-top: 1px solid var(--cp-ink);
    border-right: 1px solid var(--cp-ink);
    transform: rotate(45deg);
  }

  /* ---- 줄 ---- */
  .bp-rows { margin-top: 4px; }
  .bp-row {
    display: flex;
    align-items: baseline;
    gap: 14px;
    padding: 13px 0 13px 14px;
    border-bottom: 1px solid var(--cp-rule);
    /* 고정 일정만 이 자리를 쓴다. 나머지는 투명하게 비워 두어야
       글자 시작선이 흔들리지 않는다. */
    border-left: 3px solid transparent;
  }
  .bp-row[data-anchor="true"] {
    border-left-color: var(--cp-anchor);
  }
  .bp-row-time {
    flex-shrink: 0;
    width: 62px;
    font-family: var(--cp-mono);
    font-size: 16px;
    font-weight: 600;
  }
  .bp-row-name {
    flex: 1;
    min-width: 0;
    font-size: 17px;
    font-weight: 600;
    word-break: keep-all;
  }
  .bp-row-dur {
    flex-shrink: 0;
    font-family: var(--cp-mono);
    font-size: 13px;
    color: var(--cp-muted);
  }
  .bp-row-fixed {
    flex-shrink: 0;
    font-family: var(--cp-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--cp-anchor);
    border: 1px solid var(--cp-anchor);
    border-radius: var(--cp-radius);
    padding: 2px 7px;
  }
  .bp-more {
    padding: 12px 0 0 14px;
    font-family: var(--cp-mono);
    font-size: 13px;
    color: var(--cp-muted);
  }

  /* ---- 절취선 ---- */
  .bp-tear {
    margin: 26px 0 22px;
    border-top: 2px dashed var(--cp-rule);
  }

  /* ---- 합계 ---- */
  .bp-totals {
    display: flex;
    gap: 34px;
    flex-wrap: wrap;
  }
  .bp-total-label {
    font-family: var(--cp-mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--cp-muted);
  }
  .bp-total-value {
    margin-top: 3px;
    font-size: 17px;
    font-weight: 700;
  }
  .bp-total-note {
    margin-top: 2px;
    font-family: var(--cp-mono);
    font-size: 11px;
    color: var(--cp-muted);
  }

  /* 막대와 여백을 번갈아 놓아 폭을 가득 채운다. gap 하나로는 여백 굵기가
     전부 같아져서 바코드가 아니라 빗금처럼 보인다. */
  .bp-bars {
    display: flex;
    align-items: stretch;
    height: 34px;
    margin-top: 26px;
  }
  .bp-bar {
    background: var(--cp-ink);
  }
  .bp-gap {
    background: transparent;
  }
`;

/**
 * 코드 문자열에서 막대 굵기를 만든다.
 *
 * 난수를 쓰지 않는다 — 같은 일정을 두 번 저장하면 같은 그림이 나와야
 * "같은 티켓"으로 읽힌다. 글자값에서 결정적으로 뽑는다.
 */
function barsFor(code, totalWidth = 632) {
  const source = String(code || 'CP');
  const parts = [];
  let used = 0;
  let i = 0;
  while (used < totalWidth) {
    const c = source.charCodeAt(i % source.length) + i * 13;
    // 잉크와 여백을 번갈아 낸다. 굵기는 1~4px.
    const width = Math.min(1 + (c % 4), totalWidth - used);
    parts.push({ width, ink: i % 2 === 0 });
    used += width;
    i += 1;
  }
  return parts;
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * 티켓 한 장을 만들어 돌려준다. 붙이고 찍고 떼는 일은 부르는 쪽이 한다.
 *
 * @param {object} pass boarding-pass.mjs 의 buildBoardingPass 결과
 * @param {{fixedLabel?: string, fromLabel?: string, toLabel?: string,
 *          transitLabel?: string, costLabel?: string, moreLabel?: (n: number) => string}} [labels]
 */
export function renderBoardingPass(pass, labels = {}) {
  const {
    fixedLabel = '확정',
    fromLabel = 'FROM',
    toLabel = 'TO',
    transitLabel = '이동',
    costLabel = '1인 비용',
    moreLabel = n => `+ ${n}곳 더`,
  } = labels;

  const card = el('div', 'bp');

  const head = el('div', 'bp-head');
  head.append(el('div', 'bp-brand', pass.brand), el('div', 'bp-code', pass.code));
  card.append(head);

  if (pass.route) card.append(el('div', 'bp-route', pass.route));
  card.append(el('div', 'bp-when', `${pass.dayLabel} · ${pass.dateLabel}`));

  const leg = el('div', 'bp-leg');
  const end = (cls, label, place) => {
    const box = el('div', `bp-leg-end ${cls}`);
    box.append(el('div', 'bp-leg-label', label), el('div', 'bp-leg-place', place));
    return box;
  };
  leg.append(end('from', fromLabel, pass.from), el('div', 'bp-leg-arrow'), end('to', toLabel, pass.to));
  card.append(leg);

  const rows = el('div', 'bp-rows');
  for (const row of pass.rows) {
    const line = el('div', 'bp-row');
    line.dataset.anchor = String(row.anchor);
    line.append(el('div', 'bp-row-time', row.time), el('div', 'bp-row-name', row.name));
    if (row.duration) line.append(el('div', 'bp-row-dur', row.duration));
    if (row.anchor) line.append(el('div', 'bp-row-fixed', fixedLabel));
    rows.append(line);
  }
  // 잘라낸 것이 있으면 말한다. 조용히 줄이면 받는 사람은 이게 하루
  // 전부인 줄 안다.
  if (pass.more > 0) rows.append(el('div', 'bp-more', moreLabel(pass.more)));
  card.append(rows);

  card.append(el('div', 'bp-tear'));

  const totals = el('div', 'bp-totals');
  const total = (label, value) => {
    const box = el('div', 'bp-total');
    box.append(el('div', 'bp-total-label', label), el('div', 'bp-total-value', value));
    return box;
  };
  if (pass.transit) totals.append(total(transitLabel, pass.transit));
  if (pass.cost) {
    const box = total(costLabel, pass.cost);
    // 합계에 못 넣은 곳이 있으면 그 사실을 같이 적는다. 금액만 보이면
    // 받는 사람은 그게 하루 전부인 줄 안다.
    if (pass.costNote) box.append(el('div', 'bp-total-note', pass.costNote));
    totals.append(box);
  }
  if (totals.childElementCount) card.append(totals);

  const bars = el('div', 'bp-bars');
  for (const { width, ink } of barsFor(pass.code)) {
    const bar = el('div', ink ? 'bp-bar' : 'bp-gap');
    // flex 가 줄이지 못하게 못박는다. 줄어들면 무늬가 코드와 어긋난다.
    bar.style.flex = `0 0 ${width}px`;
    bars.append(bar);
  }
  card.append(bars);

  return card;
}
