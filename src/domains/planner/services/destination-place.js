import { GeocodingService } from '../../map/services/geocoding-service.js';
import { getMapsLoader } from '../../map/services/google-maps-loader.js';
import { travelRegion } from '../../../../functions/travel-region.mjs';
import { t, tFor } from '../../../utils/i18n.js';

export const destinationPlaceError = error => t(error?.message?.includes('RESOURCE_EXHAUSTED') ? 'flowPlaceQuota' : 'flowPlaceFailed');

export async function resolveDestinationPlace(city, place) {
  const name = place.englishName || tFor(`${place.key}Name`, 'ko');
  const countryCode = travelRegion({ destination: city }).countryCode;
  const service = new GeocodingService(getMapsLoader(), { getLanguage: () => place.englishName ? 'en' : 'ko', countryCode });
  let timer;
  try {
    const found = await Promise.race([
      service.resolvePlace(place.searchLocation || `${name}, ${tFor(city.key, 'en')}`, null, name,
        { aliases: place.searchAliases, countryCode }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Place lookup timeout')), 12000); }),
    ]);
    return found?.resolvedPlace || null;
  } finally { clearTimeout(timer); }
}
