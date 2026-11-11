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
