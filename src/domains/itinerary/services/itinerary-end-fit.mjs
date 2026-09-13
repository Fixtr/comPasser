import { applyTransitDelays, getEndTimeOverflowMinutes } from './itinerary-schedule-adjust.mjs';

const minutes = value => {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};
const time = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

export function hasFixedArrivalConflict(items, routes) {
  if (!Array.isArray(items)) return false;
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

// All-or-nothing fitting between fixed boundaries. Never invent transit times,
// remove stops, move anchors, or claim success when the minimum stays cannot fit.
export function fitMeasuredSchedule(items, routes, endTime) {
  const delayed = applyTransitDelays(items, routes);
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
  if (items.some((_, i) => i > 0 && !travel.has(i))) return unchanged;
  const starts = items.map(item => minutes(item.time));
  const ends = items.map((item, i) => minutes(item.endTime) ?? starts[i]);
  if (starts.some((start, i) => start === null || ends[i] < start || (i && start < starts[i - 1]))) return unchanged;
  if (getEndTimeOverflowMinutes(delayed, endTime) <= 0 &&
      !items.some((item, i) => item.type === 'AnchorSchedule' && i > 0 &&
        (minutes(delayed[i - 1].endTime) ?? minutes(delayed[i - 1].time)) + travel.get(i) > starts[i])) return unchanged;

  const result = items.map(item => ({ ...item }));
  const stays = ends.map((end, i) => end - starts[i]);
  const fixed = [0, ...items.flatMap((item, i) => i > 0 && i < items.length - 1 && item.type === 'AnchorSchedule' ? [i] : []), items.length - 1];
  for (let block = 1; block < fixed.length; block++) {
    const left = fixed[block - 1], right = fixed[block];
    const deadline = right === items.length - 1 ? ceiling : starts[right];
    let required = 0;
    for (let i = left + 1; i <= right; i++) required += travel.get(i) + (i < right ? stays[i] : 0);
    let excess = Math.max(0, ends[left] + required - deadline);
    for (let i = right - 1; i > left && excess > 0; i--) {
      const reduction = Math.min(excess, Math.max(0, stays[i] - 20));
      stays[i] -= reduction;
      excess -= reduction;
    }
    if (excess > 0) return unchanged;
    let cursor = ends[left];
    for (let i = left + 1; i <= right; i++) {
      cursor += travel.get(i);
      if (i === right && i !== items.length - 1) break; // fixed anchor may include waiting
      result[i].time = time(cursor);
      if (i < right) {
        cursor += stays[i];
        result[i].endTime = time(cursor);
        if (stays[i] !== ends[i] - starts[i]) delete result[i].duration;
      } else result[i].endTime = '';
    }
  }
  return { items: result, adjusted: true };
}
