import { t, getLang } from '../../../utils/i18n.js';
import { localTravelDate, dateRange, travelRegion } from '../../../../functions/travel-region.mjs';
import { normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';
import { isOutdoorStop, rainAlert } from '../services/rain-alert.mjs';
import { fetchTripWeather } from '../services/trip-weather-api.js';

const hourAt = hour => new Date(Date.UTC(2000, 0, 1, hour));

// Shown only to the signed-in owner, online, for a trip day that is today or tomorrow at the destination.
export async function refreshRainBanner(view, skip) {
  const version = view._rainVersion = (view._rainVersion || 0) + 1;
  view.shadowRoot.getElementById('rain-banner')?.remove();
  const source = view.currentItinerary, dayIndex = view.activeDayIndex;
  const request = source?.request || source?.metadata?.request;
  const day = view.normalizeData(source)?.days?.[dayIndex];
  if (!view.canEdit() || navigator.onLine === false || !day || !request?.destination?.id) return;
  const date = String(day.date).slice(0, 10);
  if (!dateRange(localTravelDate(new Date(), travelRegion(request).timeZone), 2).includes(date)) return;
  const items = day.scheduleItems || [];
  const point = items.map((item, index) => isOutdoorStop(item) && (normalizeSelectedPlace(item.selectedPlace)
    || normalizeSelectedPlace(item.verifiedPlace)
    || normalizeSelectedPlace(view.lastResolvedPlaces?.find(place => place.index === index)?.resolvedPlace)
    || normalizeSelectedPlace(item.resolvedPlace))).find(Boolean);
  if (!point) return;
  let weather;
  try {
    weather = await fetchTripWeather({ country: request.destination.country, cityId: request.destination.id, date, lat: point.lat, lng: point.lng });
  } catch { return; }
  if (version !== view._rainVersion || view.currentItinerary !== source || view.activeDayIndex !== dayIndex || !view.canEdit()) return;
  const alert = rainAlert(items, weather, { skip });
  const timeline = view.shadowRoot.getElementById('timeline-container');
  if (!alert || !timeline) return;
  const banner = document.createElement('p');
  banner.id = 'rain-banner';
  banner.className = 'rain-banner';
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
