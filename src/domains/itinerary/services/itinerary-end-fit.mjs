import { nextVisitStart } from './itinerary-hours.mjs';
import { applyTransitDelays, getEndTimeOverflowMinutes, minimumStayMinutes, routeDepartureClock, minutesOf as minutes } from './itinerary-schedule-adjust.mjs';

const time = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

export function hasUnavoidableFixedArrivalConflict(items, routes) {
  if (!Array.isArray(items)) return false;
  return items.some((target, index) => {
    if (target.type !== 'AnchorSchedule' || index === 0 ||
        !['departure', 'AnchorSchedule'].includes(items[index - 1].type)) return false;
    const departure = minutes(routeDepartureClock(items[index - 1])) ?? minutes(items[index - 1].time);
    const deadline = minutes(target.time);
    if (departure === null || deadline === null) return false;
    if (departure > deadline) return true;
    return (routes || []).some(route => route.fromIndex === index - 1 &&
      (route.toIndex ?? route.fromIndex + 1) === index &&
      Number.isFinite(route.durationMinutes) && route.durationMinutes >= 0 &&
      departure + route.durationMinutes > deadline);
  });
}

export function hasFixedArrivalConflict(items, routes) {
  if (!Array.isArray(items)) return false;
  // Known overlapping visits are impossible even when a missing place means
  // Google cannot return the intervening route. Do not require a route to warn.
  if (items.some((item, index) => {
    if (item.type !== 'AnchorSchedule') return false;
    const deadline = minutes(item.time);
    return deadline !== null && items.slice(0, index).some(previous => {
      const end = minutes(previous.endTime) ?? minutes(previous.time);
      return end !== null && end > deadline;
    });
  })) return true;
  return (routes || []).some(route => {
    const to = route.toIndex ?? route.fromIndex + 1;
    const origin = items[route.fromIndex], target = items[to];
    const departure = minutes(routeDepartureClock(origin)) ?? minutes(origin?.time);
    const deadline = minutes(target?.time);
    return target?.type === 'AnchorSchedule' && departure !== null && deadline !== null &&
      Number.isFinite(route.durationMinutes) && route.durationMinutes >= 0 &&
      departure + route.durationMinutes > deadline;
  });
}

// Fit each fully measured block independently. Recheck routes after removing
// an optional stop; old route indexes no longer describe the new neighbors.
export function fitMeasuredSchedule(items, routes, endTime, startTime, { compact = false, date = '', hoursByIndex = [] } = {}) {
  if (Array.isArray(items)) {
    const resolved = items.filter(item => item.type === 'AnchorSchedule' ||
      item.type === 'departure' || item.type === 'arrival' ||
      item.addedByUser === true || !item.placeIntent || item.placeStatus !== 'unresolved' ||
      !['filtered', 'no-results'].includes(item.unresolvedReason));
    if (resolved.length !== items.length) return { items: resolved, adjusted: true };
  }
  const delayed = applyTransitDelays(items, routes, startTime);
  const unchanged = { items: delayed, adjusted: false };
  const ceiling = minutes(endTime);
  if (!Array.isArray(items) || items.length < 2 || ceiling === null ||
      items[0].type !== 'departure' || items.at(-1).type !== 'arrival') return unchanged;
  const travel = new Map();
  for (const route of routes || []) {
    const to = route.toIndex ?? route.fromIndex + 1;
    if (Number.isInteger(route.fromIndex) && to === route.fromIndex + 1 &&
        Number.isFinite(route.durationMinutes) && route.durationMinutes >= 0) {
      travel.set(to, Math.ceil(route.durationMinutes));
    }
  }
  const starts = items.map((item, i) => minutes(item.type === 'departure' ? delayed[i].time : item.time));
  const ends = items.map((item, i) => ['departure', 'arrival'].includes(item.type) ? starts[i] : minutes(item.endTime) ?? starts[i]);
  const result = delayed.map(item => ({ ...item }));
  let adjusted = false;
  const stays = ends.map((end, i) => end - starts[i]);
  const fixed = [0, ...items.flatMap((item, i) => i > 0 && i < items.length - 1 && item.type === 'AnchorSchedule' && item.flexible !== true ? [i] : []), items.length - 1];
  for (let block = 1; block < fixed.length; block++) {
    const left = fixed[block - 1], right = fixed[block];
    const deadline = right === items.length - 1 ? ceiling : starts[right];
    // An unknown afternoon route must not prevent repairing the measured
    // morning block. Never use a missing route as a zero-minute journey.
    if (deadline === null || ends[left] === null || Array.from({length:right-left}, (_, n) => left+n+1)
      .some(i => !travel.has(i) || starts[i] === null || ends[i] < starts[i])) continue;
    const previousEnd = minutes(delayed[right-1].endTime) ?? minutes(delayed[right-1].time);
    const conflict = right === items.length - 1
      ? getEndTimeOverflowMinutes(delayed, endTime) > 0
      : previousEnd + travel.get(right) > deadline;
    if (!conflict && !compact && !items.slice(left + 1, right).some(item => item.flexible === true)) continue;
    const visitStart = (i, cursor) => {
      // Preserve requested lower bounds and meal windows while removing AI padding.
      const meal = items[i].type === 'dining' && items[i].placeIntent?.category !== 'cafe'
        ? (starts[i] >= 1080 ? 1080 : compact && starts[i] >= 660 ? 720 : cursor) : cursor;
      cursor = Math.max(cursor, minutes(items[i].visitNotBefore) ?? cursor, Math.min(starts[i], meal),
        items[i].addedByUser === true ? starts[i] : cursor);
      return nextVisitStart(items[i], date, hoursByIndex[i], cursor, stays[i], Math.max(deadline, cursor + stays[i])) ?? deadline + 1;
    };
    const projectedEnd = () => {
      let cursor=ends[left];
      for(let i=left+1;i<=right;i++) {
        cursor+=travel.get(i) + (items[i-1].gapFill ? 30 : 0);
        if(i<right) cursor=visitStart(i, cursor)+stays[i];
      }
      return cursor;
    };
    let excess = Math.max(0, projectedEnd() - deadline);
    for (let i = right - 1; i > left && excess > 0; i--) {
      if (items[i].type === 'AnchorSchedule' || items[i].addedByUser === true) continue;
      const reduction = Math.min(excess, Math.max(0, stays[i] - minimumStayMinutes(items[i])));
      stays[i] -= reduction;
      excess = Math.max(0, projectedEnd() - deadline);
    }
    if (excess > 0) {
      const removable = Array.from({ length: right - left - 1 }, (_, n) => right - 1 - n)
        .find(i => items[i].type !== 'AnchorSchedule' && items[i].placeIntent && items[i].addedByUser !== true);
      if (removable !== undefined) return {
        items: items.filter((_, i) => i !== removable).map((item, i) => i === 0 ? delayed[0] : item),
        adjusted: true
      };
      continue;
    }
    let cursor = ends[left];
    for (let i = left + 1; i <= right; i++) {
      cursor += travel.get(i) + (items[i-1].gapFill ? 30 : 0);
      if (i === right && i !== items.length - 1) break; // fixed anchor may include waiting
      if(i<right) cursor=visitStart(i, cursor);
      result[i].time = time(cursor);
      if (i < right) {
        cursor += stays[i];
        result[i].endTime = time(cursor);
        if (stays[i] !== ends[i] - starts[i]) delete result[i].duration;
      } else result[i].endTime = '';
    }
  }
  adjusted = result.some((item, i) => item.time !== delayed[i].time || item.endTime !== delayed[i].endTime);
  return { items: result, adjusted };
}
