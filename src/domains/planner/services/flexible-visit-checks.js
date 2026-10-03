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

/** Reuse the same Maps and regular-hours sources that verify the result screen. */
export function createFlexibleVisitChecks() {
  const loader = getMapsLoader();
  const routing = new RoutingService(loader);
  const geocoding = new GeocodingService(loader, { getLanguage: getLang });
  const routes = new Map(), places = new Map();
  const deadline = Date.now() + 12000; // ponytail: cap preflight delay; the result screen rechecks unknown legs/hours.
  const remaining = () => Math.max(0, Math.min(8000, deadline - Date.now()));
  return {
    async travelMinutes(from, to, date, time) {
      const origin = formatLocationForPrompt(from), destination = formatLocationForPrompt(to);
      if (!origin || !destination) return null;
      if (origin === destination) return 0;
      if (!remaining()) return null;
      const key = JSON.stringify([origin, destination, date, time]);
      if (!routes.has(key)) routes.set(key, within(routing.getTransitRoute(origin, destination,
        buildTransitDepartureTime(date, time)), remaining()).then(result => {
        const seconds = result?.routes?.[0]?.legs?.[0]?.duration?.value;
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
      // A temporary closure today cannot establish the status of a future trip.
      return data?.businessStatus === 'CLOSED_TEMPORARILY' ? 'unknown'
        : assessVisitHours({ time, endTime }, date, data);
    }
  };
}
