import { t, getLang } from '../../../utils/i18n.js';
import { localTravelDate, travelRegion } from '../../../../functions/travel-region.mjs';
import { localizeBoundaryItem } from '../../planner/services/planner-constraints.mjs';
import { departureAdvice } from '../services/departure-advice.mjs';
import { minutesOf } from '../services/itinerary-schedule-adjust.mjs';
import { visitedStops } from '../services/visited-stops.mjs';
import { transitDurationText } from './itinerary-render-helpers.js';
import { refreshReplanButton } from './itinerary-replan.js';

// The advice follows the clock: run on each minute a card is up and when the screen comes back.
export function tickDepartureCard(view) {
  refreshReplanButton(view);
  refreshDepartureCard(view);
}

// Read-only: shown to the owner on the trip day, from the legs the map already measured (no route request).
// Call it wherever the day, its measured legs, its visited marks or the replan button change.
export function refreshDepartureCard(view) {
  const card = view.shadowRoot.getElementById('departure-card');
  if (!card) return;
  card.hidden = true;
  clearTimeout(view._departureTimer);
  const plan = view.currentItinerary;
  const day = view.canEdit() && view.normalizeData(plan)?.days?.[view.activeDayIndex];
  if (!day) return;
  const now = new Date();
  const { timeZone } = travelRegion(plan.request || plan.metadata?.request);
  const isToday = String(day.date).slice(0, 10) === localTravelDate(now, timeZone);
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const advice = departureAdvice(day.scheduleItems, view.lastTransitRoutes, isToday ? minutesOf(clock) : null,
    { visited: view.visitTripId ? visitedStops.visited(view.visitTripId, view.state.userId) : null });
  if (advice.state === 'hidden') return;
  const fill = (key, ...values) => t(key).replace(/\{(\d)\}/g, (_, n) => values[n]);
  const named = item => `${item.time} ${localizeBoundaryItem(item, getLang()).title}`;
  const { reservation, from, route } = advice;
  const origin = from && localizeBoundaryItem(from, getLang()).title;
  const travel = transitDurationText(route);
  const replan = view.shadowRoot.getElementById('replan-trip-btn');
  const [label, main, detail] = {
    ok: () => [named(reservation), fill('departLeaveAt', advice.leaveTime),
      [travel && origin ? fill('departFrom', origin, travel) : origin || travel, fill('departEarly', advice.buffer)].filter(Boolean).join(' · ')],
    go: () => [named(reservation), t('departNow'), fill('departSpare', advice.spare)],
    late: () => [named(reservation), fill('departLate', reservation.time), replan && !replan.hidden ? fill('departLateHint', t('replanBtn')) : ''],
    unknown: () => [named(reservation), t('departUnknown'), ''],
    next: () => [t('departNextVisit'), named(advice.stop), ''],
  }[advice.state]();
  card.dataset.state = advice.state;
  [label, main, detail].forEach((text, index) => { card.children[index].textContent = text; });
  card.hidden = false;
  view._departureTimer = setTimeout(() => tickDepartureCard(view), 60000);
}
