import { normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';

export const RECOMMENDATION_RADIUS_METERS = 5000;
export const PLACE_CATEGORIES = ['restaurant', 'cafe', 'park', 'museum', 'tourist_attraction', 'shopping_mall'];
export const isFixedPlace = item => ['departure', 'arrival', 'AnchorSchedule'].includes(item?.type);

export function normalizePlaceIntent(value) {
  if (!value || !PLACE_CATEGORIES.includes(value.category) || typeof value.purpose !== 'string' || !value.purpose.trim()) return null;
  return { purpose: value.purpose.trim().slice(0, 200), category: value.category,
    nearLocation: typeof value.nearLocation === 'string' ? value.nearLocation.trim().slice(0, 200) : '' };
}

export const intentKey = intent => JSON.stringify(normalizePlaceIntent(intent));

export function distanceMeters(a, b) {
  const radians = n => n * Math.PI / 180;
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

// Bias alone does not restrict Google results. Apply a hard distance AND type
// check after search, and accept only JSON-safe, identifiable physical places.
export function selectRecommendation(places, intent, center, excluded = new Set(), rejected = null, countryCode = 'KR') {
  if (!center || !normalizePlaceIntent(intent)) return null;
  const reject = reason => {
    if (rejected) rejected[reason] = (rejected[reason] || 0) + 1;
    return [];
  };
  return (Array.isArray(places) ? places : []).flatMap(place => {
    const snapshot = normalizeSelectedPlace(place);
    if (!snapshot) return reject('identity');
    // ponytail: named airport/restricted interiors are excluded; use provider access metadata when available.
    if (/(?:면세|보안구역|출국장|duty.?free|airside|departure hall|(?:공항|airport).*?(?:터미널|terminal))/i.test(snapshot.displayName)) return reject('restricted-access');
    if (excluded.has(snapshot.placeId)) return reject('duplicate');
    if (!place.types?.includes(intent.category)) return reject('type');
    if (['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'].includes(place.businessStatus)) return reject('closed');
    if (!place.addressComponents?.some(c => c.types?.includes('country') && c.shortText === countryCode)) return reject('country');
    if (distanceMeters(center, snapshot) > RECOMMENDATION_RADIUS_METERS) return reject('distance');
    return [{ ...snapshot, source: 'google_places', category: intent.category,
      intentKey: intentKey(intent), centerPlaceId: center.placeId }];
  })[0] || null; // Text Search already ranks by relevance; distance is a hard limit, not a reranker.
}

export function reusableRecommendation(item, center) {
  const saved = item.verifiedPlace;
  const place = normalizeSelectedPlace(saved);
  return place && center && saved.source === 'google_places' && saved.intentKey === intentKey(item.placeIntent) &&
    saved.category === normalizePlaceIntent(item.placeIntent)?.category && saved.centerPlaceId === center.placeId &&
    distanceMeters(center, place) <= RECOMMENDATION_RADIUS_METERS ? { ...place,
      source: saved.source, category: saved.category, intentKey: saved.intentKey, centerPlaceId: saved.centerPlaceId } : null;
}

export function recommendationFields(item, verifiedPlace) {
  const intent = normalizePlaceIntent(item.placeIntent);
  const place = normalizeSelectedPlace(verifiedPlace);
  const valid = intent && place && verifiedPlace.source === 'google_places' && verifiedPlace.intentKey === intentKey(intent);
  return {
    verifiedPlace: valid ? verifiedPlace : null,
    placeStatus: valid ? 'verified' : 'unresolved',
    title: valid ? place.displayName : (intent?.purpose || item.title),
    location: valid ? place.formattedAddress : (intent?.nearLocation || ''),
    latLng: valid ? { lat: place.lat, lng: place.lng } : null,
    resolvedName: valid ? place.displayName : '', resolvedAddress: valid ? place.formattedAddress : '',
    googleMapsUrl: valid ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName)}&query_place_id=${encodeURIComponent(place.placeId)}` : '',
    // The model has not inspected the selected business. Never retain its
    // invented reviews/hours/website/tips as facts about the Google candidate.
    officialWebsiteUrl: '', description: intent?.purpose || '', transitInfo: '', practicalInfo: {},
  };
}

// Only the generation boundary calls this; saved trusted snapshots are not
// scrubbed during reload. The model cannot self-assert a verified identity.
export function prepareGeneratedPlaces(days, budget = null, lang = 'ko') {
  const en = lang === 'en';
  return days.map(day => ({ ...day, scheduleItems: day.scheduleItems.map(item => {
    const clean = { ...item, verifiedPlace: null, selectedPlace: null, latLng: null, resolvedName: '', resolvedAddress: '' };
    if (isFixedPlace(item) || !Object.hasOwn(item, 'placeIntent')) return clean;
    clean.placeIntent = normalizePlaceIntent(item.placeIntent);
    // Unverified cards show this purpose as their title, so it follows the screen language.
    const priceWord = (en ? { budget: 'inexpensive', standard: 'moderate', flex: 'premium' }
      : { budget: '저렴한', standard: '중간 가격대', flex: '고급' })[budget];
    if (priceWord && ['restaurant', 'cafe'].includes(clean.placeIntent?.category)) {
      const purpose = clean.placeIntent.purpose.replace(/저렴한|중간 가격대|중저가|고급|프리미엄|파인다이닝|budget-friendly|moderately priced|moderate(?:ly)?|mid-range|inexpensive|affordable|premium|luxury|fine dining/gi, '').trim();
      clean.placeIntent = { ...clean.placeIntent, purpose: `${priceWord} ${purpose || (clean.placeIntent.category === 'cafe' ? (en ? 'cafe' : '카페') : (en ? 'restaurant' : '식당'))}`.slice(0, 200) };
    }
    return { ...clean, ...recommendationFields(clean, null), placeStatus: clean.placeIntent ? 'pending' : 'unresolved' };
  }) }));
}
