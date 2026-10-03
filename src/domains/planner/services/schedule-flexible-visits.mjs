import { normalizePlannerRequest } from './planner-constraints.mjs';

const parseTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const formatTime = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const travelBuffer = 30; // ponytail: provisional gap; use measured routes when pre-generation routing exists.

/** Give untimed must-visits real slots before sending the existing fixed-anchor contract. */
export function scheduleFlexibleVisits(request) {
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
      .map(({ anchor }) => ({ start: parseTime(anchor.time), end: parseTime(anchor.endTime) }))
      .sort((a, b) => a.start - b.start);
    if (fixed.some(slot => slot.start === null || slot.end === null || slot.start >= slot.end)) {
      return { request, issue: null };
    }
    const gaps = [];
    let cursor = start;
    for (const slot of [...fixed, { start: end, end }]) {
      gaps.push({ cursor, end: slot.start });
      cursor = Math.max(cursor, slot.end);
    }

    for (const { anchor, index } of indexed.filter(({ anchor }) => anchor.flexible)) {
      const stay = Number.isInteger(anchor.stayMinutes) ? Math.min(120, Math.max(20, anchor.stayMinutes)) : 60;
      const gap = gaps.find(item => item.cursor + travelBuffer + stay + travelBuffer <= item.end);
      if (!gap) return { request, issue: { reason: 'flexible-visit-space', day: day.day, anchorIndex: index } };
      const visitStart = gap.cursor + travelBuffer;
      anchor.time = formatTime(visitStart);
      anchor.endTime = formatTime(visitStart + stay);
      gap.cursor = visitStart + stay;
    }
  }
  return { request: { ...request, anchorSchedules: scheduled }, issue: null };
}
