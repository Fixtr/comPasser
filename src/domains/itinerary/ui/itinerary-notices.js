import { t, getLang } from '../../../utils/i18n.js';
import { escapeHtml } from '../../../utils/html-safety.mjs';
import { icons } from '../../../ui/icons.js';
import { summarizeCosts, formatCostSummary } from '../services/itinerary-cost.mjs';
import { applyTransitDelays } from '../services/itinerary-schedule-adjust.mjs';
import { hasFixedArrivalConflict, hasUnavoidableFixedArrivalConflict } from '../services/itinerary-end-fit.mjs';
import { getEndTimeWarning, getTransitCoverage, getBoundaryRouteWarning } from '../services/itinerary-view-model.mjs';

/**
 * 현재 보고 있는 날짜 기준으로 종료 시각 초과 여부를 다시 계산해 경고를
 * 갱신한다. 이동시간 보정 직후뿐 아니라 날짜 탭을 바꿀 때도 불러야 한다 —
 * 그러지 않으면 1일차에서 뜬 경고가 2일차 화면에 그대로 남는다.
 *
 * 종료 시각은 generateOptimizedItinerary()가 반환한 { request, days } 형태에
 * 그대로 남아있어, 저장된 일정을 불러온 경우에도 읽을 수 있다.
 */
export function refreshEndTimeWarning(view) {
  // currentItinerary 에는 이미 이동시간 보정이 반영돼 있다. enforcePlannerConstraints
  // 를 다시 돌리면 초과분이 정규화돼 사라지므로, 현재 상태만
  // 보고 판단하는 getEndTimeWarning 을 쓴다.
  const { overflowMinutes, endTime } = getEndTimeWarning(view.currentItinerary, view.activeDayIndex, view.lastTransitRoutes);
  view.renderEndTimeWarning(overflowMinutes, endTime);
  const boundary = getBoundaryRouteWarning(view.normalizeData(view.currentItinerary)?.days?.[view.activeDayIndex]?.scheduleItems, view.lastTransitRoutes);
  const boundaryWarning = view.shadowRoot.getElementById('boundary-route-warning');
  if (boundaryWarning) { boundaryWarning.hidden = !boundary; if (boundary) boundaryWarning.textContent = t(boundary === 'start' ? 'boundaryRouteStart' : 'boundaryRouteEnd'); }
  view.updateAnchorWarning(applyTransitDelays(
    view.normalizeData(view.currentItinerary)?.days?.[view.activeDayIndex]?.scheduleItems,
    view.lastTransitRoutes), view.lastTransitRoutes);
}

export function updateAnchorWarning(view, items, routes) {
  const warning = view.shadowRoot.getElementById('anchor-time-warning');
  if (!warning) return;
  warning.hidden = !hasFixedArrivalConflict(items, routes);
  warning.textContent = t(hasUnavoidableFixedArrivalConflict(items, routes)
    ? 'anchorFixedConflict' : 'anchorTransitConflict');
}

/**
 * 지금 보고 있는 날짜의 1인 예상 비용을 합산해 보여준다.
 *
 * estimatedCost 는 자유 문자열이라 일부는 금액을 읽어낼 수 없다. 합계만
 * 보여주면 실제보다 적은 금액을 확정된 것처럼 알리게 되므로, 못 읽은
 * 항목 수를 함께 표시한다.
 */
export function refreshCostSummary(view) {
  const box = view.shadowRoot.getElementById('cost-summary');
  if (!box) return;

  const plan = view.normalizeData(view.currentItinerary);
  const items = plan?.days?.[view.activeDayIndex]?.scheduleItems;
  const text = formatCostSummary(summarizeCosts(items), getLang());

  if (!text) {
    box.style.display = 'none';
    box.textContent = '';
    return;
  }
  box.innerHTML = `${icons.cost}<span>${escapeHtml(text)}</span>`;
  box.style.display = 'flex';
}

/**
 * 표시된 시각이 실제 이동시간으로 검증된 것인지 안내한다.
 *
 * 지도가 실패하면 예전에는 아무 표시 없이 AI 추정 시각만 남아, 사용자는
 * 그 시각이 검증된 줄 알았다. 검증되지 않았다는 사실 자체를 알려준다.
 */
export function refreshTransitNotice(view) {
  const box = view.shadowRoot.getElementById('transit-notice');
  if (!box) return;

  const plan = view.normalizeData(view.currentItinerary);
  const items = plan?.days?.[view.activeDayIndex]?.scheduleItems;
  if (!Array.isArray(items) || items.length === 0) {
    box.style.display = 'none';
    return;
  }

  const { expected, resolved, status } = getTransitCoverage(
    items, view.lastTransitRoutes, view.transitUnavailable
  );

  if (status === 'verified') {
    box.style.display = 'none';
    box.textContent = '';
    return;
  }

  const noticeText = status === 'none'
    ? '실제 대중교통 소요시간을 확인하지 못했습니다. 아래 시각은 AI 추정치이며 실제와 다를 수 있습니다.'
    : `전체 ${expected}개 구간 중 ${resolved}개만 실제 소요시간이 확인됐습니다. 나머지 구간의 시각은 AI 추정치입니다.`;
  box.innerHTML = `${icons.info}<span></span>`;
  box.querySelector('span').textContent = noticeText;
  // 인라인 display 가 CSS 를 이기므로 여기서 flex 로 켠다(아이콘 정렬·간격).
  box.style.display = 'flex';
}

/**
 * 실제 이동시간을 반영한 결과 도착이 사용자가 지정한 종료 시각을 넘겼을 때
 * 띄우는 경고. 시각 자체는 사실대로 두고, 얼마나 초과했는지만 알려서
 * 사용자가 직접 일정을 조정할 수 있게 한다.
 */
export function renderEndTimeWarning(view, overflowMinutes, dayEndTime) {
  const box = view.shadowRoot.getElementById('end-time-warning');
  if (!box) return;

  if (!overflowMinutes || overflowMinutes <= 0) {
    box.style.display = 'none';
    box.textContent = '';
    return;
  }

  const hours = Math.floor(overflowMinutes / 60);
  const mins = overflowMinutes % 60;
  const amount = hours > 0
    ? (mins > 0
        ? t('durationHoursMinutes').replace('{0}', hours).replace('{1}', mins)
        : t('durationHours').replace('{0}', hours))
    : t('durationMinutes').replace('{0}', mins);

  // 경고만 띄우면 사용자가 직접 폼으로 돌아가 다시 만들어야 한다.
  // 그 자리에서 해결할 수 있는 버튼을 함께 준다.
  box.innerHTML = '';
  const text = document.createElement('span');
  text.innerHTML = icons.warn;
  text.appendChild(document.createTextNode(' ' + t('endTimeOverflowWarning')
    .replace('{0}', dayEndTime)
    .replace('{1}', amount)));
  box.appendChild(text);

  if (view.canEdit()) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'end-time-fix-btn';
    action.dataset.i18n = 'trimScheduleBtn';
    action.textContent = t('trimScheduleBtn');
    action.addEventListener('click', () => view.trimActiveDayToEndTime());
    box.appendChild(action);
  }

  box.style.display = 'block';
}
