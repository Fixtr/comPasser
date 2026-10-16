import { normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';

export function hoursPlaceId(item) {
  if (Object.hasOwn(item, 'placeIntent') && item.placeStatus !== 'verified') return null;
  return normalizeSelectedPlace(item.selectedPlace)?.placeId
    || normalizeSelectedPlace(item.verifiedPlace)?.placeId
    || normalizeSelectedPlace(item.resolvedPlace)?.placeId || null;
}

const clock = value => {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return null;
  const [h, m] = value.split(':').map(Number);
  return h < 24 && m < 60 ? h * 60 + m : null;
};
const point = p => p && Number.isInteger(p.day) && p.day >= 0 && p.day <= 6
  && Number.isInteger(p.hour) && p.hour >= 0 && p.hour < 24
  && Number.isInteger(p.minute) && p.minute >= 0 && p.minute < 60
  ? p.day * 1440 + p.hour * 60 + p.minute : null;

// Korean travel dates and Places local wall-clock periods. No AI prose parsing.
export function assessVisitHours(item, date, data, now = Date.now()) {
  if (!data || !Number.isFinite(data.utcOffsetMinutes) || Math.abs(data.utcOffsetMinutes) > 840) return 'unknown';
  if (data.businessStatus === 'CLOSED_PERMANENTLY') return 'closed';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 'unknown';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return 'unknown';
  const today = new Date(now + data.utcOffsetMinutes * 60000).toISOString().slice(0, 10);
  if (data.businessStatus === 'CLOSED_TEMPORARILY') return date <= today ? 'closed' : 'unknown';
  const start = clock(item.time), end = clock(item.endTime);
  if (start === null || end === null || start === end) return 'unknown';
  const daysAhead = (parsed.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000;
  const current = daysAhead >= 0 && daysAhead < 7 && Array.isArray(data.currentOpeningHours?.periods);
  const periods = current ? data.currentOpeningHours.periods : data.regularOpeningHours?.periods;
  if (!Array.isArray(periods)) return 'unknown';
  if (!periods.length) return current ? 'conflict' : 'unknown';
  const intervals = [];
  for (const p of periods) {
    const open = point(p.open), close = point(p.close);
    if (open === null) return 'unknown';
    if (p.close == null && open === 0 && periods.length === 1) return current ? 'current' : 'regular';
    if (close === null || open === close) return 'unknown';
    const until = close > open ? close : close + 10080;
    for (const shift of [-10080, 0, 10080]) intervals.push([open + shift, until + shift]);
  }
  const from = parsed.getUTCDay() * 1440 + start;
  const to = parsed.getUTCDay() * 1440 + end + (end < start ? 1440 : 0);
  let covered = from;
  for (const [open, close] of intervals.sort((a,b) => a[0]-b[0])) {
    if (close <= covered) continue;
    if (open > covered) break;
    covered = close;
    if (covered >= to) return current ? 'current' : 'regular';
  }
  return 'conflict';
}

// Wait for live hours, including legacy identities that only exist in the current map result.
export function loadScheduleHours(items, resolvedPlaces = [], lookup = lookupPlaceHours) {
  return Promise.all(items.map((item, index) => ['departure', 'arrival'].includes(item.type) ? null
    : lookup(hoursPlaceId({ ...item, resolvedPlace: resolvedPlaces.find(place => place.index === index)?.resolvedPlace || item.resolvedPlace }))));
}

export function nextVisitStart(item, date, data, start, stay, deadline, { requireKnown = false } = {}) {
  const time = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  for (let cursor = start; cursor + stay <= deadline && cursor + stay < 1440; cursor++) {
    const status = assessVisitHours({ ...item, time: time(cursor), endTime: time(cursor + stay) }, date, data);
    if (status === 'closed' || (requireKnown && status === 'unknown')) return null;
    if (status !== 'conflict') return cursor;
  }
  return null;
}

// In-memory only: never persist live provider data into saved/shared schedules.
export function createHoursLookup(loadPlaces, { timeoutMs = 8000, now = Date.now } = {}) {
  const cache = new Map();
  const lookup = id => {
    if (!id) return Promise.resolve(null);
    const existing = cache.get(id);
    if (existing && now() - existing.at < 300000) return existing.promise;
    const promise = (async () => {
      let timer;
      try {
        return await Promise.race([
          (async () => {
            const { Place } = await loadPlaces();
            const place = new Place({ id });
            await place.fetchFields({ fields: ['currentOpeningHours', 'regularOpeningHours', 'businessStatus', 'utcOffsetMinutes', 'priceLevel'] });
            return { currentOpeningHours: place.currentOpeningHours,
              regularOpeningHours: place.regularOpeningHours, businessStatus: place.businessStatus,
              utcOffsetMinutes: place.utcOffsetMinutes, priceLevel: place.priceLevel };
          })(),
          new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
        ]);
      } catch { return null; }
      finally { clearTimeout(timer); }
    })();
    const entry = { at: now(), promise, data: null };
    cache.set(id, entry);
    promise.then(data => { entry.data = data; });
    return promise;
  };
  lookup.cached = id => {
    const entry = cache.get(id);
    return entry && now() - entry.at < 300000 ? entry.data : null;
  };
  return lookup;
}

// Search and timeline share this short-lived lookup so validating a candidate
// does not fetch the same paid place details again when its card is rendered.
export const lookupPlaceHours = createHoursLookup(async () =>
  (await import('../../map/services/google-maps-loader.js')).getMapsLoader().importLibrary('places'));
