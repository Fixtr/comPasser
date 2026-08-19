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

  const result = scheduleItems.map(item => ({ ...item }));

  // 실제 이동시간 데이터가 있을 때만 지연 보정 루프를 돈다.
  //
  // 경로는 fromIndex 가 아니라 toIndex 로 색인한다. 지오코딩에 실패한 항목은
  // 지도에서 빠지므로 구간이 연속이라는 보장이 없다. 예: A,B,C,D 중 C가
  // 실패하면 지도는 A→B(0→1)와 B→D(1→3) 두 구간만 계산한다. 이때
  // fromIndex 로 "i-1 구간"을 찾으면 B→D 의 소요시간이 C 에 붙어버려
  // C 가 D 의 자리로 밀리고 D 는 거기서 또 밀린다(실측 1시간 이상 오차).
  // "이 항목에 도착하는 경로"를 toIndex 로 찾으면 건너뛴 구간도 정확해진다.
  if (Array.isArray(transitRoutes) && transitRoutes.length > 0) {
    const routeByToIndex = new Map();
    transitRoutes.forEach(route => {
      if (
        route &&
        typeof route.durationMinutes === 'number' &&
        Number.isFinite(route.durationMinutes) &&
        typeof route.fromIndex === 'number'
      ) {
        // toIndex 가 없는 예전 데이터는 연속 구간(fromIndex + 1)으로 본다.
        const toIndex = typeof route.toIndex === 'number' ? route.toIndex : route.fromIndex + 1;
        routeByToIndex.set(toIndex, { fromIndex: route.fromIndex, durationMinutes: route.durationMinutes });
      }
    });

    for (let i = 1; i < result.length; i++) {
      const originalStart = minutesOf(result[i].time);
      if (originalStart === null) continue; // 시간 형식이 이상하면 건드리지 않는다

      const route = routeByToIndex.get(i);
      let earliestArrival = null;

      if (route && route.fromIndex >= 0 && route.fromIndex < i) {
        // 이 항목으로 오는 실제 경로가 있다: 출발 항목의 종료 시각 + 소요시간
        const origin = result[route.fromIndex];
        const originEnd = minutesOf(origin.endTime) ?? minutesOf(origin.time);
        if (originEnd !== null) earliestArrival = originEnd + route.durationMinutes;
      }

      if (earliestArrival === null) {
        // 실제 소요시간을 모르는 항목(지오코딩 실패 등)이라도 최소한 앞 항목과
        // 겹치거나 시간이 역전되지는 않게 한다.
        const prev = result[i - 1];
        const prevEnd = minutesOf(prev.endTime) ?? minutesOf(prev.time);
        if (prevEnd === null) continue;
        earliestArrival = prevEnd;
      }

      if (earliestArrival <= originalStart) continue; // 이미 여유가 있으면 그대로 둔다

      const delay = earliestArrival - originalStart;
      const originalEnd = minutesOf(result[i].endTime);

      result[i].time = formatMinutes(originalStart + delay);
      if (originalEnd !== null) {
        // 체류 시간(원래 endTime - time)을 그대로 유지한 채 뒤로 민다
        result[i].endTime = formatMinutes(originalEnd + delay);
      }
    }
  }

  return result;
}

/**
 * 마지막 항목(도착 지점)이 사용자가 지정한 종료 시각을 몇 분 넘겼는지 돌려준다.
 *
 * 예전에는 이 상황에서 도착 시각 자체를 종료 시각으로 눌러버렸는데, 그러면
 * "20:07 에 일정이 끝나고 94분을 이동했는데 20:51 도착"처럼 사실과 다른
 * 시각이 표시된다. 시각은 실제 계산 결과(21:41) 그대로 두고, 초과했다는
 * 사실만 이 함수로 알려 UI가 경고를 띄우게 한다.
 *
 * @param {Array<{time?: string, endTime?: string}>} scheduleItems 보정이 끝난 하루치 일정
 * @param {string} dayEndTime 사용자가 지정한 종료 시각("HH:MM")
 * @returns {number} 초과한 분(0이면 초과 없음)
 */
export function getEndTimeOverflowMinutes(scheduleItems, dayEndTime) {
  const ceilingMinutes = minutesOf(dayEndTime);
  if (ceilingMinutes === null) return 0;
  if (!Array.isArray(scheduleItems) || scheduleItems.length === 0) return 0;

  const lastIndex = scheduleItems.length - 1;
  const last = scheduleItems[lastIndex];
  let lastMinutes = minutesOf(last.endTime) ?? minutesOf(last.time);
  if (lastMinutes === null) return 0;

  // 자정을 넘긴 시각("01:33")은 숫자만 보면 종료 시각보다 작아 보인다.
  // 직전 항목보다 1시간 넘게 이르면 자정을 넘긴 것으로 보고 24시간을 더한다.
  const referenceMinutes = lastIndex > 0
    ? (minutesOf(scheduleItems[lastIndex - 1].endTime) ?? minutesOf(scheduleItems[lastIndex - 1].time))
    : null;
  if (referenceMinutes !== null && lastMinutes < referenceMinutes - 60) {
    lastMinutes += 1440;
  }

  return Math.max(0, lastMinutes - ceilingMinutes);
}
