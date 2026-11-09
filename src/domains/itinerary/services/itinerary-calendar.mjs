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
export function buildItineraryCalendar(plan, now = new Date()) {
  const { timeZone } = travelRegion(plan?.request || plan?.metadata?.request);
  const lines = [];
  for (const day of Array.isArray(plan?.days) ? plan.days : []) {
    const items = Array.isArray(day?.scheduleItems) ? day.scheduleItems : [];
    items.forEach((item, index) => {
      const start = travelInstant(day.date, item?.time, timeZone);
      if (!start || !item.title) return;
      let end = travelInstant(day.date, item.endTime, timeZone) || start;
      if (end < start) end = travelInstant(dateRange(day.date, 2)[1], item.endTime, timeZone) || start;
      const location = item.stayUnsetLabel || item.resolvedAddress || (typeof item.location === 'string' ? item.location : '');
      lines.push('BEGIN:VEVENT', `UID:${day.date}-${index}-${utc(start)}@compasser`, `DTSTAMP:${utc(now)}`,
        `DTSTART:${utc(start)}`, `DTEND:${utc(end)}`, `SUMMARY:${escapeText(item.title)}`,
        ...(location ? [`LOCATION:${escapeText(location)}`] : []), 'END:VEVENT');
    });
  }
  if (!lines.length) return null;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ComPasser//Itinerary//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...lines, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
