/**
 * 일정의 예상 비용을 합산한다.
 *
 * estimatedCost 는 AI 가 만든 자유 문자열이라 형식이 제각각이다.
 *   "₩3,000 (입장료)" / "₩20,000 - ₩35,000" / "무료" / "Free"
 *   "지하철 기본요금" / "쇼핑 및 식사 비용에 따라 다름"
 * 숫자가 없는 값도 흔하므로, 합계만 보여주면 실제보다 적은 금액을 확정된
 * 것처럼 알리게 된다. 그래서 파싱하지 못한 항목 수를 함께 돌려주고 UI 가
 * 그 사실을 같이 표시하도록 한다.
 */

const FREE_PATTERNS = /(무료|free|없음|no charge)/i;

/** 통화 표기가 붙었거나 세 자리 이상인 수만 금액으로 본다("2인" 같은 값 제외). */
function extractAmounts(text) {
  const amounts = [];
  // ₩10,000 / 10,000원 / KRW 10000 / 10,000
  const re = /(?:₩|krw\s*)?\s*(\d{1,3}(?:,\d{3})+|\d{3,})\s*(?:원|krw)?/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const value = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(value) && value >= 100) amounts.push(value);
  }
  return amounts;
}

/**
 * 비용 문자열 하나를 {min, max} 로 해석한다.
 * @returns {{min:number, max:number}|null} 해석 불가면 null
 */
export function parseCost(text) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return null;

  const amounts = extractAmounts(value);
  if (amounts.length === 0) {
    // 숫자가 없더라도 "무료"라고 적혀 있으면 0 으로 확정할 수 있다.
    return FREE_PATTERNS.test(value) ? { min: 0, max: 0 } : null;
  }

  return { min: Math.min(...amounts), max: Math.max(...amounts) };
}

/**
 * 하루치 일정의 비용을 합산한다.
 *
 * @param {Array} scheduleItems
 * @returns {{min:number, max:number, knownCount:number, unknownCount:number}}
 */
export function summarizeCosts(scheduleItems) {
  const items = Array.isArray(scheduleItems) ? scheduleItems : [];
  let min = 0;
  let max = 0;
  let knownCount = 0;
  let unknownCount = 0;

  items.forEach(item => {
    // 출발/도착 지점은 방문지가 아니라 경계 표시라 비용 대상이 아니다.
    if (item?.type === 'departure' || item?.type === 'arrival') return;

    const raw = item?.practicalInfo?.estimatedCost;
    const parsed = parseCost(raw);
    if (!parsed) {
      // 값이 아예 없는 항목은 "비용 정보 없음"으로 세지 않는다(무료 관광지 등
      // 정보 자체가 비어 있는 경우와, 금액이 적혀 있는데 못 읽은 경우를 구분).
      if (typeof raw === 'string' && raw.trim()) unknownCount += 1;
      return;
    }
    min += parsed.min;
    max += parsed.max;
    knownCount += 1;
  });

  return { min, max, knownCount, unknownCount };
}

/** 1인 기준 합계를 사람이 읽는 문구로. 합산할 게 없으면 null. */
export function formatCostSummary(summary, language = 'ko') {
  if (!summary || summary.knownCount === 0) return null;
  const isKo = language === 'ko';
  const won = (n) => `₩${n.toLocaleString('ko-KR')}`;

  const amount = summary.min === summary.max ? won(summary.min) : `${won(summary.min)} ~ ${won(summary.max)}`;
  const base = isKo ? `1인 예상 비용 ${amount}` : `Est. ${amount} per person`;

  if (summary.unknownCount === 0) return base;
  return isKo
    ? `${base} · ${summary.unknownCount}곳은 금액 미정`
    : `${base} · ${summary.unknownCount} stop(s) not priced`;
}
