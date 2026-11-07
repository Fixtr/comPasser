import { travelRegion } from '../../../../functions/travel-region.mjs';
import { normalizePlannerRequest, getLocationName } from './planner-constraints.mjs';
import { normalizeSelectedPlace } from './selected-place.mjs';
import { scheduleFlexibleVisits } from './schedule-flexible-visits.mjs';
import { getLang } from '../../../utils/i18n.js';
import { minutesOf as minutes } from '../../itinerary/services/itinerary-schedule-adjust.mjs';

const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const coordinate = value => ({lat: typeof value.lat === 'function' ? value.lat() : value.lat,
  lng: typeof value.lng === 'function' ? value.lng() : value.lng});

export function routeDiscoveryGaps(day) {
  if (!day || minutes(day.startTime) === null || minutes(day.endTime) === null) return [];
  const anchors = [...(day.anchors || [])].sort((a, b) => minutes(a.time) - minutes(b.time));
  if (anchors.some((anchor, index) => minutes(anchor.time) === null || minutes(anchor.endTime) === null
      || minutes(anchor.time) < minutes(day.startTime) || minutes(anchor.endTime) > minutes(day.endTime)
      || anchor.time >= anchor.endTime || (index > 0 && anchors[index - 1].endTime > anchor.time))) return [];
  const stops = [{location:day.startLocation, endTime:day.startTime}, ...anchors,
    {location:day.endLocation, time:day.endTime}];
  return stops.slice(0, -1).map((from, index) => ({from:from.location, to:stops[index + 1].location,
    start:minutes(from.endTime), end:minutes(stops[index + 1].time)}))
    .filter(gap => getLocationName(gap.from) && getLocationName(gap.to) && gap.end - gap.start >= 60);
}

async function mapServices(request) {
  const [{getMapsLoader}, {RoutingService}, {GeocodingService}, {buildTransitDepartureTime}, {createFlexibleVisitChecks}] = await Promise.all([
    import('../../map/services/google-maps-loader.js'), import('../../map/services/routing-service.js'),
    import('../../map/services/geocoding-service.js'), import('../../map/services/transit-time.mjs'),
    import('./flexible-visit-checks.js'),
  ]);
  const loader = getMapsLoader();
  const routing = new RoutingService(loader);
  const geocoding = new GeocodingService(loader, {getLanguage:getLang, countryCode:travelRegion(request).countryCode});
  const checks = createFlexibleVisitChecks(3, request);
  return {
    ...checks,
    async resolvePlace(value) {
      return normalizeSelectedPlace(value) || (await geocoding.resolvePlace(getLocationName(value)))?.resolvedPlace;
    },
    getRoute: (from, to, date, time) => from.placeId === to.placeId
      ? Promise.resolve({routes:[{legs:[{duration:{value:0}}]}]}) : routing.getTransitRoute(coordinate(from), coordinate(to), buildTransitDepartureTime(date, time, new Date(), travelRegion(request).timeZone)),
    async findPlace(center, excluded, date, time) {
      const item = {time, endTime:clock(minutes(time) + 60), placeIntent:{purpose:'관광 명소',
        category:'tourist_attraction', nearLocation:''}};
      return (await geocoding.resolveRecommendation(item, center, excluded, 6000, date))?.verifiedPlace;
    },
  };
}

/** Measured detours only. No straight-line estimate is presented as travel time. */
export async function findRouteStops(request, dayNumber, services) {
  const day = normalizePlannerRequest(request).dailyData.find(day => day.day === dayNumber);
  if (!day || !getLocationName(day.startLocation) || !getLocationName(day.endLocation)
      || minutes(day.startTime) === null || minutes(day.endTime) === null || day.startTime >= day.endTime) {
    return {status:'missing-input', suggestions:[]};
  }
  const deadline = Date.now() + 45000;
  const within = async work => {
    let timer;
    try {
      return await Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Route discovery timeout')), Math.max(1, Math.min(8000, deadline - Date.now())));
      })]);
    } finally { clearTimeout(timer); }
  };
  try {
    services ||= await within(mapServices(request));
    const placement = await within(scheduleFlexibleVisits({...request, anchorSchedules:(request.anchorSchedules || [])
      .filter(anchor => Number(anchor.day || 1) === dayNumber)}, services));
    if (placement.issue) return {status:placement.issue.reason === 'flexible-visit-route' ? 'unavailable' : 'empty', suggestions:[]};
    const preparedDay = normalizePlannerRequest({...placement.request, dailyData:undefined}).dailyData.find(day => day.day === dayNumber);
    const gaps = routeDiscoveryGaps(preparedDay).sort((a, b) => (b.end - b.start) - (a.end - a.start));
    if (!gaps.length) return {status:'empty', suggestions:[]};
    const excluded = new Set();
    for (const source of normalizePlannerRequest(request).dailyData.flatMap(day =>
      [day.startLocation, day.endLocation, ...(day.anchors || []).map(anchor => anchor.location)])) {
      const place = normalizeSelectedPlace(source);
      if (place) excluded.add(place.placeId);
    }
    const selectedNames = new Set((request.anchorSchedules || []).flatMap(anchor => [anchor.name || '', getLocationName(anchor.location)])
      .map(name => name.replace(/\s/g, '').toLowerCase()));
    const suggestions = [];
    let measured = false;
    // ponytail: sample three points on at most two fixed-stop legs; expand only if coverage is insufficient.
    for (const gap of gaps.slice(0, 2)) {
      if (Date.now() >= deadline || suggestions.length >= 3) break;
      const from = await within(services.resolvePlace(gap.from));
      const to = await within(services.resolvePlace(gap.to));
      if (!from || !to) continue;
      excluded.add(from.placeId); excluded.add(to.placeId);
      const route = await within(services.getRoute(from, to, day.date, clock(gap.start)));
      const seconds = route?.routes?.[0]?.legs?.[0]?.duration?.value;
      if (!Number.isFinite(seconds) || seconds < 0) continue;
      measured = true;
      const baseline = Math.ceil(seconds / 60);
      if (gap.start + baseline + 60 > gap.end) continue;
      const path = route.routes[0].overview_path || [];
      const centers = [coordinate(from), ...(path.length ? [coordinate(path[Math.floor(path.length / 2)])] : []), coordinate(to)];
      for (const center of centers) {
        if (Date.now() >= deadline || suggestions.length >= 3) break;
        const place = await within(services.findPlace(center, excluded, day.date, clock(gap.start + baseline)));
        if (!normalizeSelectedPlace(place) || excluded.has(place.placeId)) continue;
        excluded.add(place.placeId);
        if (selectedNames.has(place.displayName.replace(/\s/g, '').toLowerCase())) continue;
        const inbound = await within(services.travelMinutes(from, place, day.date, clock(gap.start)));
        if (!Number.isFinite(inbound) || inbound < 0 || gap.start + inbound + 60 > gap.end) continue;
        const start = gap.start + Math.ceil(inbound), end = start + 60;
        const outbound = await within(services.travelMinutes(place, to, day.date, clock(end)));
        if (!Number.isFinite(outbound) || outbound < 0 || end + outbound > gap.end) continue;
        const detourMinutes = Math.max(0, Math.ceil(inbound + outbound) - baseline);
        if (detourMinutes > 20) continue;
        const visit = {name:place.displayName, day:dayNumber, location:normalizeSelectedPlace(place),
          flexible:true, stayMinutes:60, time:'', endTime:''};
        const hours = await within(services.hoursStatus(visit, day.date, clock(start), clock(end)));
        if (['closed','conflict'].includes(hours)) continue;
        suggestions.push({visit, detourMinutes, time:clock(start), endTime:clock(end),
          from:getLocationName(gap.from), to:getLocationName(gap.to),
          hours:['current','regular'].includes(hours) ? hours : 'unknown'});
      }
    }
    return {status:suggestions.length ? 'ready' : measured ? 'empty' : 'unavailable', suggestions};
  } catch { return {status:'unavailable', suggestions:[]}; }
}
