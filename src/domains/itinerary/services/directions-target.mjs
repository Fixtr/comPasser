import { travelRegion } from '../../../../functions/travel-region.mjs';
import { safeHttpUrl } from '../../../utils/html-safety.mjs';

/**
 * Where the 길찾기 button goes. '' means the Naver/Kakao popup: Korean trips, and older plans
 * without request data (`travelRegion` falls back to Korea). Anywhere else it is a Google Maps
 * route to the place name, never the stop's saved place page (that needs a second press there).
 */
export function googleDirectionsUrl(request, locationName, savedUrl) {
  if (travelRegion(request).countryCode === 'KR') return '';
  const saved = safeHttpUrl(savedUrl);
  // Shared or copied plans can carry any address; only a Google one may name the exact place.
  const placeId = saved && /(^|\.)(google\.com|goo\.gl)$/.test(new URL(saved).hostname)
    ? new URL(saved).searchParams.get('query_place_id') : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(locationName ?? '')}`
    + (placeId ? `&destination_place_id=${encodeURIComponent(placeId)}` : '');
}
