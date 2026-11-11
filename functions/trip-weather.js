const { createHash } = require('node:crypto');
const { RECOMMENDATION_CITIES } = require('./recommendation-cities.mjs');
const { validTripWeather } = require('./recommendation-weather.mjs');
const { TRAVEL_REGIONS, travelRegion, localTravelDate, dateRange } = require('./travel-region.mjs');
const fail = (code, reason) => Object.assign(new Error(reason), { code, details: { reason } });
const HOUR_MS = 3600000;
const PERSON_HOURLY = 20, GLOBAL_HOURLY = 1000;
const MAX_CITY_KM = 100;

// Only today and tomorrow at the destination, near a supported city, at ~11 km precision (shared cache cells).
function validateTripWeatherInput(data, now = new Date()) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || Object.keys(data).some(key => !['country', 'cityId', 'date', 'lat', 'lng'].includes(key))) throw fail('invalid-argument', 'weather-input');
  const region = typeof data.country === 'string' && Object.hasOwn(TRAVEL_REGIONS, data.country) ? TRAVEL_REGIONS[data.country] : null;
  const city = typeof data.cityId === 'string' && region?.cities.includes(data.cityId)
    && Object.hasOwn(RECOMMENDATION_CITIES, data.cityId) ? RECOMMENDATION_CITIES[data.cityId] : null;
  if (!city) throw fail('invalid-argument', 'weather-city');
  const timeZone = travelRegion({ destination: { id: data.cityId, country: data.country } }).timeZone;
  if (typeof data.date !== 'string' || !dateRange(localTravelDate(now, timeZone), 2).includes(data.date)) throw fail('invalid-argument', 'weather-date');
  if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng) || Math.abs(data.lat) > 90 || Math.abs(data.lng) > 180) throw fail('invalid-argument', 'weather-location');
  const lat = Math.round(data.lat * 10) / 10, lng = Math.round(data.lng * 10) / 10;
  const km = Math.hypot(lat - city[1], (lng - city[2]) * Math.cos(city[1] * Math.PI / 180)) * 111.32;
  if (km > MAX_CITY_KM) throw fail('invalid-argument', 'weather-location');
  return { country: data.country, cityId: data.cityId, date: data.date, lat, lng };
}

function createTripWeatherLimiter({ db, now = () => new Date() }) {
  return async uid => {
    if (!uid) throw fail('unauthenticated', 'weather-identity');
    const hour = Math.floor(now().getTime() / HOUR_MS);
    const key = createHash('sha256').update(uid).digest('hex');
    return db.runTransaction(async tx => {
      const personRef = db.collection('weather_limits').doc(key), globalRef = db.collection('weather_limits').doc('global');
      const [person, global] = (await Promise.all([tx.get(personRef), tx.get(globalRef)])).map(doc => doc.data() || {});
      const count = person.hour === hour ? person.count || 0 : 0, total = global.hour === hour ? global.count || 0 : 0;
      if (count >= PERSON_HOURLY || total >= GLOBAL_HOURLY) throw fail('resource-exhausted', 'weather-limit');
      tx.set(personRef, { hour, count: count + 1 });
      tx.set(globalRef, { hour, count: total + 1 });
    });
  };
}

const localDate = d => d && `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

function createTripWeather({ axios, getKey, db, now = () => new Date(), reserve = createTripWeatherLimiter({ db, now }) }) {
  async function lookup({ lat, lng, date }) {
    const hours = [];
    try {
      let pageToken;
      // shortcut: 48 hours in pages of 24 covers today and tomorrow; widen only if the date window grows.
      for (let page = 0; page < 3; page++) {
        const response = await axios.get('https://weather.googleapis.com/v1/forecast/hours:lookup', {
          headers: { 'X-Goog-Api-Key': getKey() }, timeout: 10000,
          params: { 'location.latitude': lat, 'location.longitude': lng, hours: 48, pageSize: 24, ...(pageToken ? { pageToken } : {}) } });
        const entries = response.data?.forecastHours || [];
        for (const entry of entries) {
          if (localDate(entry.displayDateTime) !== date) continue;
          const { percent, type } = entry.precipitation?.probability || {};
          // Only a rain-type probability counts as rain; snow, NONE with a percent, or no value stays unknown.
          hours.push({ hour: entry.displayDateTime.hours,
            rainPercent: Number.isFinite(percent) && (percent === 0 || /RAIN/.test(type || '')) ? percent : null });
        }
        pageToken = response.data?.nextPageToken;
        if (!pageToken || entries.some(entry => localDate(entry.displayDateTime) > date)) break;
      }
    } catch { return { status: 'unavailable' }; }
    const result = { status: 'forecast', date, hours };
    return validTripWeather(result) ? result : { status: 'unavailable' };
  }

  return async (uid, input) => {
    await reserve(uid);
    const hour = Math.floor(now().getTime() / HOUR_MS);
    const ref = db.collection('weather_cache').doc(`${input.lat}_${input.lng}_${input.date}_${hour}`);
    const cached = (await ref.get()).data()?.result;
    if (validTripWeather(cached)) return cached;
    const result = await lookup(input);
    // expiresAt is the Firestore TTL field for this collection.
    await ref.set({ result, expiresAt: new Date((hour + 2) * HOUR_MS) });
    return result;
  };
}

module.exports = { createTripWeather, createTripWeatherLimiter, validateTripWeatherInput };
