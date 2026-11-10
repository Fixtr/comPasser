import { travelRegion } from '../../../../functions/travel-region.mjs';
import { GeocodingService } from '../../map/services/geocoding-service.js';
import { getMapsLoader } from '../../map/services/google-maps-loader.js';
import { recommendationFields } from '../../map/services/recommendation-place.mjs';
import { fitMeasuredSchedule } from '../../itinerary/services/itinerary-end-fit.mjs';
import { fillMeasuredGaps, gapFillFits } from '../../itinerary/services/itinerary-gap-fill.mjs';
import { loadScheduleHours } from '../../itinerary/services/itinerary-hours.mjs';
import { isAirportName } from './flight-arrival.mjs';
import { getLocationName } from './location-name.mjs';
import { normalizeSelectedPlace } from './selected-place.mjs';
import { createFlexibleVisitChecks } from './flexible-visit-checks.js';
import { getDayConstraints } from '../../itinerary/services/itinerary-view-model.mjs';
import { getLang } from '../../../utils/i18n.js';

const identity = item => normalizeSelectedPlace(item?.selectedPlace) || normalizeSelectedPlace(item?.verifiedPlace)
  || normalizeSelectedPlace(item?.resolvedPlace);

// Verify every generated day, including tabs the user never opens. Saved/shared plans never call this.
export async function verifyGeneratedItinerary(plan, {
  geocoding = new GeocodingService(getMapsLoader(), { getLanguage: getLang, countryCode: travelRegion(plan.request).countryCode }),
  createChecks = createFlexibleVisitChecks,
  onStage = () => {}
} = {}) {
  const result = structuredClone(plan);
  const { pace, companion } = result.request || {};
  const packedDayTrip = pace === 'packed' && companion !== 'family_kids' && companion !== 'parents';
  const excludedIds = () => result.days.flatMap(day => day.scheduleItems.map(item => identity(item)?.placeId).filter(Boolean));
  // Resolve all day identities before filling gaps so later-day visits cannot become an earlier day's extra.
  onStage('places');
  try {
    for (const day of result.days) {
      const items = day.scheduleItems.map((item, index) => ({ ...item, displayIndex: index + 1 }));
      const resolved = await geocoding.geocodeSchedule(items, day.date, excludedIds(), result.request?.budget);
      day.scheduleItems = items.map((item, index) => {
        const found = resolved.find(place => place.displayIndex === index + 1);
        const clean = { ...item };
        delete clean.displayIndex;
        if (item.placeIntent && !['departure', 'arrival', 'AnchorSchedule'].includes(item.type)) {
          return { ...clean, ...recommendationFields(item, found?.verifiedPlace), unresolvedReason: found ? null : item.unresolvedReason || null };
        }
        return { ...clean, ...(found?.resolvedPlace ? { resolvedPlace: normalizeSelectedPlace(found.resolvedPlace) } : {}) };
      });
    }
    onStage('routes');
    for (const [dayIndex, day] of result.days.entries()) {
      const constraints = getDayConstraints(result, dayIndex);
      if (!constraints?.endTime) continue;
      const checks = createChecks(Math.max(4, day.scheduleItems.length), result.request);
      const measure = async () => Promise.all(day.scheduleItems.slice(1).map(async (_, index) => {
        const from = identity(day.scheduleItems[index]), to = identity(day.scheduleItems[index+1]);
        return { fromIndex: index, toIndex: index+1, durationMinutes: from && to
          ? await checks.travelMinutes(from, to, day.date, day.scheduleItems[index].endTime || day.scheduleItems[index].time) : null };
      }));
      let routes;
      // Reuse the timeline's bounded measured fitter, rather than adding a second scheduling policy.
      for (let pass = 0; pass < 4; pass++) {
        routes = await measure();
        const hoursByIndex = await loadScheduleHours(day.scheduleItems);
        const fit = fitMeasuredSchedule(day.scheduleItems, routes, constraints.endTime, constraints.startTime,
          { compact: true, date: day.date, hoursByIndex });
        day.scheduleItems = fit.items;
        if (!fit.adjusted) break;
        routes = null;
      }
      routes ||= await measure();
      if (pace === 'relaxed') continue;
      // Keep the day-trip extension within the airport and companion constraints.
      if (result.days.length < 2 && (!packedDayTrip || isAirportName(getLocationName(constraints.endLocation)))) continue;
      const filled = await fillMeasuredGaps(day.scheduleItems, routes, { ...checks, date: day.date,
        endTime: constraints.endTime, excludedPlaceIds: excludedIds(), language: getLang(), budget: result.request?.budget });
      if (filled.changed) {
        const original = day.scheduleItems;
        day.scheduleItems = filled.items;
        const confirmed = await measure();
        if (!gapFillFits(day.scheduleItems, confirmed, { date: day.date, endTime: constraints.endTime,
          hoursByIndex: await loadScheduleHours(day.scheduleItems) })) day.scheduleItems = original;
      }
    }
  } catch (error) {
    // A provider outage must not discard a successfully generated itinerary or claim estimated routes are verified.
    console.warn('Generated itinerary map verification unavailable', error);
  }
  return result;
}
