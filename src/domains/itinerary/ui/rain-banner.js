import { t, getLang } from '../../../utils/i18n.js';
import { localTravelDate, dateRange, travelRegion } from '../../../../functions/travel-region.mjs';
import { normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';
import { visitedStops, stopKeys } from '../services/visited-stops.mjs';
import { isOutdoorStop, rainAlert } from '../services/rain-alert.mjs';
import { fetchTripWeather } from '../services/trip-weather-api.js';

const hourAt = hour => new Date(Date.UTC(2000, 0, 1, hour));
const activeDay = view => view.normalizeData(view.currentItinerary)?.days?.[view.activeDayIndex];
const point = (item, resolved) => normalizeSelectedPlace(item.selectedPlace) || normalizeSelectedPlace(item.verifiedPlace)
  || normalizeSelectedPlace(resolved?.resolvedPlace) || normalizeSelectedPlace(item.resolvedPlace)
  // Legacy stops only get map coordinates, never a saved identity.
  || (Number.isFinite(resolved?.coordinates?.lat) && Number.isFinite(resolved?.coordinates?.lng) ? resolved.coordinates : null);

// The one refresh hook: call it whenever the day, its times, its resolved places or its visited marks change.
// Shown only to the signed-in owner, online, for a trip day that is today or tomorrow at the destination.
export async function refreshRainBanner(view) {
  const version = view._rainVersion = (view._rainVersion || 0) + 1;
  const source = view.currentItinerary, dayIndex = view.activeDayIndex;
  const current = view.shadowRoot.getElementById('rain-banner');
  // A banner for another plan or day goes at once; one for this day stays until the new answer replaces it.
  if (current && (current.source !== source || current.dayIndex !== dayIndex)) current.remove();
  const clear = () => view.shadowRoot.getElementById('rain-banner')?.remove();
  const request = source?.request || source?.metadata?.request;
  const day = activeDay(view);
  if (!view.canEdit() || navigator.onLine === false || !day || !request?.destination?.id) return clear();
  const date = String(day.date).slice(0, 10);
  if (!dateRange(localTravelDate(new Date(), travelRegion(request).timeZone), 2).includes(date)) return clear();
  const location = (day.scheduleItems || []).map((item, index) => isOutdoorStop(item)
    && point(item, view.lastResolvedPlaces?.find(place => place.index === index))).find(Boolean);
  if (!location) return clear();
  let weather;
  try {
    weather = await fetchTripWeather({ country: request.destination.country, cityId: request.destination.id, date, lat: location.lat, lng: location.lng });
  } catch { weather = null; }
  if (version !== view._rainVersion) return;
  // Times, places and visited marks may have changed in place while waiting: decide on the day as it is now.
  const now = activeDay(view);
  const visited = view.visitTripId ? visitedStops.visited(view.visitTripId, view.state.userId) : null;
  const keys = now ? stopKeys(now) : [];
  const alert = view.canEdit() && view.currentItinerary === source && view.activeDayIndex === dayIndex && now
    ? rainAlert(now.scheduleItems || [], weather, { skip: index => Boolean(visited?.has(keys[index])) }) : null;
  const timeline = view.shadowRoot.getElementById('timeline-container');
  clear();
  if (!alert || !timeline) return;
  const banner = document.createElement('p');
  Object.assign(banner, { id: 'rain-banner', className: 'rain-banner', source, dayIndex });
  banner.setAttribute('role', 'status');
  const text = document.createElement('span');
  const range = new Intl.DateTimeFormat(getLang() === 'ko' ? 'ko-KR' : 'en-US', { hour: 'numeric', timeZone: 'UTC' })
    .formatRange(hourAt(alert.from), hourAt(alert.to));
  text.textContent = t('rainBannerText').replace('{0}', range);
  const action = document.createElement('button');
  action.type = 'button';
  action.textContent = t('rainBannerAction');
  action.addEventListener('click', () => {
    const card = timeline.querySelectorAll('.timeline-item .schedule-card')[alert.index];
    if (!card) return;
    card.scrollIntoView({ block: 'center' });
    view.openReplacement(card, alert.index, true);
  });
  banner.append(text, action);
  timeline.before(banner);
}
