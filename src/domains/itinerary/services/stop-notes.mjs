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

/** The trip's notes with any still under an old place key moved to its stop's id, as the view assigns ids on open. */
export function migrateStopNotes(trip) {
  const notes = { ...trip?.stopNotes };
  const plan = structuredClone(trip?.itineraryPlan);
  assignStopIds(plan, { legacy: true });
  for (const day of normalizeData(plan)?.days || []) {
    legacyStopNoteKeys(day).forEach((old, index) => {
      if (!old || !Object.hasOwn(notes, old)) return;
      notes[day.scheduleItems[index].stopId] ??= notes[old];
      delete notes[old];
    });
  }
  return notes;
}
