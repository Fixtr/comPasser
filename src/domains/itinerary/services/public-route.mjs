import { cities } from '../../planner/services/discovery-catalogue.mjs';
import { destinations } from '../../planner/services/travel-destinations.mjs';
import { tFor } from '../../../utils/i18n.js';
import { safeHttpUrl } from '../../../utils/html-safety.mjs';
import { DEFAULT_PUBLIC_APP_URL } from './share-url.mjs';
import { todayString } from '../../planner/services/trip-date.mjs';
import { cityDestination } from '../../planner/services/course-draft.mjs';

export const courseCities = [...cities, ...destinations.filter(city => city.country !== 'KOR')];
export const PUBLIC_ROUTE_ID = new RegExp(`^(?:[a-zA-Z0-9]+|curated-(?:${courseCities.map(city => city.id).join('|')})(?:-[23])?)$`);
const additionalPairs = {
  seoul: [['palace', 'bukchon'], ['namsan', 'bukchon']],
  busan: [['gamcheon', 'jagalchi'], ['gwangalli', 'haeundae']],
  jeju: [['hamdeok', 'seongsan'], ['yongduam', 'hallim']],
  incheon: [['chinatown', 'songwol'], ['sinpo', 'wolmido']],
  daegu: [['kimroad', 'dongseongro'], ['apsan', 'suseong']],
  daejeon: [['expo', 'science'], ['yuseong', 'hanbat']],
};

export function publicRouteUrl(id, origin = DEFAULT_PUBLIC_APP_URL) {
  if (!PUBLIC_ROUTE_ID.test(id || '')) throw new Error('Invalid public route ID');
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid route origin');
  return `${base.origin}/en/routes/${id}`;
}

export function curatedRoute(id) {
  const match = /^curated-(.+?)(?:-([23]))?$/.exec(id || '');
  const city = courseCities.find(item => item.id === match?.[1]);
  if (!city) return null;
  const variant = Number(match[2] || 1);
  const destination = cityDestination({ country: 'KOR', ...city });
  const places = variant === 1 ? city.places.slice(0, 2)
    : [city.places[variant === 2 ? 0 : 1], city.places[2]];
  // The three routes of a city differ only by their stops, so the title names them.
  const titled = route => ({ ...route, title: `${tFor(city.key, 'en')}: ${route.stops.map(stop => stop.englishName || stop.name).join(' and ')}` });
  if (city.country && city.country !== 'KOR') return titled({
    id, curated: true,
    destination,
    review: tFor('courseInternationalIntro', 'en'),
    // `name` is Korean (the app's Korean planner imports it). Japanese and French catalogue ids are the
    // places' local names; numbered ids ('taipei-1') are not, so those stops have no local name.
    stops: places.map(place => typeof place === 'string'
      ? { name: place, location: `${place}, ${tFor(city.key, 'en')}`, stayMinutes: 60 }
      : { name: place.name, englishName: place.englishName, localName: /-\d+$/.test(place.id) ? '' : place.id, location: place.location, englishAddress: place.location, stayMinutes: place.stayMinutes, guideUrl: place.guide }),
  });
  return titled({ id, curated: true, destination,
    review: tFor(variant === 1 ? city.pairReason : 'courseInternationalIntro', 'en'), stops: (variant === 1 ? city.pair : additionalPairs[city.id][variant - 2]).map(placeId => {
      const place = city.places.find(item => item.id === placeId);
      return { name: tFor(`${place.key}Name`, 'ko'), englishName: tFor(`${place.key}Name`, 'en'),
        location: tFor(`${place.key}Location`, 'ko'), englishAddress: tFor(`${place.key}Location`, 'en'),
        stayMinutes: Number.parseInt(place.stay, 10), guideUrl: place.guide };
    }) });
}

export function checkedVisitorInfo(input, today = todayString()) {
  if (!input || (input.englishMenu === 'unknown' && input.reservation === 'unknown' && !input.sourceUrl)) return null;
  const sourceUrl = safeHttpUrl(input.sourceUrl);
  const checkedOn = String(input.checkedOn || '');
  if (!['unknown', 'available', 'unavailable'].includes(input.englishMenu)
    || !['unknown', 'required', 'recommended', 'not_required'].includes(input.reservation)
    || !sourceUrl || sourceUrl.length > 500 || new URL(sourceUrl).username || new URL(sourceUrl).password
    || !/^\d{4}-\d{2}-\d{2}$/.test(checkedOn) || !Number.isFinite(Date.parse(checkedOn))
    || new Date(`${checkedOn}T00:00:00Z`).toISOString().slice(0, 10) !== checkedOn || checkedOn > today) {
    throw new Error('visitorInfoInvalid');
  }
  return { englishMenu: input.englishMenu, reservation: input.reservation, sourceUrl, checkedOn };
}

export function preparePublicRouteExtras({ titleEn = '', creditName = '', creditUrl = '' } = {}) {
  titleEn = titleEn.trim(); creditName = creditName.trim(); creditUrl = creditUrl.trim();
  if (titleEn.length > 100 || creditName.length > 80 || creditUrl.length > 500
    || (creditUrl && (!creditName || !safeHttpUrl(creditUrl) || new URL(creditUrl).username || new URL(creditUrl).password))) throw new Error('publicRouteExtrasInvalid');
  return { ...(titleEn ? { titleEn } : {}), ...(creditName ? { credit: { name: creditName, url: creditUrl } } : {}) };
}
