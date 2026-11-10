// Device-local "visited" marks for a saved or shared trip. Never written to Firestore or the plan.
export const VISITED_STOPS_KEY = 'compasser.visited.v1';
const MAX_TRIPS = 50;

export const isVisitableStop = item => Boolean(item?.title) && !['departure', 'arrival'].includes(item.type);

// A stop is keyed by day date + name + how many same-named stops precede it that day, so time
// recalculation and moving other stops keep the mark. The name is an AI recommendation's purpose
// (place lookups rewrite its title on every open) or else the title. Replacing a stop drops its
// mark, and reordering two stops with the same name swaps theirs.
export function stopKeys(day) {
  const seen = new Map();
  return (day?.scheduleItems || []).map(item => {
    const title = String(item?.placeIntent?.purpose || item?.title || '');
    const count = seen.get(title) || 0;
    seen.set(title, count + 1);
    return `${day.date}#${count}#${title}`;
  });
}

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
