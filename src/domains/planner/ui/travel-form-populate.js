import { t, getLang } from '../../../utils/i18n.js';
import { restorePlaceInput } from '../services/selected-place.mjs';
import { plannerDraftStore, toPlannerDraft, spreadVisitDays } from '../services/planner-draft.mjs';

export function addAnchor(view, data = null) {
  view.anchorCount++;
  const container = view.shadowRoot.getElementById('anchors-container');
  const id = `anchor-${Date.now()}`;

  const daysCount = Math.max(view.draft.date.length, 1);

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
    view.shadowRoot.getElementById('travel-form').dispatchEvent(new Event('input', { bubbles: true }));
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
  flexibleToggle.checked = data?.flexible === true || (!data && view.hasAttribute('handoff-flow'));
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
    view.shadowRoot.getElementById('travel-form').dispatchEvent(new Event('input', { bubbles: true }));
  });

  container.appendChild(template);

  // Bind autocomplete to the new element
  const newAutocomplete = template.querySelector('.anchor-location');
  if (newAutocomplete) {
    view.setupAutocompleteListener(newAutocomplete);
  }
}

function fillDates(view, requestData) {
  // 3. Inject basic fields safely
  const setVal = (id, val) => {
    const el = view.shadowRoot.getElementById(id);
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
  if (view.hasAttribute('handoff-flow')) {
    const dateInput = view.shadowRoot.getElementById('schedule-date');
    dateInput.type = 'text'; dateInput.readOnly = true; dateInput.value = requestData.date[0] || '';
    view.shadowRoot.querySelector('label[for="schedule-date"]').dataset.i18n = 'flowStartDate';
    view.shadowRoot.getElementById('trip-end-date').value = requestData.date.at(-1) || '';
    view.renderTripStays();
  }
  view.syncDateFloor();
  setVal('start-time', requestData?.startTime);
  setVal('end-time', requestData?.endTime);
}

function fillEndpoints(view, requestData) {
  // 💎 핵심 3: Autocomplete 컴포넌트의 가시적인 값도 즉시 업데이트 💎
  const startAC = view.shadowRoot.getElementById('start-location');
  const endAC = view.shadowRoot.getElementById('end-location');
  restorePlaceInput(startAC, requestData?.startLocation || '');
  restorePlaceInput(endAC, requestData?.endLocation || '');
  for (const kind of ['arrival', 'departure']) {
    const entry = view.shadowRoot.getElementById(`${kind}-flight`);
    const flight = requestData?.flights?.[kind];
    entry.hidden = !flight;
    restorePlaceInput(entry.querySelector('.flight-airport'), flight?.airport || '');
    entry.querySelector('.flight-time').value = flight?.time || '';
    entry.querySelector('.flight-kind').value = flight?.kind || 'international';
    entry.querySelector('.flight-note').textContent = '';
  }
  view.syncFlights();
  const waypoint = requestData.selectedWaypoints?.[0];
  view.shadowRoot.getElementById('selected-waypoint').hidden = !waypoint;
  view.shadowRoot.getElementById('selected-waypoint-name').textContent = waypoint?.name || '';
}

function fillDailyTimes(view, requestData) {
  // 💎 다일차 로직 처리 💎
  const dateVal = requestData?.date || requestData?.datePref;
  const dailyTimesWrapper = view.shadowRoot.getElementById('daily-times-wrapper');
  const dailyTimesAccordion = view.shadowRoot.getElementById('daily-times-accordion');
  const dailyTimesToggle = view.shadowRoot.getElementById('daily-times-toggle');
  const globalInputs = view.shadowRoot.querySelectorAll('.global-time-input');

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
  return { isMultiDay, daysCount };
}

function fillOvernightLocations(view, isMultiDay, daysCount) {
  const overnightWrapper = view.shadowRoot.getElementById('overnight-wrapper');
  const overnightContainer = view.shadowRoot.getElementById('overnight-locations');
  view.shadowRoot.getElementById('same-overnight-toggle').checked = view.draft.sameOvernightLocation;
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
      restorePlaceInput(autocomplete, view.draft.overnightLocations[index] || '');
      if (view._placesReady) view.setupAutocompleteListener(autocomplete);
    }
  }
}

export function populateForm(view, requestData, { persist = true } = {}) {
  if (!requestData) return;

  // Picks arrive without a day; the form spreads them once the trip dates are known.
  const draft = spreadVisitDays(toPlannerDraft(requestData));
  view.draft = persist ? plannerDraftStore.save(draft) : draft;
  requestData = view.draft;

  try {
    // 1. Reset Form
    const form = view.shadowRoot.getElementById('travel-form');
    if (form) form.reset();

    // 2. Clear old anchors
    const container = view.shadowRoot.getElementById('anchors-container');
    if (container) container.innerHTML = '';
    view.anchorCount = 0;

    fillDates(view, requestData);
    fillEndpoints(view, requestData);

    // 4. Inject Anchors dynamically safely
    if (requestData?.anchorSchedules && Array.isArray(requestData.anchorSchedules) && requestData.anchorSchedules.length > 0) {
      requestData.anchorSchedules.forEach(anchor => {
        if (anchor) view.addAnchor(anchor);
      });
    }

    const { isMultiDay, daysCount } = fillDailyTimes(view, requestData);
    fillOvernightLocations(view, isMultiDay, daysCount);
    view.shadowRoot.querySelector('label[for="start-location"]').dataset.i18n = isMultiDay || view.hasAttribute('handoff-flow') ? 'tripStartLocation' : 'startLocation';
    view.shadowRoot.querySelector('label[for="end-location"]').dataset.i18n = isMultiDay || view.hasAttribute('handoff-flow') ? 'tripEndLocation' : 'endLocation';
    view.renderDailyLocations();
    view.syncFlights(); // Day 1's override row exists only now; the airport-start hint reads it.
    view.updateOvernightFields();
    view.renderPreferenceBadges();
    view.updateTexts(); // 번역 텍스트 업데이트
  } catch (error) {
    console.error("[Auto-fill Error] Failed to populate form:", error);
  }
}
