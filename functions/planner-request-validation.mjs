import { TRAVEL_REGIONS, travelRegion, travelInstant } from './travel-region.mjs';
// Shared by the browser and the callable. Keep this module dependency-free and
// inside functions/ so Firebase's deployment includes the same validation rules.
export const MAX_DAYS = 4;
export const MAX_ANCHORS_PER_DAY = 10;

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = value => typeof value === 'string' && value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().length > 0;
const hasLocation = value => hasText(value) || (isRecord(value)
  && [value.displayName, value.formattedAddress, value.address].some(hasText));
const sameLocation = (left, right) => {
  if (isRecord(left) && isRecord(right) && hasText(left.placeId) && hasText(right.placeId)) {
    return left.placeId === right.placeId;
  }
  const name = value => (typeof value === 'string' ? value
    : [value?.displayName, value?.formattedAddress, value?.address].find(hasText) || '').trim().toLowerCase();
  return name(left) !== '' && name(left) === name(right);
};
const isTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const selectedPlace = value => isRecord(value) && hasText(value.placeId) && value.placeId.length <= 512
  && hasText(value.displayName) && hasText(value.formattedAddress)
  && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90 && Number.isFinite(value.lng) && Math.abs(value.lng) <= 180;

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Validate the canonical dailyData BEFORE sanitizing or filling defaults.
 * Returns safe reason/field indexes only, never user-entered text. Past-date
 * policy remains the form's local-calendar check; this contract is timezone-free.
 */
export function findPlannerRequestIssue(request) {
  if (!isRecord(request) || !Array.isArray(request.dailyData) || request.dailyData.length === 0) {
    return { reason: 'missing-days' };
  }
  if (request.destination && (!Object.hasOwn(TRAVEL_REGIONS, request.destination.country) || !travelRegion(request).cities.includes(request.destination.id) || typeof request.destination.name !== 'string' || !request.destination.name.trim() || request.destination.name.length > 100)) return { reason: 'travel-region' };
  const days = request.dailyData;
  if (days.length > MAX_DAYS) return { reason: 'day-limit' };
  const dates = request.date === undefined ? null : (Array.isArray(request.date) ? request.date : [request.date]);
  if (dates && dates.length !== days.length) return { reason: 'date-mismatch' };

  const overrides = request.dailyLocations;
  if (overrides != null) {
    if (!Array.isArray(overrides) || days.length < 2 || overrides.length !== days.length) {
      return { reason: 'daily-location-shape' };
    }
    for (let index = 0; index < overrides.length; index++) {
      const override = overrides[index];
      if (!isRecord(override) || override.day !== index + 1) return { reason: 'daily-location-shape' };
      for (const field of ['startLocation', 'endLocation']) {
        const value = override[field];
        if (value === '' || value == null) continue;
        if (!hasLocation(value) || !sameLocation(value, days[index]?.[field])) {
          return { reason: 'daily-location-mismatch', day: index + 1, field };
        }
      }
    }
  }

  // Flat anchors are retained for saved-request compatibility. Do not silently
  // lose an anchor whose day lies outside the trip during normalization.
  if (Array.isArray(request.anchorSchedules)) {
    for (const anchor of request.anchorSchedules) {
      const day = anchor?.day === undefined ? 1 : anchor.day;
      if (!Number.isInteger(day) || day < 1 || day > days.length) return { reason: 'anchor-day' };
    }
  }

  for (let index = 0; index < days.length; index += 1) {
    const item = days[index];
    const day = index + 1;
    const issue = (reason, field, anchorIndex) => ({ reason, day, ...(field ? { field } : {}),
      ...(anchorIndex === undefined ? {} : { anchorIndex }) });
    if (!isRecord(item) || item.day !== day) return issue('day-order');
    if (!isDate(item.date)) return issue('invalid-date', 'date');
    if (dates && dates[index] !== item.date) return issue('date-mismatch', 'date');
    if (index > 0 && days[index - 1].date >= item.date) return issue('date-order', 'date');
    for (const field of ['startTime', 'endTime']) {
      if (!isTime(item[field])) return issue('invalid-time', field);
    }
    if ((item.timeZone !== undefined && item.timeZone !== travelRegion(request).timeZone) || !travelInstant(item.date, item.startTime, travelRegion(request).timeZone) || !travelInstant(item.date, item.endTime, travelRegion(request).timeZone)) return issue('invalid-time', 'startTime');
    if (item.startTime >= item.endTime) return issue('time-order', 'endTime');
    for (const field of ['startLocation', 'endLocation']) {
      if (!hasLocation(item[field])) return issue('missing-location', field);
      if (request.destination && !selectedPlace(item[field]) && item[field] !== request.destination.name) return issue('missing-location', field);
    }
    // No anchors is valid; an explicitly malformed list is not.
    const anchors = item.anchors === undefined ? [] : item.anchors;
    if (!Array.isArray(anchors)) return issue('invalid-anchors');
    if (anchors.length > MAX_ANCHORS_PER_DAY) return issue('anchor-limit');
    for (let anchorIndex = 0; anchorIndex < anchors.length; anchorIndex += 1) {
      const anchor = anchors[anchorIndex];
      if (!isRecord(anchor) || !hasText(anchor.name)) return issue('incomplete-anchor', 'name', anchorIndex);
      if (anchor.day !== undefined && anchor.day !== day) return issue('anchor-day', 'day', anchorIndex);
      for (const field of ['time', 'endTime']) {
        if (!isTime(anchor[field])) return issue('invalid-anchor-time', field, anchorIndex);
        if (!travelInstant(item.date, anchor[field], travelRegion(request).timeZone)) return issue('invalid-anchor-time', field, anchorIndex);
      }
      if (request.destination && !selectedPlace(anchor.location)) return issue('incomplete-anchor', 'location', anchorIndex);
      if (anchor.time >= anchor.endTime) return issue('anchor-time-order', 'endTime', anchorIndex);
      if (anchor.time < item.startTime) return issue('anchor-bounds', 'time', anchorIndex);
      if (anchor.endTime > item.endTime) return issue('anchor-bounds', 'endTime', anchorIndex);
    }
  }
  for (const day of days) {
    const fixed = [...(day.anchors || [])].sort((a, b) => a.time.localeCompare(b.time));
    if (fixed.some((anchor, index) => index > 0 && fixed[index - 1].endTime > anchor.time)) return { reason: 'anchor-overlap', day: day.day, field: 'time' };
  }
  if (request.overnightLocations !== undefined) {
    if (!Array.isArray(request.overnightLocations) || request.overnightLocations.length !== days.length - 1) {
      return {reason:'overnight-length'};
    }
    for (let index = 0; index < days.length - 1; index++) {
      const stay = request.overnightLocations[index] || request.destination?.name;
      const end = overrides?.[index]?.endLocation;
      const start = overrides?.[index + 1]?.startLocation;
      if (!hasLocation(stay) || !sameLocation(days[index].endLocation, hasLocation(end) ? end : stay)
          || !sameLocation(hasLocation(start) ? start : stay, days[index + 1].startLocation)) {
        return {reason:'overnight-mismatch',day:index + 1};
      }
    }
  }
  return null;
}
