import { normalizeData } from './itinerary-normalize.mjs';
export const OFFLINE_TRIPS_KEY = 'compasser.offline.v1';

export function createOfflineTrips({ getStorage = () => null, now = Date.now } = {}) {
  let owner;
  const read = () => {
    try {
      const saved = JSON.parse(getStorage()?.getItem(OFFLINE_TRIPS_KEY) || 'null');
      return saved?.version === 1 && saved.owner === owner && owner && Array.isArray(saved.trips) ? saved.trips : [];
    } catch { return []; }
  };
  const write = trips => {
    const storage = getStorage();
    if (!storage) throw new Error('Offline storage unavailable');
    storage.setItem(OFFLINE_TRIPS_KEY, JSON.stringify({ version: 1, owner, trips }));
  };
  return {
    setUser(uid) {
      const next = uid || null;
      if (owner === next) return;
      owner = next;
      try {
        const storage = getStorage();
        let saved;
        try { saved = JSON.parse(storage?.getItem(OFFLINE_TRIPS_KEY) || 'null'); } catch { /* Corrupt caches are removed. */ }
        if (!next || saved?.owner !== next) storage?.removeItem(OFFLINE_TRIPS_KEY);
      } catch { /* Owner checks still prevent access when storage is unavailable. */ }
    },
    list(uid) { return uid && uid === owner ? structuredClone(read()) : []; },
    get(uid, id) { return this.list(uid).find(item => item.id === id) || null; },
    save(uid, item) {
      if (!uid || uid !== owner || item?.userId !== uid || !/^[a-zA-Z0-9]+$/.test(item.id || '') || !normalizeData(item.itineraryPlan)?.days?.length) throw new Error('Private owner snapshot required');
      const saved = { id: item.id, userId: uid, title: String(item.title || ''), itineraryPlan: structuredClone(item.itineraryPlan), savedAt: now(), createdAtMillis: item.createdAt?.toMillis?.() || item.createdAtMillis || now() };
      write([...read().filter(trip => trip.id !== item.id), saved]);
      return saved;
    },
    remove(uid, id) { if (uid && uid === owner) write(read().filter(item => id !== null && item.id !== id)); },
    clear() { getStorage()?.removeItem(OFFLINE_TRIPS_KEY); },
  };
}
export const offlineTrips = createOfflineTrips({ getStorage: () => globalThis.localStorage });
