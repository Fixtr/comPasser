import { t } from '../../../utils/i18n.js';
import { travelFormStyles } from './travel-form-style.js';
import { stepProgressStyles, stepProgressHtml } from './step-progress.js';

export function travelFormTemplate(view) {
  return `
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
        :is(button,input,select,summary):focus-visible { outline: 3px solid var(--cp-ink); outline-offset: 3px; }
        /* Each group folds to one line; open, the fields speak for themselves and the line hides. No overflow clip: place lists drop below their field. */
        .plan-group > summary { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 12px; min-height: 44px; margin-bottom: 0.75rem; cursor: pointer; list-style: none; }
        .plan-group > summary::-webkit-details-marker { display: none; }
        .plan-group > summary::after { content: '›'; grid-column: 2; grid-row: 1; font-size: 1.25rem; color: var(--cp-muted); transform: rotate(90deg); }
        .plan-group[open] > summary::after { transform: rotate(-90deg); }
        /* The value sits on its own line under the title, so long English or several places never squeeze beside it. */
        .plan-group-label, .plan-group > summary h2 { grid-column: 1; grid-row: 1; margin: 0; padding: 0; border: 0; font-size: 1rem; font-weight: 700; color: var(--cp-ink); }
        .plan-group-value { grid-column: 1 / -1; grid-row: 2; margin-top: 4px; color: var(--cp-ink-2); white-space: pre-line; overflow-wrap: anywhere; }
        .plan-group-value:empty { display: none; }
        .plan-group[open] .plan-group-value { display: none; }
        /* The stays group's summary already names it. */
        .plan-group #trip-stays > h3 { display: none; }

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
        ${view.hasAttribute('handoff-flow') ? stepProgressHtml(6) : ''}
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
          <details class="plan-group" data-group="time" open><summary><span class="plan-group-label" data-i18n="planGroupTime">${t('planGroupTime')}</span><span class="plan-group-value"></span></summary>
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
          </details>
          
          <details class="plan-group" data-group="endpoints" open><summary><span class="plan-group-label" data-i18n="reviewEndpoints">${t('reviewEndpoints')}</span><span class="plan-group-value"></span></summary>
          <div class="row-2">
            <div class="form-group">
              <div class="location-heading">
              <label for="start-location" data-i18n="startLocation">Start Location (e.g., Hotel)</label>
                <button type="button" id="where-to-go" class="link-btn" data-i18n="whereToGo">어디로 갈까?</button>
              </div>
              <gmp-place-autocomplete id="start-location" data-i18n-placeholder="startLocationPlaceholder" placeholder="${t('startLocationPlaceholder')}"></gmp-place-autocomplete>
              <p id="start-location-lock" class="subtitle" data-i18n="flightLocksStart" hidden></p>
              <p id="airport-start-hint" class="subtitle" data-i18n="airportStartHint" hidden></p>
            </div>
            <div class="form-group">
              <div class="location-heading">
                <label for="end-location" data-i18n="endLocation">End Location (e.g., Hotel/Airport)</label>
              </div>
              <gmp-place-autocomplete id="end-location" data-i18n-placeholder="endLocationPlaceholder" placeholder="${t('endLocationPlaceholder')}"></gmp-place-autocomplete>
              <p id="end-location-lock" class="subtitle" data-i18n="flightLocksEnd" hidden></p>
            </div>
          </div>
          </details>
          <div id="overnight-wrapper" hidden>
            <details class="plan-group" data-group="stays" open><summary><span class="plan-group-label" data-i18n="flowStays">${t('flowStays')}</span><span class="plan-group-value"></span></summary>
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
            </details>
          </div>
          <p id="selected-waypoint" class="subtitle" hidden><strong data-i18n="discoverWaypointLabel">방문할 곳</strong>: <span id="selected-waypoint-name"></span>
            <button type="button" id="remove-waypoint" class="link-btn" data-i18n="discoverWaypointRemove">제외</button>
          </p>
        </div>

        <div class="form-section" id="flights-section">
          <details class="plan-group" data-group="flights" open><summary><h2><span data-i18n="flightsTitle">${t('flightsTitle')}</span> <span class="optional-note">(<span data-i18n="flowOptional">${t('flowOptional')}</span>)</span></h2><span class="plan-group-value"></span></summary>
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
          </details>
        </div>

        <div class="form-section">
          <details class="plan-group" data-group="places" open><summary><h2><span data-i18n="anchorTitle">${t('anchorTitle')}</span> <span class="optional-note">(<span data-i18n="flowOptional">${t('flowOptional')}</span>)</span></h2><span class="plan-group-value"></span></summary>
          <p class="subtitle" data-i18n="anchorSubtitle">Fixed schedule items to build around (e.g., Concert at 7PM, Dinner reservation)</p>
          
          <div id="anchors-container"></div>
          
          ${view.hasAttribute('handoff-flow') ? `<button type="button" id="add-reservation-btn" class="secondary-btn" data-i18n="flowAddReservation">${t('flowAddReservation')}</button>` : ''}
          <button type="button" id="add-anchor-btn" class="secondary-btn" data-i18n="${view.hasAttribute('handoff-flow') ? 'flowAddAnchor' : 'addAnchor'}">${t(view.hasAttribute('handoff-flow') ? 'flowAddAnchor' : 'addAnchor')}</button>
          </details>
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
}
