/**
 * Firestore/공유 링크에서 읽어온 원본 일정 데이터를 렌더링 가능한
 * `{ days: [...] }` 형태로 정규화한다. 신버전(itineraryPlan 래핑)과
 * 구버전(days 최상위) 구조를 모두 흡수한다.
 */
export function normalizeData(rawData) {
  if (!rawData) return null;

  // 이미 신버전 구조(itineraryPlan 존재)인 경우
  if (rawData.itineraryPlan && Array.isArray(rawData.itineraryPlan.days)) {
    return rawData.itineraryPlan;
  }

  // 구버전 구조인 경우 (껍데기 씌우기)
  const days = Array.isArray(rawData.days) ? rawData.days : [];
  return { days: days };
}
