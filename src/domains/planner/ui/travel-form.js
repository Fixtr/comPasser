import { findFixedVisitIssue } from '../services/planner-preflight.mjs';
import { dateRange, travelRegion, localTravelDate } from '../../../../functions/travel-region.mjs';
import { stayIssue } from '../services/trip-stays.mjs';
import { destinationById } from '../services/travel-destinations.mjs';
import { normalizeSelectedPlace } from '../services/selected-place.mjs';
import { escapeHtml } from '../../../utils/html-safety.mjs';
import { t, getLang, applyTranslations } from '../../../utils/i18n.js';
import { getMapsLoader } from '../../map/services/google-maps-loader.js';
import { trackEvent } from '../../../utils/analytics.js';
import { travelFormStyles } from './travel-form-style.js';
import { stepProgressStyles, stepProgressHtml } from './step-progress.js';
import { icons } from '../../../ui/icons.js';
import { animateScreen } from '../../../ui/screen-motion.js';
import { getFormData, getAutocompleteValue } from './travel-form-data.js';
import { bindPlaceSelection, restorePlaceInput } from '../services/selected-place.mjs';
import { plannerDraftStore, toPlannerDraft, spreadVisitDays } from '../services/planner-draft.mjs';
import { cities } from '../services/discovery-catalogue.mjs';
import { showErrorToast } from '../../../utils/toast.js';
import { todayString } from '../services/trip-date.mjs';
import { findIncompleteAnchor, isAnchorBlank, missingAnchorFields } from '../services/anchor-validation.mjs';
import { findMissingLocation, REQUIRED_LOCATIONS } from '../services/location-validation.mjs';
import { getLocationName, mergedSameDayVisits, normalizePlannerRequest, stayUnsetLabel } from '../services/planner-constraints.mjs';
import { airportArrivalTime, tripStartAfterLanding } from '../services/flight-arrival.mjs';
import { findPlannerInputIssue, plannerValidationMessage } from '../services/planner-validation.js';
import { scheduleFlexibleVisits } from '../services/schedule-flexible-visits.mjs';
import { createFlexibleVisitChecks } from '../services/flexible-visit-checks.js';

/** 고정 일정의 필수 칸 이름 → 그 칸을 찾는 선택자. */
const ANCHOR_FIELD_SELECTOR = {
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
function fieldLabelOf(control) {
  if (!control) return '';
  const aria = control.getAttribute?.('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const label = control.closest?.('.form-group')?.querySelector('label');
  if (label && label.textContent.trim()) return label.textContent.trim();
  return control.getAttribute?.('placeholder')?.trim() || '';
}

function invalidFieldMessage(control) {
  const label = fieldLabelOf(control);
  return control.validity && !control.validity.valueMissing && control.validationMessage
    ? `${label}: ${control.validationMessage}`
    : t('missingFieldError').replace('{0}', label);
}



export default class TravelForm extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.anchorCount = 0;
    this.isSubmitting = false;
    this.generationCredits = undefined;
    this.draft = plannerDraftStore.read();
    this.loader = getMapsLoader();
  }

  connectedCallback() {
    if (this.hasAttribute('handoff-flow') && !Array.isArray(this.draft.stays)) this.draft = plannerDraftStore.update({ stays: this.draft.overnightLocations.map((location, i) => ({ location, checkin: this.draft.date[i], checkout: this.draft.date[i+1] })).filter(stay => getLocationName(stay.location)) });
    this.render();
    if (this.anchorCount === 0) {
      // 앵커 자동 생성 로직 제거 (Opt-in)
      // this.addAnchor();
    }
    this.setupEventListeners();
    this.updateTexts(); // Fix i18n flickering on load

    // 여기서 initPlaces() 를 부르지 않는다. initPlaces 는 Maps 의 places
    // 라이브러리를 받아 오므로, 폼이 실제로 보일 때(아래 옵저버) 받는다.
    this._visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          console.log("[TravelForm] Component became visible. Forcing re-fetch from storage.");
          this.initPlaces();
          this.refreshFromStorage();
        }
      });
    }, { threshold: 0.05 });
    this._visibilityObserver.observe(this);

    // 최초 로드시에도 1회 실행
    this.refreshFromStorage();

    // Listen for completion to reset button state
    window.addEventListener('itinerary-generation-complete', () => {
      this.isSubmitting = false;
      this._resetSubmitButton(this.shadowRoot.querySelector('.primary-btn'));
    });

    // Listen for global language changes
    window.addEventListener('i18n-changed', () => {
      this.updateTexts();
    });
  }

  /**
   * 컴포넌트가 다시 화면에 나타날 때마다 저장소에서 최신 데이터를 강제로 리페치합니다.
   */
  /**
   * 날짜 입력의 min 을 오늘로 맞춘다. 컴포넌트가 다시 보일 때마다 갱신해야
   * 탭을 열어둔 채 자정을 넘겨도 어제 날짜를 고를 수 없다.
   */
  syncDateFloor() {
    const dateInput = this.shadowRoot?.getElementById('schedule-date');
    // 여러 날 일정은 읽기 전용 텍스트로 바뀌므로 min 이 의미가 없다.
    if (!dateInput || dateInput.type !== 'date') return;
    dateInput.min = localTravelDate(new Date(), travelRegion(this.draft).timeZone);
  }

  /** 기존 일정 수정도 같은 초안을 교체한다. 화면 재진입·새로고침에 남는다. */
  setPendingFormData(requestData) {
    // Update the hidden controls together with the draft, before navigation.
    // Waiting for IntersectionObserver would briefly pair old UI with new data.
    if (requestData) this.populateForm(requestData);
  }

  refreshFromStorage() {
    this.syncDateFloor();
    this.populateForm(plannerDraftStore.read(), { persist: false });
  }

  discardDraft() {
    this.discardCount = (this.discardCount || 0) + 1;
    this.reviewing = false;
    this.isSubmitting = false;
    this.isGenerating = false;
    this._resetSubmitButton(this.shadowRoot.querySelector('.primary-btn'));
    const review = this.shadowRoot.getElementById('review-panel');
    review.hidden = true;
    review.replaceChildren();
    this.shadowRoot.getElementById('travel-form').hidden = false;
    this.refreshFromStorage();
  }

  /**
   * 현재 입력 초안을 읽어
   * 헤더의 #preference-chips-container에 칩(Badge) UI를 렌더링합니다.
   * 값이 없으면 컨테이너가 빈 채로 숨겨집니다.
   */
  renderPreferenceBadges() {
    try {
      const container = this.shadowRoot.getElementById('preference-chips-container');
      if (!container) return;

      // 기존 DOM 찌꺼기 완벽 초기화 방어 로직 (잔상 방지)
      container.innerHTML = '';

      const makeChip = (key) => {
        const chip = document.createElement('span');
        chip.className = 'pref-chip';
        // 키를 남겨 둬야 언어가 바뀔 때 따라온다. 예전에는 t() 로 한 번 찍고
        // 말아서, 영어로 바꿔도 이 배지만 "선택 없음"으로 남아 있었다.
        chip.dataset.i18n = key;
        chip.textContent = t(key);
        return chip;
      };

      const { theme, budget, companion, pace, date } = this.draft;

      // 선택값이 하나도 없으면 '선택 없음' 배지 노출
      if (!theme && !budget && !companion && !pace && !date?.length) {
        container.style.display = 'flex';
        container.appendChild(makeChip('no_preference'));
        return;
      }

      container.style.display = 'flex';

      if (date) {
        let displayDate = "";
        if (Array.isArray(date) && date.length > 0) {
          if (date.length > 1) {
            const nights = date.length - 1;
            const days = date.length;
            // i18n에 정의된 duration_n 키 사용 시도, 없으면 폴백
            const durationKey = `duration_${days}`;
            const durationText = t(durationKey) !== durationKey 
              ? t(durationKey) 
              : (getLang() === 'ko' ? `${nights}박 ${days}일` : `${nights}N ${days}D`);
            
            // [렌더링 점검] ${dateArray[0]} ~ ${dateArray[last]} (N박 M일) 형태 준수
            displayDate = `${date[0]} ~ ${date[date.length - 1]} (${durationText})`;
          } else {
            displayDate = date[0];
          }
        } else if (typeof date === 'string') {
          displayDate = date;
        }

        if (displayDate) {
          const dateChip = document.createElement('span');
          dateChip.className = 'pref-chip';
          // 예전에는 이 배지만 초록 그라디언트였다. 초록은 지도에서 "그날의
          // 첫 장소"를 뜻하는 색이라, 날짜 배지가 그 색을 먼저 써 버리면
          // 결과 화면에서 초록의 뜻이 흐려진다. 아이콘으로만 구분한다.
          // 날짜 문자열은 sessionStorage 에서 온다. textContent 로 넣어
          // 값이 마크업으로 해석될 여지를 남기지 않는다.
          const chipIcon = document.createElement('span');
          chipIcon.className = 'chip-icon';
          chipIcon.innerHTML = icons.calendar;
          const chipText = document.createElement('span');
          chipText.textContent = displayDate;
          dateChip.append(chipIcon, chipText);
          container.appendChild(dateChip);
        }
      }
      
      if (theme) container.appendChild(makeChip(`theme_${theme}`));
      if (budget) container.appendChild(makeChip(`budget_${budget}`));
      if (companion) container.appendChild(makeChip(`companion_${companion}`));
      if (pace) container.appendChild(makeChip(`pace_${pace}`));
    } catch (error) {
      console.warn('CRITICAL: renderPreferenceBadges failed but prevented crash:', error);
    }
  }

  updateTexts() {
    applyTranslations(this.shadowRoot);
    if (this.hasAttribute('handoff-flow')) {
      const city = destinationById(this.draft.destination?.id);
      const destination = this.shadowRoot.getElementById('trip-destination');
      if (destination) destination.value = city ? `${t(`country${city.country}`)} / ${t(city.key)}` : this.draft.destination?.name || '';
      const btn = this.shadowRoot.querySelector('.primary-btn');
      if (btn) { btn.dataset.i18n='flowReview'; btn.textContent=t('flowReview'); }
    }
    if (this.reviewing) this.showReview();
    // Day labels are built in code ('1일차' / 'Day 1'), so a language switch rewrites them here.
    this.shadowRoot.querySelectorAll('[data-day-n]').forEach(label => {
      label.textContent = t('day_n').replace('{0}', label.dataset.dayN) + (label.dataset.daySuffix || '');
    });
    this.shadowRoot.querySelectorAll('[data-night]').forEach(label => {
      label.textContent = t(label.dataset.i18n).replace('{0}', label.dataset.night);
      this.shadowRoot.getElementById(label.htmlFor)?.setAttribute('aria-label', label.textContent);
    });
    this.updateDailyLocationSummary();
    this.renderGenerationCredits();
  }

  setGenerationCredits(balance) {
    this.generationCredits = balance;
    this.renderGenerationCredits();
  }

  renderGenerationCredits() {
    const credits = this.generationCredits;
    const text = credits === 'unlimited' ? t('generationCreditsUnlimited') : Number.isSafeInteger(credits)
      ? t('generationCreditsCount').replace('{0}', credits)
      : t(credits === undefined ? 'generationCreditsLoading' : 'generationCreditsUnavailable');
    this.shadowRoot?.querySelectorAll('.credit-balance').forEach(line => {
      line.querySelector('strong').textContent = text;
      line.querySelector('.credit-empty').hidden = credits !== 0;
    });
    // A listed review issue or a known zero blocks; an unknown balance (loading, offline, failure) leaves the decision to the server.
    const generate = this.shadowRoot?.getElementById('final-generate');
    if (generate) generate.disabled = credits === 0 || this.reviewBlocked === true || this.isSubmitting === true;
    if (credits === 0) generate?.setAttribute('aria-describedby', 'review-credit-empty');
    else generate?.removeAttribute('aria-describedby');
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        ${travelFormStyles}
        ${stepProgressStyles}
        [hidden] { display: none !important; }
        :host([handoff-flow]) { max-width: 700px; margin: 0 auto; padding: 0; border: 0; background: transparent; }
        :host([handoff-flow]) .form-section, #review-panel section { padding: 18px; border: 1px solid var(--cp-rule); border-radius: 10px; background: var(--cp-surface); margin-bottom: 16px; }
        :host([handoff-flow]) #same-overnight-toggle, :host([handoff-flow]) .overnight-option:has(#same-overnight-toggle), :host([handoff-flow]) #overnight-locations, :host([handoff-flow]) #overnight-notice { display: none; }
        :host(:not([handoff-flow])) #trip-stays, :host(:not([handoff-flow])) .handoff-field { display: none; }
        .trip-stay { position: relative; margin: 12px 0; padding: 14px; border: 1px solid var(--cp-rule); border-radius: 8px; }
        .trip-stay .location-heading { margin-bottom: 0.4rem; }
        #review-panel { color: var(--cp-ink); }
        #review-panel p { color: var(--cp-ink-2); overflow-wrap: anywhere; }
        #review-panel button { min-height: 44px; font: inherit; padding: 8px 12px; border: 1px solid var(--cp-rule); border-radius: 6px; background: var(--cp-surface); color: var(--cp-ink); cursor: pointer; }
        #review-panel #final-generate { display: block; width: 100%; color: var(--cp-surface); background: var(--cp-ink); }
        #review-panel #final-generate:disabled { color: var(--cp-muted); background: var(--cp-sunken); cursor: not-allowed; }
        .credit-empty { display: block; margin-top: 4px; color: var(--cp-ink); }
        .credit-empty[hidden] { display: none; }
        #review-issues { margin: 12px 0; border-left: 3px solid var(--cp-danger); padding: 12px; }
        :host([handoff-flow]) .link-btn { white-space: normal; min-height: 44px; }
        /* With wider fonts the start label wrapped beside "Where should I go?" and sat higher than the end label; let the button wrap instead. */
        :host([handoff-flow]) .location-heading label { flex-shrink: 0; }
        :host([handoff-flow]) input, :host([handoff-flow]) select { min-height: 44px; font-size: 16px; border-radius: 6px; }
        :is(button,input,select):focus-visible { outline: 3px solid var(--cp-ink); outline-offset: 3px; }

      </style>

      <dialog id="discovery-dialog" aria-labelledby="discovery-title">
        <div class="location-heading">
          <h2 id="discovery-title" data-i18n="whereToGo">어디로 갈까?</h2>
          <button type="button" id="close-discovery" class="link-btn" data-i18n="closeDiscovery">닫기</button>
        </div>
        <p class="subtitle" data-i18n="discoveryScope"></p>
        <div class="discovery-modes">
          <button type="button" data-discovery-mode="destination" class="secondary-btn" aria-pressed="false" data-i18n="chooseDestination"></button>
          <button type="button" data-discovery-mode="stops" class="secondary-btn" aria-pressed="false" data-i18n="chooseStops"></button>
        </div>
        <div id="discovery-options" hidden>
          <div class="row-2">
            <div class="form-group" id="discovery-city-group"><label for="discovery-city" data-i18n="destinationCity"></label><select id="discovery-city"></select></div>
            <div class="form-group"><label for="discovery-day" data-i18n="visitDay"></label><select id="discovery-day"></select></div>
          </div>
          <div id="route-discovery-controls" hidden>
            <p class="subtitle" data-i18n="routeDiscoveryHelp"></p>
            <button type="button" id="find-route-stops" class="secondary-btn" data-i18n="findRouteStops"></button>
            <p id="route-discovery-status" role="status"></p>
          </div>
          <div id="destination-suggestions"></div>
          <div id="discovery-places"></div>
        </div>
      </dialog>
      <dialog id="stay-dialog" aria-labelledby="stay-title">
        <div class="location-heading">
          <h2 id="stay-title" data-i18n="findStay"></h2>
          <button type="button" id="close-stay" class="link-btn" data-i18n="closeDiscovery"></button>
        </div>
        <p class="subtitle" data-i18n="staySearchHelp"></p>
        <p id="stay-dates"></p>
        <p id="stay-tonight" data-i18n="stayTonight" hidden></p>
        <form id="stay-search-form">
          <div class="form-group"><label for="stay-region" data-i18n="stayRegion"></label><input id="stay-region" type="text" maxlength="120" required></div>
          <div class="form-group"><label for="stay-guests" data-i18n="stayGuests"></label><input id="stay-guests" type="number" min="1" max="8" step="1" value="2" required></div>
          <button class="secondary-btn" type="submit" data-i18n="staySearch"></button>
        </form>
        <p><a id="stay-booking-link" target="_blank" rel="noopener noreferrer" data-i18n="stayOpenBooking" hidden></a></p>
        <p class="subtitle" data-i18n="stayPriceNotice"></p>
        <div class="form-group"><label for="stay-chosen" data-i18n="stayChosen"></label><gmp-place-autocomplete id="stay-chosen"></gmp-place-autocomplete></div>
        <button id="apply-stay" type="button" class="secondary-btn" data-i18n="stayApply"></button>
      </dialog>
      <section id="review-panel" tabindex="-1" hidden></section>
      <form id="travel-form">
        ${this.hasAttribute('handoff-flow') ? stepProgressHtml(6) : ''}
        <p class="credit-balance" role="status">
          <span data-i18n="generationCreditsLabel">${t('generationCreditsLabel')}</span>:
          <strong id="generation-credit-balance">${t('generationCreditsLoading')}</strong>
          <span class="credit-empty" data-i18n="generationCreditsEmpty" hidden>${t('generationCreditsEmpty')}</span>
        </p>
        
        <div class="form-section">
          <h1 class="section-head">
            <div class="section-head-main">
              <span data-i18n="flowDetails"></span>
              <div class="preference-chips" id="preference-chips-container"></div>
            </div>
            <div class="section-head-actions">
              <button type="button" id="reselect-date-btn" class="link-btn handoff-field" data-i18n="reselectTravelDates"></button>
              <button type="button" id="reselect-preference-btn" class="link-btn" data-i18n="reselectPreference">${t('reselectPreference')}</button>
            </div>
          </h1>
          <div class="form-group handoff-field">
            <div class="location-heading">
              <label for="trip-destination" data-i18n="flowDestination"></label>
              <button type="button" id="change-trip-destination" class="link-btn" data-i18n="flowChangeDestination"></button>
            </div>
            <input id="trip-destination" readonly aria-readonly="true">
          </div>
          <div class="time-settings">
          <div id="daily-times-wrapper" style="display: none;">
            <label class="toggle-container">
              <input type="checkbox" id="daily-times-toggle" aria-controls="daily-times-accordion">
              <span class="toggle-switch" aria-hidden="true"></span>
              <span class="toggle-label" data-i18n="perDayTimeToggle">일자별로 시간 다르게 설정하기</span>
            </label>
          </div>
          <div class="row-3" id="global-times-container">
            <div class="form-group">
              <label for="schedule-date" data-i18n="scheduleDate">Date</label>
              <input type="date" id="schedule-date" required>
            </div>
            <div class="form-group handoff-field"><label for="trip-end-date" data-i18n="flowEndDate"></label><input id="trip-end-date" type="text" readonly aria-readonly="true"></div>
            <div class="form-group global-time-input">
              <label for="start-time" data-i18n="startTime">Start Time</label>
              <input type="time" id="start-time" required>
            </div>
            <div class="form-group global-time-input">
              <label for="end-time" data-i18n="endTime">End Time</label>
              <input type="time" id="end-time" required>
            </div>
          </div>
          
          <div id="daily-times-accordion" style="display: none;"></div>
          </div>
          
          <div class="row-2">
            <div class="form-group">
              <div class="location-heading">
              <label for="start-location" data-i18n="startLocation">Start Location (e.g., Hotel)</label>
                <button type="button" id="where-to-go" class="link-btn" data-i18n="whereToGo">어디로 갈까?</button>
              </div>
              <gmp-place-autocomplete id="start-location" data-i18n-placeholder="startLocationPlaceholder" placeholder="${t('startLocationPlaceholder')}"></gmp-place-autocomplete>
              <p id="start-location-lock" class="subtitle" data-i18n="flightLocksStart" hidden></p>
            </div>
            <div class="form-group">
              <div class="location-heading">
                <label for="end-location" data-i18n="endLocation">End Location (e.g., Hotel/Airport)</label>
              </div>
              <gmp-place-autocomplete id="end-location" data-i18n-placeholder="endLocationPlaceholder" placeholder="${t('endLocationPlaceholder')}"></gmp-place-autocomplete>
              <p id="end-location-lock" class="subtitle" data-i18n="flightLocksEnd" hidden></p>
            </div>
          </div>
          <div id="overnight-wrapper" hidden>
            <p class="subtitle" data-i18n="overnightLocationHelp">Choose where each night ends and the next day begins.</p>
            <label class="overnight-option">
              <input type="checkbox" id="same-overnight-toggle" aria-controls="overnight-locations">
              <span data-i18n="sameOvernightLocation">Stay at the same place every night</span>
            </label>
            <p id="overnight-notice" class="subtitle" role="status" data-i18n="overnightLocationRequired" hidden></p>
            <div id="overnight-locations"></div>
            <section id="trip-stays"><h3 data-i18n="flowStays"></h3><div id="trip-stay-list"></div><button type="button" id="add-trip-stay" class="secondary-btn" data-i18n="flowAddStay"></button><p id="trip-stay-status" role="status"></p></section>
            <label class="overnight-option">
              <input type="checkbox" id="daily-locations-toggle" aria-controls="daily-locations-panel">
              <span data-i18n="dailyLocationsToggle"></span>
            </label>
            <div id="daily-locations-panel" hidden>
              <p class="subtitle" data-i18n="dailyLocationsHelp"></p>
              <div id="daily-locations"></div>
              <p id="daily-locations-notice" class="subtitle" role="status" hidden></p>
            </div>
          </div>
          <p id="selected-waypoint" class="subtitle" hidden><strong data-i18n="discoverWaypointLabel">방문할 곳</strong>: <span id="selected-waypoint-name"></span>
            <button type="button" id="remove-waypoint" class="link-btn" data-i18n="discoverWaypointRemove">제외</button>
          </p>
        </div>

        <div class="form-section" id="flights-section">
          <h2><span data-i18n="flightsTitle">${t('flightsTitle')}</span> <span class="optional-note">(<span data-i18n="flowOptional">${t('flowOptional')}</span>)</span></h2>
          <p class="subtitle" data-i18n="flightsSubtitle"></p>
          <div class="flight-entry" id="arrival-flight" hidden>
            <div class="location-heading">
              <strong data-i18n="arrivalFlight"></strong>
              <button type="button" class="link-btn flight-remove" data-i18n="removeFlight">Remove</button>
            </div>
            <div class="form-group">
              <label for="arrival-flight-airport" data-i18n="flightAirport">Airport</label>
              <gmp-place-autocomplete id="arrival-flight-airport" class="flight-airport" data-i18n-placeholder="flightAirportPlaceholder" placeholder="Search for an airport"></gmp-place-autocomplete>
            </div>
            <div class="row-2">
              <div class="form-group">
                <label for="arrival-flight-time" data-i18n="landingTime">Time</label>
                <input type="time" id="arrival-flight-time" class="flight-time">
              </div>
              <div class="form-group">
                <label for="arrival-flight-kind" data-i18n="flightKind">Flight</label>
                <select id="arrival-flight-kind" class="flight-kind">
                  <option value="international" data-i18n="flightInternational">International</option>
                  <option value="domestic" data-i18n="flightDomestic">Domestic</option>
                </select>
              </div>
            </div>
            <p class="subtitle flight-note" role="status"></p>
          </div>
          <div class="flight-entry" id="departure-flight" hidden>
            <div class="location-heading">
              <strong data-i18n="departureFlight"></strong>
              <button type="button" class="link-btn flight-remove" data-i18n="removeFlight">Remove</button>
            </div>
            <div class="form-group">
              <label for="departure-flight-airport" data-i18n="flightAirport">Airport</label>
              <gmp-place-autocomplete id="departure-flight-airport" class="flight-airport" data-i18n-placeholder="flightAirportPlaceholder" placeholder="Search for an airport"></gmp-place-autocomplete>
            </div>
            <div class="row-2">
              <div class="form-group">
                <label for="departure-flight-time" data-i18n="takeoffTime">Time</label>
                <input type="time" id="departure-flight-time" class="flight-time">
              </div>
              <div class="form-group">
                <label for="departure-flight-kind" data-i18n="flightKind">Flight</label>
                <select id="departure-flight-kind" class="flight-kind">
                  <option value="international" data-i18n="flightInternational">International</option>
                  <option value="domestic" data-i18n="flightDomestic">Domestic</option>
                </select>
              </div>
            </div>
            <p class="subtitle flight-note" role="status"></p>
          </div>
          <div class="flight-actions">
            <button type="button" id="add-arrival-flight" class="secondary-btn" data-i18n="addArrivalFlight">+ Arriving flight</button>
            <button type="button" id="add-departure-flight" class="secondary-btn" data-i18n="addDepartureFlight">+ Departing flight</button>
          </div>
        </div>

        <div class="form-section">
          <h2><span data-i18n="anchorTitle">${t('anchorTitle')}</span> <span class="optional-note">(<span data-i18n="flowOptional">${t('flowOptional')}</span>)</span></h2>
          <p class="subtitle" data-i18n="anchorSubtitle">Fixed schedule items to build around (e.g., Concert at 7PM, Dinner reservation)</p>
          
          <div id="anchors-container"></div>
          
          <button type="button" id="add-anchor-btn" class="secondary-btn" data-i18n="${this.hasAttribute('handoff-flow') ? 'flowAddAnchor' : 'addAnchor'}">${t(this.hasAttribute('handoff-flow') ? 'flowAddAnchor' : 'addAnchor')}</button>
        </div>

        
        <div class="submit-row">
          <button type="button" id="reset-btn" class="reset-btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span data-i18n="resetBtn">초기화</span>
          </button>
          <button type="submit" class="primary-btn" data-i18n="generateBtn">Generate AI Itinerary</button>
        </div>
      </form>
    `;

    // Initialize with 1 empty anchor
    // this.addAnchor(); // Opt-in 방식으로 변경됨에 따라 주석 처리
  }

  async initPlaces() {
    // 보일 때마다 불린다. 자동완성을 두 번 붙이면 같은 선택이 두 번 전달된다.
    if (this._placesReady) return;
    this._placesReady = true;
    try {
      // 💎 핵심 1: libraries=['places']가 포함된 로더로부터 places 라이브러리를 명확히 가져옴 💎
      await this.loader.importLibrary("places");

      const startAutocomplete = this.shadowRoot.getElementById('start-location');
      const endAutocomplete = this.shadowRoot.getElementById('end-location');

      if (startAutocomplete) this.setupAutocompleteListener(startAutocomplete);
      if (endAutocomplete) this.setupAutocompleteListener(endAutocomplete);

      // Bind to existing anchors if any
      const anchorAutocompletes = this.shadowRoot.querySelectorAll('.anchor-location');
      anchorAutocompletes.forEach(ac => this.setupAutocompleteListener(ac));
      this.shadowRoot.querySelectorAll('.stay-location, .overnight-location, .daily-start-location, .daily-end-location, .flight-airport').forEach(ac => this.setupAutocompleteListener(ac));

    } catch (e) {
      console.error("Failed to load Places API:", e);
      // 잠깐 끊겼다 돌아온 사용자가 다시 폼에 들어왔을 때 재시도할 수 있어야 한다.
      this._placesReady = false;
    }
  }

  setupAutocompleteListener(autocomplete) {
    bindPlaceSelection(autocomplete, () => {
      // A flight's airport fills the locked first or last location as soon as it is picked.
      this.syncFlights(autocomplete);
      this.shadowRoot.getElementById('travel-form').dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  addAnchor(data = null) {
    this.anchorCount++;
    const container = this.shadowRoot.getElementById('anchors-container');
    const id = `anchor-${Date.now()}`;

    const daysCount = Math.max(this.draft.date.length, 1);

    let daySelectorHTML = '';
    if (daysCount > 1) {
      const options = Array.from({ length: daysCount }, (_, i) => `<option value="${i + 1}" data-day-n="${i + 1}">${t('day_n').replace('{0}', i + 1)}</option>`).join('');
      daySelectorHTML = `
        <div class="form-group">
          <label data-i18n="anchorDayLabel">${t('anchorDayLabel')}</label>
          <select class="anchor-day" required>
            ${options}
          </select>
        </div>
      `;
    }

    const template = document.createElement('div');
    template.className = 'anchor-item';
    template.id = id;
    template.innerHTML = `
      <button type="button" class="remove-btn" title="${t('removeAnchorLabel')}" aria-label="${t('removeAnchorLabel')}">×</button>
      <div class="form-group">
        <label data-i18n="anchorNameLabel">${t('anchorNameLabel')}</label>
        <input type="text" class="anchor-name" data-i18n="anchorNamePlaceholder" placeholder="${t('anchorNamePlaceholder')}" aria-label="${t('anchorNameLabel')}">
      </div>
      ${daySelectorHTML}
      <label class="anchor-flexible-option"><input type="checkbox" class="anchor-flexible"><span data-i18n="flowAutomatic">${t('anchorFlexibleLabel')}</span></label>
      <p class="anchor-flexible-hint" data-i18n="anchorFlexibleHint">${t('anchorFlexibleHint')}</p>
      <div class="row-3 anchor-fields">
        <div class="form-group anchor-time-field">
          <label data-i18n="anchorStartLabel">${t('anchorStartLabel')}</label>
          <input type="time" class="anchor-time">
        </div>
        <div class="form-group anchor-time-field">
          <label data-i18n="anchorEndLabel">${t('anchorEndLabel')}</label>
          <input type="time" class="anchor-end-time">
        </div>
        <div class="form-group">
          <label data-i18n="anchorLocationLabel">${t('anchorLocationLabel')}</label>
          <gmp-place-autocomplete class="anchor-location" data-i18n-placeholder="anchorLocationPlaceholder" placeholder="${t('anchorLocationPlaceholder')}"></gmp-place-autocomplete>
        </div>
      </div>
    `;

    // Setup remove logic
    template.querySelector('.remove-btn').addEventListener('click', () => {
      container.removeChild(template);
      this.shadowRoot.getElementById('travel-form').dispatchEvent(new Event('input', { bubbles: true }));
    });

    if (data) {
      template.querySelector('.anchor-name').value = data.name || '';
      template.querySelector('.anchor-time').value = data.time || '';
      template.querySelector('.anchor-end-time').value = data.endTime || '';
      const ac = template.querySelector('.anchor-location');
      restorePlaceInput(ac, data.location || '');
      const daySelect = template.querySelector('.anchor-day');
      if (daySelect && data.day) daySelect.value = data.day;
      if (Number.isInteger(data.stayMinutes)) template.dataset.stayMinutes = String(data.stayMinutes);
    }

    const flexibleToggle = template.querySelector('.anchor-flexible');
    flexibleToggle.checked = data?.flexible === true || (!data && this.hasAttribute('handoff-flow'));
    const showFlexible = () => {
      template.classList.toggle('is-flexible', flexibleToggle.checked);
      template.querySelectorAll('.anchor-time, .anchor-end-time').forEach(input => {
        input.disabled = flexibleToggle.checked;
        if (flexibleToggle.checked) input.removeAttribute('aria-invalid');
      });
    };
    showFlexible();
    flexibleToggle.addEventListener('change', () => {
      showFlexible();
      this.shadowRoot.getElementById('travel-form').dispatchEvent(new Event('input', { bubbles: true }));
    });

    container.appendChild(template);

    // Bind autocomplete to the new element
    const newAutocomplete = template.querySelector('.anchor-location');
    if (newAutocomplete) {
      this.setupAutocompleteListener(newAutocomplete);
    }
  }

  populateForm(requestData, { persist = true } = {}) {
    if (!requestData) return;

    // Picks arrive without a day; the form spreads them once the trip dates are known.
    const draft = spreadVisitDays(toPlannerDraft(requestData));
    this.draft = persist ? plannerDraftStore.save(draft) : draft;
    requestData = this.draft;

    try {
      // 1. Reset Form
      const form = this.shadowRoot.getElementById('travel-form');
      if (form) form.reset();

      // 2. Clear old anchors
      const container = this.shadowRoot.getElementById('anchors-container');
      if (container) container.innerHTML = '';
      this.anchorCount = 0;

      // 3. Inject basic fields safely
      const setVal = (id, val) => {
        const el = this.shadowRoot.getElementById(id);
        if (el && val !== undefined && val !== null) {
          // If the field is schedule-date and the value is an array
          if (id === 'schedule-date') {
            if (Array.isArray(val)) {
              if (val.length === 0) {
                el.type = 'date';
                el.value = '';
                el.readOnly = false;
              } else if (val.length > 1) {
                // Multi-day
                const nights = val.length - 1;
                const reqDays = val.length;
                const durationKey = `duration_${reqDays}`;
                const durationText = t(durationKey) !== durationKey 
                  ? t(durationKey) 
                  : (getLang() === 'ko' ? `${nights}박 ${reqDays}일` : `${nights}N ${reqDays}D`);
                el.type = 'text';
                el.value = `${val[0]} ~ ${val[val.length - 1]} (${durationText})`;
                // 회색·not-allowed 는 CSS 의 input[readonly] 가 맡는다.
                // 인라인으로 칠하면 다크 모드에서 흰 글씨 위에 밝은 회색이 남는다.
                el.readOnly = true;
              } else {
                el.type = 'date';
                el.value = val[0];
                el.readOnly = false;
              }
            } else {
              el.type = 'date';
              el.value = val;
              el.readOnly = false;
            }
          } else {
            el.value = val;
          }
        }
      };

      setVal('schedule-date', requestData?.date);
      if (this.hasAttribute('handoff-flow')) {
        const dateInput = this.shadowRoot.getElementById('schedule-date');
        dateInput.type = 'text'; dateInput.readOnly = true; dateInput.value = requestData.date[0] || '';
        this.shadowRoot.querySelector('label[for="schedule-date"]').dataset.i18n = 'flowStartDate';
        this.shadowRoot.getElementById('trip-end-date').value = requestData.date.at(-1) || '';
        this.renderTripStays();
      }
      this.syncDateFloor();
      setVal('start-time', requestData?.startTime);
      setVal('end-time', requestData?.endTime);

      // 💎 핵심 3: Autocomplete 컴포넌트의 가시적인 값도 즉시 업데이트 💎
      const startAC = this.shadowRoot.getElementById('start-location');
      const endAC = this.shadowRoot.getElementById('end-location');
      restorePlaceInput(startAC, requestData?.startLocation || '');
      restorePlaceInput(endAC, requestData?.endLocation || '');
      for (const kind of ['arrival', 'departure']) {
        const entry = this.shadowRoot.getElementById(`${kind}-flight`);
        const flight = requestData?.flights?.[kind];
        entry.hidden = !flight;
        restorePlaceInput(entry.querySelector('.flight-airport'), flight?.airport || '');
        entry.querySelector('.flight-time').value = flight?.time || '';
        entry.querySelector('.flight-kind').value = flight?.kind || 'international';
        entry.querySelector('.flight-note').textContent = '';
      }
      this.syncFlights();
      const waypoint = requestData.selectedWaypoints?.[0];
      this.shadowRoot.getElementById('selected-waypoint').hidden = !waypoint;
      this.shadowRoot.getElementById('selected-waypoint-name').textContent = waypoint?.name || '';

      // 4. Inject Anchors dynamically safely
      if (requestData?.anchorSchedules && Array.isArray(requestData.anchorSchedules) && requestData.anchorSchedules.length > 0) {
        requestData.anchorSchedules.forEach(anchor => {
          if (anchor) this.addAnchor(anchor);
        });
      }

      // 💎 다일차 로직 처리 💎
      const dateVal = requestData?.date || requestData?.datePref;
      const dailyTimesWrapper = this.shadowRoot.getElementById('daily-times-wrapper');
      const dailyTimesAccordion = this.shadowRoot.getElementById('daily-times-accordion');
      const dailyTimesToggle = this.shadowRoot.getElementById('daily-times-toggle');
      const globalInputs = this.shadowRoot.querySelectorAll('.global-time-input');
      
      let isMultiDay = false;
      let daysCount = 1;
      
      if (Array.isArray(dateVal) && dateVal.length > 1) {
        isMultiDay = true;
        daysCount = dateVal.length;
      } else if (typeof dateVal === 'string' && dateVal.includes('~')) {
        // Fallback for some saved string formats if necessary
        isMultiDay = true;
        // Parse days count from string if possible, or leave it. This shouldn't be the case often.
      }
      
      if (dailyTimesWrapper) {
        if (isMultiDay) {
          dailyTimesWrapper.style.display = 'block';
          
          // Render accordion rows
          dailyTimesAccordion.innerHTML = '';
          for (let i = 0; i < daysCount; i++) {
            const dayNum = i + 1;
            const dRow = document.createElement('div');
            dRow.className = 'daily-time-row';
            dRow.dataset.day = dayNum;
            dRow.innerHTML = `
              <div class="daily-time-header" data-day-n="${dayNum}">${t('day_n').replace('{0}', dayNum)}</div>
              <div class="row-2">
                <div class="form-group">
                  <label data-i18n="startTime">Start Time</label>
                  <input type="time" class="daily-start-time" required>
                </div>
                <div class="form-group">
                  <label data-i18n="endTime">End Time</label>
                  <input type="time" class="daily-end-time" required>
                </div>
              </div>
            `;
            dailyTimesAccordion.appendChild(dRow);
          }
          
          // Restore dailyTimes if toggled
          if (requestData?.dailyTimes && Array.isArray(requestData.dailyTimes) && requestData.dailyTimes.length > 0 && requestData.dailyTimes[0].isCustom) {
            dailyTimesToggle.checked = true;
            dailyTimesAccordion.style.display = 'block';
            
            globalInputs.forEach(el => {
              el.style.display = 'none';
              const input = el.querySelector('input');
              if (input) input.required = false;
            });
            
            const dailyInputs = dailyTimesAccordion.querySelectorAll('input');
            dailyInputs.forEach(input => input.required = true);

            const rows = dailyTimesAccordion.querySelectorAll('.daily-time-row');
            requestData.dailyTimes.forEach((dt, idx) => {
              if (rows[idx]) {
                rows[idx].querySelector('.daily-start-time').value = dt.startTime || '';
                rows[idx].querySelector('.daily-end-time').value = dt.endTime || '';
              }
            });
          } else {
            dailyTimesToggle.checked = false;
            dailyTimesAccordion.style.display = 'none';
            
            const dailyInputs = dailyTimesAccordion.querySelectorAll('input');
            dailyInputs.forEach(input => input.required = false);

            globalInputs.forEach(el => {
              el.style.display = 'block';
              const input = el.querySelector('input');
              if (input) input.required = true;
            });
          }
        } else {
          dailyTimesWrapper.style.display = 'none';
          if (dailyTimesToggle) dailyTimesToggle.checked = false;
          if (dailyTimesAccordion) {
            dailyTimesAccordion.innerHTML = '';
            dailyTimesAccordion.style.display = 'none';
          }
          globalInputs.forEach(el => {
            el.style.display = 'block';
            const input = el.querySelector('input');
            if (input) input.required = true;
          });
        }
      }
      const overnightWrapper = this.shadowRoot.getElementById('overnight-wrapper');
      const overnightContainer = this.shadowRoot.getElementById('overnight-locations');
      this.shadowRoot.getElementById('same-overnight-toggle').checked = this.draft.sameOvernightLocation;
      overnightWrapper.hidden = !isMultiDay;
      overnightContainer.replaceChildren();
      if (isMultiDay) {
        for (let index = 0; index < daysCount - 1; index++) {
          const row = document.createElement('div');
          row.className = 'form-group';
          row.innerHTML = `<div class="location-heading"><label for="overnight-location-${index + 1}" data-i18n="overnightLocation" data-night="${index + 1}"></label>
            <button type="button" class="link-btn" data-find-stay="${index}" data-i18n="findStay"></button></div>
            <gmp-place-autocomplete id="overnight-location-${index + 1}" class="overnight-location" data-i18n-placeholder="overnightLocationPlaceholder" placeholder="${t('overnightLocationPlaceholder')}"></gmp-place-autocomplete>`;
          overnightContainer.appendChild(row);
          const autocomplete = row.querySelector('.overnight-location');
          restorePlaceInput(autocomplete, this.draft.overnightLocations[index] || '');
          if (this._placesReady) this.setupAutocompleteListener(autocomplete);
        }
      }
      this.shadowRoot.querySelector('label[for="start-location"]').dataset.i18n = isMultiDay || this.hasAttribute('handoff-flow') ? 'tripStartLocation' : 'startLocation';
      this.shadowRoot.querySelector('label[for="end-location"]').dataset.i18n = isMultiDay || this.hasAttribute('handoff-flow') ? 'tripEndLocation' : 'endLocation';
      this.renderDailyLocations();
      this.updateOvernightFields();
      this.renderPreferenceBadges();
      this.updateTexts(); // 번역 텍스트 업데이트
    } catch (error) {
      console.error("[Auto-fill Error] Failed to populate form:", error);
    }
  }

  renderDailyLocations() {
    const container = this.shadowRoot.getElementById('daily-locations');
    const enabled = Array.isArray(this.draft.dailyLocations);
    this.shadowRoot.getElementById('daily-locations-toggle').checked = enabled;
    this.shadowRoot.getElementById('daily-locations-panel').hidden = !enabled;
    container.replaceChildren();
    if (this.draft.date.length < 2) return;
    this.draft.date.forEach((date, index) => {
      const row = document.createElement('div');
      row.className = 'daily-location-row';
      row.dataset.day = index + 1;
      row.innerHTML = `<h3></h3><p class="subtitle daily-location-default"></p><div class="row-2">
        <div class="form-group"><label for="daily-start-location-${index + 1}" data-i18n="dailyDeparture"></label>
          <gmp-place-autocomplete id="daily-start-location-${index + 1}" class="daily-start-location"></gmp-place-autocomplete></div>
        <div class="form-group"><label for="daily-end-location-${index + 1}" data-i18n="dailyArrival"></label>
          <gmp-place-autocomplete id="daily-end-location-${index + 1}" class="daily-end-location"></gmp-place-autocomplete></div>
        </div>`;
      Object.assign(row.querySelector('h3').dataset, { dayN: index + 1, daySuffix: ` · ${date}` });
      row.querySelector('h3').textContent = `${t('day_n').replace('{0}', index + 1)} · ${date}`;
      container.appendChild(row);
      for (const kind of ['start', 'end']) {
        const input = row.querySelector(`.daily-${kind}-location`);
        restorePlaceInput(input, this.draft.dailyLocations?.[index]?.[`${kind}Location`] || '');
        if (this._placesReady) this.setupAutocompleteListener(input);
      }
    });
  }

  updateDailyLocationSummary() {
    const panel = this.shadowRoot.getElementById('daily-locations-panel');
    if (!panel || panel.hidden) return;
    const request = this.getFormData();
    const defaults = normalizePlannerRequest({ ...request, dailyLocations: null }).dailyData;
    const days = normalizePlannerRequest(request).dailyData;
    const place = location => stayUnsetLabel(getLocationName(location), request.destination, getLang() === 'ko') || getLocationName(location) || t('locationUnset');
    this.shadowRoot.querySelectorAll('.daily-location-row').forEach((row, index) => {
      row.querySelector('.daily-location-default').textContent = t('dailyLocationDefault')
        .replace('{0}', place(defaults[index].startLocation))
        .replace('{1}', place(defaults[index].endLocation));
      for (const kind of ['start', 'end']) {
        const input = row.querySelector(`.daily-${kind}-location`);
        input.setAttribute('placeholder', t('dailyLocationInherit'));
        input.setAttribute('aria-label', `${t('day_n').replace('{0}', index + 1)} ${t(kind === 'start' ? 'dailyDeparture' : 'dailyArrival')}`);
      }
    });
    const transfers = [];
    days.slice(0, -1).forEach((day, index) => {
      const next = days[index + 1];
      const from = getLocationName(day.endLocation), to = getLocationName(next.startLocation);
      const same = day.endLocation?.placeId && next.startLocation?.placeId
        ? day.endLocation.placeId === next.startLocation.placeId : from === to;
      if (from && to && !same) transfers.push(`${t('day_n').replace('{0}', day.day)} ${from} → ${t('day_n').replace('{0}', next.day)} ${to}`);
    });
    const notice = this.shadowRoot.getElementById('daily-locations-notice');
    notice.hidden = transfers.length === 0;
    notice.textContent = transfers.length ? `${t('dailyLocationTransfer')} ${transfers.join(' / ')}` : '';
  }

  renderTripStays() {
    const list = this.shadowRoot.getElementById('trip-stay-list');
    list.replaceChildren();
    (this.draft.stays || []).forEach(stay => {
      const row = document.createElement('div'); row.className = 'trip-stay';
      row.innerHTML = `<div class="location-heading"><label data-i18n="flowStays"></label><button type="button" class="link-btn" data-i18n="deleteBtn"></button></div><gmp-place-autocomplete class="stay-location"></gmp-place-autocomplete><div class="row-2"><label>${t('flowCheckin')}<input type="date" class="stay-checkin"></label><label>${t('flowCheckout')}<input type="date" class="stay-checkout"></label></div>`;
      const place = row.querySelector('.stay-location'); restorePlaceInput(place, stay.location); this.setupAutocompleteListener(place);
      for (const field of ['checkin','checkout']) { const input = row.querySelector(`.stay-${field}`); input.value=stay[field]; input.min=this.draft.date[0] || ''; input.max=this.draft.date.at(-1) || ''; }
      row.querySelector('button').onclick = () => { row.remove(); this.saveDraft(); };
      list.append(row);
    });
    applyTranslations(list);
    this.updateTripStayStatus();
  }

  updateTripStayStatus() {
    this.shadowRoot.getElementById('trip-stay-status').textContent = stayIssue(this.draft.stays || [], this.draft.date) >= 0 ? t('flowStayInvalid') : this.draft.overnightLocations.some(place => !getLocationName(place)) ? t('flowStayUnset') : '';
  }

  addTripStay() {
    this.saveDraft();
    const stays = structuredClone(this.draft.stays || []);
    if (stays.length >= this.draft.date.length - 1) return;
    let checkin = this.draft.date[0], checkout = this.draft.date.at(-1);
    if (stays.length) {
      const last = stays.findLast(stay => Date.parse(stay.checkout)-Date.parse(stay.checkin) > 86400000);
      if (last) { checkout=last.checkout; checkin=new Date(Date.parse(checkout)-86400000).toISOString().slice(0,10); last.checkout=checkin; }
      else { checkin=this.draft.date.slice(0,-1).find(date => !stays.some(stay => stay.checkin<=date && date<stay.checkout)); checkout=dateRange(checkin,2)[1]; }
    }
    if (!checkin || !checkout) return;
    stays.push({ location:'', checkin, checkout });
    this.draft=plannerDraftStore.save({ ...this.draft, stays }); this.renderTripStays(); this.saveDraft();
  }

  showReview() {
    const enteringReview = !this.reviewing;
    this.saveDraft(); this.reviewing=true;
    const root=this.shadowRoot.getElementById('review-panel');
    const draft=this.draft;
    const line=value => escapeHtml(String(value || t('locationUnset')));
    const time=value => escapeHtml(value || t('timeUnset'));
    const tripTimes=draft.dailyTimes?.some(day=>day.isCustom) ? draft.dailyTimes.map(day=>`<p>${t('day_n').replace('{0}', day.day)} · ${time(day.startTime)} – ${time(day.endTime)}</p>`).join('') : `<p>${time(draft.startTime)} – ${time(draft.endTime)}</p>`;
    const section=(key,content,target='details') => `<section><h3>${t(key)}</h3>${content}<button type="button" data-review-edit="${target}">${t('flowEdit')}</button></section>`;
    root.innerHTML=(this.hasAttribute('handoff-flow') ? stepProgressHtml(7) : '')+`<h1>${t('flowReviewTitle')}</h1>`
      +section('flowTravelDate',`<p>${line(this.shadowRoot.getElementById('trip-destination').value)}</p><p>${line(draft.date[0])} → ${line(draft.date.at(-1))}</p>`)
      +section('reviewEndpoints',`<p>${line(getLocationName(draft.startLocation))} → ${line(getLocationName(draft.endLocation))}</p>${tripTimes}`)
      +section('flowStays', (draft.stays || []).length ? draft.stays.map(stay=>`<p>${line(getLocationName(stay.location))} · ${line(stay.checkin)} → ${line(stay.checkout)}</p>`).join('') : `<p>${t('flowStayUnset')}</p>`)
      +section('flowPlaces', draft.anchorSchedules.map(anchor=>`<p>${t('day_n').replace('{0}', anchor.day)} · ${line(anchor.name)} · ${anchor.flexible?t('flowAutomatic'):time(anchor.time)+' – '+time(anchor.endTime)}</p>`).join('')
        +(mergedSameDayVisits(draft.anchorSchedules) ? `<p class="review-merged" role="note">${t('reviewMergedVisits')}</p>` : ''))
      +section('flowStyle',`<p>${draft.theme?t('theme_'+draft.theme):t('no_preference')} · ${draft.budget?t('budget_'+draft.budget):t('no_preference')}${draft.companion?' · '+t('companion_'+draft.companion):''} · ${t(`pace_${draft.pace || 'balanced'}`)}</p>`,'style')
      +(draft.dailyLocations?.some(day=>getLocationName(day.startLocation)||getLocationName(day.endLocation)) ? section('dailyLocationsToggle',draft.dailyLocations.map(day=>`<p>${t('day_n').replace('{0}', day.day)} · ${line(getLocationName(day.startLocation))} → ${line(getLocationName(day.endLocation))}</p>`).join('')):'')
      +`<div id="review-issues" role="alert" hidden></div><p class="credit-balance" role="status">${t('generationCreditsLabel')}: <strong></strong><span class="credit-empty" id="review-credit-empty" hidden>${t('generationCreditsEmpty')}</span></p><button type="button" id="final-generate">${t('flowGenerate')}</button>`;
    this.shadowRoot.getElementById('travel-form').hidden=true;root.hidden=false;
    root.querySelectorAll('[data-review-edit]').forEach(button=>button.onclick=()=>{ this.hideReview();if(button.dataset.reviewEdit==='style')window.navigate('/preference/2', { state: { returnTo: '/plan' } }); });
    root.querySelector('#final-generate').onclick=()=> { if(this.isSubmitting)return; const form=this.shadowRoot.getElementById('travel-form'); if(!form.reportValidity())return; form.dispatchEvent(new Event('submit',{cancelable:true})); };
    const issues=this._reviewIssues();
    this.reviewBlocked=issues.length > 0;
    this._showReviewIssues(issues);
    this.renderGenerationCredits();
    if (this.isSubmitting) root.querySelector('#final-generate').textContent=t('flowChecking');
    this.draft = plannerDraftStore.update({step:'/plan?review=1'});
    root.focus({preventScroll:true});root.scrollIntoView({block:'start',behavior:'auto'});
    if (enteringReview) animateScreen(root, true);
  }

  /**
   * Every blocker the inputs alone can show, listed at once instead of one per tap on 일정 생성하기.
   * Checks that need maps (travel times, opening hours, overlaps) still run when generating.
   */
  _reviewIssues() {
    const root=this.shadowRoot, request=this.getFormData(), issues=[];
    const add=(control, message) => { if (control && !issues.some(issue => issue.control === control)) issues.push({ control, message }); };
    for (const control of root.getElementById('travel-form').elements) {
      if (control.matches('.stay-checkin, .stay-checkout')) continue; // stayIssue below covers stay dates
      const day=control.closest('.daily-time-row')?.dataset.day;
      if (control.willValidate && !control.validity.valid) add(control, (day ? `[${t('day_n').replace('{0}', day)}] ` : '') + invalidFieldMessage(control));
    }
    const pastDate=[request.date].flat().find(date => date < localTravelDate(new Date(), travelRegion(request).timeZone));
    if (pastDate) add(root.getElementById('reselect-date-btn'), t('pastDateValidationError').replace('{0}', pastDate));
    for (const day of request.dailyTimes?.some(entry => entry.isCustom) ? request.dailyTimes : [{ ...request, day: 0 }]) {
      if (!day.startTime || !day.endTime || day.startTime < day.endTime) continue;
      add(day.day ? root.querySelector(`.daily-time-row[data-day="${day.day}"] .daily-end-time`) : root.getElementById('end-time'),
        (day.day ? `[${t('day_n').replace('{0}', day.day)}] ` : '') + t('basicTimeValidationError'));
    }
    const flights={};
    for (const kind of ['arrival', 'departure']) {
      const entry=root.getElementById(`${kind}-flight`);
      if (entry.hidden) continue;
      flights[kind]=true;
      const airport=entry.querySelector('.flight-airport');
      const message=`${t(`${kind}Flight`)}: ${t('incompleteFlightError')}`;
      if (!normalizeSelectedPlace(getAutocompleteValue(airport))) add(airport, message);
      else if (!entry.querySelector('.flight-time').value) add(entry.querySelector('.flight-time'), message);
    }
    for (const field of REQUIRED_LOCATIONS) {
      // A shown flight fills this end with its airport, and the flight line already asks for it.
      if (flights[field.key === 'startLocation' ? 'arrival' : 'departure'] || getLocationName(request[field.key])) continue;
      const control=root.getElementById(field.id);
      add(control, t('missingLocationError').replace('{0}', fieldLabelOf(control) || t(field.labelKey)));
    }
    const badStay=stayIssue(request.stays || [], request.date);
    if (badStay >= 0) add(root.querySelectorAll('.trip-stay .stay-checkin')[badStay], t('flowStayInvalid'));
    for (const control of root.querySelectorAll('#start-location, #end-location, .stay-location, .anchor-location, .daily-start-location, .daily-end-location')) {
      if (control.closest('.form-group')?.inert) continue; // locked to a flight's airport, which the flight line checks
      const value=getAutocompleteValue(control);
      const name=control.closest('.anchor-item')?.querySelector('.anchor-name').value.trim() || fieldLabelOf(control) || (control.matches('.stay-location') ? t('flowStays') : '');
      if (getLocationName(value) && !normalizeSelectedPlace(value)) add(control, name ? `${name}: ${t('flowPlaceFailed')}` : t('flowPlaceFailed'));
    }
    this._readAnchorRows().forEach((row, index) => {
      if (isAnchorBlank(row)) return;
      // Planning with a destination needs a searched place for every visit, fixed or automatic.
      const field=missingAnchorFields(row)[0] || (getLocationName(row.location) ? '' : 'location');
      if (!field) return;
      const control=row.el.querySelector(ANCHOR_FIELD_SELECTOR[field]);
      add(control, t('incompleteAnchorError').replace('{0}', String(index + 1)).replace('{1}', fieldLabelOf(control)));
    });
    return issues;
  }

  _showReviewIssues(issues, offerAuto = false) {
    const box=this.shadowRoot.getElementById('review-issues');
    box.hidden=!issues.length; box.replaceChildren();
    for (const { control, message } of issues) {
      const text=document.createElement('p'); text.textContent=message;
      const edit=document.createElement('button'); edit.type='button'; edit.textContent=t('flowEdit');
      edit.onclick=() => { this.hideReview(); this._revealInvalidField(control); };
      box.append(text, edit);
      const row=(offerAuto || control?.matches?.('.anchor-time, .anchor-end-time')) && control?.closest('.anchor-item');
      if (row) { const auto=document.createElement('button'); auto.type='button'; auto.textContent=t('flowAuto'); auto.onclick=() => { const toggle=row.querySelector('.anchor-flexible'); toggle.checked=true; toggle.dispatchEvent(new Event('change')); this.saveDraft(); this.showReview(); }; box.append(auto); }
    }
  }

  hideReview() {
    this.reviewing=false; this.shadowRoot.getElementById('review-panel').hidden=true; this.shadowRoot.getElementById('travel-form').hidden=false;
    this.draft = plannerDraftStore.update({step:'/plan'});
    animateScreen(this.shadowRoot.getElementById('travel-form'), true);
  }

  getFormData() {
    return getFormData(this.shadowRoot, this.draft);
  }

  // A flight decides the first day's start or the last day's end: lock that location and fill its time.
  syncFlights(target = null) {
    const root = this.shadowRoot;
    for (const [kind, locationId, day, edge] of [['arrival', 'start-location', 0, 'start'], ['departure', 'end-location', -1, 'end']]) {
      const entry = root.getElementById(`${kind}-flight`);
      const location = root.getElementById(locationId);
      location.closest('.form-group').inert = !entry.hidden;
      root.getElementById(`${locationId}-lock`).hidden = entry.hidden;
      root.getElementById(`add-${kind}-flight`).hidden = !entry.hidden;
      if (entry.hidden || !entry.contains(target)) continue;
      const airport = getAutocompleteValue(entry.querySelector('.flight-airport'));
      if (airport) restorePlaceInput(location, airport);
      const flightTime = entry.querySelector('.flight-time').value;
      const flightKind = entry.querySelector('.flight-kind').value;
      const time = kind === 'arrival' ? tripStartAfterLanding(flightTime, flightKind) : airportArrivalTime(flightTime, flightKind);
      const other = this.dayTimeInput(day, edge === 'start' ? 'end' : 'start').value;
      const note = entry.querySelector('.flight-note');
      if (!time || (other && (edge === 'start' ? time >= other : time <= other))) {
        note.textContent = flightTime ? t(kind === 'arrival' ? 'flightStartManual' : 'flightArrivalManual') : '';
        continue;
      }
      this.setDayTime(day, edge, time);
      note.textContent = t(kind === 'arrival' ? 'flightStartSet' : 'flightArrivalSet').replace('{0}', time);
    }
  }

  dayTimeInput(day, edge) {
    const root = this.shadowRoot;
    const rows = Array.from(root.querySelectorAll('.daily-time-row'));
    return rows.length > 1 && root.getElementById('daily-times-toggle').checked
      ? rows.at(day).querySelector(`.daily-${edge}-time`) : root.getElementById(`${edge}-time`);
  }

  // Only the first or last day changes, so shared multi-day times are split into per-day rows first.
  setDayTime(day, edge, value) {
    const root = this.shadowRoot;
    const rows = Array.from(root.querySelectorAll('.daily-time-row'));
    const toggle = root.getElementById('daily-times-toggle');
    if (rows.length > 1 && !toggle.checked) {
      rows.forEach(row => {
        row.querySelector('.daily-start-time').value = root.getElementById('start-time').value;
        row.querySelector('.daily-end-time').value = root.getElementById('end-time').value;
      });
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));
    }
    this.dayTimeInput(day, edge).value = value;
  }

  saveDraft() {
    this.draft = plannerDraftStore.save(this.getFormData());
    if (this.hasAttribute('handoff-flow')) {
      this.updateTripStayStatus();
      this.shadowRoot.getElementById('trip-end-date').value = this.draft.date.at(-1) || '';
      const btn = this.shadowRoot.getElementById('add-anchor-btn'); btn.dataset.i18n = this.shadowRoot.querySelector('.anchor-item') ? 'flowMoreAnchor' : 'flowAddAnchor'; btn.textContent = t(btn.dataset.i18n);
    }
    this.shadowRoot.getElementById('overnight-notice').hidden = !this.draft.overnightLocations.some(location => !getLocationName(location));
    this.updateDailyLocationSummary();
    this.renderPreferenceBadges();
  }

  updateOvernightFields() {
    const same = this.shadowRoot.getElementById('same-overnight-toggle').checked;
    this.shadowRoot.querySelectorAll('#overnight-locations .form-group').forEach((row, index) => {
      row.hidden = same && index > 0;
      row.querySelector('label').dataset.i18n = same ? 'sharedOvernightLocation' : 'overnightLocation';
    });
    this.shadowRoot.getElementById('overnight-notice').hidden = !this.draft.overnightLocations.some(location => !getLocationName(location));
  }

  setupEventListeners() {
    const stayDialog = this.shadowRoot.getElementById('stay-dialog');
    const stayRegion = this.shadowRoot.getElementById('stay-region');
    const stayChosen = this.shadowRoot.getElementById('stay-chosen');
    const bookingLink = this.shadowRoot.getElementById('stay-booking-link');
    let stayIndex = 0;
    let checkin = '';
    let checkout = '';
    bindPlaceSelection(stayChosen, () => {});
    this.shadowRoot.getElementById('close-stay').addEventListener('click', () => stayDialog.close());
    this.shadowRoot.getElementById('overnight-locations').addEventListener('click', event => {
      const button = event.target.closest('[data-find-stay]');
      if (!button) return;
      this.saveDraft();
      stayIndex = Number(button.dataset.findStay);
      checkin = this.draft.date[stayIndex];
      checkout = this.draft.date[this.draft.sameOvernightLocation ? this.draft.date.length - 1 : stayIndex + 1];
      const selected = this.draft.overnightLocations[stayIndex];
      stayRegion.value = selected?.formattedAddress || getLocationName(selected);
      restorePlaceInput(stayChosen, selected);
      bookingLink.hidden = true;
      bookingLink.removeAttribute('href');
      this.shadowRoot.getElementById('stay-dates').textContent = `${t('stayDates')} · ${checkin} → ${checkout}`;
      this.shadowRoot.getElementById('stay-tonight').hidden = checkin !== todayString();
      stayDialog.showModal();
      animateScreen(stayDialog, true);
    });
    this.shadowRoot.getElementById('stay-search-form').addEventListener('submit', event => {
      event.preventDefault();
      const region = stayRegion.value.trim();
      if (!region) { stayRegion.focus(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout) || checkout <= checkin || checkin < todayString()) {
        showErrorToast(t('stayInvalidDates'));
        return;
      }
      const url = new URL('https://www.booking.com/searchresults.html');
      url.search = new URLSearchParams({ ss: region, checkin, checkout,
        group_adults: this.shadowRoot.getElementById('stay-guests').value, no_rooms: '1', group_children: '0' });
      bookingLink.href = url.href;
      bookingLink.hidden = false;
    });
    this.shadowRoot.getElementById('stay-search-form').addEventListener('input', () => {
      bookingLink.hidden = true;
      bookingLink.removeAttribute('href');
    });
    this.shadowRoot.getElementById('apply-stay').addEventListener('click', async () => {
      const version = stayChosen.placeSelectionVersion;
      const night = stayIndex;
      await stayChosen.placeSelectionPending;
      if (!stayDialog.open || !this.isConnected || version !== stayChosen.placeSelectionVersion || night !== stayIndex) return;
      const location = getAutocompleteValue(stayChosen);
      if (!getLocationName(location) || stayChosen.placeSelectionError) {
        showErrorToast(t('stayInputRequired'));
        stayChosen.focus();
        return;
      }
      const stays = Array.from(this.shadowRoot.querySelectorAll('.overnight-location'));
      const targets = this.draft.sameOvernightLocation ? stays : [stays[stayIndex]];
      targets.forEach(input => restorePlaceInput(input, location));
      this.saveDraft();
      stayDialog.close();
    });
    const discoveryDialog = this.shadowRoot.getElementById('discovery-dialog');
    const citySelect = this.shadowRoot.getElementById('discovery-city');
    const suggestions = this.shadowRoot.getElementById('destination-suggestions');
    const placeContainer = this.shadowRoot.getElementById('discovery-places');
    const routeControls = this.shadowRoot.getElementById('route-discovery-controls');
    const routeStatus = this.shadowRoot.getElementById('route-discovery-status');
    const routeButton = this.shadowRoot.getElementById('find-route-stops');
    const cityGroup = this.shadowRoot.getElementById('discovery-city-group');
    let routeVersion = 0;
    let routeSuggestions = [];
    const clearRouteResults = () => {
      routeVersion++;
      routeSuggestions = [];
      routeStatus.textContent = '';
      routeButton.disabled = false;
      placeContainer.replaceChildren();
    };
    discoveryDialog.addEventListener('close', clearRouteResults);
    this.shadowRoot.getElementById('discovery-day').addEventListener('change', () => {
      if (!routeControls.hidden) clearRouteResults();
    });
    routeButton.addEventListener('click', async () => {
      clearRouteResults();
      const version = routeVersion;
      const request = this.getFormData();
      const signature = JSON.stringify(request);
      const day = Number(this.shadowRoot.getElementById('discovery-day').value);
      routeButton.disabled = true;
      routeStatus.textContent = t('routeDiscoveryLoading');
      try {
        const {findRouteStops} = await import('../services/route-discovery.js');
        const result = await findRouteStops(request, day);
        if (!discoveryDialog.open || !this.isConnected || version !== routeVersion) return;
        if (signature !== JSON.stringify(this.getFormData())) {
          clearRouteResults();
          routeStatus.textContent = t('routeDiscoveryChanged');
          return;
        }
        routeStatus.textContent = t({ready:'routeDiscoveryReady', empty:'routeDiscoveryEmpty',
          'missing-input':'routeDiscoveryMissing', unavailable:'routeDiscoveryUnavailable'}[result.status]);
        routeSuggestions = result.suggestions;
        routeSuggestions.forEach((suggestion, index) => {
          const article = document.createElement('article');
          article.className = 'form-group';
          const title = document.createElement('h3');
          title.textContent = suggestion.visit.name;
          const details = document.createElement('p');
          details.textContent = `${suggestion.from} → ${suggestion.to} · ${t('routeDiscoveryDetour').replace('{0}', suggestion.detourMinutes)} · ${suggestion.time}–${suggestion.endTime}`;
          const address = document.createElement('p');
          address.textContent = suggestion.visit.location.formattedAddress;
          const hours = document.createElement('p');
          hours.textContent = t(suggestion.hours === 'unknown' ? 'routeDiscoveryHoursUnknown' : 'routeDiscoveryHours');
          const link = document.createElement('a');
          const url = new URL('https://www.google.com/maps/search/');
          url.search = new URLSearchParams({api:'1', query:suggestion.visit.name, query_place_id:suggestion.visit.location.placeId});
          link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
          link.textContent = t('routeDiscoveryPlaceDetails');
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'secondary-btn';
          button.dataset.routePick = index; button.textContent = t('routeDiscoveryAdd');
          button.addEventListener('click', () => {
            if (version !== routeVersion || signature !== JSON.stringify(this.getFormData())) {
              clearRouteResults(); routeStatus.textContent = t('routeDiscoveryChanged'); return;
            }
            const visit = routeSuggestions[index].visit;
            const anchors = [...request.anchorSchedules];
            if (!anchors.some(anchor => anchor.location?.placeId === visit.location.placeId)) anchors.push(visit);
            this.populateForm({...request, anchorSchedules:anchors});
            discoveryDialog.close();
          });
          article.append(title, details, address, hours, link, button);
          placeContainer.append(article);
        });
      } catch {
        if (version === routeVersion && discoveryDialog.open) routeStatus.textContent = t('routeDiscoveryUnavailable');
      } finally { if (version === routeVersion) routeButton.disabled = false; }
    });
    this.shadowRoot.getElementById('close-discovery').addEventListener('click', () => discoveryDialog.close());
    this.shadowRoot.getElementById('where-to-go').addEventListener('click', async () => {
      this.saveDraft();
      const button = this.shadowRoot.getElementById('where-to-go');
      button.disabled = true;
      try {
        await import('./home-recommendations.js');
        citySelect.replaceChildren(new Option(t('chooseCity'), ''), ...cities.map(city => new Option(t(city.key), city.id)));
        const days = this.shadowRoot.getElementById('discovery-day');
        days.replaceChildren(...this.draft.date.map((date, index) => new Option(`${t('day_n').replace('{0}', index + 1)} · ${date}`, String(index + 1))));
        clearRouteResults();
        routeControls.hidden = true;
        cityGroup.hidden = false;
        suggestions.replaceChildren();
        this.shadowRoot.getElementById('discovery-options').hidden = true;
        discoveryDialog.querySelectorAll('[data-discovery-mode]').forEach(button => button.setAttribute('aria-pressed', 'false'));
        if (this.isConnected) { discoveryDialog.showModal(); animateScreen(discoveryDialog, true); }
      } catch {
        showErrorToast(t('discoveryLoadError'));
      } finally { button.disabled = false; }
    });
    discoveryDialog.addEventListener('click', event => {
      const mode = event.target.closest('[data-discovery-mode]');
      const cityButton = event.target.closest('[data-destination-city]');
      if (cityButton) {
        citySelect.value = cityButton.dataset.destinationCity;
        citySelect.dispatchEvent(new Event('change'));
      }
      if (!mode) return;
      clearRouteResults();
      routeControls.hidden = mode.dataset.discoveryMode !== 'stops';
      cityGroup.hidden = mode.dataset.discoveryMode === 'stops';
      discoveryDialog.querySelectorAll('[data-discovery-mode]').forEach(button => button.setAttribute('aria-pressed', String(button === mode)));
      this.shadowRoot.getElementById('discovery-options').hidden = false;
      placeContainer.replaceChildren();
      suggestions.replaceChildren();
      citySelect.value = '';
      if (mode.dataset.discoveryMode === 'destination') {
        cities.forEach(city => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'secondary-btn';
          button.dataset.destinationCity = city.id;
          button.textContent = `${t(city.key)} · ${t(city.pairReason)}`;
          suggestions.append(button);
        });
      }
    });
    citySelect.addEventListener('change', () => {
      const index = cities.findIndex(city => city.id === citySelect.value);
      placeContainer.replaceChildren();
      if (index < 0) return;
      const recommendations = document.createElement('home-recommendations');
      recommendations.setAttribute('planner-pick', '');
      placeContainer.append(recommendations);
      recommendations.showCity(index);
      // Keep the destination selector authoritative within the planner dialog.
      recommendations.shadowRoot.querySelector('.cities').style.display = 'none';
      suggestions.replaceChildren();
      recommendations.addEventListener('places-picked', event => {
        const day = Number(this.shadowRoot.getElementById('discovery-day').value);
        const draft = plannerDraftStore.read();
        const anchors = [...draft.anchorSchedules];
        event.detail.forEach(visit => {
          if (!anchors.some(anchor => anchor.name === visit.name && getLocationName(anchor.location) === visit.location)) anchors.push({ ...visit, day });
        });
        this.populateForm({ ...draft, anchorSchedules: anchors });
        discoveryDialog.close();
      });
    });
    this.shadowRoot.getElementById('remove-waypoint').addEventListener('click', () => {
      this.draft.selectedWaypoints = [];
      this.shadowRoot.getElementById('selected-waypoint').hidden = true;
      this.saveDraft();
    });
    this.shadowRoot.getElementById('add-anchor-btn').addEventListener('click', () => {
      this.addAnchor();
      this.saveDraft();
    });

    const preferenceBtn = this.shadowRoot.getElementById('reselect-preference-btn');
    this.shadowRoot.getElementById('reselect-date-btn').onclick = () => {
      this.saveDraft();
      window.navigate('/preference/1', { state: { returnTo: '/plan' } });
    };
    if (preferenceBtn) {
      preferenceBtn.addEventListener('click', () => {
        this.saveDraft();
        window.navigate('/preference/2', { state: { returnTo: '/plan' } });
      });
    }

    const form = this.shadowRoot.getElementById('travel-form');
    if (this.hasAttribute('handoff-flow')) form.noValidate = true;
    this.shadowRoot.getElementById('change-trip-destination').onclick = () => { this.saveDraft(); window.navigate('/destination', { state: { returnTo: '/plan' } }); };
    this.shadowRoot.getElementById('add-trip-stay').onclick = () => this.addTripStay();
    for (const kind of ['arrival', 'departure']) {
      const entry = this.shadowRoot.getElementById(`${kind}-flight`);
      this.shadowRoot.getElementById(`add-${kind}-flight`).onclick = () => {
        entry.hidden = false;
        this.syncFlights();
        this.saveDraft();
        entry.querySelector('.flight-airport input')?.focus();
      };
      entry.querySelector('.flight-remove').onclick = () => {
        entry.hidden = true;
        restorePlaceInput(entry.querySelector('.flight-airport'), '');
        entry.querySelector('.flight-time').value = '';
        entry.querySelector('.flight-note').textContent = '';
        this.syncFlights();
        this.saveDraft();
      };
    }

    // 브라우저 기본 검사는 Shadow DOM 안에서 사실상 보이지 않는다.
    // `invalid` 는 거품처럼 위로 오르지 않으므로 폼에서 받으려면 캡처 단계여야 한다.
    // 무엇보다 걸린 칸이 접힌 아래에 있으면(실측: top 887 / 화면 높이 932)
    // 사용자 눈에는 버튼이 죽은 것으로 보인다. 그래서 우리가 그 칸까지 데려간다.
    let revealedThisRound = false;
    form.addEventListener('invalid', (e) => {
      e.preventDefault(); // 믿을 수 없는 기본 말풍선 대신 우리 안내를 쓴다
      // 한 번 누르면 걸린 칸마다 하나씩 쏜다 — 첫 칸만 데려가고 나머지는 흘린다.
      // (그 무더기는 한 작업 안에서 연달아 오므로 마이크로태스크면 충분히 뒤다)
      if (revealedThisRound) return;
      revealedThisRound = true;
      queueMicrotask(() => { revealedThisRound = false; });

      const control = e.target;
      this._revealInvalidField(control, invalidFieldMessage(control));
    }, true);

    // Auto-save form data on any input
    form.addEventListener('input', (e) => {
      // 고치기 시작했으면 걸렸던 표시는 즉시 거둔다.
      if (e.target?.hasAttribute?.('aria-invalid')) e.target.removeAttribute('aria-invalid');
      this.syncFlights(e.target);
      if (e.target.id !== 'same-overnight-toggle') this.saveDraft();
    });

    this.shadowRoot.getElementById('daily-locations-toggle').addEventListener('change', event => {
      this.shadowRoot.getElementById('daily-locations-panel').hidden = !event.target.checked;
      if (!event.target.checked) {
        this.shadowRoot.querySelectorAll('.daily-start-location, .daily-end-location')
          .forEach(input => restorePlaceInput(input, ''));
      }
      this.saveDraft();
      this.updateTexts();
    });

    this.shadowRoot.getElementById('same-overnight-toggle').addEventListener('change', () => {
      const stays = Array.from(this.shadowRoot.querySelectorAll('.overnight-location'));
      const location = getAutocompleteValue(stays[0]);
      stays.slice(1).forEach(element => restorePlaceInput(element, location));
      this.saveDraft();
      this.updateOvernightFields();
      this.updateTexts();
    });
    
    const dailyToggle = this.shadowRoot.getElementById('daily-times-toggle');
    const dailyAccordion = this.shadowRoot.getElementById('daily-times-accordion');
    const globalInputs = this.shadowRoot.querySelectorAll('.global-time-input');
    
    if (dailyToggle) {
      dailyToggle.addEventListener('change', (e) => {
        const timeSettings = dailyToggle.closest('.time-settings');
        timeSettings.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
        if (e.target.checked) {
          dailyAccordion.style.display = 'block';
          
          const dailyInputs = dailyAccordion.querySelectorAll('input');
          dailyInputs.forEach(input => input.required = true);

          globalInputs.forEach(el => {
            el.style.display = 'none';
            const input = el.querySelector('input');
            if (input) input.required = false;
          });
        } else {
          dailyAccordion.style.display = 'none';

          const dailyInputs = dailyAccordion.querySelectorAll('input');
          dailyInputs.forEach(input => input.required = false);

          globalInputs.forEach(el => {
            el.style.display = 'block';
            const input = el.querySelector('input');
            if (input) input.required = true;
          });
        }
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const visibleTimes = e.target.checked ? [dailyAccordion] : Array.from(globalInputs);
          visibleTimes.forEach(element => element.animate([
            { opacity: 0, transform: 'translateY(-8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ], { duration: 240, easing: 'ease-out' }));
        }
        form.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    // Reset Form Event
    this.shadowRoot.getElementById('reset-btn').addEventListener('click', () => {
      // 1. Reset standard inputs and clear native validation states
      form.reset();

      // 2. Clear Google Autocomplete values
      const autocompletes = this.shadowRoot.querySelectorAll('gmp-place-autocomplete');
      autocompletes.forEach(ac => ac.value = '');

      // 3. Clear dynamic anchors entirely (Opt-in)
      const container = this.shadowRoot.getElementById('anchors-container');
      container.innerHTML = '';
      this.anchorCount = 0;

      // 4. Clear specific error classes or inline borders just in case
      const allInputs = this.shadowRoot.querySelectorAll('input');
      allInputs.forEach(input => {
        input.removeAttribute('aria-invalid');
        input.style.borderColor = '';
      });

      // 날짜·선호는 유지하고 상세 입력만 비운다. 복원도 같은 빈 초안을 쓴다.
      this.populateForm(plannerDraftStore.resetDetails(), { persist: false });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (this.hasAttribute('handoff-flow') && !this.reviewing) {
        // A pick still loading would be reviewed as typed text and listed as unverified.
        const discarded = this.discardCount;
        await Promise.all(Array.from(this.shadowRoot.querySelectorAll('gmp-place-autocomplete')).map(element => element.placeSelectionPending));
        if (discarded !== this.discardCount) return; // the draft was deleted while a pick loaded
        this.saveDraft(); this.showReview(); return;
      }
      if (this.isSubmitting) {
        console.log('Already submitting, preventing duplicate request...');
        return;
      }

      

      this.isSubmitting = true;
      const btn = this.shadowRoot.querySelector('.primary-btn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Planning... ⏳';
        btn.style.opacity = '0.7';
        btn.style.cursor = 'not-allowed';
      }
      // The checks before generation can take seconds, so the review's button says so.
      const generate = this.reviewing && this.shadowRoot.getElementById('final-generate');
      if (generate) { generate.disabled = true; generate.textContent = t('flowChecking'); }

      try {
      await Promise.all(Array.from(this.shadowRoot.querySelectorAll('gmp-place-autocomplete'))
        .map(element => element.placeSelectionPending));
      if (Array.from(this.shadowRoot.querySelectorAll('gmp-place-autocomplete')).some(element => element.placeSelectionError)) {
        showErrorToast(t('flowPlaceFailed'));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }
      let plannerRequest = this.getFormData();
      this.draft = plannerDraftStore.save(plannerRequest);

      // --- Date Validation ---
      // 과거 날짜로 만들면 화면 날짜와 실제 계산되는 경로가 어긋난다
      // (transit-time.mjs 가 지난 출발 시각을 다음 주로 밀어 조회한다).
      const pastDate = (Array.isArray(plannerRequest.date) ? plannerRequest.date : [plannerRequest.date]).find(date => date < localTravelDate(new Date(), travelRegion(plannerRequest).timeZone));
      if (pastDate) {
        showErrorToast(t('pastDateValidationError').replace('{0}', pastDate));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }

      // A shown flight needs its airport and time; the airport also fills the locked first or last location.
      let flightIssue = null;
      for (const kind of ['arrival', 'departure']) {
        const entry = this.shadowRoot.getElementById(`${kind}-flight`);
        if (entry.hidden || flightIssue) continue;
        const airport = getAutocompleteValue(entry.querySelector('.flight-airport'));
        if (!getLocationName(airport) || (this.hasAttribute('handoff-flow') && !normalizeSelectedPlace(airport))) flightIssue = entry.querySelector('.flight-airport');
        else if (!entry.querySelector('.flight-time').value) flightIssue = entry.querySelector('.flight-time');
      }
      if (flightIssue) {
        this._revealInvalidField(flightIssue, t('incompleteFlightError'));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }
      // 출발·도착 장소. 이 칸들은 커스텀 엘리먼트라 브라우저 기본 검사가
      // 못 본다 — required 를 붙여도 소용없다. 여기서 막지 않으면 빈 채로
      // 흘러가, AI 는 출발지를 "Unknown" 으로 듣고 경계 보정은 통째로 꺼진다.
      const missingLocation = findMissingLocation(plannerRequest);
      if (missingLocation) {
        const control = this.shadowRoot.getElementById(missingLocation.id);
        this._revealInvalidField(control, t('missingLocationError')
          .replace('{0}', fieldLabelOf(control) || t(missingLocation.labelKey)));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }
      if (this.hasAttribute('handoff-flow')) {
        if (stayIssue(plannerRequest.stays || [], plannerRequest.date) >= 0) { this._revealInvalidField(this.shadowRoot.getElementById('add-trip-stay'), t('flowStayInvalid')); this._resetSubmitButton(btn); this.isSubmitting = false; return; }
        const placeControls = Array.from(this.shadowRoot.querySelectorAll('#start-location, #end-location, .stay-location, .anchor-location, .daily-start-location, .daily-end-location')).filter(el => getLocationName(getAutocompleteValue(el)) || ['start-location', 'end-location'].includes(el.id));
        const invalidPlace = placeControls.find(el => !normalizeSelectedPlace(getAutocompleteValue(el)));
        if (invalidPlace) { this._revealInvalidField(invalidPlace, t('flowPlaceFailed')); this._resetSubmitButton(btn); this.isSubmitting = false; return; }
      }
      const missingNight = !this.hasAttribute('handoff-flow') && Array.isArray(plannerRequest.date) && plannerRequest.date.length > 1
        ? plannerRequest.overnightLocations.findIndex(location => !getLocationName(location)) : -1;
      if (missingNight >= 0) {
        const control = this.shadowRoot.querySelectorAll('.overnight-location')[plannerRequest.sameOvernightLocation ? 0 : missingNight];
        this._revealInvalidField(control, t('missingLocationError')
          .replace('{0}', fieldLabelOf(control)));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }

      // 손댔지만 덜 찬 고정 일정. 화면에 보이는 줄을 그대로 읽는다 —
      // plannerRequest.anchorSchedules 는 빈 줄이 이미 걸러져 번호가 어긋난다.
      const anchorRows = this._readAnchorRows();
      const incomplete = findIncompleteAnchor(anchorRows);
      if (incomplete) {
        const control = anchorRows[incomplete.index].el
          .querySelector(ANCHOR_FIELD_SELECTOR[incomplete.field]);
        this._revealInvalidField(control, t('incompleteAnchorError')
          .replace('{0}', String(incomplete.index + 1))
          .replace('{1}', fieldLabelOf(control)));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }

      if (this.hasAttribute('handoff-flow')) {
        const issue = await findFixedVisitIssue(plannerRequest, createFlexibleVisitChecks(Math.max(1, plannerRequest.anchorSchedules.length), plannerRequest));
        if (issue) {
          const row = anchorRows.find(row => row.name===issue.anchor.name && row.day===issue.day);
          this._revealInvalidField(row?.el.querySelector('.anchor-time'), t({time:'plannerAnchorError',overlap:'flowOverlap',route:'flexibleVisitRouteError',travel:'flowTravelTime',bounds:'plannerAnchorBoundsError',hours:'flexibleVisitHoursError'}[issue.reason]));
          this._resetSubmitButton(btn);this.isSubmitting=false;return;
        }
      }
      const flexibleCount = plannerRequest.anchorSchedules.filter(anchor => anchor.flexible).length;
      const placement = await scheduleFlexibleVisits(plannerRequest,
        flexibleCount ? createFlexibleVisitChecks(flexibleCount, plannerRequest) : {});
      if (placement.issue) {
        const control = anchorRows.filter(row => !isAnchorBlank(row))[placement.issue.anchorIndex]?.el.querySelector('.anchor-name');
        const messageKey = { 'flexible-visit-route': 'flexibleVisitRouteError',
          'flexible-visit-hours': 'flexibleVisitHoursError' }[placement.issue.reason] || 'flexibleVisitSpaceError';
        this._revealInvalidField(control, t(messageKey));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }
      plannerRequest = placement.request;

      // Same canonical contract as the server, including each anchor's own
      // day's custom times. DOM-only checks above preserve precise row feedback.
      const issue = findPlannerInputIssue(plannerRequest);
      if (issue) {
        const fieldIds = { date: 'schedule-date', startTime: 'start-time', endTime: 'end-time',
          startLocation: 'start-location', endLocation: 'end-location' };
        let control = this.shadowRoot.getElementById(fieldIds[issue.field] || 'schedule-date');
        if (issue.field === 'startTime' || issue.field === 'endTime') {
          if (plannerRequest.dailyTimes?.some(dt => dt.isCustom)) {
            const selector = issue.field === 'startTime' ? '.daily-start-time' : '.daily-end-time';
            control = this.shadowRoot.querySelector(`.daily-time-row[data-day="${issue.day}"] ${selector}`) || control;
          }
        }
        if (issue.anchorIndex !== undefined) {
          const row = anchorRows.filter(row => row.day === issue.day && !isAnchorBlank(row))[issue.anchorIndex];
          control = row?.el.querySelector(ANCHOR_FIELD_SELECTOR[issue.field] || '.anchor-day') || control;
        } else if (issue.reason === 'anchor-limit' || issue.reason === 'anchor-day') {
          control = this.shadowRoot.getElementById('add-anchor-btn');
        }
        this._revealInvalidField(control, plannerValidationMessage(issue));
        this._resetSubmitButton(btn);
        this.isSubmitting = false;
        return;
      }
      // --- End Validation ---

      

      console.log('Dispatching generation event:', plannerRequest);
      
      trackEvent('generate_itinerary_click');

      // Dispatch custom event reaching up through the DOM
      this.dispatchEvent(new CustomEvent('generate-itinerary', {
        detail: plannerRequest,
        bubbles: true,
        composed: true // Allows event to pass through shadow DOM boundary
      }));
      } catch (error) {
        console.error('Planner validation failed:', error);
        this._revealInvalidField(null, t('shellGenerationFailed'));
        this._resetSubmitButton(btn); this.isSubmitting = false;
      }
    });
  }

  /**
   * 화면에 보이는 순서 그대로의 고정 일정 줄. 빈 줄도 세어 둔다 —
   * 사용자에게 "두 번째 고정 일정"이라고 말하려면 번호가 화면과 같아야 한다.
   */
  _readAnchorRows() {
    return Array.from(this.shadowRoot.querySelectorAll('.anchor-item')).map((el) => ({
      el,
      day: Number(el.querySelector('.anchor-day')?.value || 1),
      name: el.querySelector('.anchor-name')?.value || '',
      time: el.querySelector('.anchor-time')?.value || '',
      endTime: el.querySelector('.anchor-end-time')?.value || '',
      location: getAutocompleteValue(el.querySelector('.anchor-location')),
      flexible: el.querySelector('.anchor-flexible')?.checked === true
    }));
  }

  /**
   * 막혔다는 사실을 눈에 보이게 한다: 말로 한 번(토스트), 자리로 한 번(스크롤·초점),
   * 그리고 그 칸에 표시를 남긴다(aria-invalid — 보조기기도 읽는다).
   */
  _revealInvalidField(control, message) {
    // The review lists the issue inline, so a toast there would only repeat it and outlive the fix.
    if (this.reviewing) {
      this._showReviewIssues([{ control, message }], true);
      this.shadowRoot.getElementById('review-issues').scrollIntoView({ block: 'center', behavior: 'auto' });
      return;
    }
    if (message) showErrorToast(message);
    if (!control) return;
    // 표시는 늘 한 칸에만. 앞서 걸렸던 칸을 그대로 두면 "지금 막고 있는 것"이
    // 둘로 보인다 — 값이 코드로 바뀌어 input 이 안 뜬 경우에도 남는다.
    this.shadowRoot.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    control.setAttribute('aria-invalid', 'true');
    control.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // 스크롤과 다투지 않게 초점만 옮긴다. 장소 칸은 껍데기가 커스텀
    // 엘리먼트라 껍데기에 초점을 줘 봐야 커서가 안 뜬다 — 안쪽 input 을
    // 찾아 준다(getAutocompleteValue 가 값을 읽는 자리와 같은 곳이다).
    const focusTarget = control.shadowRoot?.querySelector('input')
      || control.querySelector?.('input')
      || control;
    focusTarget.focus?.({ preventScroll: true });
  }

  _resetSubmitButton(btn) {
    this.isSubmitting = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = t(this.hasAttribute('handoff-flow') ? 'flowReview' : 'generateBtn');
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
    const generate = this.shadowRoot.getElementById('final-generate');
    if (generate) { generate.textContent = t('flowGenerate'); this.renderGenerationCredits(); }
  }

  }

customElements.define('travel-form', TravelForm);
