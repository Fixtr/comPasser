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

/**
 * The stored trip as the view sees it: every stop id filled (ids added now report idsAdded, so the
 * caller can persist them and fix them in place) and each note still under an old place key copied
 * to its stop's id. The place-key copy stays until that stop's note is written, so builds without
 * stop ids still show it and an id-less save of the plan can recover from it.
 */
export function migrateStopNotes(trip) {
  const plan = structuredClone(trip?.itineraryPlan);
  const days = (normalizeData(plan)?.days || []).filter(day => Array.isArray(day?.scheduleItems));
  const previous = new Map(days.flatMap(day => day.scheduleItems.map(item => [item, item?.stopId])));
  const idsAdded = assignStopIds(plan, { legacy: true });
  const notes = { ...trip?.stopNotes };
  for (const day of days) {
    legacyStopNoteKeys(day).forEach((old, index) => {
      const item = day.scheduleItems[index];
      if (!old || !Object.hasOwn(notes, old)) return;
      // An id filled just now can equal another stop's id from before an id-less save; the place note is this stop's.
      if (previous.get(item) !== item.stopId) notes[item.stopId] = notes[old];
      else notes[item.stopId] ??= notes[old];
    });
  }
  // shortcut: copies can push a trip with over 100 notes past the rules' 200-entry cap, which fails the write; trim old copies if that ever happens.
  return { plan, notes, idsAdded };
}
