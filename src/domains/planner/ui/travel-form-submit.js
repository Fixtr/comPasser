import { findFixedVisitIssue } from '../services/planner-preflight.mjs';
import { travelRegion, localTravelDate } from '../../../../functions/travel-region.mjs';
import { stayIssue } from '../services/trip-stays.mjs';
import { normalizeSelectedPlace } from '../services/selected-place.mjs';
import { t } from '../../../utils/i18n.js';
import { trackEvent } from '../../../utils/analytics.js';
import { getAutocompleteValue } from './travel-form-data.js';
import { plannerDraftStore } from '../services/planner-draft.mjs';
import { showErrorToast } from '../../../utils/toast.js';
import { findIncompleteAnchor, isAnchorBlank } from '../services/anchor-validation.mjs';
import { findMissingLocation } from '../services/location-validation.mjs';
import { getLocationName } from '../services/planner-constraints.mjs';
import { findPlannerInputIssue, plannerValidationMessage } from '../services/planner-validation.js';
import { scheduleFlexibleVisits } from '../services/schedule-flexible-visits.mjs';
import { createFlexibleVisitChecks } from '../services/flexible-visit-checks.js';

/** 고정 일정의 필수 칸 이름 → 그 칸을 찾는 선택자. */
export const ANCHOR_FIELD_SELECTOR = {
  name: '.anchor-name',
  time: '.anchor-time',
  endTime: '.anchor-end-time',
  location: '.anchor-location'
};

/**
 * 사용자가 화면에서 읽은 그 이름으로 칸을 부른다.
 * `aria-label` → 같은 묶음의 <label> → placeholder 순. 셋 다 없으면 이름 없이 말한다
 * ("'' 칸을 채워 주세요" 보다는 스크롤과 초점이 더 정확한 안내다).
 */
export function fieldLabelOf(control) {
  if (!control) return '';
  const aria = control.getAttribute?.('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const label = control.closest?.('.form-group')?.querySelector('label');
  if (label && label.textContent.trim()) return label.textContent.trim();
  return control.getAttribute?.('placeholder')?.trim() || '';
}

export function invalidFieldMessage(control) {
  const label = fieldLabelOf(control);
  return control.validity && !control.validity.valueMissing && control.validationMessage
    ? `${label}: ${control.validationMessage}`
    : t('missingFieldError').replace('{0}', label);
}

export function bindSubmit(view) {
  const form = view.shadowRoot.getElementById('travel-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (view.hasAttribute('handoff-flow') && !view.reviewing) {
      // A pick still loading would be reviewed as typed text and listed as unverified.
      const discarded = view.discardCount;
      await Promise.all(Array.from(view.shadowRoot.querySelectorAll('gmp-place-autocomplete')).map(element => element.placeSelectionPending));
      if (discarded !== view.discardCount) return; // the draft was deleted while a pick loaded
      view.saveDraft(); view.showReview(); return;
    }
    if (view.isSubmitting) {
      console.log('Already submitting, preventing duplicate request...');
      return;
    }



    view.isSubmitting = true;
    const btn = view.shadowRoot.querySelector('.primary-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Planning... ⏳';
      btn.style.opacity = '0.7';
      btn.style.cursor = 'not-allowed';
    }
    // The checks before generation can take seconds, so the review's button says so.
    const generate = view.reviewing && view.shadowRoot.getElementById('final-generate');
    if (generate) { generate.disabled = true; generate.textContent = t('flowChecking'); }

    try {
    await Promise.all(Array.from(view.shadowRoot.querySelectorAll('gmp-place-autocomplete'))
      .map(element => element.placeSelectionPending));
    if (Array.from(view.shadowRoot.querySelectorAll('gmp-place-autocomplete')).some(element => element.placeSelectionError)) {
      showErrorToast(t('flowPlaceFailed'));
      view._resetSubmitButton(btn);
      view.isSubmitting = false;
      return;
    }
    let plannerRequest = view.getFormData();
    view.draft = plannerDraftStore.save(plannerRequest);

    // --- Date Validation ---
    // 과거 날짜로 만들면 화면 날짜와 실제 계산되는 경로가 어긋난다
    // (transit-time.mjs 가 지난 출발 시각을 다음 주로 밀어 조회한다).
    const pastDate = (Array.isArray(plannerRequest.date) ? plannerRequest.date : [plannerRequest.date]).find(date => date < localTravelDate(new Date(), travelRegion(plannerRequest).timeZone));
    if (pastDate) {
      showErrorToast(t('pastDateValidationError').replace('{0}', pastDate));
      view._resetSubmitButton(btn);
      view.isSubmitting = false;
      return;
    }

    // A shown flight needs its airport and time; the airport also fills the locked first or last location.
    let flightIssue = null;
    for (const kind of ['arrival', 'departure']) {
      const entry = view.shadowRoot.getElementById(`${kind}-flight`);
      if (entry.hidden || flightIssue) continue;
      const airport = getAutocompleteValue(entry.querySelector('.flight-airport'));
      if (!getLocationName(airport) || (view.hasAttribute('handoff-flow') && !normalizeSelectedPlace(airport))) flightIssue = entry.querySelector('.flight-airport');
      else if (!entry.querySelector('.flight-time').value) flightIssue = entry.querySelector('.flight-time');
    }
    if (flightIssue) {
      view._revealInvalidField(flightIssue, t('incompleteFlightError'));
      view._resetSubmitButton(btn);
      view.isSubmitting = false;
      return;
    }
    // 출발·도착 장소. 이 칸들은 커스텀 엘리먼트라 브라우저 기본 검사가
    // 못 본다 — required 를 붙여도 소용없다. 여기서 막지 않으면 빈 채로
    // 흘러가, AI 는 출발지를 "Unknown" 으로 듣고 경계 보정은 통째로 꺼진다.
    const missingLocation = findMissingLocation(plannerRequest);
    if (missingLocation) {
      const control = view.shadowRoot.getElementById(missingLocation.id);
      view._revealInvalidField(control, t('missingLocationError')
        .replace('{0}', fieldLabelOf(control) || t(missingLocation.labelKey)));
      view._resetSubmitButton(btn);
      view.isSubmitting = false;
      return;
    }
    if (view.hasAttribute('handoff-flow')) {
      if (stayIssue(plannerRequest.stays || [], plannerRequest.date) >= 0) { view._revealInvalidField(view.shadowRoot.getElementById('add-trip-stay'), t('flowStayInvalid')); view._resetSubmitButton(btn); view.isSubmitting = false; return; }
      const placeControls = Array.from(view.shadowRoot.querySelectorAll('#start-location, #end-location, .stay-location, .anchor-location, .daily-start-location, .daily-end-location')).filter(el => getLocationName(getAutocompleteValue(el)) || ['start-location', 'end-location'].includes(el.id));
      const invalidPlace = placeControls.find(el => !normalizeSelectedPlace(getAutocompleteValue(el)));
      if (invalidPlace) { view._revealInvalidField(invalidPlace, t('flowPlaceFailed')); view._resetSubmitButton(btn); view.isSubmitting = false; return; }
    }
    const missingNight = !view.hasAttribute('handoff-flow') && Array.isArray(plannerRequest.date) && plannerRequest.date.length > 1
      ? plannerRequest.overnightLocations.findIndex(location => !getLocationName(location)) : -1;
    if (missingNight >= 0) {
      const control = view.shadowRoot.querySelectorAll('.overnight-location')[plannerRequest.sameOvernightLocation ? 0 : missingNight];
      view._revealInvalidField(control, t('missingLocationError')
        .replace('{0}', fieldLabelOf(control)));
      view._resetSubmitButton(btn);
      view.isSubmitting = false;
      return;
    }

    // 손댔지만 덜 찬 고정 일정. 화면에 보이는 줄을 그대로 읽는다 —
    // plannerRequest.anchorSchedules 는 빈 줄이 이미 걸러져 번호가 어긋난다.
    const anchorRows = view._readAnchorRows();
    const incomplete = findIncompleteAnchor(anchorRows);
    if (incomplete) {
      const control = anchorRows[incomplete.index].el
        .querySelector(ANCHOR_FIELD_SELECTOR[incomplete.field]);
      view._revealInvalidField(control, t('incompleteAnchorError')
        .replace('{0}', String(incomplete.index + 1))
        .replace('{1}', fieldLabelOf(control)));
      view._resetSubmitButton(btn);
      view.isSubmitting = false;
      return;
    }

    if (view.hasAttribute('handoff-flow')) {
      const issue = await findFixedVisitIssue(plannerRequest, createFlexibleVisitChecks(Math.max(1, plannerRequest.anchorSchedules.length), plannerRequest));
      if (issue) {
        const row = anchorRows.find(row => row.name===issue.anchor.name && row.day===issue.day);
        view._revealInvalidField(row?.el.querySelector('.anchor-time'), t({time:'plannerAnchorError',overlap:'flowOverlap',route:'flexibleVisitRouteError',travel:'flowTravelTime',bounds:'plannerAnchorBoundsError',hours:'flexibleVisitHoursError'}[issue.reason]));
        view._resetSubmitButton(btn);view.isSubmitting=false;return;
      }
    }
    const flexibleCount = plannerRequest.anchorSchedules.filter(anchor => anchor.flexible).length;
    const placement = await scheduleFlexibleVisits(plannerRequest,
      flexibleCount ? createFlexibleVisitChecks(flexibleCount, plannerRequest) : {});
    if (placement.issue) {
      const control = anchorRows.filter(row => !isAnchorBlank(row))[placement.issue.anchorIndex]?.el.querySelector('.anchor-name');
      const messageKey = { 'flexible-visit-route': 'flexibleVisitRouteError',
        'flexible-visit-hours': 'flexibleVisitHoursError' }[placement.issue.reason] || 'flexibleVisitSpaceError';
      view._revealInvalidField(control, t(messageKey));
      view._resetSubmitButton(btn);
      view.isSubmitting = false;
      return;
    }
    plannerRequest = placement.request;

    // Same canonical contract as the server, including each anchor's own
    // day's custom times. DOM-only checks above preserve precise row feedback.
    const issue = findPlannerInputIssue(plannerRequest);
    if (issue) {
      const fieldIds = { date: 'schedule-date', startTime: 'start-time', endTime: 'end-time',
        startLocation: 'start-location', endLocation: 'end-location' };
      let control = view.shadowRoot.getElementById(fieldIds[issue.field] || 'schedule-date');
      if (issue.field === 'startTime' || issue.field === 'endTime') {
        if (plannerRequest.dailyTimes?.some(dt => dt.isCustom)) {
          const selector = issue.field === 'startTime' ? '.daily-start-time' : '.daily-end-time';
          control = view.shadowRoot.querySelector(`.daily-time-row[data-day="${issue.day}"] ${selector}`) || control;
        }
      }
      if (issue.anchorIndex !== undefined) {
        const row = anchorRows.filter(row => row.day === issue.day && !isAnchorBlank(row))[issue.anchorIndex];
        control = row?.el.querySelector(ANCHOR_FIELD_SELECTOR[issue.field] || '.anchor-day') || control;
      } else if (issue.reason === 'anchor-limit' || issue.reason === 'anchor-day') {
        control = view.shadowRoot.getElementById('add-anchor-btn');
      }
      view._revealInvalidField(control, plannerValidationMessage(issue));
      view._resetSubmitButton(btn);
      view.isSubmitting = false;
      return;
    }
    // --- End Validation ---



    console.log('Dispatching generation event:', plannerRequest);

    trackEvent('generate_itinerary_click');

    // Dispatch custom event reaching up through the DOM
    view.dispatchEvent(new CustomEvent('generate-itinerary', {
      detail: plannerRequest,
      bubbles: true,
      composed: true // Allows event to pass through shadow DOM boundary
    }));
    } catch (error) {
      console.error('Planner validation failed:', error);
      view._revealInvalidField(null, t('shellGenerationFailed'));
      view._resetSubmitButton(btn); view.isSubmitting = false;
    }
  });
}
