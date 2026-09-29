import { applyTransitDelays, getEndTimeOverflowMinutes, minimumStayMinutes } from './itinerary-schedule-adjust.mjs';

const minutes = value => {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};
const time = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

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
    const departure = minutes(origin?.endTime) ?? minutes(origin?.time);
    const deadline = minutes(target?.time);
    return target?.type === 'AnchorSchedule' && departure !== null && deadline !== null &&
      Number.isFinite(route.durationMinutes) && route.durationMinutes >= 0 &&
      departure + route.durationMinutes > deadline;
  });
}

// Fit each fully measured block independently. Recheck routes after removing
// an optional stop; old route indexes no longer describe the new neighbors.
export function fitMeasuredSchedule(items, routes, endTime, startTime) {
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
  const fixed = [0, ...items.flatMap((item, i) => i > 0 && i < items.length - 1 && item.type === 'AnchorSchedule' ? [i] : []), items.length - 1];
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
    if (!conflict) continue;
    const projectedEnd = () => {
      let cursor=ends[left];
      for(let i=left+1;i<=right;i++) {
        cursor+=travel.get(i);
        if(i<right) {
          const dinnerStart = items[i].type === 'dining' && starts[i] >= 1080 ? 1080 : null;
          cursor=Math.max(cursor,minutes(items[i].visitNotBefore) ?? cursor,dinnerStart ?? cursor)+stays[i];
        }
      }
      return cursor;
    };
    let excess = Math.max(0, projectedEnd() - deadline);
    for (let i = right - 1; i > left && excess > 0; i--) {
      const reduction = Math.min(excess, Math.max(0, stays[i] - minimumStayMinutes(items[i])));
      stays[i] -= reduction;
      excess = Math.max(0, projectedEnd() - deadline);
    }
    if (excess > 0) {
      const removable = Array.from({ length: right - left - 1 }, (_, n) => right - 1 - n)
        .find(i => items[i].placeIntent && items[i].addedByUser !== true);
      if (removable !== undefined) return {
        items: items.filter((_, i) => i !== removable).map((item, i) => i === 0 ? delayed[0] : item),
        adjusted: true
      };
      continue;
    }
    adjusted = true;
    let cursor = ends[left];
    for (let i = left + 1; i <= right; i++) {
      cursor += travel.get(i);
      if (i === right && i !== items.length - 1) break; // fixed anchor may include waiting
      if(i<right) cursor=Math.max(cursor,minutes(items[i].visitNotBefore) ?? cursor,
        items[i].type === 'dining' && starts[i] >= 1080 ? 1080 : cursor);
      result[i].time = time(cursor);
      if (i < right) {
        cursor += stays[i];
        result[i].endTime = time(cursor);
        if (stays[i] !== ends[i] - starts[i]) delete result[i].duration;
      } else result[i].endTime = '';
    }
  }
  return { items: result, adjusted };
}
