import { normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';
import { assessVisitHours, nextVisitStart } from './itinerary-hours.mjs';

const minutes = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const time = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const place = item => normalizeSelectedPlace(item?.selectedPlace) || normalizeSelectedPlace(item?.verifiedPlace)
  || normalizeSelectedPlace(item?.resolvedPlace);

export function gapFillFits(items, routes, { date, endTime, hoursByIndex = [] } = {}) {
  return items.every((item, index) => {
    if (!item.gapFill) return true;
    const inbound = routes.find(r => r.fromIndex === index-1 && (r.toIndex ?? index) === index);
    const outbound = routes.find(r => r.fromIndex === index && (r.toIndex ?? index+1) === index+1);
    const next = items[index+1], previous = items[index-1];
    const end = next?.type === 'arrival' ? minutes(endTime) : minutes(next?.time);
    const start = minutes(item.time), until = minutes(item.endTime), before = minutes(previous?.endTime || previous?.time);
    return end !== null && start !== null && until !== null && before !== null &&
      Number.isFinite(inbound?.durationMinutes) && inbound.durationMinutes >= 0 && Number.isFinite(outbound?.durationMinutes) && outbound.durationMinutes >= 0 &&
      before + Math.ceil(inbound.durationMinutes) <= start && until + Math.ceil(outbound.durationMinutes) + 30 <= end &&
      ['current','regular'].includes(assessVisitHours(item, date, hoursByIndex[index]));
  });
}

// ponytail: one candidate per measured gap, at most four searches/day; leave unsuitable gaps as free time.
export async function fillMeasuredGaps(items, routes, { date, endTime, excludedPlaceIds = [], resolvedPlaces = [],
  findRecommendation, travelMinutes, getHours, language = 'ko', budget } = {}) {
  const unchanged = { items, changed: false };
  const limit = 2 - items.filter(item => item.gapFill === true).length;
  if (limit <= 0 || !findRecommendation || !travelMinutes || !getHours) return unchanged;
  const identities = items.map((item, index) => place(item) || normalizeSelectedPlace(resolvedPlaces.find(p => p.index === index)?.resolvedPlace));
  const excluded = new Set([...excludedPlaceIds, ...identities.map(p => p?.placeId).filter(Boolean)]);
  const gaps = (routes || []).flatMap(route => {
    const index = route.fromIndex, next = index + 1;
    if (!Number.isInteger(index) || index < 0 || next >= items.length || (route.toIndex ?? next) !== next ||
        !Number.isFinite(route.durationMinutes) || route.durationMinutes < 0) return [];
    const start = minutes(items[index].endTime || items[index].time);
    const end = minutes(items[next].type === 'arrival' ? endTime : items[next].time);
    return start !== null && end !== null && end - start - Math.ceil(route.durationMinutes) >= 90 && identities[index] && identities[next]
      ? [{ index, start, end, free: end - start - Math.ceil(route.durationMinutes) }] : [];
  }).sort((a, b) => b.free - a.free || a.index - b.index).slice(0, 4);
  const additions = [];
  for (const gap of gaps) {
    if (additions.length >= limit) break;
    // Match the same nearest authoritative center used by geocodeSchedule so the verified ID is reused.
    const center = identities.map((identity, index) => ({ identity, index }))
      .filter(p => p.identity && ['departure', 'arrival', 'AnchorSchedule'].includes(items[p.index].type))
      .sort((a, b) => Math.abs(a.index - gap.index - 0.5) - Math.abs(b.index - gap.index - 0.5))[0]?.identity;
    if (!center) continue;
    const provisional = { type: 'attraction', time: time(gap.start), endTime: time(gap.start + 60),
      placeIntent: { purpose: language === 'ko' ? '관광 명소' : 'tourist attraction',
        category: 'tourist_attraction', nearLocation: center.displayName } };
    const candidate = await findRecommendation(provisional, center, excluded, date, budget);
    const identity = candidate?.placeStatus === 'verified' && place(candidate);
    if (!identity || excluded.has(identity.placeId)) continue;
    const inbound = await travelMinutes(identities[gap.index], identity, date, time(gap.start));
    if (!Number.isFinite(inbound) || inbound < 0) continue;
    const start = nextVisitStart(candidate, date, await getHours(identity.placeId), gap.start + Math.ceil(inbound), 60, gap.end - 30, { requireKnown: true });
    if (start === null) continue;
    const end = start + 60;
    const outbound = await travelMinutes(identity, identities[gap.index+1], date, time(end));
    if (!Number.isFinite(outbound) || outbound < 0 || end + Math.ceil(outbound) + 30 > gap.end) continue;
    additions.push({ index: gap.index, item: { ...candidate, time: time(start), endTime: time(end), visitNotBefore: time(start), gapFill: true } });
    excluded.add(identity.placeId);
  }
  if (!additions.length) return unchanged;
  const result = items.slice();
  for (const addition of additions.sort((a, b) => b.index - a.index)) result.splice(addition.index + 1, 0, addition.item);
  return { items: result, changed: true };
}
