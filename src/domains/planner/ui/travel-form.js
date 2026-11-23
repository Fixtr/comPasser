import { dateRange, travelRegion, localTravelDate } from '../../../../functions/travel-region.mjs';
import { stayIssue } from '../services/trip-stays.mjs';
import { destinationById } from '../services/travel-destinations.mjs';
import { normalizeSelectedPlace } from '../services/selected-place.mjs';
import { escapeHtml } from '../../../utils/html-safety.mjs';
import { t, getLang, applyTranslations } from '../../../utils/i18n.js';
import { getMapsLoader } from '../../map/services/google-maps-loader.js';
import { travelFormTemplate } from './travel-form-template.js';
import { addAnchor, populateForm } from './travel-form-populate.js';
import { stepProgressHtml } from './step-progress.js';
import { icons } from '../../../ui/icons.js';
import { animateScreen } from '../../../ui/screen-motion.js';
import { getFormData, getAutocompleteValue } from './travel-form-data.js';
import { bindPlaceSelection, restorePlaceInput } from '../services/selected-place.mjs';
import { plannerDraftStore } from '../services/planner-draft.mjs';
import { showErrorToast } from '../../../utils/toast.js';
import { isAnchorBlank, missingAnchorFields } from '../services/anchor-validation.mjs';
import { REQUIRED_LOCATIONS } from '../services/location-validation.mjs';
import { getLocationName, mergedSameDayVisits, normalizePlannerRequest, stayUnsetLabel } from '../services/planner-constraints.mjs';
import { airportArrivalTime, isAirportName, tripStartAfterLanding } from '../services/flight-arrival.mjs';
import { farFromCityKm } from '../../../../functions/airport-buffer.mjs';
import { RECOMMENDATION_CITIES } from '../../../../functions/recommendation-cities.mjs';
import { ANCHOR_FIELD_SELECTOR, bindSubmit, fieldLabelOf, invalidFieldMessage } from './travel-form-submit.js';
import { bindStaySearch, bindDiscovery, bindVisitButtons, bindFlights, bindValidation, bindDayToggles, bindReset } from './travel-form-events.js';

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
    this.syncFarLocations();
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
    this.shadowRoot.innerHTML = travelFormTemplate(this);

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

  addAnchor(data = null) { addAnchor(this, data); }

  populateForm(requestData, options) { populateForm(this, requestData, options); }

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
    // Without an arrival flight, an airport start time means leaving the airport: say so instead of guessing a buffer.
    const firstStart = getLocationName(getAutocompleteValue(root.querySelector('.daily-start-location')))
      || getLocationName(getAutocompleteValue(root.getElementById('start-location')));
    root.getElementById('airport-start-hint').hidden = !root.getElementById('arrival-flight').hidden || !isAirportName(firstStart);
    this.syncFarLocations();
  }

  // Planning only uses transit and walking, so a start or end far from the trip city cannot be reached: warn, never block.
  syncFarLocations() {
    const root = this.shadowRoot;
    const cityId = this.draft.destination?.id;
    const english = RECOMMENDATION_CITIES[cityId]?.[0]?.replaceAll(' ', '');
    const city = [`city${english}`, `discover${english}`].map(key => [key, t(key)]).find(([key, text]) => key !== text)?.[1]
      || RECOMMENDATION_CITIES[cityId]?.[0];
    for (const input of root.querySelectorAll('#start-location, #end-location, .daily-start-location, .daily-end-location')) {
      const group = input.closest('.form-group');
      let warning = group.querySelector('.far-location-warning');
      if (!warning) {
        warning = Object.assign(document.createElement('p'), { className: 'subtitle far-location-warning' });
        warning.setAttribute('role', 'status');
        group.append(warning);
      }
      const place = getAutocompleteValue(input);
      const km = farFromCityKm(place, cityId);
      warning.hidden = km === null;
      if (km === null) { warning.replaceChildren(); continue; }
      // A far trip start or end airport is a flight: point to the flight form. A flight only fills these trip-wide fields,
      // and a per-day override wins over them, so a per-day airport gets the plain warning.
      const flight = isAirportName(getLocationName(place))
        ? (input.id === 'start-location' ? 'arrival' : input.id === 'end-location' ? 'departure' : null)
        : null;
      const message = t(flight ? `farAirport_${flight}` : 'farLocation').replace('{0}', city).replace('{1}', km);
      warning.replaceChildren(message);
      if (!flight || !root.getElementById(`${flight}-flight`).hidden) continue;
      const button = Object.assign(document.createElement('button'), { type: 'button', className: 'link-btn', textContent: t(flight === 'arrival' ? 'addArrivalFlight' : 'addDepartureFlight') });
      button.onclick = () => root.getElementById(`add-${flight}-flight`).click();
      warning.append(' ', button);
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
    bindStaySearch(this);
    bindDiscovery(this);
    bindVisitButtons(this);
    bindFlights(this);
    bindValidation(this);
    bindDayToggles(this);
    bindReset(this);
    bindSubmit(this);
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
