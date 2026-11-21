import { normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';
import { assessVisitHours, nextVisitStart } from './itinerary-hours.mjs';
import { minutesOf as minutes } from './itinerary-schedule-adjust.mjs';
import { isFixedPlace, recommendationCenters } from '../../map/services/recommendation-place.mjs';

const time = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
// A 60-minute filler is never a full meal: the generator owns meal windows, so the food theme gets a cafe.
const GAP_INTENTS = {
  food: { category: 'cafe', ko: '디저트 카페', en: 'dessert cafe' },
  activity: { category: 'park', ko: '공원', en: 'park' },
  healing: { category: 'park', ko: '조용한 공원', en: 'quiet park' },
  photo: { category: 'tourist_attraction', ko: '전망 좋은 명소', en: 'scenic viewpoint' }
};
// Google often lists no hours for landmarks and parks, and most are open all day: a looked-up place of these
// types without hours is accepted. A failed lookup (null) is still rejected; cafes and the rest need real hours.
const OPEN_AIR = new Set(['park', 'tourist_attraction']);
const hoursOk = (item, data, status) => ['current','regular'].includes(status) || (!!data && status === 'unknown' && OPEN_AIR.has(item.placeIntent?.category));
const DEFAULT_GAP_INTENT = { category: 'tourist_attraction', ko: '관광 명소', en: 'tourist attraction' };
const place = item => normalizeSelectedPlace(item?.selectedPlace) || normalizeSelectedPlace(item?.verifiedPlace)
  || normalizeSelectedPlace(item?.resolvedPlace);

// An undefined duration is a leg the checks deadline left unmeasured (the earlier stop of a chained visit whose
// first visit was rolled back): the fill already passed its own measured legs, so it is no evidence against it.
const legFits = (route, from, to) => !!route && (route.durationMinutes === undefined ||
  Number.isFinite(route.durationMinutes) && route.durationMinutes >= 0 && from + Math.ceil(route.durationMinutes) <= to);

// Indexes of gapFill visits that no longer fit their measured legs, slack and opening hours.
export function failedGapFills(items, routes, { date, endTime, hoursByIndex = [] } = {}) {
  return items.flatMap((item, index) => {
    if (!item.gapFill) return [];
    const inbound = routes.find(r => r.fromIndex === index-1 && (r.toIndex ?? index) === index);
    const outbound = routes.find(r => r.fromIndex === index && (r.toIndex ?? index+1) === index+1);
    const next = items[index+1], previous = items[index-1];
    const end = next?.type === 'arrival' ? minutes(endTime) : minutes(next?.time);
    const start = minutes(item.time), until = minutes(item.endTime), before = minutes(previous?.endTime || previous?.time);
    return end !== null && start !== null && until !== null && before !== null &&
      legFits(inbound, before, start) && legFits(outbound, until + 30, end) &&
      hoursOk(item, hoursByIndex[index], assessVisitHours(item, date, hoursByIndex[index])) ? [] : [index];
  });
}

// ponytail: one candidate per measured gap, plus one chained after it when 90+ minutes remain and the daily
// limit allows; at most four searches/day; leave unsuitable gaps as free time.
export async function fillMeasuredGaps(items, routes, { date, endTime, excludedPlaceIds = [], resolvedPlaces = [],
  findRecommendation, travelMinutes, getHours, language = 'ko', budget, cityId, theme } = {}) {
  // Why gaps or candidates were dropped: fixed reason strings and counts only, for debugging.
  const skipped = {};
  const skip = reason => { skipped[reason] = (skipped[reason] || 0) + 1; };
  const unchanged = () => ({ items, changed: false, skipped });
  const limit = 2 - items.filter(item => item.gapFill === true).length;
  if (limit <= 0) { skip('limit'); return unchanged(); }
  if (!findRecommendation || !travelMinutes || !getHours) { skip('no-checks'); return unchanged(); }
  const identities = items.map((item, index) => place(item) || normalizeSelectedPlace(resolvedPlaces.find(p => p.index === index)?.resolvedPlace));
  const excluded = new Set([...excludedPlaceIds, ...identities.map(p => p?.placeId).filter(Boolean)]);
  const gaps = (routes || []).flatMap(route => {
    const index = route.fromIndex, next = index + 1;
    if (!Number.isInteger(index) || index < 0 || next >= items.length || (route.toIndex ?? next) !== next ||
        !Number.isFinite(route.durationMinutes) || route.durationMinutes < 0) { skip('leg'); return []; }
    const start = minutes(items[index].endTime || items[index].time);
    const end = minutes(items[next].type === 'arrival' ? endTime : items[next].time);
    if (start === null || end === null) { skip('no-time'); return []; }
    // Pre-filter only: inbound, stay, outbound and 30-minute slack are measured per candidate below, so a near place
    // can fit a gap whose free time over the direct leg is under 90 minutes.
    if (end - start - Math.ceil(route.durationMinutes) < 60) { skip('short'); return []; }
    if (!identities[index] || !identities[next]) { skip('no-identity'); return []; }
    return [{ index, start, end, free: end - start - Math.ceil(route.durationMinutes) }];
  }).sort((a, b) => b.free - a.free || a.index - b.index);
  for (let i = 4; i < gaps.length; i++) skip('cap');
  gaps.length = Math.min(gaps.length, 4);
  // Same center rule as geocodeSchedule (airports skipped), so the verified ID is reused there.
  const centers = recommendationCenters(identities.flatMap((place, index) =>
    place && isFixedPlace(items[index]) ? [{ index, place }] : []), cityId);
  const themed = Object.hasOwn(GAP_INTENTS, theme ?? '') ? GAP_INTENTS[theme] : DEFAULT_GAP_INTENT;
  // The meal rules allow at most two cafe/snack stops per day.
  let cafes = items.filter(item => item.placeIntent?.category === 'cafe').length;
  const additions = [];
  // gaps.entries() rereads the length, so a chained remainder pushed below is visited after the original gaps.
  for (const [tried, gap] of gaps.entries()) {
    if (additions.length >= limit) { for (let i = tried; i < gaps.length; i++) skip('not-tried'); break; }
    // A chained visit is a general attraction, so a gap never gets two cafes or two parks in a row.
    const intent = gap.from || (themed.category === 'cafe' && cafes >= 2) ? DEFAULT_GAP_INTENT : themed;
    const center = [...centers].sort((a, b) => Math.abs(a.index - gap.index - 0.5) - Math.abs(b.index - gap.index - 0.5))[0]?.place;
    if (!center) { skip('no-center'); continue; }
    const provisional = { type: 'attraction', time: time(gap.start), endTime: time(gap.start + 60),
      placeIntent: { purpose: language === 'ko' ? intent.ko : intent.en,
        category: intent.category, nearLocation: center.displayName } };
    const candidate = await findRecommendation(provisional, center, excluded, date, budget);
    if (!candidate) { skip('no-candidate'); continue; }
    const identity = candidate.placeStatus === 'verified' && place(candidate);
    if (!identity) { skip('unverified'); continue; }
    if (excluded.has(identity.placeId)) { skip('excluded'); continue; }
    const inbound = await travelMinutes(gap.from || identities[gap.index], identity, date, time(gap.start));
    if (!Number.isFinite(inbound) || inbound < 0) { skip('inbound'); continue; }
    const hours = await getHours(identity.placeId);
    // After an earlier fill, keep the same 30 minutes failedGapFills requires before the next visit.
    const earliest = gap.start + Math.ceil(inbound) + (gap.from ? 30 : 0);
    const start = nextVisitStart(candidate, date, hours, earliest, 60, gap.end - 30, { requireKnown: !(hours && OPEN_AIR.has(intent.category)) });
    if (start === null) {
      // window: inbound travel left no 60-minute slot; hours-missing: lookup failed or deadline ran out;
      // hours-unknown: no usable hours data; hours: closed or open hours conflict with every slot.
      skip(earliest + 60 > gap.end - 30 ? 'window' : !hours ? 'hours-missing'
        : assessVisitHours({ ...candidate, time: time(earliest), endTime: time(earliest + 60) }, date, hours) === 'unknown' ? 'hours-unknown' : 'hours');
      continue;
    }
    const end = start + 60;
    const outbound = await travelMinutes(identity, identities[gap.index+1], date, time(end));
    if (!Number.isFinite(outbound) || outbound < 0 || end + Math.ceil(outbound) + 30 > gap.end) { skip('outbound'); continue; }
    additions.push({ index: gap.index, item: { ...candidate, time: time(start), endTime: time(end), visitNotBefore: time(start), gapFill: true } });
    excluded.add(identity.placeId);
    if (intent.category === 'cafe') cafes++;
    // Pre-filter only, like a fresh gap: the chained visit still needs 30-minute slacks around 60 minutes, measured.
    const rest = gap.end - end - Math.ceil(outbound);
    if (rest >= 90 && gaps.length < 4 && additions.length < limit) gaps.push({ index: gap.index, from: identity, start: end, end: gap.end });
  }
  if (!additions.length) return unchanged();
  const result = items.slice();
  // Reverse first so the stable sort splices a gap's later visit before its earlier one, keeping time order.
  for (const addition of additions.reverse().sort((a, b) => b.index - a.index)) result.splice(addition.index + 1, 0, addition.item);
  return { items: result, changed: true, skipped };
}
