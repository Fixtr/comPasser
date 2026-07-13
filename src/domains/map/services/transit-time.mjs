/**
 * Builds the departureTime for a transit Directions request.
 *
 * Google computes transit routes for "now" when no departure time is given,
 * which returned night buses for itineraries generated at night. Timetables
 * also differ per weekday, so a past schedule is shifted forward in whole
 * weeks instead of being clamped to "now".
 *
 * @param {string} dateStr Itinerary day, e.g. "2026-07-14"
 * @param {string} timeStr Departure clock time, e.g. "09:44"
 * @param {Date} [now] Injection point for tests
 * @returns {Date|null} A future Date, or null when inputs are unusable
 */
export function buildTransitDepartureTime(dateStr, timeStr, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
  if (!/^\d{2}:\d{2}$/.test(timeStr || '')) return null;

  const departure = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(departure.getTime())) return null;
  if (departure >= now) return departure;

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const weeksBehind = Math.ceil((now.getTime() - departure.getTime()) / WEEK_MS);
  return new Date(departure.getTime() + (weeksBehind * WEEK_MS));
}
