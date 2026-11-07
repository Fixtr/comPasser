import { isSameLocation, normalizePlannerRequest } from './planner-constraints.mjs';
import { minutesOf as parseTime } from '../../itinerary/services/itinerary-schedule-adjust.mjs';

const formatTime = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

/** Give untimed must-visits real slots before sending the existing timed-anchor contract. */
export async function scheduleFlexibleVisits(request, { travelMinutes, hoursStatus } = {}) {
  const anchors = request.anchorSchedules || [];
  if (!anchors.some(anchor => anchor.flexible)) return { request, issue: null };
  const days = normalizePlannerRequest(request).dailyData;
  const scheduled = anchors.map(anchor => ({ ...anchor }));
  // An untimed visit to a place already on that day (a timed appointment, or an earlier untimed visit) is one
  // visit, as the review says; placing it would give it its own time and keep it as a second event.
  const merged = new Set(anchors.flatMap((anchor, index) => anchor.flexible && anchors.some((other, otherIndex) => otherIndex !== index
    && Number(other.day || 1) === Number(anchor.day || 1) && isSameLocation(other.location, anchor.location)
    && (!other.flexible || otherIndex < index)) ? [index] : []));
  const kept = list => list.filter((_, index) => !merged.has(index));
  const unplaced = { ...request, anchorSchedules: kept(anchors) };

  for (const day of days) {
    const start = parseTime(day.startTime);
    const end = parseTime(day.endTime);
    if (start === null || end === null || start >= end) return { request: unplaced, issue: null };
    const indexed = scheduled.map((anchor, index) => ({ anchor, index }))
      .filter(({ anchor, index }) => Number(anchor.day || 1) === day.day && !merged.has(index));
    const fixed = indexed.filter(({ anchor }) => !anchor.flexible)
      .map(({ anchor }) => ({ anchor, start: parseTime(anchor.time), end: parseTime(anchor.endTime) }))
      .sort((a, b) => a.start - b.start);
    if (fixed.some(slot => slot.start === null || slot.end === null || slot.start >= slot.end)) {
      return { request: unplaced, issue: null };
    }
    const gaps = [];
    let previous = { location: day.startLocation }, cursor = start;
    for (const { anchor: next, start: deadline, end: nextEnd } of
      [...fixed, { anchor: { location: day.endLocation }, start: end, end }]) {
      gaps.push({ previous, cursor, next, end: deadline });
      previous = next;
      cursor = Math.max(cursor, nextEnd);
    }

    const remaining = indexed.filter(({ anchor }) => anchor.flexible);
    // Choose the earliest feasible visit; an afternoon opening must not consume the morning gap.
    while (remaining.length) {
      let best = null, hoursBlocked = false, routeUnknown = false;
      for (const { anchor, index } of remaining) {
        const stay = Number.isInteger(anchor.stayMinutes) ? Math.min(120, Math.max(20, anchor.stayMinutes)) : 60;
        for (const gap of gaps) {
          if (gap.cursor + stay > gap.end) continue;
          const inbound = await travelMinutes?.(gap.previous.location, anchor.location, day.date, formatTime(gap.cursor));
          if (!Number.isFinite(inbound) || inbound < 0) { routeUnknown = true; continue; }
          const firstStart = gap.cursor + Math.ceil(inbound);
          for (let visitStart = firstStart; visitStart + stay <= gap.end; visitStart += 15) {
            if (best && visitStart >= best.start) break;
            const visitEnd = visitStart + stay;
            const status = await hoursStatus?.(anchor, day.date, formatTime(visitStart), formatTime(visitEnd));
            if (status === 'closed') { hoursBlocked = true; break; }
            if (status === 'conflict') { hoursBlocked = true; continue; }
            // Opening waits change the departure: measure the return leg at the actual visit end.
            const outbound = await travelMinutes?.(anchor.location, gap.next.location, day.date, formatTime(visitEnd));
            if (!Number.isFinite(outbound) || outbound < 0) { routeUnknown = true; break; }
            if (visitEnd + Math.ceil(outbound) > gap.end) continue;
            best = { anchor, index, gap, start: visitStart, end: visitEnd };
            break;
          }
        }
      }
      if (!best) return { request, issue: { reason: routeUnknown ? 'flexible-visit-route' : hoursBlocked ? 'flexible-visit-hours' : 'flexible-visit-space',
        day: day.day, anchorIndex: remaining[0].index } };
      best.anchor.time = formatTime(best.start);
      best.anchor.endTime = formatTime(best.end);
      best.gap.previous = best.anchor;
      best.gap.cursor = best.end;
      remaining.splice(remaining.findIndex(item => item.index === best.index), 1);
    }
  }
  return { request: { ...request, anchorSchedules: kept(scheduled) }, issue: null };
}
