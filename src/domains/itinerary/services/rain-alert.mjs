import { isFixedPlace } from '../../map/services/recommendation-place.mjs';
import { minutesOf } from './itinerary-schedule-adjust.mjs';

export const RAIN_PERCENT = 50;
const OUTDOOR_CATEGORIES = ['park', 'tourist_attraction'];

// Stops without a place intent are older plans; their attraction/leisure visits are treated as outdoor.
export function isOutdoorStop(item) {
  if (!item || isFixedPlace(item)) return false;
  const category = item.placeIntent?.category;
  return category ? OUTDOOR_CATEGORIES.includes(category) : ['attraction', 'leisure'].includes(item.type);
}

// The first outdoor stop whose visit overlaps a likely-rain hour, with that whole rain window [from, to).
export function rainAlert(items, weather, { skip = () => false } = {}) {
  if (weather?.status !== 'forecast' || !Array.isArray(weather.hours)) return null;
  const rainy = new Set(weather.hours.filter(hour => hour.rainPercent !== null && hour.rainPercent >= RAIN_PERCENT).map(hour => hour.hour));
  for (const [index, item] of items.entries()) {
    const start = minutesOf(item.time), end = minutesOf(item.endTime);
    if (!isOutdoorStop(item) || skip(index) || start === null || end === null || end <= start) continue;
    let hour = Math.floor(start / 60);
    while (hour * 60 < end && !rainy.has(hour)) hour++;
    if (hour * 60 >= end) continue;
    let from = hour, to = hour + 1;
    while (rainy.has(from - 1)) from--;
    while (rainy.has(to)) to++;
    return { index, from, to };
  }
  return null;
}

const hourAt = hour => new Date(Date.UTC(2000, 0, 1, hour % 24));
// The rain window as a short hour range, or null when it covers the whole day.
// Hour 24 is formatted as that day's midnight so the range never spans two dates.
export function rainHours({ from, to }, locale) {
  if (from === 0 && to === 24) return null;
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).formatRange(hourAt(from), hourAt(to));
}
