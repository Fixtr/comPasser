import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { t, getLang } from '../../../utils/i18n.js';
import { removeScheduleItem, moveScheduleItem, insertScheduleItem, replaceSchedulePlace } from '../services/itinerary-edit.mjs';
import { openPlaceReplacement } from './place-replacement.js';
import { openIndoorAlternatives } from './indoor-alternatives.js';
import { findIndoorAlternatives } from '../services/indoor-alternatives.mjs';
import { suggestRouteOrder } from '../services/itinerary-route-order.mjs';
import { createFlexibleVisitChecks } from '../../planner/services/flexible-visit-checks.js';
import { showConfirm } from '../../../utils/confirm-dialog.js';
import { trimScheduleToEndTime } from '../services/itinerary-schedule-adjust.mjs';
import { getEndTimeWarning, getDayConstraints } from '../services/itinerary-view-model.mjs';
import { showToast as showGlobalToast } from '../../../utils/toast.js';

/**
 * "여기에 장소 추가" 자리를 만든다. 누르면 그 자리에서 입력 폼으로 바뀐다.
 */
export function buildInsertSlot(view, insertAt) {
  const slot = document.createElement('div');
  slot.className = 'insert-slot';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'insert-slot-btn';
  btn.textContent = t('addStopHere') || '+ 여기에 장소 추가';
  btn.setAttribute('aria-label', t('addStopHere') || '여기에 장소 추가');
  btn.addEventListener('click', () => view.openInsertForm(slot, insertAt));

  slot.appendChild(btn);
  return slot;
}

export function openReplacement(view, card, index, indoor = false) {
  if (!view.canEdit() || card.querySelector('.place-replacement') || (indoor && card.hasAttribute('data-visited'))) return;
  const userId = getCurrentUser()?.uid;
  const pathname = window.location.pathname;
  const entry = view.state.current;
  const day = view.activeDayIndex;
  const plan = view.currentItinerary;
  const dayData = view.normalizeData(plan)?.days?.[day];
  const items = dayData?.scheduleItems;
  const item = items?.[index];
  if (!item || ['departure', 'arrival', 'AnchorSchedule'].includes(item.type)) return;
  const isCurrent = () => {
    if (!view.canEdit() || getCurrentUser()?.uid !== userId || window.location.pathname !== pathname ||
        view.state.current !== entry || view.activeDayIndex !== day) return false;
    const currentItems = view.normalizeData(view.currentItinerary)?.days?.[day]?.scheduleItems;
    return indoor ? currentItems === items && !card.hasAttribute('data-visited') : currentItems?.[index] === item;
  };
  const onSelect = place => {
    if (!isCurrent()) return;
    const currentItems = view.normalizeData(view.currentItinerary).days[day].scheduleItems;
    const result = replaceSchedulePlace(currentItems, index, place);
    if (!result.replaced) return;
    view.state.editDayItems(day, result.items);
    view.requestMapRoute();
    view.refreshAccessControls();
    showGlobalToast(t('replacePlaceDone'), { tone: 'success' });
  };
  if (indoor) {
    const resolvedPlaces = view.lastResolvedPlaces, routes = view.lastTransitRoutes;
    const endTime = getDayConstraints(plan, day)?.endTime;
    return openIndoorAlternatives(card, { isCurrent, onSelect, search: stillCurrent =>
      findIndoorAlternatives(items, index, { date: dayData.date, endTime, resolvedPlaces, routes,
        language: getLang(), checks: createFlexibleVisitChecks(3, plan.request || plan.metadata?.request),
        isCurrent: stillCurrent }) });
  }
  return openPlaceReplacement(card, { isCurrent, onSelect });
}

/**
 * 삽입 자리에 교체와 같은 장소 검색을 연다. 이름만 적어서는 넣을 수 없다 —
 * 지도가 이름으로 장소와 이동시간을 짐작하게 되기 때문이다.
 */
export function openInsertForm(view, slot, insertAt) {
  if (!view.canEdit()) return;
  if (slot.dataset.editing === 'true') return;
  slot.dataset.editing = 'true';
  const button = slot.querySelector('.insert-slot-btn');
  if (button) button.hidden = true;

  const stay = document.createElement('label');
  stay.className = 'insert-stay';
  stay.innerHTML = `
    <span>${t('addStopStay')}</span>
    <select class="insert-stay-select" aria-label="${t('addStopStay')}">
      <option value="30" data-i18n="stay30m">${t('stay30m')}</option>
      <option value="60" selected data-i18n="stay1h">${t('stay1h')}</option>
      <option value="90" data-i18n="stay1h30m">${t('stay1h30m')}</option>
      <option value="120" data-i18n="stay2h">${t('stay2h')}</option>
    </select>`;

  const entry = view.state.current;
  const day = view.activeDayIndex;
  const items = view.normalizeData(view.currentItinerary)?.days?.[day]?.scheduleItems;
  const isCurrent = () => view.canEdit() && view.state.current === entry && view.activeDayIndex === day &&
    view.normalizeData(view.currentItinerary)?.days?.[day]?.scheduleItems === items;
  const restore = () => {
    slot.dataset.editing = 'false';
    if (button) { button.hidden = false; button.focus(); }
  };
  const opened = openPlaceReplacement(slot, {
    isCurrent,
    labels: { search: 'addStopPlaceholder', confirm: 'addStopConfirm', select: 'addStopSelect' },
    extra: stay,
    onCancel: restore,
    onSelect: place => {
      if (!isCurrent()) return;
      view.insertPlaceAt(insertAt, { selectedPlace: place, stayMinutes: Number(stay.querySelector('select').value) || 60 });
    },
  });
  // The add button just hid itself; keep keyboard focus in the panel it opened.
  stay.querySelector('select').focus();
  return opened;
}

/**
 * 사용자가 고른 자리에 장소를 넣고 화면·지도를 다시 그린다.
 */
export function insertPlaceAt(view, insertAt, place) {
  if (!view.canEdit()) return;
  const plan = view.normalizeData(view.currentItinerary);
  const dayData = plan?.days?.[view.activeDayIndex];
  if (!dayData || !Array.isArray(dayData.scheduleItems)) return;

  const { items, inserted } = insertScheduleItem(dayData.scheduleItems, insertAt, place);
  if (!inserted) {
    showGlobalToast(t('addStopFailed') || '이 위치에는 장소를 추가할 수 없습니다.', { tone: 'warning' });
    return;
  }

  view.state.editDayItems(view.activeDayIndex, items);
  view.requestMapRoute();
  view.refreshAccessControls();
  showGlobalToast(t('addStopDone').replace('{0}', inserted.title), { tone: 'success' });

}

/**
 * 타임라인 항목을 옮기거나 뺀다.
 *
 * 계산은 itinerary-edit.mjs 가 하고 여기서는 결과를 반영해 다시 그린다.
 * 편집 결과는 currentItinerary 에 남으므로 이어서 저장/공유해도 그대로다.
 * 삭제는 되돌릴 수 없으니 확인을 받는다.
 */
export async function improveRouteOrder(view) {
  if (!view.canEdit()) return;
  const source=view.currentItinerary, day=view.activeDayIndex, request=view._mapRequest;
  const items=view.normalizeData(source)?.days?.[day]?.scheduleItems;
  const snapshot=JSON.stringify(items);
  const proposal=suggestRouteOrder(items,view.lastResolvedPlaces);
  if (!proposal.changed) {
    showGlobalToast(t('routeOrderUnavailable'), {tone:'warning'});return;
  }
  const distance = value => (value/1000).toFixed(1);
  const ok=await showConfirm({title:t('routeOrderBtn'),destructive:false,
    confirmText:t('routeOrderApply'),cancelText:t('cancelBtn'),
    message:t('routeOrderPreview').replace('{0}',distance(proposal.beforeMeters))
      .replace('{1}',distance(proposal.afterMeters))
      + ' ' + proposal.items.map(item=>item.title).join(' → ')});
  if (!ok || !view.canEdit() || view.currentItinerary!==source || view.activeDayIndex!==day
    || view._mapRequest!==request || JSON.stringify(view.normalizeData(source)?.days?.[day]?.scheduleItems)!==snapshot) return;
  view.state.editDayItems(day,proposal.items);
  view.requestMapRoute();
  view.refreshAccessControls();
  showGlobalToast(t('routeOrderApplied'),{tone:'success'});
}

export async function handleItemEdit(view, action, index) {
  if (!view.canEdit()) return;
  const source = view.currentItinerary;
  const dayIndex = view.activeDayIndex;
  const request = view._mapRequest;
  const plan = view.normalizeData(view.currentItinerary);
  const dayData = plan?.days?.[view.activeDayIndex];
  if (!dayData || !Array.isArray(dayData.scheduleItems)) return;

  if (action === 'remove') {
    const target = dayData.scheduleItems[index];
    const ok = await showConfirm({
      title: t('flowRemoveTitle'),
      message: t('flowRemoveConfirm').replace('{0}',target?.title || ''),
      confirmText: t('flowRemoveTitle')
    });
    if (!ok || !view.canEdit() || source !== view.currentItinerary
      || dayIndex !== view.activeDayIndex || request !== view._mapRequest) return;

    const { items, removed } = removeScheduleItem(dayData.scheduleItems, index);
    if (!removed) return;
    view.state.editDayItems(view.activeDayIndex, items, {undo:true});
    showGlobalToast(t('flowRemoved').replace('{0}',removed.title), { tone: 'success' });
  } else {
    const { items, moved } = moveScheduleItem(dayData.scheduleItems, index, action === 'up' ? -1 : 1);
    if (!moved) {
      showGlobalToast(t('moveItemBlocked'), { tone: 'warning' });
      return;
    }
    view.state.editDayItems(view.activeDayIndex, items);
  }

  view.requestMapRoute();
  view.refreshAccessControls();
}

/**
 * 종료 시각을 넘긴 일정을 실제로 줄여서 맞춘다.
 *
 * 표시 시각을 눌러 속이는 게 아니라 체류 시간을 깎거나 항목을 빼는 것이라,
 * 줄인 뒤에도 화면의 시각은 계속 사실이다. 무엇을 줄였는지 토스트로 알린다.
 */
export function trimActiveDayToEndTime(view) {
  if (!view.canEdit()) return;
  const plan = view.normalizeData(view.currentItinerary);
  const dayData = plan?.days?.[view.activeDayIndex];
  if (!dayData || !Array.isArray(dayData.scheduleItems)) return;

  const { endTime } = getEndTimeWarning(view.currentItinerary, view.activeDayIndex);
  if (!endTime) return;

  const { items, removedTitles, shortenedCount, resolved } =
    trimScheduleToEndTime(dayData.scheduleItems, endTime);

  if (removedTitles.length === 0 && shortenedCount === 0) {
    showGlobalToast(t('trimNothingToDo') || '더 줄일 수 있는 일정이 없습니다.', { tone: 'warning' });
    return;
  }

  view.state.editDayItems(view.activeDayIndex, items);
  view.requestMapRoute();
  view.refreshAccessControls();

  const parts = [];
  if (shortenedCount > 0) parts.push(`${shortenedCount}곳 체류 시간 단축`);
  if (removedTitles.length > 0) parts.push(`${removedTitles.length}곳 제외(${removedTitles.join(', ')})`);
  const summary = parts.join(' · ');

  showGlobalToast(
    resolved ? `일정을 종료 시각에 맞췄습니다 — ${summary}` : `${summary} — 그래도 종료 시각을 넘습니다`,
    { tone: resolved ? 'success' : 'warning', duration: 5000 }
  );
}
