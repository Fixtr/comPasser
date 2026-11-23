import { saveItinerary, updateItinerary, createSharedItinerary, loadItineraryDocument } from '../services/firestore-service.js';
import { getSharedItineraryUrl } from '../services/share-links.js';
import { createItineraryState } from '../services/itinerary-state.mjs';
import { createItineraryActions } from '../services/itinerary-actions.mjs';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { t, applyTranslations } from '../../../utils/i18n.js';
import { safeHttpUrl } from '../../../utils/html-safety.mjs';

import { itineraryStyles } from './itinerary-style.js';
import { icons, iconRow } from '../../../ui/icons.js';
import { normalizeData } from '../services/itinerary-normalize.mjs';
import { refreshHours } from './itinerary-hours.js';
import { refreshRainBanner } from './rain-banner.js';
import { refreshReplanButton, showItineraryReplan } from './itinerary-replan.js';
import { loadScheduleHours } from '../services/itinerary-hours.mjs';
import { suggestRouteOrder } from '../services/itinerary-route-order.mjs';
import { describeResolvedPlace } from '../services/itinerary-resolved-place.mjs';
import {
  getTransitStyle,
  getTransitModeText,
  renderTransitStep,
  renderTransitInfo
} from './itinerary-render-helpers.js';
import { showToast as showGlobalToast } from '../../../utils/toast.js';
import { verifyRouteImprovement, startRouteImprovement, applyTransitDelaysToActiveDay } from './itinerary-transit-adjust.js';
import { renderPageHeading, renderCurrentState, renderDayTabs, renderActiveDay, updateNextStop } from './itinerary-day-render.js';
import { setupSaveListener, getShareUrl, setupShareListener, setupKakaoShareListener, setupDownloadListener, downloadCalendar, downloadAsImage } from './itinerary-share-save.js';
import { loadItineraryById, retryFailedLoad } from './itinerary-loading.js';
import { buildInsertSlot, openReplacement, openInsertForm, insertPlaceAt, improveRouteOrder, handleItemEdit, trimActiveDayToEndTime } from './itinerary-editing.js';
import { refreshEndTimeWarning, updateAnchorWarning, refreshCostSummary, refreshTransitNotice, renderEndTimeWarning } from './itinerary-notices.js';

// Firestore finishes a queued write once the connection returns, so failing it here and retrying would write twice.
const STALLED_WRITE_MS = 15000;
const noticeStalledWrite = write => async (...args) => {
  const path = window.location.pathname;
  const userId = getCurrentUser()?.uid;
  let timer;
  const stop = () => {
    clearTimeout(timer);
    window.removeEventListener('offline', warn);
  };
  // A write queued for another account never settles while that account is out, and "keep this screen open" means nothing once it is gone.
  function warn() {
    if (window.location.pathname === path && getCurrentUser()?.uid === userId) showGlobalToast(t('writeWaitingForConnection'), { tone: 'warning' });
    else stop();
  }
  if (navigator.onLine === false) warn();
  timer = setTimeout(warn, STALLED_WRITE_MS);
  window.addEventListener('offline', warn);
  try {
    return await write(...args);
  } finally {
    stop();
  }
};

export default class ItineraryView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.state = createItineraryState({
      getStorage: () => window.sessionStorage,
      onStorageError: () => this.showToast(t('itinerarySessionUnavailable'), true),
    });
    this.actions = createItineraryActions({
      state: this.state, getCurrentUser, getSharedItineraryUrl,
      readSharedItinerary: async id => (await loadItineraryDocument(id, { sharedOnly: true }))?.itineraryPlan,
      saveItinerary: noticeStalledWrite(saveItinerary), updateItinerary: noticeStalledWrite(updateItinerary), createSharedItinerary: noticeStalledWrite(createSharedItinerary),
    });
    this._loadVersion = 0;
    this._itineraryVersion = 0;
    this._mapRequestId = 0;
    this._mapRequest = null;
    this.lastResolvedPlaces = [];
    // 지도가 실제 이동시간을 구했는지 추적한다. 실패를 조용히 넘기면 화면에는
    // AI 추정 시각이 검증된 것처럼 남는다.
    this.lastTransitRoutes = [];
    this.transitUnavailable = false;
  }

  connectedCallback() {
    this.render();

    this.setupSaveListener();
    this.setupShareListener();
    this.setupKakaoShareListener();
    this.setupDownloadListener();
    this.setupDayControls();
    this.updateTexts();

    this.listenForLanguageChange();
    this.listenForMapResults();
    this.listenForTripChanges();
  }

  setupDayControls() {
    const replanButton = this.shadowRoot.getElementById('replan-trip-btn');
    replanButton?.addEventListener('click', () => showItineraryReplan(this, replanButton));
    this.shadowRoot.getElementById('improve-route-btn')?.addEventListener('click', () => this.improveRouteOrder());
    this.shadowRoot.getElementById('recalculate-times-btn')?.addEventListener('click', () => {
      if (this.canEdit()) { this._explicitRecalculation=true; this.requestMapRoute({ scheduleEdited: true }); }
    });
    this.shadowRoot.getElementById('undo-deletion-btn')?.addEventListener('click', () => {
      if (this.canEdit() && this.state.undoDeletion(this.activeDayIndex)) { this.requestMapRoute(); this.refreshAccessControls(); }
    });
  }

  listenForLanguageChange() {
    this._languageHandler = () => {
      this.updateTexts();
      // Day tabs and cards are built from translated strings; rebuild them without a new map request.
      const plan = this.normalizeData(this.currentItinerary);
      if (plan?.days?.length) { this.renderDayTabs(plan); this.renderActiveDay(plan); }
    };
    window.addEventListener('i18n-changed', this._languageHandler);
  }

  listenForMapResults() {
    // 지도(map-view)가 계산한 실제 대중교통 경로를 타임라인에 반영
    this._transitInfoHandler = async (e) => {
      if (!this.isCurrentMapResult(e.detail)) return;
      const transitRoutes = Array.isArray(e.detail.routes) ? e.detail.routes : [];
      this.lastTransitRoutes = transitRoutes;
      // 유효한 경로가 하나라도 오면 실패 상태를 푼다(지도가 재계산에 성공한 경우).
      if (transitRoutes.some(r => typeof r?.durationMinutes === 'number')) {
        this.transitUnavailable = false;
      }
      // Gemini가 추정한 시각은 실제 이동시간과 어긋날 수 있다(예: 이동에
      // 45분이 걸리는데 다음 항목이 이동시간 없이 바로 시작하는 것처럼
      // 생성되는 경우). 실제 이동시간이 밝혀졌으니 뒤 항목들의 시각을
      // 필요한 만큼만 보정한다.
      const context = e.detail.context;
      const source = this.currentItinerary;
      const day = this.normalizeData(source)?.days?.[this.activeDayIndex];
      if (!day?.scheduleItems) return;
      if (this.canEdit() && this._allowTimeAdjustment) {
        const hours = await loadScheduleHours(day.scheduleItems, this.lastResolvedPlaces);
        if (!this.isCurrentMapResult({ context }) || source !== this.currentItinerary) return;
        this._measuredHours = { context, hours };
      }
      if (this.verifyRouteImprovement(transitRoutes)) return;
      if (this.startRouteImprovement(transitRoutes)) return;
      if (transitRoutes.length && this.applyTransitDelaysToActiveDay(transitRoutes)) return;
      this.renderTransitInfo(transitRoutes);
      if (this._explicitRecalculation && transitRoutes.length===Math.max(day.scheduleItems.length-1,0) && transitRoutes.every(route=>!route.estimated&&Number.isFinite(route.durationMinutes))) {
        this.state.markDayRecalculated(this.activeDayIndex);this._explicitRecalculation=false;this.refreshAccessControls();
      }
    };
    window.addEventListener('transit-info-ready', this._transitInfoHandler);

    // 지도가 실제 이동시간을 구하지 못했을 때(지오코딩/Directions 실패 등)
    this._transitUnavailableHandler = (e) => {
      if (!this.isCurrentMapResult(e.detail)) return;
      this.transitUnavailable = true;
      this.refreshTransitNotice();
    };
    window.addEventListener('transit-unavailable', this._transitUnavailableHandler);

    // 지도가 실제로 찾은 장소를 화면에 반영한다(오매칭이 드러나도록).
    this._placesResolvedHandler = (e) => {
      if (!this.isCurrentMapResult(e.detail)) return;
      this.lastResolvedPlaces = Array.isArray(e.detail.places) ? e.detail.places : [];
      this.applyResolvedPlaces(this.lastResolvedPlaces);
      // Map coordinates can reveal a shorter order for stops without a saved identity.
      this.refreshAccessControls();
      // If no adjacent route exists, transit-info-ready may never fire. Remove
      // definitively missing optional stops here so the map can try the new neighbors.
      if (this.lastResolvedPlaces.some(place => ['filtered', 'no-results'].includes(place.unresolvedReason))) {
        this.applyTransitDelaysToActiveDay([]);
      }
    };
    window.addEventListener('places-resolved', this._placesResolvedHandler);
  }

  listenForTripChanges() {
    this._deletedHandler = ({ detail }) => {
      if (!detail || detail.userId !== this.state.userId) return;
      this.state.forgetDocument(detail.id);
      if (!this.currentItinerary) this.clear();
    };
    window.addEventListener('itinerary-deleted', this._deletedHandler);
    this._sharedRecheck = () => {
      if (this.sharedId) this.loadItineraryById(this.sharedId, { sharedOnly: true });
    };
    window.addEventListener('focus', this._sharedRecheck);
    window.addEventListener('offline', this._sharedRecheck);
    this._retryOnOnline = () => this.retryFailedLoad();
    window.addEventListener('online', this._retryOnOnline);
  }

  disconnectedCallback() {
    this.cancelPendingLoad();
    window.removeEventListener('i18n-changed', this._languageHandler);
    window.removeEventListener('focus', this._sharedRecheck);
    window.removeEventListener('offline', this._sharedRecheck);
    window.removeEventListener('online', this._retryOnOnline);
    window.removeEventListener('transit-info-ready', this._transitInfoHandler);
    window.removeEventListener('transit-unavailable', this._transitUnavailableHandler);
    window.removeEventListener('places-resolved', this._placesResolvedHandler);
    window.removeEventListener('itinerary-deleted', this._deletedHandler);
  }

  updateTexts() {
    applyTranslations(this.shadowRoot);
    this.refreshAccessControls();
    const day = this.normalizeData(this.currentItinerary)?.days?.[this.activeDayIndex];
    if (day) this.updateNextStop(day);

    // 값이 섞인 문장(종료 시각·초과 시간·비용·이동 안내)은 사전 키 하나로
    // 되돌릴 수 없다 — 상태가 그대로 있으니 그 자리에서 다시 그린다.
    // 실제로 언어를 바꿔도 이 경고만 한국어로 남아 있었다(사용자가 잡아 줬다).
    if (this.currentItinerary) {
      this.refreshEndTimeWarning?.();
      this.refreshTransitNotice?.();
      this.refreshCostSummary?.();
    }

    if (this.currentItinerary?.days?.length > 0) this.renderPageHeading(this.currentItinerary.days);
  }

  renderPageHeading(days) { return renderPageHeading(this, days); }

  canEdit() {
    return Boolean(getCurrentUser()) && !this.isReadOnly;
  }

  get currentItinerary() { return this.state.current?.plan || null; }
  get activeDayIndex() { return this.state.current?.dayIndex || 0; }
  get isReadOnly() { return this.state.current?.source.kind === 'shared'; }
  get sharedId() { return this.isReadOnly ? this.state.current.source.id : null; }
  // Fresh drafts have no id yet, so their visited marks would have nowhere stable to live.
  get visitTripId() {
    const source = this.state.current?.source;
    return ['private', 'shared'].includes(source?.kind) && source.id ? `${source.kind}:${source.id}` : null;
  }

  setSessionUser(userId) {
    const wasKnown = this.state.userId !== undefined;
    if (!this.state.setUser(userId)) return;
    if (wasKnown) {
      this.cancelPendingLoad();
      if (!this.currentItinerary) this.clear();
    }
    this.refreshAccessControls();
  }

  restoreDraft() {
    const previous = this.state.current;
    const draft = this.state.activateDraft();
    if (!draft) return false;
    if (previous !== draft) this.renderCurrentState();
    else this.resumeMapRoute();
    return true;
  }

  isCurrentMapResult(detail) {
    const context = detail?.context;
    return Boolean(this.currentItinerary && this._mapRequest && context
      && context.requestId === this._mapRequest.requestId
      && context.itineraryVersion === this._itineraryVersion
      && context.dayIndex === this.activeDayIndex);
  }

  invalidateMapRequest() {
    this._replan?.abort();
    this._mapRequest = null;
    window.dispatchEvent(new CustomEvent('cancel-map-route'));
  }

  /** 생성·불러오기·날짜 전환·편집 모두 이곳에서 같은 요청 표식을 붙인다. */
  requestMapRoute({ automaticFit = false, scheduleEdited = false } = {}) {
    this._replan?.abort();
    if (!automaticFit) { this._automaticFitCount = 0; this._routeOrderChecked = false; this._routeOrderOriginal = null; }
    if (!automaticFit) this._allowTimeAdjustment = scheduleEdited || (this.state.current?.source.kind === 'draft' && !this.state.current?.dirtyDays?.includes(this.activeDayIndex));
    const plan = this.normalizeData(this.currentItinerary);
    const day = plan?.days?.[this.activeDayIndex];
    if (!day) return;
    const excludedPlaceIds = this.state.current?.source.kind === 'draft'
      ? plan.days.flatMap((other, index) => index === this.activeDayIndex ? []
        : other.scheduleItems.map(item => item.selectedPlace?.placeId || item.verifiedPlace?.placeId).filter(Boolean))
      : [];
    const context = {
      itineraryVersion: this._itineraryVersion,
      dayIndex: this.activeDayIndex,
      requestId: ++this._mapRequestId,
    };
    this._mapRequest = context;
    this._measuredHours = null;
    this.lastTransitRoutes = [];
    this.lastResolvedPlaces = [];
    this.transitUnavailable = false;
    const anchorWarning = this.shadowRoot.getElementById('anchor-time-warning');
    if (anchorWarning) anchorWarning.hidden = true;
    const boundaryWarning = this.shadowRoot.getElementById('boundary-route-warning');
    if (boundaryWarning) boundaryWarning.hidden = true;
    this.renderActiveDay(plan);
    // 편집 중 원본 배열이 바뀌어도 이미 보낸 계산의 입력은 그대로 유지한다.
    window.dispatchEvent(new CustomEvent('render-map-route', {
      detail: { plan: { days: [structuredClone(day)], ...(this.currentItinerary?.request ? { request: this.currentItinerary.request } : {}), ...(this.currentItinerary?.request?.budget ? { budget: this.currentItinerary.request.budget } : {}),
        ...(excludedPlaceIds.length ? { excludedPlaceIds } : {}) }, context },
    }));
  }

  selectDay(index) {
    if (!this.state.selectDay(index)) return;
    this._explicitRecalculation=false;
    this.requestMapRoute();
    this.refreshAccessControls();
  }

  resumeMapRoute() {
    if (!this._mapRequest) this.requestMapRoute();
  }

  loginToSave() {
    const path = this.sharedId ? '/share/' + this.sharedId : window.location.pathname;
    window.navigate('/login?next=' + encodeURIComponent(path));
  }

  refreshAccessControls() {
    refreshReplanButton(this);
    if (!this.isReadOnly) {
      this._stopSharedWatch?.();
      this._stopSharedWatch = null;
    }
    const hasPlan = Boolean(this.currentItinerary);
    const saveBtn = this.shadowRoot.getElementById('save-itinerary-btn');
    const entry = this.state.current;
    const saveKey = this.isReadOnly
      ? (getCurrentUser() ? 'saveSharedCopyBtn' : 'loginToSaveSharedBtn')
      : entry?.source.kind !== 'private' ? 'saveItineraryBtn' : entry.unsaved ? 'saveChangesBtn' : 'savedStateBtn';
    if (saveBtn && !this._saving) {
      saveBtn.dataset.i18n = saveKey;
      saveBtn.textContent = t(saveKey);
      saveBtn.disabled = saveKey === 'savedStateBtn';
    }
    const notice = this.shadowRoot.getElementById('shared-notice');
    if (notice) {
      notice.hidden = !hasPlan || !this.isReadOnly;
      notice.textContent = t('sharedReadOnlyNotice');
    }
    const editBtn = document.getElementById('edit-itinerary-btn');
    const recalculateBtn = this.shadowRoot.getElementById('recalculate-times-btn');
    if (recalculateBtn) { recalculateBtn.hidden = !hasPlan || !this.canEdit(); recalculateBtn.disabled = this.hasAttribute('day-editing') && !this.state.current?.dirtyDays?.includes(this.activeDayIndex); }
    const undo=this.shadowRoot.getElementById('undo-deletion-btn');if(undo)undo.hidden=!this.canEdit()||!this.state.current?.undoByDay?.[this.activeDayIndex];
    const dirty=this.shadowRoot.getElementById('day-modified');if(dirty)dirty.hidden=!this.state.current?.dirtyDays?.includes(this.activeDayIndex);
    const improveBtn = this.shadowRoot.getElementById('improve-route-btn');
    // Offered only when the current day has a shorter order; the check is local and needs no network.
    if (improveBtn) improveBtn.hidden = !hasPlan || !this.canEdit() ||
      !suggestRouteOrder(this.normalizeData(this.currentItinerary)?.days?.[this.activeDayIndex]?.scheduleItems, this.lastResolvedPlaces).changed;
    if (editBtn) {
      editBtn.style.display = hasPlan && this.canEdit() ? '' : 'none';
      editBtn.disabled = !hasPlan || !this.canEdit();
    }
  }

  setupSaveListener() { return setupSaveListener(this); }




  async checkUrlForId() {
    const path = window.location.pathname;
    const match = path.match(/^\/(view|share)\/([a-zA-Z0-9]+)$/);
    if (match && match[1]) {
      await this.loadItineraryById(match[2], { sharedOnly: match[1] === 'share', userId: getCurrentUser()?.uid });
    }
  }

  normalizeData(rawData) {
    return normalizeData(rawData);
  }

  loadItineraryById(id, options) { return loadItineraryById(this, id, options); }

  retryFailedLoad() { return retryFailedLoad(this); }

  getShareUrl() { return getShareUrl(this); }

  setupShareListener() { return setupShareListener(this); }

  setupKakaoShareListener() { return setupKakaoShareListener(this); }

  setupDownloadListener() { return setupDownloadListener(this); }

  downloadCalendar() { return downloadCalendar(this); }

  downloadAsImage() { return downloadAsImage(this); }

  /**
   * 컴포넌트 안에 따로 두던 토스트를 앱 공용 토스트로 위임한다.
   * Shadow DOM 안에 있으면 이 컴포넌트가 화면에 없을 때 알림을 띄울 수 없고,
   * 다른 화면의 알림과 위치·모양이 제각각이 된다.
   */
  showToast(message, isError = false) {
    showGlobalToast(message, { tone: isError ? 'error' : 'success' });
  }

  // ========== 이동 수단 시각화 (업그레이드) ==========
  getTransitStyle(mode, vehicleType) {
    return getTransitStyle(mode, vehicleType);
  }

  getTransitModeText(vehicleType, lineName) {
    return getTransitModeText(vehicleType, lineName);
  }

  renderTransitStep(step) {
    return renderTransitStep(step);
  }

  renderTransitInfo(transitRoutes) {
    const day = this.normalizeData(this.currentItinerary)?.days?.[this.activeDayIndex];
    renderTransitInfo(this.shadowRoot, transitRoutes, day?.scheduleItems);
  }

  refreshEndTimeWarning() { return refreshEndTimeWarning(this); }

  updateAnchorWarning(items, routes) { return updateAnchorWarning(this, items, routes); }

  /**
   * 지도가 해석한 장소 이름/주소를 카드에 반영한다.
   *
   * 카드에는 AI 가 쓴 문자열("서울 경복궁")이 떠 있는데, 지도가 실제로 찾은
   * 곳과 다를 수 있다. 실제로 찾은 이름이 다르면 함께 보여줘서 오매칭이
   * 눈에 띄게 한다. 같으면 굳이 덧붙이지 않는다.
   */
  applyResolvedPlaces(resolved) {
    if (!Array.isArray(resolved) || resolved.length === 0) return;

    this.state.resolvePlaces(this.activeDayIndex, resolved);

    const plan = this.normalizeData(this.currentItinerary);
    const items = plan?.days?.[this.activeDayIndex]?.scheduleItems;
    if (!Array.isArray(items)) return;

    const cards = this.shadowRoot.querySelectorAll('#timeline-container .schedule-card');

    resolved.forEach(({ index, name, address }) => {
      const item = items[index];
      const card = cards[index];
      if (!item) return;

      const target = card?.querySelector('.resolved-place');
      if (!target) return;

      if (!['departure', 'arrival', 'AnchorSchedule'].includes(item.type) && Object.hasOwn(item, 'placeIntent')) {
        const verified = item.placeStatus === 'verified' && item.verifiedPlace;
        card.querySelector('.schedule-title').textContent = item.title;
        card.querySelector('.schedule-meta .meta-item').textContent = item.location;
        target.textContent = verified ? `${t('recommendationVerified')}: ${item.resolvedName} · ${item.resolvedAddress}` : t('recommendationUnresolved');
        target.hidden = false;
        target.classList.toggle('mismatch', !verified);
        const links = card.querySelector('.action-links');
        links.hidden = !verified;
        const review = links.querySelector('a.primary');
        if (review) review.href = safeHttpUrl(item.googleMapsUrl);
        const nav = links.querySelector('.nav-btn');
        if (nav) { nav.dataset.location = item.location; nav.dataset.gmaps = item.googleMapsUrl; }
        return;
      }

      const { visible, mismatch, detail } = describeResolvedPlace({
        written: item.location,
        name,
        address,
      });

      if (!visible || item.stayUnsetLabel) {
        target.hidden = true;
        return;
      }

      // 아이콘은 마크업이라 글자와 같은 자리에 넣을 수 없다(ui/icons.js 참고).
      // 장소 이름은 지도 API 가 준 값이므로 반드시 글자 쪽으로 간다.
      target.replaceChildren(
        iconRow(icons.search, `${t('resolvedPlaceLabel') || '지도에서 찾은 곳'}: ${detail}`)
      );
      target.hidden = false;
      // 적어둔 이름과 다르면 눈에 띄게 표시한다.
      target.classList.toggle('mismatch', mismatch);
    });
    refreshHours(this);
    refreshRainBanner(this);
  }

  buildInsertSlot(insertAt) { return buildInsertSlot(this, insertAt); }

  openReplacement(card, index, indoor) { return openReplacement(this, card, index, indoor); }

  openInsertForm(slot, insertAt) { return openInsertForm(this, slot, insertAt); }

  insertPlaceAt(insertAt, place) { return insertPlaceAt(this, insertAt, place); }

  improveRouteOrder() { return improveRouteOrder(this); }

  handleItemEdit(action, index) { return handleItemEdit(this, action, index); }

  trimActiveDayToEndTime() { return trimActiveDayToEndTime(this); }

  refreshCostSummary() { return refreshCostSummary(this); }

  refreshTransitNotice() { return refreshTransitNotice(this); }

  renderEndTimeWarning(overflowMinutes, dayEndTime) { return renderEndTimeWarning(this, overflowMinutes, dayEndTime); }

  verifyRouteImprovement(routes) { return verifyRouteImprovement(this, routes); }

  startRouteImprovement(routes) { return startRouteImprovement(this, routes); }

  applyTransitDelaysToActiveDay(transitRoutes) { return applyTransitDelaysToActiveDay(this, transitRoutes); }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        ${itineraryStyles}
      </style>
      
      <p id="results-loading" class="state-block" role="status" data-i18n="resultLoading" hidden>${t('resultLoading')}</p>

      <div id="results" style="display: none;">
        <!-- 배경은 호스트(:host)가 준다. 여기에 흰색을 박아 두면 다크 모드에서
             흰 띠가 생긴다. 캡처용 배경은 share 경로가 따로 지정한다. -->
        <div id="results-content">
          <p id="shared-notice" class="shared-notice" role="note" data-i18n="sharedReadOnlyNotice" hidden></p>
          <div id="transit-notice" class="transit-notice" role="status" aria-live="polite" style="display: none;"></div>
          <div id="end-time-warning" class="end-time-warning" role="status" aria-live="polite" style="display: none;"></div>
          <p id="anchor-time-warning" class="shared-notice" role="alert" data-i18n="anchorTransitConflict" hidden></p>
          <p id="boundary-route-warning" class="shared-notice" role="alert" hidden></p>
          <section id="next-stop" class="next-stop" hidden>
            <span id="next-stop-label"></span>
            <strong id="next-stop-title"></strong>
            <span id="next-stop-time"></span>
            <button type="button" id="next-stop-directions"></button>
          </section>
          <span id="day-modified" data-i18n="flowChanged" hidden></span><button type="button" id="undo-deletion-btn" data-i18n="flowUndo" hidden></button>
          <button type="button" id="replan-trip-btn" class="end-time-fix-btn" data-i18n="replanBtn" hidden></button>
          <button id="recalculate-times-btn" class="end-time-fix-btn" data-i18n="recalculateTimesBtn" hidden>${t('recalculateTimesBtn')}</button>
          <button id="improve-route-btn" class="end-time-fix-btn" data-i18n="routeOrderBtn" hidden>${t('routeOrderBtn')}</button>
          <div id="cost-summary" class="cost-summary" style="display: none;"></div>
          <h1 id="day-title-header" style="padding-top: 0.5rem; margin-top: 0; display: none;"></h1>
          <div id="day-tabs-container" class="day-tabs-container" style="display: none;">
            <!-- Tabs injected dynamically -->
          </div>
          <div class="timeline" id="timeline-container" style="transition: opacity 0.3s ease-in-out;">
            <!-- Dynamically injected -->
          </div>
        </div>
        <div class="itinerary-actions">
          <button id="download-image-btn" class="download-btn" data-i18n="downloadTicketBtn">${t('downloadTicketBtn')}</button>
          <button id="calendar-export-btn" class="download-btn" data-i18n="calendarExportBtn">${t('calendarExportBtn')}</button>
          <button id="share-itinerary-btn" class="share-btn" data-i18n="shareItineraryBtn">일정 공유하기</button>
          <button id="kakao-share-btn" class="kakao-share-btn" data-i18n="kakaoShareBtn">카카오톡 공유하기</button>
        </div>
        <!-- 주 버튼은 .itinerary-actions **밖**에 있어야 한다.

             sticky 요소는 부모 상자를 벗어나지 못한다. 조작 묶음 안에 두면
             그 묶음이 버튼 높이만큼밖에 안 되므로 미끄러질 자리가 없고,
             sticky 를 적어 놔도 아무 일도 일어나지 않는다(실제로 그랬다).
             하루치 타임라인을 품은 #results 의 자식이어야 화면 끝까지
             따라온다. 정리한다고 위 묶음 안으로 옮기지 말 것. -->
        <div class="actions-primary" id="actions-primary" hidden>
          <button id="save-itinerary-btn" class="save-btn" data-i18n="saveItineraryBtn">이 일정 저장하기</button>
        </div>
      </div>

    `;
  }

  setLoading(isLoading) {
    this.setAttribute('visible', '');
    const results = this.shadowRoot.getElementById('results');
    // A blank sheet on a slow share link looks finished; say it is still loading.
    const loading = this.shadowRoot.getElementById('results-loading');
    if (loading) loading.hidden = !isLoading;

    if (isLoading) {
      results.style.display = 'none';
    } else {
      results.style.display = 'block';
    }
  }

  /**
   * 호출부가 이미 .state-block 을 담은 마크업을 넘긴다.
   * 예전에는 여기서 다시 <p style="color:red"> 로 감싸서, 빈 상태 카드가
   * 빨간 글씨 문단 안에 들어가 있었다.
   */
  // A deleted, missing or unreadable trip: the shell listens so it can give the card the whole screen.
  showMissing(msg) {
    this.setError(msg);
    this.dispatchEvent(new CustomEvent('itinerary-missing'));
  }

  setError(msg) {
    this.setLoading(false);
    const nextStop = this.shadowRoot.getElementById('next-stop');
    if (nextStop) nextStop.hidden = true;
    const container = this.shadowRoot.getElementById('timeline-container');
    container.innerHTML = msg;
  }

  cancelPendingLoad() {
    this._failedLoad = null;
    this.shadowRoot.querySelectorAll?.('.stop-note-editor').forEach(form => form.remove());
    this._stopSharedWatch?.();
    this._stopSharedWatch = null;
    this._loadVersion += 1;
    this._pendingDocument = null;
    this.invalidateMapRequest();
  }

  clear() {
    this.cancelPendingLoad();
    this.state.deactivate();
    this.refreshAccessControls();
    const nextStop = this.shadowRoot.getElementById('next-stop');
    if (nextStop) nextStop.hidden = true;
    const container = this.shadowRoot.getElementById('timeline-container');
    if (container) container.innerHTML = '';
    const dayTitle = this.shadowRoot.getElementById('day-title-header');
    if (dayTitle) { dayTitle.textContent = ''; dayTitle.style.display = 'none'; }
    const dayTabs = this.shadowRoot.getElementById('day-tabs-container');
    if (dayTabs) dayTabs.innerHTML = '';
    const primaryBar = this.shadowRoot.getElementById('actions-primary');
    if (primaryBar) primaryBar.hidden = true;
    const shareBtn = this.shadowRoot.getElementById('share-itinerary-btn');
    if (shareBtn) shareBtn.style.display = 'none';
    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');
    if (downloadBtn) downloadBtn.style.display = 'none';
    const calendarBtn = this.shadowRoot.getElementById('calendar-export-btn');
    if (calendarBtn) calendarBtn.style.display = 'none';
    const kakaoBtn = this.shadowRoot.getElementById('kakao-share-btn');
    if (kakaoBtn) kakaoBtn.style.display = 'none';
    this.renderEndTimeWarning(0);
    this.lastTransitRoutes = [];
    this.transitUnavailable = false;
    const notice = this.shadowRoot.getElementById('transit-notice');
    if (notice) notice.style.display = 'none';
    const boundaryWarning = this.shadowRoot.getElementById('boundary-route-warning');
    if (boundaryWarning) boundaryWarning.hidden = true;
    const cost = this.shadowRoot.getElementById('cost-summary');
    if (cost) cost.style.display = 'none';
  }

  showResults(itineraryData, { access = 'private', id = null } = {}) {
    const userId = getCurrentUser()?.uid;
    if (userId) this.setSessionUser(userId);
    // A fresh draft already passed enforcePlannerConstraints before its measured fit (gemini-optimizer.js);
    // rerunning it here would let the pre-measure airport estimate delete visits the measured fit kept.
    const entry = this.state.open(itineraryData, {
      kind: access === 'shared' ? 'shared' : id ? 'private' : 'draft', id,
    });
    if (!entry) {
      this.clear();
      this.setError(`<div class="state-block"><p class="state-desc" data-i18n="viewNoItemsDesc">${t('viewNoItemsDesc')}</p></div>`);
      return false;
    }
    this.renderCurrentState();
    return true;
  }

  renderCurrentState() { return renderCurrentState(this); }

  renderDayTabs(safePlan) { return renderDayTabs(this, safePlan); }

  renderActiveDay(safePlan) { return renderActiveDay(this, safePlan); }

  updateNextStop(dayData) { return updateNextStop(this, dayData); }
}

customElements.define('itinerary-view', ItineraryView);
