import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../auth/services/firebase-auth.js';
import { validTripWeather } from '../../../../functions/recommendation-weather.mjs';

// One server call per trip day, cell and hour on this device; a failure also stays cached so renders never retry-loop.
const calls = new Map();
export function fetchTripWeather(input) {
  const key = [input.country, input.cityId, input.date, Math.round(input.lat * 10), Math.round(input.lng * 10), Math.floor(Date.now() / 3600000)].join(':');
  if (!calls.has(key)) calls.set(key, request(input));
  return calls.get(key);
}

async function request(input) {
  if (!app) throw new Error('weather-config');
  const { data } = await httpsCallable(getFunctions(app), 'getTripWeather', { timeout: 20000 })(input);
  if (!validTripWeather(data) || (data.status === 'forecast' && data.date !== input.date)) throw new Error('weather-response');
  return data;
}
