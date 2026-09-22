/**
 * 일정의 예상 비용을 합산한다.
 *
 * estimatedCost 는 AI 가 만든 자유 문자열이라 형식이 제각각이다.
 *   "₩3,000 (입장료)" / "₩20,000 - ₩35,000" / "무료" / "Free"
 *   "2,000엔" / "$25" / "지하철 기본요금" / "쇼핑 비용에 따라 다름"
 * 숫자가 없는 값도 흔하므로, 합계만 보여주면 실제보다 적은 금액을 확정된
 * 것처럼 알리게 된다. 그래서 파싱하지 못한 항목 수를 함께 돌려주고 UI 가
 * 그 사실을 같이 표시하도록 한다.
 *
 * **통화를 본다.** 예전에는 세 자리 이상 숫자를 전부 집어 원화로 찍었다.
 * 그래서 "2,000엔"이 "₩2,000"이 됐다 — 열 배쯤 어긋나는데 화면에는
 * 확정된 금액처럼 보인다. 이 앱의 데모가 도쿄인 것을 생각하면 작은 문제가
 * 아니다.
 *
 * **환산은 하지 않는다.** 환율을 끌어오려면 외부 API 와 키, 그리고 "언제
 * 기준인가"라는 문제가 따라온다. 억지로 더하는 순간 화면의 숫자는 근거를
 * 잃는다. 통화가 섞이면 섞인 채로 나란히 보여주고, 더하는 일은 사용자에게
 * 맡긴다.
 */

const FREE_PATTERNS = /(무료|free|없음|no charge)/i;

// 이동 경로는 Google Directions가 유일한 기준이다. AI가 장소 비용 필드에
// 교통비를 섞어 넣은 구버전 일정은 금액 합계에서 제외하고 미확인으로 센다.
// 입장·식사처럼 장소 자체의 비용이 함께 적힌 경우에는 이 필터를 적용하지
// 않아 유효한 방문 비용까지 버리지 않는다.
const TRANSPORT_COST = /(?:대중교통|교통비|교통\s*요금|운임|승차권|버스|지하철|전철|공항철도|철도|열차|기차|택시|\bktx\b|\barex\b|public\s+transit|transport(?:ation)?|transit|\bfare\b|\bbus\b|subway|metro|airport\s+rail(?:road)?|rail(?:way)?|\btrain\b|\btaxi\b|\bcab\b)/i;
const VENUE_COST = /(?:입장|관람|전시|체험|식사|음식|음료|메뉴|숙박|쇼핑|admission|entrance|entry|exhibit|activity|meal|food|drink|hotel|shopping)/i;

export function isTransportEstimatedCost(value, itemType = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return false;
  if (itemType === 'departure' || itemType === 'arrival') return true;
  return TRANSPORT_COST.test(text) && !VENUE_COST.test(text);
}

/**
 * 표기 → ISO 코드. **숫자에 붙어 있을 때만** 통화로 본다.
 *
 * 그냥 글자만 찾으면 "공원"의 원, "이동"의 동 같은 흔한 낱말에 걸린다.
 * 실제로 금액은 늘 숫자와 붙어 적히므로(`₩3,000`, `2,000엔`) 그 인접성을
 * 조건으로 건다.
 *
 * 애매한 둘은 이렇게 정했다.
 *  - `¥` 는 엔과 위안이 함께 쓴다. 위안은 `元`·`위안`·`CNY` 로 따로 적히는
 *    일이 많고 이 앱의 사용자는 한국인이라 엔으로 본다.
 *  - `$` 는 미국·호주·싱가포르·홍콩이 함께 쓴다. 별도 표기가 없으면 달러로
 *    본다. `A$`·`S$`·`HK$`·`NT$` 는 목록에서 먼저 잡힌다(순서가 중요하다).
 *
 * 베트남 동은 `₫`·`VND` 로만 잡는다. 낱말 "동"은 한국어에서 너무 흔해서
 * ("3동", "이동") 숫자 옆에 있어도 믿을 수 없다.
 */
const CURRENCY_MARKS = [
  ['TWD', ['NT\\$', 'TWD'], ['NT\\$', 'TWD', '대만\\s*달러']],
  ['HKD', ['HK\\$', 'HKD'], ['HK\\$', 'HKD', '홍콩\\s*달러']],
  ['SGD', ['S\\$', 'SGD'], ['S\\$', 'SGD', '싱가포르\\s*달러']],
  ['AUD', ['A\\$', 'AUD'], ['A\\$', 'AUD', '호주\\s*달러']],
  ['KRW', ['₩', 'KRW'], ['₩', 'KRW', '원']],
  ['JPY', ['¥', 'JPY'], ['¥', 'JPY', '엔', '円']],
  ['EUR', ['€', 'EUR'], ['€', 'EUR', '유로']],
  ['GBP', ['£', 'GBP'], ['£', 'GBP', '파운드']],
  ['CNY', ['CNY', 'RMB'], ['CNY', 'RMB', '위안', '元']],
  ['THB', ['฿', 'THB'], ['฿', 'THB', '바트']],
  ['VND', ['₫', 'VND'], ['₫', 'VND']],
  ['USD', ['\\$', 'USD'], ['\\$', 'USD', '달러']],
];

/** 표기가 하나도 없을 때 쓰는 값. 가정했다는 사실은 요약에 남긴다. */
const DEFAULT_CURRENCY = 'KRW';

const NUMBER = '\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?';

/** 숫자 앞뒤 어느 쪽에 붙어도 잡도록 두 방향을 함께 본다. */
const MARK_PATTERNS = CURRENCY_MARKS.map(([code, pre, post]) => [
  code,
  new RegExp(`(?:${pre.join('|')})\\s*\\d|\\d[\\d,.\\s]*(?:${post.join('|')})`, 'i'),
]);

/** 그 통화의 표기가 **숫자 바로 옆에** 붙은 자리만 골라내는 정규식. */
const ADJACENT_PATTERNS = new Map(CURRENCY_MARKS.map(([code, pre, post]) => [
  code,
  new RegExp(`(?:(?:${pre.join('|')})\\s*(${NUMBER}))|(?:(${NUMBER})\\s*(?:${post.join('|')}))`, 'gi'),
]));

/** 문자열에서 통화를 읽는다. 표기가 없으면 null. */
export function detectCurrency(text) {
  const value = String(text || '');
  for (const [code, pattern] of MARK_PATTERNS) {
    if (pattern.test(value)) return code;
  }
  return null;
}

/**
 * 금액을 뽑는다. 숫자가 금액으로 인정되는 길은 둘이다.
 *
 *  ① **통화 표기가 그 숫자 바로 옆에 붙어 있다** — `$25`, `2,000엔`.
 *     이러면 두 자리도 금액이다(예전에는 이런 값을 통째로 놓쳤다).
 *  ② 세 자리 이상이다 — 표기 없이 적힌 `12,000` 같은 값.
 *
 * ①을 "문자열 어딘가에 표기가 있으면"으로 느슨하게 잡았다가 "약 2500엔
 * (1인)"의 **1** 이 최소 금액으로 들어왔다. 조건은 문자열 전체가 아니라
 * 그 숫자의 이웃이어야 한다.
 */
function extractAmounts(text, currency) {
  const amounts = [];

  // ① 표기에 붙어 있는 숫자
  const adjacent = currency ? ADJACENT_PATTERNS.get(currency) : null;
  if (adjacent) {
    adjacent.lastIndex = 0;
    let m;
    while ((m = adjacent.exec(text)) !== null) {
      const raw = m[1] ?? m[2];
      const value = Number(String(raw).replace(/,/g, ''));
      if (Number.isFinite(value)) amounts.push(value);
    }
  }

  // ② 표기가 없어도 충분히 큰 숫자
  const big = /(\d{1,3}(?:,\d{3})+|\d{3,})/g;
  let m;
  while ((m = big.exec(text)) !== null) {
    const value = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(value) && value >= 100) amounts.push(value);
  }

  return amounts;
}

/**
 * 비용 문자열 하나를 해석한다.
 * @returns {{min:number, max:number, currency:string|null}|null} 해석 불가면 null
 */
export function parseCost(text) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return null;

  const currency = detectCurrency(value);
  const amounts = extractAmounts(value, currency);

  if (amounts.length === 0) {
    // 숫자가 없더라도 "무료"라고 적혀 있으면 0 으로 확정할 수 있다.
    // 0 원과 0 엔은 같으므로 통화를 정할 필요가 없다.
    return FREE_PATTERNS.test(value) ? { min: 0, max: 0, currency: null } : null;
  }

  return { min: Math.min(...amounts), max: Math.max(...amounts), currency };
}

/**
 * 하루치 일정의 비용을 통화별로 합산한다.
 *
 * 표기 없는 금액은 **그날에 나온 유일한 통화**에 붙인다. 하루 안에서
 * "¥1,500" 과 맨숫자 "3000" 이 섞이면 둘 다 엔이라고 보는 것이 자연스럽다 —
 * AI 는 하루를 한 통화로 쓴다. 표기가 하나도 없으면 원화로 보되,
 * 가정했다는 사실을 `assumedCurrency` 로 남긴다.
 *
 * @param {Array} scheduleItems
 * @returns {{
 *   totals: Array<{currency: string, min: number, max: number, count: number}>,
 *   knownCount: number, unknownCount: number,
 *   mixed: boolean, assumedCurrency: boolean
 * }}
 */
export function summarizeCosts(scheduleItems) {
  const items = Array.isArray(scheduleItems) ? scheduleItems : [];
  const parsed = [];
  let unknownCount = 0;

  items.forEach(item => {
    // 출발/도착 지점은 방문지가 아니라 경계 표시라 비용 대상이 아니다.
    if (item?.type === 'departure' || item?.type === 'arrival') return;

    const raw = item?.practicalInfo?.estimatedCost;
    if (isTransportEstimatedCost(raw, item?.type)) {
      unknownCount += 1;
      return;
    }
    const cost = parseCost(raw);
    if (!cost) {
      // Missing information is not evidence of free admission/food.
      unknownCount += 1;
      return;
    }
    parsed.push(cost);
  });

  const named = [...new Set(parsed.map(c => c.currency).filter(Boolean))];
  const fallback = named.length === 1 ? named[0] : DEFAULT_CURRENCY;

  const buckets = new Map();
  for (const cost of parsed) {
    const code = cost.currency || fallback;
    const bucket = buckets.get(code) || { currency: code, min: 0, max: 0, count: 0 };
    bucket.min += cost.min;
    bucket.max += cost.max;
    bucket.count += 1;
    buckets.set(code, bucket);
  }

  // 큰 금액이 앞에 온다 — 여러 통화가 보일 때 무엇이 주된 지출인지 먼저 읽힌다.
  const totals = [...buckets.values()].sort((a, b) => b.max - a.max);

  return {
    totals,
    knownCount: parsed.length,
    unknownCount,
    mixed: totals.length > 1,
    assumedCurrency: named.length === 0 && parsed.length > 0,
  };
}

/**
 * 돈을 글자로 바꾸는 곳은 여기 하나다.
 *
 * 화면과 공유 티켓이 각자 `₩${n.toLocaleString()}` 을 적고 있었는데, 그러면
 * 통화가 늘어날 때 한쪽만 고쳐진다. 소수점은 버린다 — 어차피 추정치라
 * 센트 단위는 정보가 아니라 잡음이다.
 */
function money(amount, currency, language, distinct) {
  const locale = language === 'en' ? 'en-US' : 'ko-KR';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      // 통화가 하나면 좁은 기호(₩·¥·$)가 읽기 쉽다. 여럿이 나란히 설 때는
      // 구분되는 표기(JP¥·US$)를 쓴다 — `$` 하나로 미국과 호주를 함께
      // 가리키면 그 줄은 거짓말이 된다.
      currencyDisplay: distinct ? 'symbol' : 'narrowSymbol',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // 알 수 없는 코드가 들어와도 화면이 비지는 않게 한다.
    return `${amount.toLocaleString(locale)} ${currency}`;
  }
}

/**
 * 합계의 **금액 부분만** 돌려준다(티켓처럼 라벨이 따로 붙는 자리용).
 * 통화가 섞였으면 환산하지 않고 나란히 놓는다.
 * @returns {string|null} 합산할 게 없으면 null
 */
export function formatCostAmount(summary, language = 'ko') {
  if (summary?.unknownCount > 0 && (!summary.totals?.length || summary.totals.every(total => total.max === 0))) {
    return language === 'ko' ? '비용 미확인' : 'Cost unknown';
  }
  if (!summary || !Array.isArray(summary.totals) || summary.totals.length === 0) return null;
  const distinct = summary.totals.length > 1;
  return summary.totals
    .map(({ currency, min, max }) => (min === max
      ? money(min, currency, language, distinct)
      : `${money(min, currency, language, distinct)} ~ ${money(max, currency, language, distinct)}`))
    .join(' · ');
}

/** 1인 기준 합계를 사람이 읽는 문구로. 합산할 게 없으면 null. */
export function formatCostSummary(summary, language = 'ko') {
  if (summary?.unknownCount > 0 && (!summary.totals?.length || summary.totals.every(total => total.max === 0))) {
    return language === 'ko' ? `예상 비용 미확인 · ${summary.unknownCount}곳은 금액 미정`
      : `Estimated cost unknown · ${summary.unknownCount} stop(s) not priced`;
  }
  const amount = formatCostAmount(summary, language);
  if (amount === null) return null;

  const isKo = language === 'ko';
  const base = isKo ? `1인 예상 비용 ${amount}` : `Est. ${amount} per person`;

  if (summary.unknownCount === 0) return base;
  return isKo
    ? `${base} · ${summary.unknownCount}곳은 금액 미정`
    : `${base} · ${summary.unknownCount} stop(s) not priced`;
}
