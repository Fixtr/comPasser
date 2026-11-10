import { dateRange } from '../../../../functions/travel-region.mjs';

// Noon UTC keeps whole-day arithmetic clear of any offset; NaN for anything that is not a real YYYY-MM-DD.
const noon = value => dateRange(value, 1).length ? Date.parse(`${value}T12:00:00Z`) : NaN;
const list = value => Array.isArray(value) ? value : [];

/** The first trip day of a saved plan, or '' when it has none. */
export function itineraryStartDate(plan) {
  const request = plan?.request || plan?.metadata?.request;
  return [plan?.days?.[0]?.date, [request?.date].flat()[0], request?.dailyData?.[0]?.date]
    .find(value => Number.isFinite(noon(value))) || '';
}

/**
 * A deep copy of a saved plan whose first day falls on newStartDate. Day dates, request dates,
 * per-day constraint dates and stay check-in/out move by the same number of days; times,
 * flights (time only) and day-numbered anchors are relative to the day and stay as they are.
 * No live opening hours are stored in a plan, so nothing date-bound needs clearing.
 * Throws when newStartDate is before today (YYYY-MM-DD) or any moved date stops being a real date.
 */
export function shiftItineraryDates(plan, newStartDate, today = '') {
  const start = itineraryStartDate(plan);
  if (!Number.isFinite(noon(newStartDate)) || !start || newStartDate < today) throw new Error('A valid new start date is required');
  const offset = noon(newStartDate) - noon(start);
  const shift = value => {
    if (!Number.isFinite(noon(value))) return value;
    const moved = new Date(noon(value) + offset).toISOString().slice(0, 10);
    if (!Number.isFinite(noon(moved))) throw new Error('A shifted date is out of range');
    return moved;
  };
  // Only fields already present are written: Firestore rejects undefined values.
  const move = (target, key) => { if (target && Object.hasOwn(target, key)) target[key] = shift(target[key]); };
  const copy = structuredClone(plan);
  list(copy.days).forEach(day => move(day, 'date'));
  for (const request of [copy.request, copy.metadata?.request]) {
    if (!request || typeof request !== 'object') continue;
    if (Array.isArray(request.date)) request.date = request.date.map(shift); else move(request, 'date');
    list(request.dailyData).forEach(day => move(day, 'date'));
    list(request.stays).forEach(stay => { move(stay, 'checkin'); move(stay, 'checkout'); });
  }
  return copy;
}

/**
 * firestore.rules accept a title of at most 100 characters, so the original is clipped to keep the suffix.
 * 100 UTF-16 units fits however the rules count, and a cut emoji's lone high surrogate is dropped.
 */
export const duplicateTitle = (title, suffix) => `${String(title).slice(0, 100 - suffix.length).replace(/[\uD800-\uDBFF]$/, '')}${suffix}`;
