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
