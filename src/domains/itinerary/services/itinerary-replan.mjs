import { localTravelDate } from '../../../../functions/travel-region.mjs';
import { minutesOf } from './itinerary-schedule-adjust.mjs';
import { assessVisitHours, nextVisitStart } from './itinerary-hours.mjs';
import { stopKeys } from './visited-stops.mjs';

const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const fixed = item => item.type === 'arrival' || (item.type === 'AnchorSchedule' && item.flexible !== true);
const canSkip = item => !['departure', 'arrival', 'AnchorSchedule'].includes(item.type) && !item.addedByUser && !item.visitNotBefore;

export function replanDeparture(day, timeZone, now) {
  const departure = new Date(Math.ceil((now.getTime() + 60000) / 60000) * 60000);
  if (day?.date !== localTravelDate(now, timeZone) || day.date !== localTravelDate(departure, timeZone)) return null;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(departure);
  return { departure, time };
}

export function replanOrigin(day, visited) {
  const items = day?.scheduleItems;
  if (!items || items[0]?.type !== 'departure' || items.at(-1)?.type !== 'arrival') return -1;
  const lastVisited = stopKeys(day).findLastIndex(key => visited.has(key));
  return Math.max(0, lastVisited);
}

/** Keep the original order and fixed visits. Recheck the new legs if one optional stop must be dropped. */
export async function replanRemaining({ day, origin, startTime, endTime, locations, hours, travelMinutes, isCurrent = () => true }) {
  const items = day.scheduleItems;
  const start = minutesOf(startTime);
  const plannedEnd = minutesOf(items.at(-1)?.time);
  const deadline = minutesOf(endTime) ?? plannedEnd;
  if (origin < 0 || origin >= items.length - 1 || start === null || deadline === null) return { status: 'unavailable' };
  const originEnd = minutesOf(items[origin].endTime) ?? minutesOf(items[origin].time);
  if (start > deadline || (fixed(items[origin]) && originEnd !== null && start < originEnd)) return { status: 'conflict' };
  // A marked stop can precede a missed appointment. Keep the appointment in the record,
  // and never treat a still-upcoming reservation before the origin as completed.
  if (items.slice(0, origin).some(item => fixed(item) && (minutesOf(item.endTime) ?? minutesOf(item.time) ?? 1440) > start)) return { status: 'conflict' };

  async function measure(skip = -1) {
    let from = origin;
    let cursor = start;
    let blockStart = origin + 1;
    const updated = items.slice(0, origin + 1);
    for (let index = origin + 1; index < items.length; index++) {
      if (index === skip) continue;
      if (!isCurrent() || !locations[from] || !locations[index]) return { status: 'unavailable' };
      const item = items[index];
      const travel = await travelMinutes(locations[from], locations[index], day.date, clock(cursor));
      if (!Number.isFinite(travel) || travel < 0) return { status: 'unavailable' };
      const arrival = cursor + Math.ceil(travel);
      if (fixed(item)) {
        const limit = item.type === 'arrival' ? deadline : minutesOf(item.time);
        if (limit === null) return { status: 'unavailable' };
        if (arrival > limit) return { status: 'conflict', blockStart, index };
        const keepArrival = plannedEnd !== null && arrival <= plannedEnd && plannedEnd <= limit;
        updated.push(item.type === 'arrival' && !keepArrival ? { ...item, time: clock(arrival) } : item);
        cursor = item.type === 'arrival' ? arrival : Math.max(limit, minutesOf(item.endTime) ?? limit);
        blockStart = index + 1;
      } else {
        const before = minutesOf(item.time);
        const after = minutesOf(item.endTime);
        if (before === null || after === null || after <= before) return { status: 'unavailable' };
        const earliest = Math.max(arrival, before, minutesOf(item.visitNotBefore) ?? 0);
        const stay = after - before;
        if (earliest + stay > deadline) return { status: 'conflict', blockStart, index };
        const opening = assessVisitHours(item, day.date, hours[index]);
        if (earliest !== before && opening === 'unknown') return { status: 'unavailable' };
        const at = nextVisitStart(item, day.date, hours[index], earliest, stay, deadline, { requireKnown: earliest !== before });
        if (at === null) return { status: 'conflict', blockStart, index };
        cursor = at + stay;
        updated.push(at === before ? item : { ...item, time: clock(at), endTime: clock(cursor) });
      }
      if (cursor >= 1440) return { status: 'conflict' };
      from = index;
    }
    if (!isCurrent()) return { status: 'unavailable' };
    const changed = skip >= 0 || updated.some((item, index) => item.time !== items[index]?.time);
    if (!changed) return { status: 'unchanged' };
    updated[origin] = { ...updated[origin], actualDepartureTime: startTime };
    return { status: 'ready', items: updated, skipped: items[skip] || null };
  }

  const first = await measure();
  if (first.status !== 'conflict' || first.index === undefined) return first;
  // shortcut: one omission keeps the extra route requests bounded.
  for (let index = first.index; index >= first.blockStart; index--) {
    if (canSkip(items[index])) return measure(index);
  }
  return first;
}
