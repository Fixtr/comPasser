/**
 * Gemini가 생성한 일정의 시간은 AI의 추정치일 뿐이라, 실제 대중교통
 * 소요시간(map-view.js가 Google Directions API로 계산해 transit-info-ready
 * 이벤트로 흘려보내는 값)과 어긋날 수 있다. 예: A 방문이 09:00-10:00,
 * B 방문이 10:00-11:00으로 생성됐는데 실제 이동에 45분이 걸리면, B의
 * 실제 관람 가능 시간은 15분뿐이다.
 *
 * 이 모듈은 실제 이동시간이 밝혀진 뒤 뒷 항목들의 시작/종료 시각을
 * 필요한 만큼만 뒤로 밀어, 각 항목의 원래 체류 시간(endTime - time)이
 * 이동시간에 잠식되지 않도록 보정한다. 이미 여유가 있던 구간은 건드리지
 * 않는다(당겨오지 않고, 필요한 만큼만 미룬다).
 */

function minutesOf(time) {
  if (!/^\d{2}:\d{2}$/.test(time || '')) return null;
  const [hours, mins] = time.split(':').map(Number);
  return (hours * 60) + mins;
}

function formatMinutes(totalMinutes) {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * @param {Array<{time?: string, endTime?: string}>} scheduleItems 표시 순서대로 정렬된 하루치 일정
 * @param {Array<{fromIndex: number, durationMinutes?: number|null}>} transitRoutes map-view.js 가 계산한 구간별 실제 소요시간
 * @returns {Array} 시각이 보정된 새 scheduleItems 배열 (입력은 변경하지 않음)
 */
export function applyTransitDelays(scheduleItems, transitRoutes) {
  if (!Array.isArray(scheduleItems) || scheduleItems.length === 0) return scheduleItems;
  if (!Array.isArray(transitRoutes) || transitRoutes.length === 0) return scheduleItems;

  const transitMinutesByFromIndex = new Map();
  transitRoutes.forEach(route => {
    if (
      route &&
      typeof route.fromIndex === 'number' &&
      typeof route.durationMinutes === 'number' &&
      Number.isFinite(route.durationMinutes)
    ) {
      transitMinutesByFromIndex.set(route.fromIndex, route.durationMinutes);
    }
  });

  const result = scheduleItems.map(item => ({ ...item }));

  for (let i = 1; i < result.length; i++) {
    const prev = result[i - 1];
    const transitMinutes = transitMinutesByFromIndex.get(i - 1);
    if (typeof transitMinutes !== 'number') continue; // 실제 소요시간을 모르면 건드리지 않는다

    const prevEnd = minutesOf(prev.endTime) ?? minutesOf(prev.time);
    const originalStart = minutesOf(result[i].time);
    if (prevEnd === null || originalStart === null) continue; // 시간 형식이 이상하면 건드리지 않는다

    const earliestArrival = prevEnd + transitMinutes;
    if (earliestArrival <= originalStart) continue; // 이미 여유가 있으면 그대로 둔다

    const delay = earliestArrival - originalStart;
    const originalEnd = minutesOf(result[i].endTime);

    result[i].time = formatMinutes(originalStart + delay);
    if (originalEnd !== null) {
      // 체류 시간(원래 endTime - time)을 그대로 유지한 채 뒤로 민다
      result[i].endTime = formatMinutes(originalEnd + delay);
    }
  }

  return result;
}
