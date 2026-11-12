import { travelRegion } from '../../../../functions/travel-region.mjs';
import { getMapsLoader } from '../../map/services/google-maps-loader.js';
import { RoutingService } from '../../map/services/routing-service.js';
import { GeocodingService } from '../../map/services/geocoding-service.js';
import { buildTransitDepartureTime } from '../../map/services/transit-time.mjs';
import { assessVisitHours, lookupPlaceHours } from '../../itinerary/services/itinerary-hours.mjs';
import { formatLocationForPrompt, getLocationName } from './planner-constraints.mjs';
import { normalizeSelectedPlace } from './selected-place.mjs';
import { getLang } from '../../../utils/i18n.js';

const within = (work, ms = 8000) => {
  let timer;
  return Promise.race([work, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Map lookup timed out')), ms);
  })]).finally(() => clearTimeout(timer));
};

/** Reuse the same Maps and opening-hours sources that verify the result screen. */
/** `measuredOnly` drops the routing service's straight-line walking estimates (route discovery shows detours as measured). */
export function createFlexibleVisitChecks(visitCount = 1, request = {}, { measuredOnly = false } = {}) {
  const region = travelRegion(request);
  const loader = getMapsLoader();
  const routing = new RoutingService(loader);
  const geocoding = new GeocodingService(loader, { getLanguage: getLang, countryCode: region.countryCode });
  const routes = new Map(), places = new Map();
  const deadline = Date.now() + Math.min(45000, 12000 * Math.max(1, visitCount));
  const remaining = () => Math.max(0, Math.min(8000, deadline - Date.now()));
  return {
    async getHours(id) { return remaining() ? within(lookupPlaceHours(id), remaining()).catch(() => null) : null; },
    async findRecommendation(item, center, excluded, _date, budget) {
      if (!remaining()) return null;
      // Check the full stay after measuring arrival, rather than rejecting a venue before it opens.
      return geocoding.resolveRecommendation(item, center, excluded, Math.min(6000, remaining()), '', center, budget);
    },
    async travelMinutes(from, to, date, time) {
      const selectedFrom = normalizeSelectedPlace(from), selectedTo = normalizeSelectedPlace(to);
      // Active map results can supply legacy coordinates without a saved Place ID.
      const endpoint = value => Number.isFinite(value?.lat) && Math.abs(value.lat) <= 90 &&
        Number.isFinite(value?.lng) && Math.abs(value.lng) <= 180
        ? {lat:value.lat,lng:value.lng} : formatLocationForPrompt(value);
      const origin = endpoint(selectedFrom || from), destination = endpoint(selectedTo || to);
      if (!origin || !destination) return null;
      if ((selectedFrom && selectedTo && selectedFrom.placeId === selectedTo.placeId) ||
          (typeof origin === 'string' ? origin === destination : origin.lat === destination.lat && origin.lng === destination.lng)) return 0;
      if (!remaining()) return null;
      const key = JSON.stringify([origin, destination, date, time]);
      if (!routes.has(key)) routes.set(key, within(routing.getTransitRoute(origin, destination,
        buildTransitDepartureTime(date, time, new Date(), region.timeZone)), remaining()).then(result => {
        const seconds = measuredOnly && result?.estimated ? NaN : result?.routes?.[0]?.legs?.[0]?.duration?.value;
        return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds / 60) : null;
      }).catch(() => null));
      return routes.get(key);
    },
    async hoursStatus(anchor, date, time, endTime) {
      if (!remaining()) return 'unknown';
      const selected = normalizeSelectedPlace(anchor.location);
      const key = JSON.stringify([anchor.name, anchor.location]);
      if (!places.has(key)) places.set(key, selected?.placeId
        ? Promise.resolve(selected.placeId)
        : within(geocoding.resolvePlace(getLocationName(anchor.location), null, anchor.name), remaining())
          .then(place => place?.resolvedPlace?.placeId || null).catch(() => null));
      const id = await places.get(key);
      if (!id || !remaining()) return 'unknown';
      const data = await within(lookupPlaceHours(id), remaining()).catch(() => null);
      return assessVisitHours({ time, endTime }, date, data);
    }
  };
}
