// Shared response contract: an empty day is not evidence of a forecast.
export function validRecommendationWeather(weather) {
  if (!weather || !['forecast','seasonal','unavailable'].includes(weather.status)) return false;
  if (weather.status !== 'forecast') return true;
  const { description, minC, maxC, rainPercent } = weather;
  if (typeof description !== 'string' || description.length > 160
    || [minC,maxC].some(value => value !== null && (!Number.isFinite(value) || value < -100 || value > 100))
    || (minC !== null && maxC !== null && minC > maxC)
    || (rainPercent !== null && (!Number.isFinite(rainPercent) || rainPercent < 0 || rainPercent > 100))) return false;
  return Boolean(description.trim()) || minC !== null || maxC !== null || rainPercent !== null;
}

// Trip-day hourly rain from getTripWeather. A missing hour or null percent means unknown, never dry or wet.
export function validTripWeather(weather) {
  if (weather?.status === 'unavailable') return Object.keys(weather).length === 1;
  return weather?.status === 'forecast' && /^\d{4}-\d{2}-\d{2}$/.test(weather.date || '')
    && Array.isArray(weather.hours) && weather.hours.length > 0 && weather.hours.length <= 24
    && weather.hours.every((entry, index) => entry && Number.isInteger(entry.hour) && entry.hour >= 0 && entry.hour <= 23
      && (index === 0 || entry.hour > weather.hours[index - 1].hour)
      && (entry.rainPercent === null || (Number.isFinite(entry.rainPercent) && entry.rainPercent >= 0 && entry.rainPercent <= 100)));
}
