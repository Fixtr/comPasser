// Time to be at the airport before departure: check-in and security for an
// international flight at a hub such as Incheon, or a domestic flight.
export const FLIGHT_BUFFER_MINUTES = { international: 180, domestic: 90 };
// Time from landing to leaving the airport: immigration and baggage claim.
export const LANDING_BUFFER_MINUTES = { international: 60, domestic: 30 };

// shortcut: airports are recognised by name only; use Places types if endpoints ever store them.
export const isAirportName = name => /공항|airport|空港|a[ée]roport/i.test(String(name || ''));

function shift(time, delta) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time || '');
  if (!match || !Number.isFinite(delta)) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]) + delta;
  // shortcut: a time that crosses midnight belongs to another day; the user enters it by hand.
  if (minutes < 0 || minutes >= 24 * 60) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Same-day HH:mm to reach the airport, or null when the user must set the end time. */
export const airportArrivalTime = (departureTime, kind) => shift(departureTime, -FLIGHT_BUFFER_MINUTES[kind]);

/** Same-day HH:mm to start the trip after landing, or null when the user must set the start time. */
export const tripStartAfterLanding = (landingTime, kind) => shift(landingTime, LANDING_BUFFER_MINUTES[kind]);
