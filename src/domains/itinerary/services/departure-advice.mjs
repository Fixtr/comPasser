import { minutesOf, formatMinutes } from './itinerary-schedule-adjust.mjs';
import { stopKeys, pickNextStop } from './visited-stops.mjs';

/**
 * When to leave the previous stop for the day's next fixed reservation.
 * `now` is the destination-local minute of the day, or null when the day is not today.
 * Reads the legs the map already measured; it never asks for a route.
 */
export function departureAdvice(items, routes, now, { buffer = 10, visited } = {}) {
  if (!Number.isFinite(now) || !Array.isArray(items)) return { state: 'hidden' };
  const keys = stopKeys({ scheduleItems: items });
  const index = items.findIndex((item, i) => item?.type === 'AnchorSchedule' && item.flexible !== true &&
    !visited?.has(keys[i]) && (minutesOf(item.time) ?? -1) >= now);
  if (index < 0) {
    const stop = pickNextStop({ scheduleItems: items }, { visited, currentTime: formatMinutes(now) });
    // The arrival is not a visit, and the end-time warning already covers it.
    return stop && stop.type !== 'arrival' ? { state: 'next', stop } : { state: 'hidden' };
  }
  const reservation = items[index];
  const from = items[index - 1];
  const route = from && (routes || []).find(leg => leg?.fromIndex === index - 1);
  const travel = route?.durationMinutes;
  if (!Number.isFinite(travel) || travel < 0) return { state: 'unknown', reservation, from };
  const start = minutesOf(reservation.time);
  const leave = start - buffer - Math.ceil(travel);
  if (now <= leave) return { state: 'ok', reservation, from, route, buffer, leaveTime: formatMinutes(leave) };
  const spare = start - now - Math.ceil(travel);
  return spare >= 0 ? { state: 'go', reservation, from, route, spare } : { state: 'late', reservation, from, route };
}
