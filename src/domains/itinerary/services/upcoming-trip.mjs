import { normalizeData } from './itinerary-normalize.mjs';

const DAY_MS = 86400000;

/** 'YYYY-MM-DD…' -> UTC midnight in ms, or null when it is not a real calendar day. */
function dayTime(value) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(date) ? time : null;
}

/**
 * The saved trip nearest to `today` ('YYYY-MM-DD') whose last day is today or later.
 * daysUntil counts days to its first day (0 = D-day, negative once it has begun);
 * dayNumber is the trip day it is today, or null before it starts.
 */
export function upcomingTrip(items, today) {
  const now = dayTime(today);
  if (now === null) return null;
  let best = null;
  for (const item of items || []) {
    const days = normalizeData(item?.itineraryPlan)?.days || [];
    const first = dayTime(days[0]?.date);
    const last = dayTime(days.at(-1)?.date);
    if (first === null || last === null || last < first || last < now) continue;
    const daysUntil = Math.round((first - now) / DAY_MS);
    if (!best || daysUntil < best.daysUntil) best = { item, daysUntil, dayNumber: daysUntil > 0 ? null : 1 - daysUntil };
  }
  return best;
}
