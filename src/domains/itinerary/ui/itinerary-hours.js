import { assessVisitHours, hoursPlaceId, lookupPlaceHours } from '../services/itinerary-hours.mjs';
import { t } from '../../../utils/i18n.js';

export function refreshHours(view) {
  const version = view._hoursVersion = (view._hoursVersion || 0) + 1;
  const source = view.currentItinerary, dayIndex = view.activeDayIndex;
  const day = view.normalizeData(source)?.days?.[dayIndex];
  const nodes = view.shadowRoot.querySelectorAll('.visit-hours');
  day?.scheduleItems?.forEach((item, index) => {
    const node = nodes[index];
    if (!node || ['departure', 'arrival'].includes(item.type)) return;
    const resolved = view.lastResolvedPlaces?.find(result => result.index === index);
    const id = hoursPlaceId({ ...item, resolvedPlace: resolved?.resolvedPlace || item.resolvedPlace });
    node.textContent = t(id ? 'hoursLoading' : 'hoursUnknown');
    node.dataset.status = 'unknown';
    if (!id) return;
    lookupPlaceHours(id).then(data => {
      if (!node.isConnected || view._hoursVersion !== version || view.currentItinerary !== source
        || view.activeDayIndex !== dayIndex) return;
      const status = assessVisitHours(item, day.date, data);
      node.dataset.status = status;
      node.textContent = t({unknown:'hoursUnknown', closed:'hoursClosed', conflict:'hoursConflict', current:'hoursCurrent', regular:'hoursRegular'}[status]);
    });
  });
}
