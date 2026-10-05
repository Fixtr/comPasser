import { cities } from '../../planner/services/discovery-catalogue.mjs';
import { tFor } from '../../../utils/i18n.js';
import { safeHttpUrl } from '../../../utils/html-safety.mjs';
import { DEFAULT_PUBLIC_APP_URL } from './share-url.mjs';
import { todayString } from '../../planner/services/trip-date.mjs';

export const PUBLIC_ROUTE_ID = /^(?:[a-zA-Z0-9]+|curated-(?:seoul|busan|jeju|incheon|daegu|daejeon))$/;

export function publicRouteUrl(id, origin = DEFAULT_PUBLIC_APP_URL) {
  if (!PUBLIC_ROUTE_ID.test(id || '')) throw new Error('Invalid public route ID');
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid route origin');
  return `${base.origin}/en/routes/${id}`;
}

export function curatedRoute(id) {
  const city = cities.find(item => `curated-${item.id}` === id);
  if (!city) return null;
  return { id, title: `${tFor(city.key, 'en')}: a first visit`, curated: true,
    review: tFor(city.pairReason, 'en'), stops: city.pair.map(placeId => {
      const place = city.places.find(item => item.id === placeId);
      return { name: tFor(`${place.key}Name`, 'ko'), englishName: tFor(`${place.key}Name`, 'en'),
        location: tFor(`${place.key}Location`, 'ko'), englishAddress: tFor(`${place.key}Location`, 'en'),
        stayMinutes: Number.parseInt(place.stay, 10), guideUrl: place.guide };
    }) };
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
