import { normalizeData } from './itinerary-normalize.mjs';

// Device-local "visited" marks for a saved or shared trip, keyed by stopId. Never written to Firestore or the plan.
export const VISITED_STOPS_KEY = 'compasser.visited.v1';
const MAX_TRIPS = 50;

export const isVisitableStop = item => Boolean(item?.title) && !['departure', 'arrival'].includes(item.type);

// Before stop ids, a mark was keyed by day date + how many same-named stops precede it that day +
// the name (an AI recommendation's purpose, since place lookups rewrite its title, or else the title).
// Plans saved before then take these keys as their ids, so existing marks keep matching.
export function legacyStopKeys(day) {
  const seen = new Map();
  return (day?.scheduleItems || []).map(item => {
    const title = String(item?.placeIntent?.purpose || item?.title || '');
    const count = seen.get(title) || 0;
    seen.set(title, count + 1);
    return `${day.date}#${count}#${title}`;
  });
}

const randomStopId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 12);

/**
 * Gives every visitable stop a client-only stopId that edits carry along (they copy the item).
 * With legacy, a missing id is the stop's old mark key, so a plan saved before ids, or a read-only
 * share of one, gets the same ids on every open; otherwise (a stop added by an edit) it is random.
 * Kept ids never change; a repeated or non-string one is replaced. Mutates the plan.
 */
export function assignStopIds(plan, { legacy = false } = {}) {
  const days = (normalizeData(plan)?.days || []).filter(day => Array.isArray(day?.scheduleItems));
  const used = new Set();
  const missing = [];
  for (const day of days) {
    day.scheduleItems.forEach((item, index) => {
      if (!isVisitableStop(item)) return;
      if (typeof item.stopId === 'string' && item.stopId && !used.has(item.stopId)) used.add(item.stopId);
      else missing.push([day, index]);
    });
  }
  const legacyKeys = new Map();
  for (const [day, index] of missing) {
    if (legacy && !legacyKeys.has(day)) legacyKeys.set(day, legacyStopKeys(day));
    const base = legacy ? legacyKeys.get(day)[index] : randomStopId();
    let id = base;
    for (let n = 1; used.has(id); n++) id = `${base}~${n}`;
    used.add(id);
    day.scheduleItems[index].stopId = id;
  }
  return missing.length > 0;
}

export const stopKeys = day => (day?.scheduleItems || []).map(item => isVisitableStop(item) ? item.stopId : undefined);

// currentTime ('HH:mm') is given only when the day is today in the destination's time zone.
export function pickNextStop(day, { visited, currentTime } = {}) {
  const keys = stopKeys(day);
  return (day?.scheduleItems || []).find((item, i) =>
    item.type !== 'departure' && item.title && !item.stayUnsetLabel &&
    (!Object.hasOwn(item, 'placeIntent') || item.placeStatus === 'verified') &&
    !visited?.has(keys[i]) &&
    (!currentTime || (typeof item.time === 'string' && item.time >= currentTime)));
}

export function createVisitedStops({ getStorage = () => null, now = Date.now } = {}) {
  let owner;
  const read = () => {
    try {
      return JSON.parse(getStorage()?.getItem(VISITED_STOPS_KEY) || 'null');
    } catch { return null; }
  };
  const tripsFor = userId => {
    if (owner === undefined || owner !== userId) return {};
    const saved = read();
    return saved?.version === 2 && saved.owner === owner && saved.trips
      && typeof saved.trips === 'object' && !Array.isArray(saved.trips) ? saved.trips : {};
  };
  const marked = trip => new Set(Array.isArray(trip?.stops) ? trip.stops : []);
  return {
    setUser(userId) {
      const next = userId || null;
      if (next === owner) return;
      owner = next;
      try {
        const saved = read();
        // Unowned legacy marks cannot be assigned safely to the account restoring this page.
        if (saved?.version !== 2 || saved.owner !== owner) getStorage()?.removeItem(VISITED_STOPS_KEY);
      } catch { /* The owner check still protects reads when storage cannot be changed. */ }
    },
    visited(tripId, userId) { return marked(tripsFor(userId)[tripId]); },
    // Returns whether the stop is now marked; false when storage is unavailable.
    toggle(tripId, key, userId) {
      if (owner === undefined || owner !== userId || !key) return false;
      try {
        const storage = getStorage();
        if (!storage) return false;
        const trips = tripsFor(userId), stops = marked(trips[tripId]), on = !stops.has(key);
        if (on) stops.add(key); else stops.delete(key);
        if (stops.size) trips[tripId] = { at: now(), stops: [...stops] };
        else delete trips[tripId];
        const kept = Object.entries(trips).sort(([, a], [, b]) => (b?.at || 0) - (a?.at || 0)).slice(0, MAX_TRIPS);
        storage.setItem(VISITED_STOPS_KEY, JSON.stringify({ version: 2, owner, trips: Object.fromEntries(kept) }));
        return on;
      } catch { return false; }
    },
  };
}
export const visitedStops = createVisitedStops({ getStorage: () => globalThis.localStorage });
