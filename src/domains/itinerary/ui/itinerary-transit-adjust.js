import { t } from '../../../utils/i18n.js';
import { escapeHtml } from '../../../utils/html-safety.mjs';
import { refreshHours } from './itinerary-hours.js';
import { refreshRainBanner } from './rain-banner.js';
import { refreshDepartureCard } from './departure-card.js';
import { hoursPlaceId, lookupPlaceHours } from '../services/itinerary-hours.mjs';
import { suggestRouteOrder, improveMeasuredRouteOrder } from '../services/itinerary-route-order.mjs';
import { createFlexibleVisitChecks } from '../../planner/services/flexible-visit-checks.js';
import { applyTransitDelays } from '../services/itinerary-schedule-adjust.mjs';
import { fitMeasuredSchedule, hasFixedArrivalConflict } from '../services/itinerary-end-fit.mjs';
import { getEndTimeWarning, getDayConstraints } from '../services/itinerary-view-model.mjs';
import { showToast as showGlobalToast } from '../../../utils/toast.js';

export function verifyRouteImprovement(view, routes) {
  const original = view._routeOrderOriginal;
  if (!original) return false;
  view._routeOrderOriginal = null;
  const known = routes.filter(route => Number.isInteger(route.fromIndex) && route.fromIndex >= 0 &&
    route.fromIndex < original.items.length - 1 && (route.toIndex ?? route.fromIndex + 1) === route.fromIndex + 1 &&
    Number.isFinite(route.durationMinutes) && route.durationMinutes >= 0);
  const items = view.normalizeData(view.currentItinerary)?.days?.[view.activeDayIndex]?.scheduleItems;
  if (known.length === original.items.length - 1 &&
      new Set(known.map(route => route.fromIndex)).size === original.items.length - 1 &&
      !hasFixedArrivalConflict(items, known) &&
      getEndTimeWarning(view.currentItinerary, view.activeDayIndex, known).overflowMinutes === 0 &&
      original.beforeMinutes - known.reduce((sum, route) => sum + route.durationMinutes, 0) >= 2) return false;
  // Changed departure times can change timetables. Roll back an unconfirmed saving once.
  view.state.replaceDayItems(view.activeDayIndex, original.items);
  view.requestMapRoute({automaticFit:true});
  return true;
}

function activeScheduleHours(view, items) {
  if (view._measuredHours?.context === view._mapRequest) return view._measuredHours.hours;
  return items.map((item, index) => lookupPlaceHours.cached(hoursPlaceId({ ...item,
    resolvedPlace: view.lastResolvedPlaces.find(place => place.index === index)?.resolvedPlace || item.resolvedPlace })));
}

export function startRouteImprovement(view, routes) {
  if (view._routeOrderChecked || view.state.current?.source.kind !== 'draft' || !view._allowTimeAdjustment) return false;
  view._routeOrderChecked = true;
  const source = view.currentItinerary, dayIndex = view.activeDayIndex, context = view._mapRequest;
  const day = view.normalizeData(source)?.days?.[dayIndex];
  const items = day?.scheduleItems;
  if (!items?.some(item => (item.placeIntent && item.addedByUser !== true) ||
      (item.type === 'AnchorSchedule' && item.flexible === true)) ||
      !suggestRouteOrder(items, view.lastResolvedPlaces, { automatic:true }).changed) return false;
  const constraints = getDayConstraints(source, dayIndex);
  const checks = createFlexibleVisitChecks(items.length - 1, view.currentItinerary?.request);
  improveMeasuredRouteOrder(items, view.lastResolvedPlaces, routes, {
    ...constraints, date:day.date, travelMinutes:checks.travelMinutes,
    hoursByIndex:activeScheduleHours(view, items)
  }).then(result => {
    if (!view.isCurrentMapResult({context}) || source !== view.currentItinerary ||
        items !== view.normalizeData(view.currentItinerary)?.days?.[dayIndex]?.scheduleItems) return;
    if (result.changed) {
      view._routeOrderOriginal = { items, beforeMinutes: result.beforeMinutes };
      view.state.replaceDayItems(dayIndex, result.items);
      view.requestMapRoute({automaticFit:true});
    } else {
      if (view.applyTransitDelaysToActiveDay(routes)) return;
      view.renderTransitInfo(routes);
    }
  }).catch(() => {
    if (view.isCurrentMapResult({context}) && source === view.currentItinerary) {
      if (view.applyTransitDelaysToActiveDay(routes)) return;
      view.renderTransitInfo(routes);
    }
  });
  return true;
}

/**
 * 실제 이동시간(transitRoutes)을 반영해 현재 보고 있는 날짜의
 * scheduleItems 시각을 보정하고, 이미 그려진 타임라인의 시간 배지만
 * 갱신한다(전체 재렌더 대신 — renderActiveDay는 페이드 애니메이션 때문에
 * DOM 반영이 150ms 지연되어 뒤이은 renderTransitInfo와 타이밍이 꼬인다).
 * currentItinerary 자체를 갱신하므로, 이후 "저장하기"를 눌러도 보정된
 * 시각이 저장된다.
 */
export function applyTransitDelaysToActiveDay(view, transitRoutes) {
  if (!view.currentItinerary) return;

  const plan = view.normalizeData(view.currentItinerary);
  const dayData = plan?.days?.[view.activeDayIndex];
  if (!dayData?.scheduleItems?.length) return;
  const { endTime } = getEndTimeWarning(view.currentItinerary, view.activeDayIndex);
  // Saved/shared documents are snapshots. Reading them may refresh route
  // evidence and warnings, but cannot silently reschedule their contents.
  if (!view.canEdit() || !view._allowTimeAdjustment) {
    view.refreshEndTimeWarning();
    view.refreshTransitNotice();
    view.refreshCostSummary();
    return false;
  }
  // Apply only the requested departure time, not full planner reconciliation.
  const startTime = getDayConstraints(view.currentItinerary, view.activeDayIndex)?.startTime;
  // ponytail: four rechecks cap Maps cost; raise only if measured plans still need more removals.
  const fit = view.canEdit() && (view._automaticFitCount || 0) < 4
    ? fitMeasuredSchedule(dayData.scheduleItems, transitRoutes, endTime, startTime, {
      compact: dayData.scheduleItems.some(item => item.placeIntent && item.addedByUser !== true),
      date: dayData.date,
      hoursByIndex: activeScheduleHours(view, dayData.scheduleItems)
    })
    : { items: applyTransitDelays(dayData.scheduleItems, transitRoutes, startTime), adjusted: false };
  const scheduleItems = fit.items;
  const removed = scheduleItems.length < dayData.scheduleItems.length;
  view.state.replaceDayItems(view.activeDayIndex, scheduleItems, { undo: removed });
  view.refreshAccessControls();

  view.updateAnchorWarning(scheduleItems, transitRoutes);

  if (fit.adjusted) {
    view._automaticFitCount = (view._automaticFitCount || 0) + 1;
    showGlobalToast(t(removed ? 'endTimeVisitRemoved' : 'endTimeAutoFit'), { tone: 'info', duration: 5000 });
    // That notice names the undo button, so read mode keeps it for this day while the undo is offered.
    const undo = removed && view.shadowRoot.getElementById('undo-deletion-btn');
    if (undo) undo.dataset.pointed = view.activeDayIndex;
    // Earlier departure can change the available bus/train: verify again,
    // with a hard retry bound rather than recursively generating requests.
    view.requestMapRoute({ automaticFit: true });
    return true;
  }

  view.refreshEndTimeWarning();
  view.refreshTransitNotice();
  view.refreshCostSummary();

  const badges = view.shadowRoot.querySelectorAll('#timeline-container .time-badge');
  scheduleItems.forEach((item, idx) => {
    const badge = badges[idx];
    if (!badge) return;
    badge.innerHTML = item.endTime ? `${escapeHtml(item.time)} -<br>${escapeHtml(item.endTime)}` : escapeHtml(item.time);
  });
  view.updateNextStop({ ...dayData, scheduleItems });
  refreshHours(view);
  refreshRainBanner(view);
  refreshDepartureCard(view);
}
