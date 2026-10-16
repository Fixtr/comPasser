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
export function applyTransitDelays(scheduleItems, transitRoutes, requestedStartTime) {
  if (!Array.isArray(scheduleItems) || scheduleItems.length === 0) return scheduleItems;

  const validTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '');
  const result = scheduleItems.map(item => {
    if (item.type === 'departure') {
      // The user's requested start is authoritative, not an AI preparation
      // start. Legacy plans without a request retain the preparation end.
      const departureTime = validTime(requestedStartTime) ? requestedStartTime
        : validTime(item.endTime) ? item.endTime : item.time;
      return { ...item, time: departureTime, endTime: '', duration: '' };
    }
    return item.type === 'arrival' ? { ...item, endTime: '', duration: '' } : { ...item };
  });

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
      // A late journey cannot reschedule a user's fixed appointment.
      if (result[i].type === 'AnchorSchedule' && result[i].flexible !== true) continue;
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

      if (validTime(result[i].visitNotBefore)) earliestArrival=Math.max(earliestArrival,minutesOf(result[i].visitNotBefore));
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

/**
 * 종료 시각을 넘긴 일정을 실제로 줄여서 맞춘다.
 *
 * 경고만 띄우면 사용자가 직접 폼으로 돌아가 다시 만들어야 한다. 초과분은
 * 대개 "마지막 방문지에 너무 오래 머무는" 데서 오므로, 뒤에서부터 체류
 * 시간을 깎아 도착이 종료 시각에 맞도록 한다. 시각을 눌러 속이는 게 아니라
 * 실제로 일정을 줄이는 것이라 표시된 시각은 계속 사실이다.
 *
 * 규칙
 *  - 마지막 방문지부터 거슬러 올라가며 줄인다(늦게 잡힌 일정이 먼저 희생).
 *  - 체류 시간은 식사 60분, 카페·기타 방문 20분까지만 줄인다. 그보다 더
 *    줄여야 하면 그 항목을 통째로 뺀다 — 5분짜리 방문은 의미가 없다.
 *  - 사용자가 지정한 필수 일정(AnchorSchedule)과 출발/도착은 건드리지 않는다.
 *  - 그래도 못 맞추면 할 수 있는 만큼만 줄이고 남은 초과를 알린다.
 *
 * @param {Array} scheduleItems 보정이 끝난 하루치 일정
 * @param {string} dayEndTime 사용자가 지정한 종료 시각("HH:MM")
 * @returns {{items: Array, removedTitles: string[], shortenedCount: number, resolved: boolean}}
 */
export const minimumStayMinutes = item => item?.placeIntent?.category === 'restaurant' ||
  (item?.type === 'dining' && item?.placeIntent?.category !== 'cafe') ? 60 : 20;

export function trimScheduleToEndTime(scheduleItems, dayEndTime) {
  const unchanged = { items: scheduleItems, removedTitles: [], shortenedCount: 0, resolved: true };
  if (!Array.isArray(scheduleItems) || scheduleItems.length === 0) return unchanged;

  let overflow = getEndTimeOverflowMinutes(scheduleItems, dayEndTime);
  if (overflow <= 0) return unchanged;

  // 항목 사이 간격(=이동시간)을 미리 기록해 둔다. 줄이거나 뺀 뒤에 원본을
  // 다시 읽으면 이미 바뀐 값이라 얼마나 당길 수 있는지 알 수 없다.
  const items = scheduleItems.map((item, i) => {
    let gapBefore = 0;
    if (i > 0) {
      const prev = scheduleItems[i - 1];
      const prevEnd = minutesOf(prev.endTime) ?? minutesOf(prev.time);
      const start = minutesOf(item.time);
      if (prevEnd !== null && start !== null) gapBefore = Math.max(0, start - prevEnd);
    }
    return { ...item, __gapBefore: gapBefore };
  });
  const removedTitles = [];
  let shortenedCount = 0;

  const isTrimmable = (item) => (
    item.type !== 'AnchorSchedule' && item.type !== 'departure' && item.type !== 'arrival'
  );

  // 마지막 방문지부터 거슬러 올라간다(도착 항목은 제외).
  for (let i = items.length - 1; i >= 0 && overflow > 0; i--) {
    const item = items[i];
    if (!isTrimmable(item)) continue;

    const start = minutesOf(item.time);
    const end = minutesOf(item.endTime);
    if (start === null || end === null || end <= start) continue;

    const stay = end - start;
    const canShorten = Math.max(0, stay - minimumStayMinutes(item));

    if (canShorten >= overflow) {
      item.endTime = formatMinutes(end - overflow);
      shortenedCount += 1;
      overflow = 0;
      break;
    }

    // 최소 체류 시간까지 줄여도 모자라면 이 항목은 빼는 편이 낫다.
    removedTitles.push(item.title || '');
    items.splice(i, 1);
    overflow -= stay;
  }

  // 앞 항목을 줄이거나 뺀 만큼 뒤 항목들을 당겨온다.
  const shifted = pullForward(items);

  // 내부용 필드는 화면/저장 데이터에 남기지 않는다.
  const cleaned = shifted.map(({ __gapBefore, ...item }) => item);

  return {
    items: cleaned,
    removedTitles,
    shortenedCount,
    resolved: getEndTimeOverflowMinutes(cleaned, dayEndTime) <= 0
  };
}

/**
 * 앞 항목이 줄어든 만큼 뒤 항목들을 앞으로 당긴다.
 * 각 항목의 체류 시간과 항목 사이 간격(이동시간)은 그대로 유지한다.
 */
function pullForward(items) {
  const result = items.map(item => ({ ...item }));

  for (let i = 1; i < result.length; i++) {
    if (result[i].type === 'AnchorSchedule') continue;
    const prevEnd = minutesOf(result[i - 1].endTime) ?? minutesOf(result[i - 1].time);
    const start = minutesOf(result[i].time);
    if (prevEnd === null || start === null) continue;

    // 원래 간격(이동시간)만큼은 반드시 남긴다. 앞이 줄어든 만큼만 당긴다.
    const nextStart = prevEnd + (result[i].__gapBefore || 0);
    if (nextStart >= start) continue; // 당길 여지가 없다

    const shift = start - nextStart;
    const end = minutesOf(result[i].endTime);
    result[i].time = formatMinutes(start - shift);
    if (end !== null) result[i].endTime = formatMinutes(end - shift);
  }

  // 도착 시각을 종료 시각으로 눌러 담지 않는다. 줄일 수 없어 여전히 늦는다면
  // 그 사실을 그대로 보여주고 resolved: false 로 알리는 게 맞다
  // (표시 시각을 속이면 실제로 그 시각에 도착하는 것처럼 오해하게 된다).
  return result;
}
