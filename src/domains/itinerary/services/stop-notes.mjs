import { safeHttpUrl } from '../../../utils/html-safety.mjs';
import { isVisitableStop } from './visited-stops.mjs';

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

export function stopNoteKeys(day) {
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
  // shortcut: indistinguishable visits need stable stop IDs before they can carry distinct notes.
  return keys.map((key, index) => key && keys.indexOf(key) === index && keys.lastIndexOf(key) === index ? key : null);
}
