import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../auth/services/firebase-auth.js';
import { normalizeSelectedPlace } from './selected-place.mjs';
import { validRecommendationWeather } from '../../../../functions/recommendation-weather.mjs';

export async function getAIPlaceRecommendations(input) {
  if (!app) throw Object.assign(new Error('recommendation-config'),{code:'functions/failed-precondition'});
  const response = await httpsCallable(getFunctions(app),'recommendPlaces',{timeout:310000})(input);
  const result = response.data;
  if (!result || result.cityId !== input.cityId || result.country !== input.country || result.date !== input.date || result.lang !== input.lang
    || result.interest !== (input.interest ?? 'any')
    || !Array.isArray(result.places) || result.places.length < 1 || result.places.length > 4
    || !validRecommendationWeather(result.weather)
    || typeof result.searchSuggestions !== 'string' || result.searchSuggestions.length > 24000
    || result.places.some(item => !normalizeSelectedPlace(item.place) || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 400
      || input.excludedPlaces?.some(excluded => excluded.placeId === item.place.placeId)
      || (item.hours !== undefined && !validHours(item.hours))
      || !Array.isArray(item.sources) || item.sources.length < 1 || item.sources.length > 3
      || item.sources.some(source => typeof source.title !== 'string' || !safeLink(source.url))
      || (item.mapsUrl && !safeLink(item.mapsUrl)) || (item.attributions && (!Array.isArray(item.attributions) || item.attributions.some(a=>typeof a.name !== 'string' || (a.url && !safeLink(a.url))))))) throw new Error('recommendation-response');
  return result;
}

function validHours(hours) {
  if (!hours || !['current','regular','unknown'].includes(hours.status) || !Array.isArray(hours.intervals)) return false;
  if (hours.status === 'unknown') return hours.intervals.length === 0;
  return hours.intervals.length > 0 && hours.intervals.length <= 14 && hours.intervals.every(interval => {
    if (typeof interval !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d–(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(interval)) return false;
    const [start,end] = interval.split('–');
    return start < end;
  });
}

function safeLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
