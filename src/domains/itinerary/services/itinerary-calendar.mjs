import { travelRegion, travelInstant, dateRange } from '../../../../functions/travel-region.mjs';

const utc = instant => instant.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escapeText = value => String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// RFC 5545 caps a line at 75 octets; continuation lines start with a space, which counts.
function fold(line) {
  const encoder = new TextEncoder();
  const lines = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > (lines.length ? 74 : 75)) { lines.push(current); current = ''; size = 0; }
    current += char;
    size += bytes;
  }
  lines.push(current);
  return lines.join('\r\n ');
}

/** Every timed stop of every day as a UTC event, or null when there is none. Times are read in the destination's time zone. */
export async function buildItineraryCalendar(plan, tripKey, now = new Date()) {
  if (!tripKey) return null;
  const itinerary = Array.isArray(plan?.itineraryPlan?.days) ? plan.itineraryPlan : plan;
  const { timeZone } = travelRegion(itinerary?.request || itinerary?.metadata?.request || plan?.request || plan?.metadata?.request);
  const events = [];
  const days = Array.isArray(itinerary?.days) ? itinerary.days : [];
  const encoder = new TextEncoder();
  for (const [dayIndex, day] of days.entries()) {
    const items = Array.isArray(day?.scheduleItems) ? day.scheduleItems : [];
    const occurrences = new Map();
    for (const item of items) {
      const stopKey = JSON.stringify([item?.type, item?.placeIntent?.purpose || item?.selectedPlace?.placeId || item?.title]);
      const occurrence = occurrences.get(stopKey) || 0;
      occurrences.set(stopKey, occurrence + 1);
      const start = travelInstant(day.date, item?.time, timeZone);
      if (!start || !item.title) continue;
      let end = travelInstant(day.date, item.endTime, timeZone) || start;
      if (end < start) end = travelInstant(dateRange(day.date, 2)[1], item.endTime, timeZone) || start;
      const location = item.stayUnsetLabel || item.resolvedAddress || (typeof item.location === 'string' ? item.location : '');
      // The UID must not expose the private document ID or the public share link's token.
      const key = encoder.encode(JSON.stringify([tripKey, dayIndex, stopKey, occurrence]));
      events.push(crypto.subtle.digest('SHA-256', key).then(hash => [
        'BEGIN:VEVENT', `UID:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`, `DTSTAMP:${utc(now)}`,
        `DTSTART:${utc(start)}`, `DTEND:${utc(end)}`, `SUMMARY:${escapeText(item.title)}`,
        ...(location ? [`LOCATION:${escapeText(location)}`] : []), 'END:VEVENT',
      ]));
    }
  }
  if (!events.length) return null;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ComPasser//Itinerary//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...(await Promise.all(events)).flat(), 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
