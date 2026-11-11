import { safeHttpUrl } from '../../../utils/html-safety.mjs';
import { normalizeData } from './itinerary-normalize.mjs';
import { assignStopIds, isVisitableStop, stopKeys } from './visited-stops.mjs';

export const MAX_STOP_NOTE_LENGTH = 500;
export const MAX_RESERVATION_URL_LENGTH = 1000;

export function normalizeStopNote(text, url) {
  if (typeof text !== 'string' || typeof url !== 'string') return null;
  const note = text.trim();
  const enteredUrl = url.trim();
  const reservationUrl = safeHttpUrl(enteredUrl);
  if (note.length > MAX_STOP_NOTE_LENGTH || reservationUrl.length > MAX_RESERVATION_URL_LENGTH
    || (enteredUrl && !reservationUrl)) return null;
  return { text: note, url: reservationUrl };
}

export const stopNoteKeys = day => stopKeys(day).map(id => id || null);

// Notes written before stop ids were keyed by place; repeated places had none.
export function legacyStopNoteKeys(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day?.date)) return [];
  const keys = (day.scheduleItems || []).map(item => {
    if (!isVisitableStop(item)) return null;
    const placeId = item.selectedPlace?.placeId || item.verifiedPlace?.placeId;
    if (item.placeIntent && !placeId) return null;
    // Exclude movable times and display names supplied by the map. Fixed slots
    // can have two bookings at the same place with distinct reservation times.
    const fixedTime = item.type === 'AnchorSchedule' && !item.flexible ? item.time : '';
    const place = placeId || [item.title, typeof item.location === 'string' ? item.location : ''];
    const key = JSON.stringify([day.date, item.type, fixedTime, place]);
    return new TextEncoder().encode(key).length <= 1400 ? key : null;
  });
  return keys.map((key, index) => key && keys.indexOf(key) === index && keys.lastIndexOf(key) === index ? key : null);
}

// A note records the old place key of the stop it was written for (legacy notes are keyed by it).
const placeOf = (key, note) => note && typeof note === 'object' && Object.hasOwn(note, 'place') ? note.place : key;

/**
 * The stored trip as the view sees it, deterministic for one document: every stop id filled, and
 * each note keyed by its stop's id. Old place-keyed notes move to the id. A build without stop ids
 * can save the plan without them, so ids are filled again by position; such an id takes only the
 * note of its own place, else the stop gets a fresh id. Notes whose stop left the plan stay under
 * their key and come back if a stop with their place appears. update is what to save (empty once
 * migrated): the plan when ids changed, so ids stay fixed once notes depend on them.
 */
export function migrateStopNotes(trip) {
  const plan = structuredClone(trip?.itineraryPlan);
  const days = (normalizeData(plan)?.days || []).filter(day => Array.isArray(day?.scheduleItems));
  const previous = new Map(days.flatMap(day => day.scheduleItems.map(item => [item, item?.stopId])));
  let planChanged = assignStopIds(plan, { legacy: true });
  const notes = { ...trip?.stopNotes };
  const stops = days.flatMap(day => {
    const places = legacyStopNoteKeys(day);
    return day.scheduleItems.map((item, index) => ({ item, place: places[index] ?? null })).filter(stop => isVisitableStop(stop.item));
  });
  const ids = new Set(stops.map(stop => stop.item.stopId));
  const freeKey = base => {
    let key = base;
    for (let n = 1; ids.has(key) || Object.hasOwn(notes, key); n++) key = `${base}~${n}`;
    return key;
  };
  const detached = place => place !== null && Object.keys(notes).find(key => !ids.has(key) && placeOf(key, notes[key]) === place);
  for (const { item, place } of stops) {
    const id = item.stopId, note = notes[id];
    if (!note || (place !== null && placeOf(id, note) === place)) continue;
    if (previous.get(item) !== id) {
      ids.delete(id);
      item.stopId = freeKey(id);
      ids.add(item.stopId);
      planChanged = true;
    } else if (detached(place)) {
      // This stop's own note is elsewhere, so the one under its id belongs to a removed stop.
      notes[freeKey(id)] = note;
      delete notes[id];
    } else {
      // Same slot, place replaced: the note stays with the stop.
      notes[id] = { ...note, place };
    }
  }
  for (const { item, place } of stops) {
    const key = !Object.hasOwn(notes, item.stopId) && detached(place);
    if (!key) continue;
    notes[item.stopId] = { ...notes[key], place };
    delete notes[key];
  }
  const update = {
    ...(planChanged ? { itineraryPlan: plan } : {}),
    ...(JSON.stringify(notes) !== JSON.stringify(trip?.stopNotes || {}) ? { stopNotes: notes } : {}),
  };
  return { plan, notes, update };
}
