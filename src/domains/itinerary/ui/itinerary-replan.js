import { t } from '../../../utils/i18n.js';
import { showConfirm } from '../../../utils/confirm-dialog.js';
import { showToast } from '../../../utils/toast.js';
import { travelRegion } from '../../../../functions/travel-region.mjs';
import { createFlexibleVisitChecks } from '../../planner/services/flexible-visit-checks.js';
import { normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';
import { hoursPlaceId } from '../services/itinerary-hours.mjs';
import { replanDeparture, replanOrigin, replanRemaining } from '../services/itinerary-replan.mjs';
import { getDayConstraints } from '../services/itinerary-view-model.mjs';
import { visitedStops, stopKeys } from '../services/visited-stops.mjs';

function replanContext(view) {
  if (view.state.current?.source.kind !== 'private' || !view.canEdit()) return null;
  const plan = view.currentItinerary;
  const dayIndex = view.activeDayIndex;
  const day = view.normalizeData(plan)?.days?.[dayIndex];
  const request = plan?.request || plan?.metadata?.request;
  const departure = replanDeparture(day, travelRegion(request).timeZone, new Date());
  if (!departure) return null;
  const visited = visitedStops.visited(view.visitTripId, view.state.userId);
  const origin = replanOrigin(day, visited);
  if (origin < 0 || origin >= day.scheduleItems.length - 1) return null;
  return { day, dayIndex, request, origin, visited, ...departure };
}

export function refreshReplanButton(view) {
  const button = view.shadowRoot.getElementById('replan-trip-btn');
  if (button) button.hidden = !replanContext(view);
}

export async function showItineraryReplan(view, button) {
  const context = replanContext(view);
  if (!context || view._replan) return;
  const { day, dayIndex, request, origin, departure, time, visited } = context;
  const { scheduleItems: items } = day;
  const marks = stopKeys(day);
  const sameVisits = () => {
    const current = visitedStops.visited(view.visitTripId, view.state.userId);
    return marks.every(key => current.has(key) === visited.has(key));
  };
  const controller = new AbortController();
  view._replan = controller;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  const revision = view.state.revision;
  const current = () => !controller.signal.aborted && revision === view.state.revision && view.canEdit() && sameVisits();
  try {
    const checks = createFlexibleVisitChecks(items.length - origin, request);
    const resolved = new Map(view.lastResolvedPlaces.map(place => [place.index, place]));
    const locations = items.map((item, index) =>
      normalizeSelectedPlace(item.selectedPlace || item.verifiedPlace || resolved.get(index)?.resolvedPlace) ||
      (!item.stayUnsetLabel && resolved.get(index)?.coordinates) || null);
    const hours = await Promise.all(items.map((item, index) => index <= origin || ['departure', 'arrival'].includes(item.type)
      ? null : checks.getHours(hoursPlaceId({ ...item, resolvedPlace: resolved.get(index)?.resolvedPlace }))));
    const result = await replanRemaining({
      day, origin, startTime: time, endTime: getDayConstraints(view.currentItinerary, dayIndex)?.endTime,
      locations, hours, travelMinutes: checks.travelMinutes, isCurrent: current
    });
    if (!current()) return;
    if (result.status !== 'ready') {
      showToast(t({ conflict: 'replanConflict', unchanged: 'replanUnchanged' }[result.status] || 'replanUnavailable'), { tone: 'info' });
      return;
    }
    const detail = result.items.slice(origin + 1).map(item => `${item.time} ${item.title}`).join(' · ');
    const skip = result.skipped ? t('replanSkipped').replace('{0}', () => result.skipped.title) : '';
    const ok = await showConfirm({
      title: t('replanBtn'),
      message: [t('replanFrom').replace(/\{([01])\}/g, (_, key) => key === '0' ? items[origin].title : time), detail, skip].filter(Boolean).join(' · '),
      confirmText: t('routeOrderApply'),
      cancelText: t('cancelBtn'),
      destructive: false,
      signal: controller.signal,
    });
    if (!ok || !current()) return;
    if (Date.now() > departure.getTime()) {
      showToast(t('replanExpired'), { tone: 'info' });
      return;
    }
    view.state.editDayItems(dayIndex, result.items, { undo: true });
    view.state.markDayRecalculated(dayIndex);
    view.requestMapRoute();
    view.refreshAccessControls();
    showToast(t('replanApplied'), { tone: 'success' });
  } catch {
    if (current()) showToast(t('replanUnavailable'), { tone: 'warning' });
  } finally {
    if (view._replan === controller) view._replan = null;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}
