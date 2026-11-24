import { travelRegion } from '../../../../functions/travel-region.mjs';
import { safeHttpUrl } from '../../../utils/html-safety.mjs';

/**
 * Where the 길찾기 button goes. '' means the Naver/Kakao popup: Korean trips, and older plans
 * without request data (`travelRegion` falls back to Korea). Anywhere else it is a Google Maps
 * address: the stop's saved one, or directions to the place name.
 */
export function googleDirectionsUrl(request, locationName, savedUrl) {
  if (travelRegion(request).countryCode === 'KR') return '';
  const saved = safeHttpUrl(savedUrl);
  // Shared or copied plans can carry any address; only a Google one may be opened as "Google Maps".
  if (saved && /(^|\.)(google\.com|goo\.gl)$/.test(new URL(saved).hostname)) return saved;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(locationName ?? '')}`;
}
