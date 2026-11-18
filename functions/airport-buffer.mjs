import { CITY_DOWNTOWNS, RECOMMENDATION_CITIES } from './recommendation-cities.mjs';

// Shared by the server prompt and the client planner so both name the same stops airports.
export const isAirportName = name => /공항|airport|空港|a[ée]roport/i.test(String(name || ''));

const point = value => Number.isFinite(value?.lat) && Math.abs(value.lat) <= 90
  && Number.isFinite(value?.lng) && Math.abs(value.lng) <= 180 ? value : null;

function kilometres(a, b) {
  const radians = n => n * Math.PI / 180;
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Minutes to keep free before a day that ends at an airport, or null when the end is not an airport.
 * The day's visits sit near downtown or near where the day starts (a Seogwipo hotel on a Jeju trip),
 * so the farther of the two counts.
 * shortcut: estimated from straight-line distance before any route is measured; the measured fit then
 * checks the real leg. Upgrade if generation ever measures before planning.
 */
export function airportBufferMinutes(name, location, cityId, dayStart = null) {
  if (!isAirportName(name)) return null;
  const city = Object.hasOwn(RECOMMENDATION_CITIES, cityId ?? '') ? RECOMMENDATION_CITIES[cityId] : null;
  const airport = point(location);
  if (!city || !airport) return 150;
  const [lat, lng] = CITY_DOWNTOWNS[cityId] || [city[1], city[2]];
  const start = point(dayStart);
  const km = Math.max(kilometres(airport, { lat, lng }), start ? kilometres(airport, start) : 0);
  // About 2.2 minutes of transit per km plus 20 minutes of walking and waiting, counted from the edge of
  // the 5 km search radius. Incheon-Seoul gives about 138 (measured up to 130), Jeju gives the 45 floor.
  return Math.min(150, Math.max(45, Math.round(20 + 2.2 * (km + 5))));
}
