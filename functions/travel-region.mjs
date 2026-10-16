// Supported trip regions are shared by client validation and server packaging.
export const TRAVEL_REGIONS = {
  KOR: { countryCode: 'KR', timeZone: 'Asia/Seoul', cities: ['seoul', 'busan', 'jeju', 'incheon', 'daegu', 'daejeon'] },
  JPN: { countryCode: 'JP', timeZone: 'Asia/Tokyo', cities: ['tokyo', 'kyoto'] },
  FRA: { countryCode: 'FR', timeZone: 'Europe/Paris', cities: ['paris', 'nice'] },
  TWN: { countryCode: 'TW', timeZone: 'Asia/Taipei', cities: ['taipei'] },
  THA: { countryCode: 'TH', timeZone: 'Asia/Bangkok', cities: ['bangkok'] },
  VNM: { countryCode: 'VN', timeZone: 'Asia/Ho_Chi_Minh', cities: ['hanoi'] },
  SGP: { countryCode: 'SG', timeZone: 'Asia/Singapore', cities: ['singapore'] },
  ITA: { countryCode: 'IT', timeZone: 'Europe/Rome', cities: ['rome'] },
  ESP: { countryCode: 'ES', timeZone: 'Europe/Madrid', cities: ['barcelona'] },
  GBR: { countryCode: 'GB', timeZone: 'Europe/London', cities: ['london'] },
  USA: { countryCode: 'US', timeZone: 'America/New_York', cities: ['newyork', 'losangeles', 'sanfrancisco', 'lasvegas', 'chicago', 'washingtondc', 'honolulu'], cityTimeZones: {
    losangeles: 'America/Los_Angeles', sanfrancisco: 'America/Los_Angeles', lasvegas: 'America/Los_Angeles',
    chicago: 'America/Chicago', washingtondc: 'America/New_York', honolulu: 'Pacific/Honolulu',
  } },
};
export function travelRegion(request = {}) {
  const country = request?.destination?.country;
  const region = Object.hasOwn(TRAVEL_REGIONS, country) ? TRAVEL_REGIONS[country] : TRAVEL_REGIONS.KOR;
  const city = request?.destination?.id;
  const timeZone = region.cityTimeZones && Object.hasOwn(region.cityTimeZones, city) ? region.cityTimeZones[city] : null;
  return timeZone ? { ...region, timeZone } : region;
}

export function localTravelDate(now = new Date(), timeZone = 'Asia/Seoul') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}

export function dateRange(start, count) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !Number.isInteger(count) || count < 1 || count > 4) return [];
  const day = new Date(`${start}T12:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== start) return [];
  return Array.from({ length: count }, (_, index) => new Date(day.getTime() + index * 86400000).toISOString().slice(0, 10));
}

// Intl supplies DST offsets; reject nonexistent local times at a spring-forward boundary.
export function travelInstant(date, time, timeZone = 'Asia/Seoul') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return null;
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== date) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
  const localWall = instant => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  };
  let instant = wall;
  for (let pass = 0; pass < 3; pass++) instant += wall - localWall(instant);
  return localWall(instant) === wall ? new Date(instant) : null;
}
