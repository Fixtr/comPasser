import { normalizeData } from './itinerary-normalize.mjs';

/**
 * 저장된 일정을 목록에서 구분할 수 있는 제목을 만든다.
 *
 * 예전에는 모든 카드가 "여행 일정 (N개의 핵심 장소)" + 저장일로만 표시돼,
 * 여러 개를 저장하면 무엇이 무엇인지 알 수 없었다(저장일은 여행 날짜도
 * 아니다). 여행 날짜와 실제 방문지를 조합해 한눈에 구분되게 한다.
 *
 * 출발/도착 지점은 대개 호텔·공항이라 변별력이 없으므로 제외하고,
 * 실제 방문지(관광/식사/필수 일정)를 기준으로 삼는다.
 */

const SKIPPED_TYPES = new Set(['departure', 'arrival']);

function pad(n) {
  return String(n).padStart(2, '0');
}

/** "2026-08-20" -> {month: 8, day: 20}. 파싱 실패 시 null. */
function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function formatDateRange(days, isKo) {
  const first = parseDate(days[0]?.date);
  const last = parseDate(days[days.length - 1]?.date);
  if (!first) return '';

  const one = (d) => (isKo ? `${d.month}월 ${d.day}일` : `${pad(d.month)}/${pad(d.day)}`);
  if (!last || days.length === 1 || (first.month === last.month && first.day === last.day)) {
    return one(first);
  }
  return isKo ? `${one(first)}~${one(last)}` : `${one(first)}–${one(last)}`;
}

/** 출발/도착을 뺀 실제 방문지 제목들. */
function realStopTitles(days) {
  const titles = [];
  days.forEach(day => {
    (day?.scheduleItems || []).forEach(item => {
      if (SKIPPED_TYPES.has(item?.type)) return;
      const title = typeof item?.title === 'string' ? item.title.trim() : '';
      if (title) titles.push(title);
    });
  });
  return titles;
}

/**
 * @param {object} itinerary 저장 대상 일정({request, days} 또는 {itineraryPlan})
 * @param {string} [language] 'ko' | 'en'
 * @returns {string} 예: "8월 20일 · 경복궁 외 3곳", "8월 20일~22일 · 3일 여행"
 */
export function buildItineraryTitle(itinerary, language = 'ko') {
  const isKo = language === 'ko';
  const plan = normalizeData(itinerary);
  const days = Array.isArray(plan?.days) ? plan.days : [];

  const fallback = isKo ? '여행 일정' : 'Trip plan';
  if (days.length === 0) return fallback;

  const dateText = formatDateRange(days, isKo);

  // 여러 날 일정은 날짜 범위와 일수가 가장 알아보기 쉽다.
  if (days.length > 1) {
    const nights = days.length - 1;
    const span = isKo ? `${nights}박 ${days.length}일` : `${days.length} days`;
    return dateText ? `${dateText} · ${span}` : span;
  }

  const stops = realStopTitles(days);
  if (stops.length === 0) return dateText || fallback;

  const [firstStop] = stops;
  const rest = stops.length - 1;
  const stopText = rest > 0
    ? (isKo ? `${firstStop} 외 ${rest}곳` : `${firstStop} +${rest} more`)
    : firstStop;

  return dateText ? `${dateText} · ${stopText}` : stopText;
}
