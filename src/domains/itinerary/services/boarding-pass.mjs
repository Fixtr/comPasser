/**
 * 공유 이미지를 "탑승권"으로 그리기 위한 순수 로직.
 *
 * 지금까지 "이미지로 저장"은 결과 화면을 그대로 찍었다. 받는 사람 손에는
 * 버튼이 빠진 앱 스크린샷이 갔다 — 우리 화면을 모르는 사람에게는 무엇을
 * 보라는 것인지 알기 어렵다.
 *
 * 탑승권은 이 제품의 은유와 정확히 맞는다. 하루 일정은 여정이고, 사용자가
 * 못박은 고정 일정(AnchorSchedule)은 **확정된 좌석**이다. 출발지와 도착지는
 * 그대로 구간이 된다. 그래서 티켓 한 장이 "이 사람의 하루는 어디서 시작해
 * 어디서 끝나고, 그중 무엇이 반드시 지켜지는가"를 한눈에 말한다.
 *
 * 여기는 DOM 을 모른다. 값만 정리해서 돌려준다 — 그래야 브라우저 없이
 * 검사할 수 있고, 나중에 서버에서 이미지를 만들게 되어도 그대로 쓴다.
 */

import { summarizeCosts, formatCostAmount } from './itinerary-cost.mjs';

/** 티켓 한 장에 들어가는 최대 줄 수. 넘치면 잘라내되 몇 곳인지 남긴다. */
export const MAX_ROWS = 8;

/** 방문지가 아니라 하루의 경계를 뜻하는 항목들. */
const BOUNDARY = new Set(['departure', 'arrival']);

/**
 * "약 15분", "1시간 10분", "지하철 14분 · 2.1km" 에서 분을 읽는다.
 *
 * 단위를 반드시 요구한다. 숫자만 집으면 "2.1km" 의 2 를 2분으로 읽는다 —
 * 이동 안내 문구에는 거리와 시간이 늘 함께 온다.
 */
export function parseDurationMinutes(text) {
  const s = String(text || '');
  const hour = s.match(/(\d+)\s*시간/);
  // 시간 뒤에 붙는 분만 세도록, 분은 앞에 소수점이 없는 정수여야 한다.
  const minute = s.match(/(?<![\d.])(\d+)\s*분/);
  if (!hour && !minute) return null;
  return (hour ? Number(hour[1]) * 60 : 0) + (minute ? Number(minute[1]) : 0);
}

/** 분을 다시 사람이 읽는 길이로. 0 이면 보여줄 것이 없으므로 null. */
export function formatMinutes(minutes, language = 'ko') {
  const total = Number(minutes) || 0;
  if (total <= 0) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (language === 'en') {
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

/**
 * 티켓에 적을 금액과, 합계를 곧이곧대로 믿으면 안 되는 이유.
 *
 * 화면에서는 "1인 예상 비용 ₩9,000 · 2곳은 금액 미정" 한 문장으로 보여
 * 주지만, 티켓에는 라벨이 이미 붙어 있어서 문장을 그대로 넣으면 "비용 /
 * 1인 예상 비용 ₩9,000" 처럼 같은 말이 두 번 적힌다. 그래서 금액과 단서를
 * 나눠서 돌려준다.
 */
function describeCost(stops, language) {
  const summary = summarizeCosts(stops);
  // 돈을 글자로 바꾸는 일은 itinerary-cost 한 곳이 안다. 예전에는 여기서도
  // `₩${n.toLocaleString()}` 을 따로 적고 있었는데, 그 탓에 엔화 일정의
  // 티켓에도 원화 기호가 찍혔다.
  const cost = formatCostAmount(summary, language);
  if (cost === null) return { cost: null, costNote: null };
  const note = summary.unknownCount === 0
    ? null
    : (language === 'en' ? `${summary.unknownCount} not priced` : `${summary.unknownCount}곳 미정`);
  return { cost, costNote: note };
}

/** 'YYYY-MM-DD' → 'YYYY.MM.DD'. 형식이 아니면 받은 값을 그대로 둔다. */
function formatDate(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : String(value || '');
}

/**
 * 표에 적을 이름. 장소 이름이 있으면 그쪽이 우선이다 — 티켓은 "무엇을
 * 하는가"보다 "어디에 있는가"를 말하는 물건이다.
 */
const placeOf = item => String(item?.location || item?.title || '').trim();
const nameOf = item => String(item?.title || item?.location || '').trim();

/**
 * 하루치 일정을 티켓 한 장의 값으로 정리한다.
 * 그릴 것이 없으면 null — 빈 티켓을 내보내지 않는다.
 *
 * @returns {null | {
 *   brand: string, code: string, route: string,
 *   dayLabel: string, dateLabel: string,
 *   from: string, to: string,
 *   rows: Array<{time: string, name: string, duration: string, anchor: boolean}>,
 *   more: number, transit: string|null, cost: string|null, costNote: string|null,
 *   anchorCount: number
 * }}
 */
export function buildBoardingPass({ plan, dayIndex = 0, title = '', language = 'ko' } = {}) {
  const day = plan?.days?.[dayIndex];
  const items = Array.isArray(day?.scheduleItems) ? day.scheduleItems : [];
  const stops = items.filter(item => !BOUNDARY.has(item?.type));
  if (stops.length === 0) return null;

  const departure = items.find(item => item?.type === 'departure');
  const arrival = [...items].reverse().find(item => item?.type === 'arrival');

  // 출발·도착이 없는 일정도 있다. 그때는 첫 곳과 마지막 곳이 구간이 된다.
  const from = placeOf(departure) || placeOf(stops[0]);
  const to = placeOf(arrival) || placeOf(stops[stops.length - 1]);

  const rows = stops.slice(0, MAX_ROWS).map(item => ({
    time: String(item?.time || '').trim(),
    name: nameOf(item),
    duration: String(item?.duration || '').trim(),
    anchor: item?.type === 'AnchorSchedule',
  }));

  // 이동 시간은 전체를 더한다. 잘라낸 뒤의 것도 실제로는 이동하므로
  // rows 가 아니라 stops 전체에서 센다.
  const transitMinutes = stops.reduce(
    (sum, item) => sum + (parseDurationMinutes(item?.transitInfo) || 0), 0);

  const dateLabel = formatDate(day?.date);
  // 일련번호는 날짜와 일차에서만 나온다. 시계를 읽으면 같은 일정을 두 번
  // 저장했을 때 번호가 달라져, 같은 티켓인지 알 수 없다.
  const code = `CP-${dateLabel.replace(/\./g, '').slice(2) || '000000'}-${dayIndex + 1}`;

  const { cost, costNote } = describeCost(stops, language);

  return {
    brand: 'COMPASSER',
    code,
    route: String(title || '').trim(),
    dayLabel: `DAY ${dayIndex + 1}`,
    dateLabel,
    from,
    to,
    rows,
    more: Math.max(0, stops.length - rows.length),
    transit: formatMinutes(transitMinutes, language),
    cost,
    costNote,
    anchorCount: stops.filter(item => item?.type === 'AnchorSchedule').length,
  };
}
