import { normalizeData } from './itinerary-normalize.mjs';
import { localTravelDate, travelRegion } from '../../../../functions/travel-region.mjs';

const DAY_MS = 86400000;

/** 'YYYY-MM-DD…' -> UTC midnight in ms, or null when it is not a real calendar day. */
function dayTime(value) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(date) ? time : null;
}

/**
 * The saved trip nearest to the instant `now` whose last day is today or later, where today is the
 * trip's own local date (as the trip view reads it). daysUntil counts days to its first day
 * (0 = D-day, negative once it has begun); dayNumber is the trip day it is today, or null before it starts.
 */
export function upcomingTrip(items, now) {
  if (!Number.isFinite(now?.getTime())) return null;
  let best = null;
  for (const item of items || []) {
    const plan = item?.itineraryPlan;
    const days = normalizeData(plan)?.days || [];
    const today = dayTime(localTravelDate(now, travelRegion(plan?.request || plan?.metadata?.request).timeZone));
    const first = dayTime(days[0]?.date);
    const last = dayTime(days.at(-1)?.date);
    if (first === null || last === null || last < first || last < today) continue;
    const daysUntil = Math.round((first - today) / DAY_MS);
    if (!best || daysUntil < best.daysUntil) best = { item, daysUntil, dayNumber: daysUntil > 0 ? null : 1 - daysUntil };
  }
  return best;
}
