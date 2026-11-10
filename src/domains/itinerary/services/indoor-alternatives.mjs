import { distanceMeters, isFixedPlace } from '../../map/services/recommendation-place.mjs';
import { normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';
import { assessVisitHours } from './itinerary-hours.mjs';
import { minutesOf, routeDepartureClock } from './itinerary-schedule-adjust.mjs';

const indoorTypes = [
  ['museum', '박물관', 'museum'],
  ['shopping_mall', '쇼핑몰', 'shopping mall'],
  ['cafe', '카페', 'cafe'],
];
const validDuration = value => Number.isFinite(value) && value >= 0;

// An alternative must fit the existing slot. A missing route or hours result cannot prove that.
export async function findIndoorAlternatives(items, index, {
  date, endTime, resolvedPlaces = [], routes = [], language, checks, isCurrent = () => true,
}) {
  const item = items[index], previous = items[index - 1], next = items[index + 1];
  if (!item || !previous || !next || isFixedPlace(item)) return [];
  const time = minutesOf(item.time), end = minutesOf(item.endTime);
  const departure = routeDepartureClock(previous);
  const earliest = minutesOf(departure), latest = minutesOf(next.time);
  if ([time, end, earliest, latest].includes(null) || time < earliest || end <= time || latest < end) return [];
  const arrivalDeadline = next.type === 'arrival' ? Math.min(latest, minutesOf(endTime) ?? latest) : latest;
  const identities = items.map((stop, i) => normalizeSelectedPlace(stop.selectedPlace)
    || normalizeSelectedPlace(stop.verifiedPlace)
    || normalizeSelectedPlace(resolvedPlaces.find(place => place.index === i)?.resolvedPlace)
    || normalizeSelectedPlace(stop.resolvedPlace));
  const center = identities[index];
  const routePoint = i => identities[i] || resolvedPlaces.find(place => place.index === i)?.coordinates;
  const from = routePoint(index - 1), to = routePoint(index + 1);
  if (!center || !from || !to) return [];

  const excluded = new Set(identities.map(place => place?.placeId).filter(Boolean));
  const knownLeg = fromIndex => routes.find(route => route.fromIndex === fromIndex
    && (route.toIndex ?? fromIndex + 1) === fromIndex + 1)?.durationMinutes;
  const before = knownLeg(index - 1), after = knownLeg(index);
  const knownOriginal = validDuration(before) && validDuration(after);

  // shortcut: one verified candidate per category. Broaden the search only if travelers routinely get no result.
  const options = await Promise.all(indoorTypes.map(async ([category, korean, english]) => {
    const result = await checks.findRecommendation({ ...item, verifiedPlace: null,
      placeIntent: { category, purpose: language === 'ko' ? korean : english } }, center, excluded, date);
    const place = result?.placeStatus === 'verified' && normalizeSelectedPlace(result.verifiedPlace);
    if (!isCurrent() || !place || excluded.has(place.placeId) || distanceMeters(center, place) > 3000) return null;
    const hours = assessVisitHours(item, date, await checks.getHours(place.placeId));
    if (!isCurrent() || !['current', 'regular'].includes(hours)) return null;
    const [inbound, outbound] = await Promise.all([
      checks.travelMinutes(from, place, date, departure),
      checks.travelMinutes(place, to, date, item.endTime),
    ]);
    if (!validDuration(inbound) || !validDuration(outbound) ||
        earliest + inbound > time || end + outbound > arrivalDeadline) return null;
    const totalMinutes = inbound + outbound;
    return { place, hours, totalMinutes, difference: knownOriginal ? totalMinutes - before - after : null };
  }));
  if (!isCurrent()) return [];
  return options.filter(option => option && options.find(candidate => candidate?.place.placeId === option.place.placeId) === option)
    .sort((a, b) => a.totalMinutes - b.totalMinutes);
}
