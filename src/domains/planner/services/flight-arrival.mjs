// Time to be at the airport before departure: check-in and security for an
// international flight at a hub such as Incheon, or a domestic flight.
export const FLIGHT_BUFFER_MINUTES = { international: 180, domestic: 90 };

// shortcut: airports are recognised by name only; use Places types if endpoints ever store them.
export const isAirportName = name => /공항|airport|空港|a[ée]roport/i.test(String(name || ''));

/** Same-day HH:mm to reach the airport, or null when the user must set the end time. */
export function airportArrivalTime(departureTime, kind) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(departureTime || '');
  const buffer = FLIGHT_BUFFER_MINUTES[kind];
  if (!match || !buffer) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]) - buffer;
  // shortcut: a flight soon after midnight needs the previous day's end; the user enters it by hand.
  if (minutes < 0) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
