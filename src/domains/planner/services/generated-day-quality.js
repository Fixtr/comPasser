import { travelRegion } from '../../../../functions/travel-region.mjs';
import { GeocodingService } from '../../map/services/geocoding-service.js';
import { getMapsLoader } from '../../map/services/google-maps-loader.js';
import { recommendationFields } from '../../map/services/recommendation-place.mjs';
import { fitMeasuredSchedule } from '../../itinerary/services/itinerary-end-fit.mjs';
import { fillMeasuredGaps, failedGapFills } from '../../itinerary/services/itinerary-gap-fill.mjs';
import { loadScheduleHours } from '../../itinerary/services/itinerary-hours.mjs';
import { normalizeSelectedPlace } from './selected-place.mjs';
import { createFlexibleVisitChecks } from './flexible-visit-checks.js';
import { getDayConstraints } from '../../itinerary/services/itinerary-view-model.mjs';
import { getLang } from '../../../utils/i18n.js';

const identity = item => normalizeSelectedPlace(item?.selectedPlace) || normalizeSelectedPlace(item?.verifiedPlace)
  || normalizeSelectedPlace(item?.resolvedPlace);

const measureLegs = (checks, date, items) => Promise.all(items.slice(1).map(async (_, index) => {
  const from = identity(items[index]), to = identity(items[index+1]);
  return { fromIndex: index, toIndex: index+1, durationMinutes: from && to
    ? await checks.travelMinutes(from, to, date, items[index].endTime || items[index].time) : null };
}));

// Gap-fill diagnostics stay in the developer console: day index, fixed reasons and counts only.
const gapLog = (dayIndex, detail) => console.info('[GapFill]', dayIndex, detail);

// A provider outage must not discard a successfully generated itinerary or claim estimated routes are verified.
const unavailable = (stage, day, error) => console.warn(`Generated itinerary ${stage} verification unavailable`, day.date, error);

// Verify every generated day, including tabs the user never opens. Saved/shared plans never call this.
// Each day and stage fails on its own, so one provider error cannot leave the other days unverified.
export async function verifyGeneratedItinerary(plan, {
  geocoding = new GeocodingService(getMapsLoader(), { getLanguage: getLang, countryCode: travelRegion(plan.request).countryCode }),
  createChecks = createFlexibleVisitChecks,
  loadHours = loadScheduleHours,
  onStage = () => {}
} = {}) {
  const result = structuredClone(plan);
  const { pace, companion, theme } = result.request || {};
  // Relaxed pace returns before gap filling, so a single day is filled unless kids or parents come along.
  const fillDayTrip = companion !== 'family_kids' && companion !== 'parents';
  const excludedIds = () => result.days.flatMap(day => day.scheduleItems.map(item => identity(item)?.placeId).filter(Boolean));
  // Resolve all day identities in order before filling gaps so later-day visits cannot become an earlier day's extra.
  onStage('places');
  for (const day of result.days) {
    try {
      const items = day.scheduleItems.map((item, index) => ({ ...item, displayIndex: index + 1 }));
      const resolved = await geocoding.geocodeSchedule(items, day.date, excludedIds(), result.request?.budget, travelRegion(result.request).countryCode, result.request?.destination?.id);
      day.scheduleItems = items.map((item, index) => {
        const found = resolved.find(place => place.displayIndex === index + 1);
        const clean = { ...item };
        delete clean.displayIndex;
        if (item.placeIntent && !['departure', 'arrival', 'AnchorSchedule'].includes(item.type)) {
          return { ...clean, ...recommendationFields(item, found?.verifiedPlace), unresolvedReason: found ? null : item.unresolvedReason || null };
        }
        return { ...clean, ...(found?.resolvedPlace ? { resolvedPlace: normalizeSelectedPlace(found.resolvedPlace) } : {}) };
      });
    } catch (error) { unavailable('places', day, error); }
  }
  onStage('routes');
  // Fitting touches only its own day, so days run together (at most days x legs requests in flight).
  const fitted = await Promise.all(result.days.map(async (day, dayIndex) => {
    try {
      const constraints = getDayConstraints(result, dayIndex);
      if (!constraints?.endTime) return null;
      const checks = createChecks(Math.max(4, day.scheduleItems.length), result.request);
      let routes;
      // Reuse the timeline's bounded measured fitter, rather than adding a second scheduling policy.
      for (let pass = 0; pass < 4; pass++) {
        routes = await measureLegs(checks, day.date, day.scheduleItems);
        const hoursByIndex = await loadHours(day.scheduleItems);
        const fit = fitMeasuredSchedule(day.scheduleItems, routes, constraints.endTime, constraints.startTime,
          { compact: true, date: day.date, hoursByIndex });
        day.scheduleItems = fit.items;
        if (!fit.adjusted) break;
        routes = null;
      }
      routes ||= await measureLegs(checks, day.date, day.scheduleItems);
      return { constraints, routes };
    } catch (error) { unavailable('routes', day, error); return null; }
  }));
  if (pace === 'relaxed') { gapLog(null, { skippedTrip: 'relaxed' }); return result; }
  // Gap filling adds places and reserves every other day's IDs, so it stays sequential across days.
  for (const [dayIndex, day] of result.days.entries()) {
    const { constraints, routes } = fitted[dayIndex] || {};
    if (!constraints) { gapLog(dayIndex, { skippedDay: 'no-constraints' }); continue; }
    // Single days with kids/parents keep their slack. An airport end needs no extra rule:
    // the fill already requires the measured airport leg plus 30 minutes before the end time.
    if (result.days.length < 2 && !fillDayTrip) { gapLog(dayIndex, { skippedDay: 'single-day' }); continue; }
    try {
      // Fresh checks: the fit's deadline started with every day at once and would expire for later days.
      const checks = createChecks(Math.max(4, day.scheduleItems.length), result.request);
      const filled = await fillMeasuredGaps(day.scheduleItems, routes, { ...checks, date: day.date, theme,
        endTime: constraints.endTime, excludedPlaceIds: excludedIds(), language: getLang(), budget: result.request?.budget, cityId: result.request?.destination?.id });
      if (!filled.changed) { gapLog(dayIndex, { skipped: filled.skipped, added: 0 }); continue; }
      let items = filled.items, failed;
      // Drop only failing additions, then re-measure: removing a visit changes its neighbours' legs.
      do {
        const confirmed = await measureLegs(checks, day.date, items);
        failed = new Set(failedGapFills(items, confirmed, { date: day.date, endTime: constraints.endTime,
          hoursByIndex: await loadHours(items) }).filter(index => !day.scheduleItems.includes(items[index])));
        items = items.filter((_, index) => !failed.has(index));
      } while (failed.size);
      const added = items.length - day.scheduleItems.length;
      day.scheduleItems = items;
      gapLog(dayIndex, { skipped: filled.skipped, added, rolledBack: filled.items.length - items.length });
    } catch (error) { unavailable('gap', day, error); }
  }
  return result;
}
