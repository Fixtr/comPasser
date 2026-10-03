import { normalizePlannerRequest } from './planner-constraints.mjs';

const parseTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const formatTime = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const travelBuffer = 30; // ponytail: fallback when Maps cannot measure a leg; result map rechecks it.

/** Give untimed must-visits real slots before sending the existing timed-anchor contract. */
export async function scheduleFlexibleVisits(request, { travelMinutes, hoursStatus } = {}) {
  const anchors = request.anchorSchedules || [];
  if (!anchors.some(anchor => anchor.flexible)) return { request, issue: null };
  const days = normalizePlannerRequest(request).dailyData;
  const scheduled = anchors.map(anchor => ({ ...anchor }));

  for (const day of days) {
    const start = parseTime(day.startTime);
    const end = parseTime(day.endTime);
    if (start === null || end === null || start >= end) return { request, issue: null };
    const indexed = scheduled.map((anchor, index) => ({ anchor, index }))
      .filter(({ anchor }) => Number(anchor.day || 1) === day.day);
    const fixed = indexed.filter(({ anchor }) => !anchor.flexible)
      .map(({ anchor }) => ({ anchor, start: parseTime(anchor.time), end: parseTime(anchor.endTime) }))
      .sort((a, b) => a.start - b.start);
    if (fixed.some(slot => slot.start === null || slot.end === null || slot.start >= slot.end)) {
      return { request, issue: null };
    }
    const gaps = [];
    let previous = { location: day.startLocation }, cursor = start;
    for (const { anchor: next, start: deadline, end: nextEnd } of
      [...fixed, { anchor: { location: day.endLocation }, start: end, end }]) {
      gaps.push({ previous, cursor, next, end: deadline });
      previous = next;
      cursor = Math.max(cursor, nextEnd);
    }

    for (const { anchor, index } of indexed.filter(({ anchor }) => anchor.flexible)) {
      const stay = Number.isInteger(anchor.stayMinutes) ? Math.min(120, Math.max(20, anchor.stayMinutes)) : 60;
      let placed = false, hoursBlocked = false;
      for (const gap of gaps) {
        const inbound = await travelMinutes?.(gap.previous.location, anchor.location, day.date, formatTime(gap.cursor));
        const journeyIn = Number.isFinite(inbound) && inbound >= 0 ? Math.ceil(inbound) : travelBuffer;
        const firstStart = gap.cursor + journeyIn;
        if (firstStart + stay > gap.end) continue;
        const outbound = await travelMinutes?.(anchor.location, gap.next.location, day.date, formatTime(firstStart + stay));
        const journeyOut = Number.isFinite(outbound) && outbound >= 0 ? Math.ceil(outbound) : travelBuffer;
        for (let visitStart = firstStart; visitStart + stay + journeyOut <= gap.end; visitStart += 15) {
          const visitEnd = visitStart + stay;
          const status = await hoursStatus?.(anchor, day.date, formatTime(visitStart), formatTime(visitEnd));
          if (status === 'closed') { hoursBlocked = true; break; }
          if (status === 'conflict') { hoursBlocked = true; continue; }
          anchor.time = formatTime(visitStart);
          anchor.endTime = formatTime(visitEnd);
          gap.previous = anchor;
          gap.cursor = visitEnd;
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) return { request, issue: { reason: hoursBlocked ? 'flexible-visit-hours' : 'flexible-visit-space',
        day: day.day, anchorIndex: index } };
    }
  }
  return { request: { ...request, anchorSchedules: scheduled }, issue: null };
}
