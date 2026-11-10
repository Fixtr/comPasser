import { saveItinerary, updateItinerary, createSharedItinerary, loadItineraryDocument, watchSharedItinerary } from '../services/firestore-service.js';
import { offlineTrips } from '../services/offline-trips.mjs';
import { visitedStops, stopKeys, isVisitableStop, pickNextStop } from '../services/visited-stops.mjs';
import { getSharedItineraryUrl } from '../services/share-links.js';
import { createItineraryState } from '../services/itinerary-state.mjs';
import { createItineraryActions } from '../services/itinerary-actions.mjs';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { t, getLang, applyTranslations } from '../../../utils/i18n.js';
import { trackEvent } from '../../../utils/analytics.js';
import { escapeHtml, safeHttpUrl } from '../../../utils/html-safety.mjs';

import { itineraryStyles } from './itinerary-style.js';
import { openNavPopup } from './nav-popup.js';
import { icons, iconRow } from '../../../ui/icons.js';
import { normalizeData } from '../services/itinerary-normalize.mjs';
import { summarizeCosts, formatCostSummary, isTransportEstimatedCost } from '../services/itinerary-cost.mjs';
import { removeScheduleItem, moveScheduleItem, insertScheduleItem, isEditableItem, replaceSchedulePlace } from '../services/itinerary-edit.mjs';
import { openPlaceReplacement } from './place-replacement.js';
import { refreshHours } from './itinerary-hours.js';
import { openVisitTimeEditor } from './visit-time-editor.js';
import { hoursPlaceId, lookupPlaceHours, loadScheduleHours } from '../services/itinerary-hours.mjs';
import { suggestRouteOrder, improveMeasuredRouteOrder } from '../services/itinerary-route-order.mjs';
import { localTravelDate, travelRegion } from '../../../../functions/travel-region.mjs';
import { createFlexibleVisitChecks } from '../../planner/services/flexible-visit-checks.js';
import { showConfirm } from '../../../utils/confirm-dialog.js';
import { trimScheduleToEndTime, applyTransitDelays, minutesOf } from '../services/itinerary-schedule-adjust.mjs';
import { fitMeasuredSchedule, hasFixedArrivalConflict, hasUnavoidableFixedArrivalConflict } from '../services/itinerary-end-fit.mjs';
import { describeResolvedPlace } from '../services/itinerary-resolved-place.mjs';
import { exportItineraryImage } from './itinerary-image-export.js';
import { buildItineraryCalendar } from '../services/itinerary-calendar.mjs';
import { Capacitor } from '@capacitor/core';
import { itineraryShareDelivery } from './itinerary-share-delivery.js';
import {
  reconcileWithConstraints,
  getEndTimeWarning,
  getDayConstraints,
  getTransitCoverage
} from '../services/itinerary-view-model.mjs';
import {
  getTransitStyle,
  getTransitModeText,
  renderTransitStep,
  renderTransitInfo
} from './itinerary-render-helpers.js';
import { showToast as showGlobalToast } from '../../../utils/toast.js';

/**
 * duration 이 없는 항목(사용자가 넣었거나 구버전 데이터)에 쓸 표시값.
 * 그냥 두면 화면에 "undefined" 가 그대로 노출된다.
 */
function fallbackDuration(item) {
  const start = minutesOf(item?.time);
  const end = minutesOf(item?.endTime);
  if (start === null || end === null || end <= start) return '';

  const total = end - start;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return t('durationHoursMinutes').replace('{0}', hours).replace('{1}', mins);
  if (hours) return t('durationHours').replace('{0}', hours);
  return t('durationMinutes').replace('{0}', mins);
}

// visited is undefined when the trip has no stable id, so no visited toggle is drawn.
function renderScheduleCard(scheduleItem, idx, editable, visited) {
  const timeDisplay = scheduleItem.endTime ? `${escapeHtml(scheduleItem.time)} -<br>${escapeHtml(scheduleItem.endTime)}` : escapeHtml(scheduleItem.time);

  // location이 객체(좌표)일 수 있으므로 안전하게 문자열 변환
  const locationStr = typeof scheduleItem.location === 'string'
    ? scheduleItem.location
    : (scheduleItem.location ? JSON.stringify(scheduleItem.location) : '');
  const gmapsStr = safeHttpUrl(scheduleItem.googleMapsUrl);
  const officialUrl = safeHttpUrl(scheduleItem.officialWebsiteUrl);

  // 출발/도착은 사용자가 폼에서 지정한 경계라 편집 대상이 아니다.
  const editHtml = editable && isEditableItem(scheduleItem) ? `
    <div class="item-edit-actions">
      <button class="item-edit-btn" data-edit="up" data-idx="${idx}" aria-label="${escapeHtml(t('moveUpAria').replace('{0}', scheduleItem.title))}" data-i18n-title="moveUpTitle" title="${t('moveUpTitle')}">↑</button>
      <button class="item-edit-btn" data-edit="down" data-idx="${idx}" aria-label="${escapeHtml(t('moveDownAria').replace('{0}', scheduleItem.title))}" data-i18n-title="moveDownTitle" title="${t('moveDownTitle')}">↓</button>
      <button class="item-edit-btn danger" data-edit="remove" data-idx="${idx}" aria-label="${escapeHtml(t('removeItemAria').replace('{0}', scheduleItem.title))}" data-i18n-title="removeItemTitle" title="${t('removeItemTitle')}">✕</button>
    </div>
  ` : '';

  const isRecommendation = !['departure', 'arrival', 'AnchorSchedule'].includes(scheduleItem.type) && Object.hasOwn(scheduleItem, 'placeIntent');
  // An unset stay stands for a whole city, so reviews and directions to it would mislead.
  const linksHtml = scheduleItem.stayUnsetLabel ? '' : `
    <div class="action-links" ${isRecommendation && scheduleItem.placeStatus !== 'verified' ? 'hidden' : ''}>
      ${officialUrl ? `<a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer" class="action-link-badge">${icons.info} <span data-i18n="officialSiteBtn">${t('officialSiteBtn')}</span></a>` : ''}
      ${gmapsStr || isRecommendation ? `<a href="${escapeHtml(gmapsStr)}" target="_blank" rel="noopener noreferrer" class="action-link-badge primary">${icons.search} <span data-i18n="reviewsBtn">${t('reviewsBtn')}</span></a>` : ''}
      <button class="nav-btn" data-location="${escapeHtml(locationStr)}" data-gmaps="${escapeHtml(gmapsStr)}">${icons.route} <span data-i18n="directionsBtn">${t('directionsBtn')}</span></button>
    </div>
  `;

  return `
    <div class="time-badge">${timeDisplay}</div>
    <div class="schedule-card" data-type="${escapeHtml(scheduleItem.type)}" data-index="${idx + 1}"${scheduleItem.addedByUser ? ' data-added="true"' : ''}${visited ? ' data-visited="true"' : ''}>
      <div class="schedule-title-row">
        <span class="schedule-title">${escapeHtml(scheduleItem.title)}</span>
        ${editHtml}
      </div>
      ${visited === undefined || !isVisitableStop(scheduleItem) ? '' : `<button type="button" class="visited-btn" aria-pressed="${visited}" aria-label="${escapeHtml(t('visitedAria').replace('{0}', scheduleItem.title))}"><span aria-hidden="true">✓</span> ${escapeHtml(t('visitedBtn'))}</button>`}
      ${(function() {
        const info = scheduleItem.transitInfo;
        if (typeof info !== 'string' || !info) return '';

        const trimmedInfo = info.trim();
        // 강화된 필터링 키워드
        const skipKeywords = ['없음', '이동 완료', '정보 없음', 'null', 'undefined'];
        if (trimmedInfo === '' || skipKeywords.some(k => trimmedInfo.includes(k))) return '';

        // 색은 지도 마커 규칙에만 쓴다(보라=고정, 초록=첫 장소, 파랑=나머지).
        // 이동 안내가 초록을 쓰면 같은 초록이 두 가지를 뜻하게 된다.
        return `<div class="schedule-desc gemini-transit">${icons.route}<span>${t('unverifiedTransitGuideLabel') || 'AI 예상 이동 · 확인 필요'} · ${escapeHtml(trimmedInfo)}</span></div>`;
      })()}
      <div class="resolved-place" ${isRecommendation ? '' : 'hidden'}>${isRecommendation ? escapeHtml(t(scheduleItem.placeStatus === 'verified' ? 'recommendationVerified' : scheduleItem.placeStatus === 'unresolved' ? 'recommendationUnresolved' : 'recommendationPending')) : ''}</div>
      <p class="visit-hours" role="status" ${['departure', 'arrival'].includes(scheduleItem.type) ? 'hidden' : ''}></p>
      ${editable && !['departure','arrival','AnchorSchedule'].includes(scheduleItem.type) ? `<button type="button" class="visit-time-btn replace-place-btn-style">${escapeHtml(t('visitTimeBtn'))}</button>` : ''}
      ${editable && !['departure', 'arrival', 'AnchorSchedule'].includes(scheduleItem.type) ? `<button type="button" class="replace-place-btn">${escapeHtml(t('replacePlaceBtn'))}</button>` : ''}
      <div class="schedule-meta">
        <span class="meta-item">${icons.pin} ${escapeHtml(scheduleItem.stayUnsetLabel || locationStr)}</span>
        <span class="meta-item">${icons.clock} ${escapeHtml(scheduleItem.duration || fallbackDuration(scheduleItem))}${(function() {
          const info = typeof scheduleItem.transitInfo === 'string' ? scheduleItem.transitInfo : '';
          // 시간 정보 추출 정규식 (예: 약 15분, 1시간 10분 등)
          const timeMatch = info.match(/(?:약\s*)?(\d+\s*시간)?\s*(\d+\s*분)/);
          if (timeMatch) {
            const transitTime = timeMatch[0];
            // 전체 소요 시간과 이동 시간이 다른 경우 혹은 이동 관련 키워드가 있는 경우에만 표시
            if (scheduleItem.duration !== transitTime || info.includes('이동') || info.includes('도보')) {
               return ` <span class="gemini-transit-meta" style="opacity: 0.8; font-weight: normal; font-size: 0.85em;">${t('transitTimeMeta').replace('{0}', transitTime)}</span>`;
            }
          }
          return '';
        })()}</span>
      </div>
      ${(function() {
        const info = scheduleItem.practicalInfo;
        if (!info) return '';

        // Structured Object Format (Phase 4)
        if (typeof info === 'object' && !Array.isArray(info)) {
          const recs = info.top3Recommendations;
          const itemType = scheduleItem.type || '';
          const isDining = itemType === 'dining';
          const isCafe = itemType === 'cafe';

          // 객체 배열 포맷 (신규)
          let recsHtml = '';
          if (Array.isArray(recs) && recs.length > 0) {
            const recIcon = isDining ? icons.dining : isCafe ? icons.cafe : icons.star;
            const recLabel = isDining ? '추천 식당 Top 3' : isCafe ? '추천 카페 Top 3' : '추천 Top 3';
            const recItemsHtml = recs.filter(rec => rec && typeof rec === 'object').map((rec, i) => {
              const safeName = escapeHtml(rec.name);
              const reviewHref = safeHttpUrl(rec.reviewUrl) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rec.name || '')}`;
              const dirHref = safeHttpUrl(rec.directionUrl) || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(rec.name || '')}`;
              return `<div class="rec-item">
                <span class="rec-rank">${i + 1}.</span>
                <span class="rec-name">${safeName}</span>
                <span class="rec-rating">${icons.star} ${escapeHtml(rec.rating)}</span>
                <a href="${escapeHtml(reviewHref)}" target="_blank" rel="noopener noreferrer" class="rec-btn review">${icons.list} <span data-i18n="reviewsBtn">${t('reviewsBtn')}</span></a>
                <a href="${escapeHtml(dirHref)}" target="_blank" rel="noopener noreferrer" class="rec-btn direction">${icons.route} <span data-i18n="directionsBtn">${t('directionsBtn')}</span></a>
              </div>`;
            }).join('');
            recsHtml = `<div class="info-row" style="margin-top: 0.5rem; align-items: flex-start;">
                 <span class="info-icon">${recIcon}</span>
                 <span class="info-value" style="flex:1;">
                   <span class="info-label">${recLabel}</span>
                   <div class="rec-list" style="margin-top: 0.4rem;">${recItemsHtml}</div>
                 </span>
               </div>`;
          } else if (typeof recs === 'string' && recs.trim() !== '') {
            // 문자열 폴백 (구버전 데이터 호환)
            recsHtml = `<div class="info-row" style="margin-top: 0.5rem; align-items: flex-start;">
                 <span class="info-icon">${isDining ? icons.dining : isCafe ? icons.cafe : icons.star}</span>
                 <span class="info-value">
                   <span class="info-label">${isDining ? '추천 식당 Top 3' : isCafe ? '추천 카페 Top 3' : '추천 Top 3'}</span>
                   <div style="margin-top: 0.3rem; white-space: pre-line; line-height: 1.7;">${escapeHtml(recs.trim())}</div>
                 </span>
               </div>`;
          }

          // 값이 없는 줄은 아예 그리지 않는다. "현지 팁: —" 은 정보가
          // 없다는 뜻이 아니라 앱이 부실하다는 인상만 남긴다.
          const infoLine = (icon, label, value, className = '') => {
            const text = typeof value === 'string' ? value.trim() : '';
            if (!text || text === '—') return '';
            return `
                <div class="info-row${className ? ` ${className}` : ''}">
                  <span class="info-icon">${icon}</span>
                  <span class="info-value"><span class="info-label">${label}</span> ${escapeHtml(text)}</span>
                </div>`;
          };

          // 현지 팁은 외국인 사용자에게 방문 여부를 가르는 정보다
          // (영어 메뉴 유무, 택스프리, 대기시간). 다른 메타 정보와 같은
          // 줄에 두지 않고 한 칸 올린다.
          const tipText = typeof info.localTip === 'string' ? info.localTip.trim() : '';
          const tipHtml = (!tipText || tipText === '—') ? '' : `
                <div class="info-row tip">
                  <span class="info-icon">${icons.tip}</span>
                  <span class="info-value"><span class="info-label">${t('localTipLabel') || '현지 팁'}</span>${escapeHtml(tipText)}</span>
                </div>`;

          const transportCost = isTransportEstimatedCost(info.estimatedCost, scheduleItem.type);
          const lines = [
            infoLine(
              icons.cost,
              transportCost ? (t('unverifiedTransitCostLabel') || 'AI 예상 교통비 · 확인 필요') : `${t('estimatedCostLabel') || '예상 비용'}`,
              info.estimatedCost,
              transportCost ? 'gemini-transport-cost' : ''
            ),
            infoLine(icons.hours, t('hoursUnverifiedText'), info.operatingHours),
          ].join('');

          if (!lines && !tipHtml && !recsHtml) return '';

          return `
            <div class="quick-info-box structured">
              <div class="info-group">${lines}${tipHtml}${recsHtml}
              </div>
            </div>
          `;
        }

        // Legacy String Format (Phase 3 Fallback)
        return `
          <div class="quick-info-box">
            <span class="quick-info-icon">${icons.tip}</span>
            <div class="quick-info-text">${escapeHtml(info)}</div>
          </div>
        `;
      })()}
      ${linksHtml}
    </div>
  `;
}

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
    this.shadowRoot.getElementById('improve-route-btn')?.addEventListener('click', () => this.improveRouteOrder());
    this.shadowRoot.getElementById('recalculate-times-btn')?.addEventListener('click', () => {
      if (this.canEdit()) { this._explicitRecalculation=true; this.requestMapRoute({ scheduleEdited: true }); }
    });
    this.shadowRoot.getElementById('undo-deletion-btn')?.addEventListener('click', () => {
      if (this.canEdit() && this.state.undoDeletion(this.activeDayIndex)) { this.requestMapRoute(); this.refreshAccessControls(); }
    });
    this.updateTexts();

    this._languageHandler = () => {
      this.updateTexts();
      // Day tabs and cards are built from translated strings; rebuild them without a new map request.
      const plan = this.normalizeData(this.currentItinerary);
      if (plan?.days?.length) { this.renderDayTabs(plan); this.renderActiveDay(plan); }
    };
    window.addEventListener('i18n-changed', this._languageHandler);

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
      if (this._explicitRecalculation && transitRoutes.length===Math.max(day.scheduleItems.length-1,0) && transitRoutes.every(route=>Number.isFinite(route.durationMinutes))) {
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

  // The page's h1. A single day shows it; several days keep it for screen readers only, above their day tabs.
  renderPageHeading(days) {
    const headerEl = this.shadowRoot.getElementById('day-title-header');
    if (!headerEl) return;
    const several = days.length > 1;
    const dates = several ? `${days[0]?.date || ''} – ${days.at(-1)?.date || ''}` : days[0]?.date || '';
    headerEl.textContent = (t('itineraryHeader') || '{0}').replace('{0}', dates);
    headerEl.classList.toggle('visually-hidden', several);
    headerEl.style.display = 'block';
  }

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
    this._mapRequest = null;
    window.dispatchEvent(new CustomEvent('cancel-map-route'));
  }

  /** 생성·불러오기·날짜 전환·편집 모두 이곳에서 같은 요청 표식을 붙인다. */
  requestMapRoute({ automaticFit = false, scheduleEdited = false } = {}) {
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

  setupSaveListener() {
    const saveBtn = this.shadowRoot.getElementById('save-itinerary-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        trackEvent('save_itinerary_click');
        const path = window.location.pathname;
        return this.saveCurrent({ onSavedId: id => this.openSavedTrip(id, path) });
      });
    }
  }

  // Replace the pre-save /view or /share entry so Back can't reopen a copy that offers Save again.
  // A user who already left keeps the page they went to.
  openSavedTrip(id, path) {
    if (window.navigate && window.location.pathname === path) window.navigate('/view/' + id, { replace: true });
  }

  async saveCurrent({ onSavedId }) {
    const saveBtn = this.shadowRoot.getElementById('save-itinerary-btn');
    try {
      this._saving = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = t('savingStateBtn') || '저장 중...';
      }
      const result = await this.actions.save({
        language: getLang(),
        onSaved: id => {
          // Toast first: an offline-copy warning from refreshOfflineCopy then replaces it instead of being hidden.
          this.showToast(t('itinerarySaveToast') || '일정이 성공적으로 저장되었습니다.');
          this.refreshOfflineCopy(id);
          this.renderCurrentState();
          onSavedId(id);
        },
      });
      if (result.status === 'login-required') {
        this.loginToSave();
      } else if (result.status === 'saved-earlier-version') {
        this.showToast(t('itinerarySavedEarlierVersion'));
      }
      return result;
    } catch (error) {
      console.error("Save error:", error);
      this.showToast(t('saveFailToast') || "저장에 실패했습니다.", true);
      return { status: 'failed' };
    } finally {
      this._saving = false;
      this.refreshAccessControls();
    }
  }

  // A trip kept for offline reading must show the saved changes at the trip site.
  refreshOfflineCopy(id) {
    try {
      const offline = offlineTrips.get(this.state.userId, id);
      if (offline) offlineTrips.save(offline.userId, { ...offline, itineraryPlan: this.currentItinerary });
    } catch {
      showGlobalToast(t('offlineFailed'), { tone: 'warning' });
    }
  }

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

  /**
   * 저장/공유로 읽어온 일정에도 확정적 가드레일을 다시 적용한다.
   * 실제 계산은 itinerary-view-model.mjs 가 담당한다(테스트 가능한 순수 모듈).
   */
  reconcileWithConstraints(rawData) {
    return reconcileWithConstraints(rawData, getLang());
  }

  async loadItineraryById(id, { sharedOnly = false, userId = getCurrentUser()?.uid } = {}) {
    if (userId) this.setSessionUser(userId);
    const key = `${sharedOnly ? 'shared' : userId || 'guest'}:${id}`;
    if (this._pendingDocument?.key === key) return this._pendingDocument.promise;
    const previous = this.state.current;
    const cached = !sharedOnly && this.state.activateDocument(id, { sharedOnly, userId });
    if (cached && cached.source.kind !== 'shared') {
      if (cached !== previous) {
        this.cancelPendingLoad();
        this.renderCurrentState();
      } else {
        this.resumeMapRoute();
        this.refreshAccessControls();
      }
      return true;
    }
    const pending = { key, promise: this.fetchItineraryById(id, { sharedOnly, userId }) };
    this._pendingDocument = pending;
    try {
      return await pending.promise;
    } finally {
      if (this._pendingDocument === pending) this._pendingDocument = null;
    }
  }

  async fetchItineraryById(id, { sharedOnly, userId }) {
    this.clear();
    const version = this._loadVersion;
    try {
      this.setLoading(true);

      const document = await loadItineraryDocument(id, { sharedOnly, userId });
      if (version !== this._loadVersion) return false;

      if (document?.deleted) {
        this.showMissing(`<div class="state-block" role="alert"><h1 class="state-title" data-i18n="sharedDeleted">${t('sharedDeleted')}</h1></div>`);
        return false;
      }

      if (!document) {
        // 예전 /view 링크는 개인·공유가 섞여 있다. 게스트는 공유본만 조회한
        // 뒤, 개인 일정일 수 있는 경우 로그인하고 같은 주소로 돌아온다.
        if (!sharedOnly && !userId) {
          window.navigate('/login?next=' + encodeURIComponent('/view/' + id));
          return false;
        }
        this.showMissing(`
          <div class="state-block" role="alert">
             <div class="state-icon">${icons.search}</div>
             <h1 class="state-title" data-i18n="viewNotFoundTitle">${t('viewNotFoundTitle')}</h1>
             <p class="state-desc"><span data-i18n="viewNotFoundDesc1">${t('viewNotFoundDesc1')}</span><br><span data-i18n="viewNotFoundDesc2">${t('viewNotFoundDesc2')}</span></p>
             <button class="state-action" onclick="window.navigate('/recommend')" data-i18n="viewNewPlanBtn">${t('viewNewPlanBtn')}</button>
          </div>
        `);
        return false;
      }

      if (!this.showResults(document.itineraryPlan, { access: document.access, id })) return false;
      if (document.access === 'shared') {
        const stop = await watchSharedItinerary(id, () => {
          if (version === this._loadVersion && this.sharedId === id) {
            // Drop cached content before the authoritative deletion/error check.
            this.fetchItineraryById(id, { sharedOnly: true, userId: getCurrentUser()?.uid });
          }
        });
        if (version === this._loadVersion && this.sharedId === id) this._stopSharedWatch = stop;
        else stop();
      }

      return true;
    } catch (error) {
      if (version !== this._loadVersion) return false;
      this.clear();
      console.error('🔥 렌더링 치명적 오류:', error);
      this.showMissing(`
        <div class="state-block danger" role="alert">
           <div class="state-icon">${icons.warn}</div>
           <h1 class="state-title" data-i18n="viewLoadErrorTitle">${t('viewLoadErrorTitle')}</h1>
           <p class="state-desc" data-i18n="sharedLoadRetry">${t('sharedLoadRetry')}</p>
           <button type="button" class="state-action" id="retry-load-btn" data-i18n="shellRetry">${t('shellRetry')}</button>
        </div>
      `);
      this._failedLoad = { id, sharedOnly, path: window.location.pathname };
      const retry = this.shadowRoot.getElementById('retry-load-btn');
      retry.addEventListener('click', () => { retry.focus(); this.retryFailedLoad(); });
      return false;
    } finally {
      if (version === this._loadVersion) this.setLoading(false);
    }
  }

  /** Ionic keeps left pages mounted, so a hidden view must not reload (it could redirect) when the connection returns. */
  async retryFailedLoad() {
    const failed = this._failedLoad;
    if (!failed || failed.path !== window.location.pathname) return;
    // The retry replaces the card, so keyboard focus on its button must move with it.
    const hadFocus = this.shadowRoot.activeElement?.id === 'retry-load-btn';
    const loaded = await this.loadItineraryById(failed.id, { sharedOnly: failed.sharedOnly });
    if (loaded) this.dispatchEvent(new CustomEvent('itinerary-recovered'));
    // A control the user moved to while it loaded keeps focus.
    if (!hadFocus || (document.activeElement && document.activeElement !== document.body)) return;
    const timeline = this.shadowRoot.getElementById('timeline-container');
    timeline.tabIndex = -1;
    (this.shadowRoot.getElementById('retry-load-btn') || timeline).focus();
  }

  async getShareUrl() {
    // A running save or share would otherwise write a second trip or public document.
    if (this._saving || this._sharing) {
      showGlobalToast(t('creatingLink'), { tone: 'warning' });
      return null;
    }
    // Firestore writes wait forever without a connection, which would leave the button stuck.
    if (navigator.onLine === false) {
      this.showToast(t('shareLinkFailed'), true);
      return null;
    }
    const path = window.location.pathname;
    const leaving = new AbortController();
    const onLeave = () => leaving.abort();
    window.addEventListener('popstate', onLeave);
    let savedId = null;
    this._sharing = true;
    try {
      const result = await this.actions.getShareLink({
        confirmPublicShare: () => showConfirm({
          title: t('sharePublicTitle'),
          message: t('sharePublicNotice'),
          confirmText: t('sharePublicConfirm'),
          cancelText: t('cancelBtn'),
          destructive: false,
          signal: leaving.signal,
        }),
        confirmSaveAndShare: () => showConfirm({
          title: t('shareSaveAndPublicTitle'),
          message: `${t('shareSaveAndPublicIntro')} ${t('sharePublicNotice')}`,
          confirmText: t('shareSaveAndPublicConfirm'),
          cancelText: t('cancelBtn'),
          destructive: false,
          signal: leaving.signal,
        }),
        saveBeforeShare: async () => {
          // The address moves only after the link exists: a route change remounts this view and its busy buttons.
          const saved = await this.saveCurrent({ onSavedId: id => { savedId = id; } });
          return window.location.pathname === path ? saved : { status: 'left' };
        },
      });
      if (result.status === 'login-required') this.loginToSave();
      if (result.status === 'not-shared') showGlobalToast(t('shareNotCreatedAfterSave'), { tone: 'warning' });
      return result.status === 'ready' ? result.url : null;
    } finally {
      this._sharing = false;
      window.removeEventListener('popstate', onLeave);
      if (savedId) this.openSavedTrip(savedId, path);
    }
  }

  setupShareListener() {
    const shareBtn = this.shadowRoot.getElementById('share-itinerary-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        if (!this.currentItinerary) return;

        const originalText = shareBtn.textContent;
        try {
          shareBtn.textContent = t('creatingLink');
          shareBtn.disabled = true;

          const shareUrl = await this.getShareUrl();
          if (!shareUrl) return;

          await itineraryShareDelivery.copyLink(shareUrl);
          if (!await this.actions.linkDelivered(shareUrl)) throw new Error('The shared trip no longer opens');
          showGlobalToast(t('shareSuccessAlert') || "공유 링크가 클립보드에 복사되었습니다!", { tone: 'success' });
        } catch (error) {
          console.error("Share error:", error);
          this.showToast(t('shareLinkFailed'), true);
        } finally {
          shareBtn.textContent = originalText;
          shareBtn.disabled = false;
        }
      });
    }
  }

  setupKakaoShareListener() {
    const kakaoBtn = this.shadowRoot.getElementById('kakao-share-btn');
    if (kakaoBtn) {
      kakaoBtn.addEventListener('click', async () => {
        trackEvent('share_kakao_click');
        if (!this.currentItinerary) return;

        const originalText = kakaoBtn.textContent;
        try {
          kakaoBtn.textContent = t('creatingLink');
          kakaoBtn.disabled = true;

          const shareUrl = await this.getShareUrl();
          if (!shareUrl) return;

          await itineraryShareDelivery.shareToKakao(shareUrl);
          if (!await this.actions.linkDelivered(shareUrl)) throw new Error('The shared trip no longer opens');
        } catch (error) {
          console.error("Kakao Share error:", error);
          this.showToast(t('kakaoShareFailed'), true);
        } finally {
          kakaoBtn.textContent = originalText;
          kakaoBtn.disabled = false;
        }
      });
    }
  }

  setupDownloadListener() {
    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadAsImage());
    }
    this.shadowRoot.getElementById('calendar-export-btn')?.addEventListener('click', () => this.downloadCalendar());
  }

  /** The whole trip as an .ics file; calendars import it from the download. */
  async downloadCalendar() {
    const entry = this.state.current;
    const userId = getCurrentUser()?.uid || null;
    if (entry && entry.source.kind !== 'shared' && entry.source.ownerId !== userId) return;
    let url;
    try {
      const snapshot = this.state.snapshot();
      const ics = snapshot && await buildItineraryCalendar(snapshot.plan, this.state.calendarTripKey());
      if (entry !== this.state.current || userId !== (getCurrentUser()?.uid || null)) return;
      if (!ics) { this.showToast(t('nothingToShare'), true); return; }
      url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'compasser-trip.ics';
      link.click();
      this.showToast(t('calendarExportDone'));
    } catch (error) {
      console.error('Calendar export failed:', error);
      this.showToast(t('calendarExportFailed'), true);
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  /** 내보낼 사본과 번역을 전달하고, 화면의 버튼·결과 알림만 관리한다. */
  async downloadAsImage() {
    if (!this.currentItinerary) return;

    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');

    try {
      if (downloadBtn) {
        downloadBtn.disabled = true;
        // 언어 전환 시에도 진행 상태를 번역하고, 완료 후에는 현재 언어를 사용한다.
        downloadBtn.dataset.i18n = 'generatingImage';
        downloadBtn.textContent = t('generatingImage');
      }
      const snapshot = this.state.snapshot();
      const result = await exportItineraryImage({
        plan: snapshot.plan,
        dayIndex: snapshot.dayIndex,
        language: getLang(),
        labels: {
          fixedLabel: t('anchorBadge'),
          fromLabel: t('ticketFromLabel'),
          toLabel: t('ticketToLabel'),
          transitLabel: t('transitTotalLabel'),
          costLabel: t('costLabel'),
        },
      });
      if (result === 'empty') {
        this.showToast(t('nothingToShare'), true);
      } else if (result === 'shared') {
        this.showToast(t('shareImageDone'));
      } else if (result === 'downloaded') {
        this.showToast(t('saveImageDone'));
      }
    } catch (error) {
      console.error('[boarding-pass] 이미지 생성 실패:', error);
      this.showToast(t('captureUnsupported'), true);
    } finally {
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.dataset.i18n = 'downloadTicketBtn';
        downloadBtn.textContent = t('downloadTicketBtn');
      }
    }
  }

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

  /**
   * 실제 이동시간(transitRoutes)을 반영해 현재 보고 있는 날짜의
   * scheduleItems 시각을 보정하고, 이미 그려진 타임라인의 시간 배지만
   * 갱신한다(전체 재렌더 대신 — renderActiveDay는 페이드 애니메이션 때문에
   * DOM 반영이 150ms 지연되어 뒤이은 renderTransitInfo와 타이밍이 꼬인다).
   * currentItinerary 자체를 갱신하므로, 이후 "저장하기"를 눌러도 보정된
   * 시각이 저장된다.
   */
  /**
   * 현재 보고 있는 날짜 기준으로 종료 시각 초과 여부를 다시 계산해 경고를
   * 갱신한다. 이동시간 보정 직후뿐 아니라 날짜 탭을 바꿀 때도 불러야 한다 —
   * 그러지 않으면 1일차에서 뜬 경고가 2일차 화면에 그대로 남는다.
   *
   * 종료 시각은 generateOptimizedItinerary()가 반환한 { request, days } 형태에
   * 그대로 남아있어, 저장된 일정을 불러온 경우에도 읽을 수 있다.
   */
  refreshEndTimeWarning() {
    // currentItinerary 에는 이미 이동시간 보정이 반영돼 있다. reconcileWithConstraints
    // 를 다시 돌리면 초과분이 정규화돼 사라지므로, 현재 상태만
    // 보고 판단하는 getEndTimeWarning 을 쓴다.
    const { overflowMinutes, endTime } = getEndTimeWarning(this.currentItinerary, this.activeDayIndex, this.lastTransitRoutes);
    this.renderEndTimeWarning(overflowMinutes, endTime);
    this.updateAnchorWarning(applyTransitDelays(
      this.normalizeData(this.currentItinerary)?.days?.[this.activeDayIndex]?.scheduleItems,
      this.lastTransitRoutes), this.lastTransitRoutes);
  }

  updateAnchorWarning(items, routes) {
    const warning = this.shadowRoot.getElementById('anchor-time-warning');
    if (!warning) return;
    warning.hidden = !hasFixedArrivalConflict(items, routes);
    warning.textContent = t(hasUnavoidableFixedArrivalConflict(items, routes)
      ? 'anchorFixedConflict' : 'anchorTransitConflict');
  }

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
  }

  /**
   * "여기에 장소 추가" 자리를 만든다. 누르면 그 자리에서 입력 폼으로 바뀐다.
   */
  buildInsertSlot(insertAt) {
    const slot = document.createElement('div');
    slot.className = 'insert-slot';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'insert-slot-btn';
    btn.textContent = t('addStopHere') || '+ 여기에 장소 추가';
    btn.setAttribute('aria-label', t('addStopHere') || '여기에 장소 추가');
    btn.addEventListener('click', () => this.openInsertForm(slot, insertAt));

    slot.appendChild(btn);
    return slot;
  }

  openReplacement(card, index) {
    if (!this.canEdit()) return;
    const entry = this.state.current;
    const day = this.activeDayIndex;
    const item = this.normalizeData(this.currentItinerary)?.days?.[day]?.scheduleItems?.[index];
    if (!item || ['departure', 'arrival', 'AnchorSchedule'].includes(item.type)) return;
    const isCurrent = () => this.canEdit() && this.state.current === entry && this.activeDayIndex === day &&
      this.normalizeData(this.currentItinerary)?.days?.[day]?.scheduleItems?.[index] === item;
    return openPlaceReplacement(card, { isCurrent, onSelect: place => {
      if (!isCurrent()) return;
      const items = this.normalizeData(this.currentItinerary).days[day].scheduleItems;
      const result = replaceSchedulePlace(items, index, place);
      if (!result.replaced) return;
      this.state.editDayItems(day, result.items);
      this.requestMapRoute();
      this.refreshAccessControls();
      showGlobalToast(t('replacePlaceDone'), { tone: 'success' });
    } });
  }

  /**
   * 삽입 자리에 교체와 같은 장소 검색을 연다. 이름만 적어서는 넣을 수 없다 —
   * 지도가 이름으로 장소와 이동시간을 짐작하게 되기 때문이다.
   */
  openInsertForm(slot, insertAt) {
    if (!this.canEdit()) return;
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

    const entry = this.state.current;
    const day = this.activeDayIndex;
    const items = this.normalizeData(this.currentItinerary)?.days?.[day]?.scheduleItems;
    const isCurrent = () => this.canEdit() && this.state.current === entry && this.activeDayIndex === day &&
      this.normalizeData(this.currentItinerary)?.days?.[day]?.scheduleItems === items;
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
        this.insertPlaceAt(insertAt, { selectedPlace: place, stayMinutes: Number(stay.querySelector('select').value) || 60 });
      },
    });
    // The add button just hid itself; keep keyboard focus in the panel it opened.
    stay.querySelector('select').focus();
    return opened;
  }

  /**
   * 사용자가 고른 자리에 장소를 넣고 화면·지도를 다시 그린다.
   */
  insertPlaceAt(insertAt, place) {
    if (!this.canEdit()) return;
    const plan = this.normalizeData(this.currentItinerary);
    const dayData = plan?.days?.[this.activeDayIndex];
    if (!dayData || !Array.isArray(dayData.scheduleItems)) return;

    const { items, inserted } = insertScheduleItem(dayData.scheduleItems, insertAt, place);
    if (!inserted) {
      showGlobalToast(t('addStopFailed') || '이 위치에는 장소를 추가할 수 없습니다.', { tone: 'warning' });
      return;
    }

    this.state.editDayItems(this.activeDayIndex, items);
    this.requestMapRoute();
    this.refreshAccessControls();
    showGlobalToast(t('addStopDone').replace('{0}', inserted.title), { tone: 'success' });

  }

  /**
   * 타임라인 항목을 옮기거나 뺀다.
   *
   * 계산은 itinerary-edit.mjs 가 하고 여기서는 결과를 반영해 다시 그린다.
   * 편집 결과는 currentItinerary 에 남으므로 이어서 저장/공유해도 그대로다.
   * 삭제는 되돌릴 수 없으니 확인을 받는다.
   */
  async improveRouteOrder() {
    if (!this.canEdit()) return;
    const source=this.currentItinerary, day=this.activeDayIndex, request=this._mapRequest;
    const items=this.normalizeData(source)?.days?.[day]?.scheduleItems;
    const snapshot=JSON.stringify(items);
    const proposal=suggestRouteOrder(items,this.lastResolvedPlaces);
    if (!proposal.changed) {
      showGlobalToast(t('routeOrderUnavailable'), {tone:'warning'});return;
    }
    const distance = value => (value/1000).toFixed(1);
    const ok=await showConfirm({title:t('routeOrderBtn'),destructive:false,
      confirmText:t('routeOrderApply'),cancelText:t('cancelBtn'),
      message:t('routeOrderPreview').replace('{0}',distance(proposal.beforeMeters))
        .replace('{1}',distance(proposal.afterMeters))
        + ' ' + proposal.items.map(item=>item.title).join(' → ')});
    if (!ok || !this.canEdit() || this.currentItinerary!==source || this.activeDayIndex!==day
      || this._mapRequest!==request || JSON.stringify(this.normalizeData(source)?.days?.[day]?.scheduleItems)!==snapshot) return;
    this.state.editDayItems(day,proposal.items);
    this.requestMapRoute();
    this.refreshAccessControls();
    showGlobalToast(t('routeOrderApplied'),{tone:'success'});
  }

  async handleItemEdit(action, index) {
    if (!this.canEdit()) return;
    const source = this.currentItinerary;
    const dayIndex = this.activeDayIndex;
    const request = this._mapRequest;
    const plan = this.normalizeData(this.currentItinerary);
    const dayData = plan?.days?.[this.activeDayIndex];
    if (!dayData || !Array.isArray(dayData.scheduleItems)) return;

    if (action === 'remove') {
      const target = dayData.scheduleItems[index];
      const ok = await showConfirm({
        title: t('flowRemoveTitle'),
        message: t('flowRemoveConfirm').replace('{0}',target?.title || ''),
        confirmText: t('flowRemoveTitle')
      });
      if (!ok || !this.canEdit() || source !== this.currentItinerary
        || dayIndex !== this.activeDayIndex || request !== this._mapRequest) return;

      const { items, removed } = removeScheduleItem(dayData.scheduleItems, index);
      if (!removed) return;
      this.state.editDayItems(this.activeDayIndex, items, {undo:true});
      showGlobalToast(t('flowRemoved').replace('{0}',removed.title), { tone: 'success' });
    } else {
      const { items, moved } = moveScheduleItem(dayData.scheduleItems, index, action === 'up' ? -1 : 1);
      if (!moved) {
        showGlobalToast('더 옮길 수 없습니다.', { tone: 'warning' });
        return;
      }
      this.state.editDayItems(this.activeDayIndex, items);
    }

    this.requestMapRoute();
    this.refreshAccessControls();
  }

  /**
   * 종료 시각을 넘긴 일정을 실제로 줄여서 맞춘다.
   *
   * 표시 시각을 눌러 속이는 게 아니라 체류 시간을 깎거나 항목을 빼는 것이라,
   * 줄인 뒤에도 화면의 시각은 계속 사실이다. 무엇을 줄였는지 토스트로 알린다.
   */
  trimActiveDayToEndTime() {
    if (!this.canEdit()) return;
    const plan = this.normalizeData(this.currentItinerary);
    const dayData = plan?.days?.[this.activeDayIndex];
    if (!dayData || !Array.isArray(dayData.scheduleItems)) return;

    const { endTime } = getEndTimeWarning(this.currentItinerary, this.activeDayIndex);
    if (!endTime) return;

    const { items, removedTitles, shortenedCount, resolved } =
      trimScheduleToEndTime(dayData.scheduleItems, endTime);

    if (removedTitles.length === 0 && shortenedCount === 0) {
      showGlobalToast(t('trimNothingToDo') || '더 줄일 수 있는 일정이 없습니다.', { tone: 'warning' });
      return;
    }

    this.state.editDayItems(this.activeDayIndex, items);
    this.requestMapRoute();
    this.refreshAccessControls();

    const parts = [];
    if (shortenedCount > 0) parts.push(`${shortenedCount}곳 체류 시간 단축`);
    if (removedTitles.length > 0) parts.push(`${removedTitles.length}곳 제외(${removedTitles.join(', ')})`);
    const summary = parts.join(' · ');

    showGlobalToast(
      resolved ? `일정을 종료 시각에 맞췄습니다 — ${summary}` : `${summary} — 그래도 종료 시각을 넘습니다`,
      { tone: resolved ? 'success' : 'warning', duration: 5000 }
    );
  }

  /**
   * 지금 보고 있는 날짜의 1인 예상 비용을 합산해 보여준다.
   *
   * estimatedCost 는 자유 문자열이라 일부는 금액을 읽어낼 수 없다. 합계만
   * 보여주면 실제보다 적은 금액을 확정된 것처럼 알리게 되므로, 못 읽은
   * 항목 수를 함께 표시한다.
   */
  refreshCostSummary() {
    const box = this.shadowRoot.getElementById('cost-summary');
    if (!box) return;

    const plan = this.normalizeData(this.currentItinerary);
    const items = plan?.days?.[this.activeDayIndex]?.scheduleItems;
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
  refreshTransitNotice() {
    const box = this.shadowRoot.getElementById('transit-notice');
    if (!box) return;

    const plan = this.normalizeData(this.currentItinerary);
    const items = plan?.days?.[this.activeDayIndex]?.scheduleItems;
    if (!Array.isArray(items) || items.length === 0) {
      box.style.display = 'none';
      return;
    }

    const { expected, resolved, status } = getTransitCoverage(
      items, this.lastTransitRoutes, this.transitUnavailable
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
  renderEndTimeWarning(overflowMinutes, dayEndTime) {
    const box = this.shadowRoot.getElementById('end-time-warning');
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

    if (this.canEdit()) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'end-time-fix-btn';
      action.dataset.i18n = 'trimScheduleBtn';
      action.textContent = t('trimScheduleBtn');
      action.addEventListener('click', () => this.trimActiveDayToEndTime());
      box.appendChild(action);
    }

    box.style.display = 'block';
  }

  verifyRouteImprovement(routes) {
    const original = this._routeOrderOriginal;
    if (!original) return false;
    this._routeOrderOriginal = null;
    const known = routes.filter(route => Number.isInteger(route.fromIndex) && route.fromIndex >= 0 &&
      route.fromIndex < original.items.length - 1 && (route.toIndex ?? route.fromIndex + 1) === route.fromIndex + 1 &&
      Number.isFinite(route.durationMinutes) && route.durationMinutes >= 0);
    const items = this.normalizeData(this.currentItinerary)?.days?.[this.activeDayIndex]?.scheduleItems;
    if (known.length === original.items.length - 1 &&
        new Set(known.map(route => route.fromIndex)).size === original.items.length - 1 &&
        !hasFixedArrivalConflict(items, known) &&
        getEndTimeWarning(this.currentItinerary, this.activeDayIndex, known).overflowMinutes === 0 &&
        original.beforeMinutes - known.reduce((sum, route) => sum + route.durationMinutes, 0) >= 2) return false;
    // Changed departure times can change timetables. Roll back an unconfirmed saving once.
    this.state.replaceDayItems(this.activeDayIndex, original.items);
    this.requestMapRoute({automaticFit:true});
    return true;
  }

  activeScheduleHours(items) {
    if (this._measuredHours?.context === this._mapRequest) return this._measuredHours.hours;
    return items.map((item, index) => lookupPlaceHours.cached(hoursPlaceId({ ...item,
      resolvedPlace: this.lastResolvedPlaces.find(place => place.index === index)?.resolvedPlace || item.resolvedPlace })));
  }

  startRouteImprovement(routes) {
    if (this._routeOrderChecked || this.state.current?.source.kind !== 'draft' || !this._allowTimeAdjustment) return false;
    this._routeOrderChecked = true;
    const source = this.currentItinerary, dayIndex = this.activeDayIndex, context = this._mapRequest;
    const day = this.normalizeData(source)?.days?.[dayIndex];
    const items = day?.scheduleItems;
    if (!items?.some(item => (item.placeIntent && item.addedByUser !== true) ||
        (item.type === 'AnchorSchedule' && item.flexible === true)) ||
        !suggestRouteOrder(items, this.lastResolvedPlaces, { automatic:true }).changed) return false;
    const constraints = getDayConstraints(source, dayIndex);
    const checks = createFlexibleVisitChecks(items.length - 1, this.currentItinerary?.request);
    improveMeasuredRouteOrder(items, this.lastResolvedPlaces, routes, {
      ...constraints, date:day.date, travelMinutes:checks.travelMinutes,
      hoursByIndex:this.activeScheduleHours(items)
    }).then(result => {
      if (!this.isCurrentMapResult({context}) || source !== this.currentItinerary ||
          items !== this.normalizeData(this.currentItinerary)?.days?.[dayIndex]?.scheduleItems) return;
      if (result.changed) {
        this._routeOrderOriginal = { items, beforeMinutes: result.beforeMinutes };
        this.state.replaceDayItems(dayIndex, result.items);
        this.requestMapRoute({automaticFit:true});
      } else {
        if (this.applyTransitDelaysToActiveDay(routes)) return;
        this.renderTransitInfo(routes);
      }
    }).catch(() => {
      if (this.isCurrentMapResult({context}) && source === this.currentItinerary) {
        if (this.applyTransitDelaysToActiveDay(routes)) return;
        this.renderTransitInfo(routes);
      }
    });
    return true;
  }

  applyTransitDelaysToActiveDay(transitRoutes) {
    if (!this.currentItinerary) return;

    const plan = this.normalizeData(this.currentItinerary);
    const dayData = plan?.days?.[this.activeDayIndex];
    if (!dayData?.scheduleItems?.length) return;
    const { endTime } = getEndTimeWarning(this.currentItinerary, this.activeDayIndex);
    // Saved/shared documents are snapshots. Reading them may refresh route
    // evidence and warnings, but cannot silently reschedule their contents.
    if (!this.canEdit() || !this._allowTimeAdjustment) {
      this.refreshEndTimeWarning();
      this.refreshTransitNotice();
      this.refreshCostSummary();
      return false;
    }
    // Apply only the requested departure time, not full planner reconciliation.
    const startTime = getDayConstraints(this.currentItinerary, this.activeDayIndex)?.startTime;
    // ponytail: four rechecks cap Maps cost; raise only if measured plans still need more removals.
    const fit = this.canEdit() && (this._automaticFitCount || 0) < 4
      ? fitMeasuredSchedule(dayData.scheduleItems, transitRoutes, endTime, startTime, {
        compact: dayData.scheduleItems.some(item => item.placeIntent && item.addedByUser !== true),
        date: dayData.date,
        hoursByIndex: this.activeScheduleHours(dayData.scheduleItems)
      })
      : { items: applyTransitDelays(dayData.scheduleItems, transitRoutes, startTime), adjusted: false };
    const scheduleItems = fit.items;
    this.state.replaceDayItems(this.activeDayIndex, scheduleItems);
    this.refreshAccessControls();

    this.updateAnchorWarning(scheduleItems, transitRoutes);

    if (fit.adjusted) {
      this._automaticFitCount = (this._automaticFitCount || 0) + 1;
      showGlobalToast(t('endTimeAutoFit'), { tone: 'info', duration: 5000 });
      // Earlier departure can change the available bus/train: verify again,
      // with a hard retry bound rather than recursively generating requests.
      this.requestMapRoute({ automaticFit: true });
      return true;
    }

    this.refreshEndTimeWarning();
    this.refreshTransitNotice();
    this.refreshCostSummary();

    const badges = this.shadowRoot.querySelectorAll('#timeline-container .time-badge');
    scheduleItems.forEach((item, idx) => {
      const badge = badges[idx];
      if (!badge) return;
      badge.innerHTML = item.endTime ? `${escapeHtml(item.time)} -<br>${escapeHtml(item.endTime)}` : escapeHtml(item.time);
    });
    this.updateNextStop({ ...dayData, scheduleItems });
    refreshHours(this);
  }

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
          <section id="next-stop" class="next-stop" hidden>
            <span id="next-stop-label"></span>
            <strong id="next-stop-title"></strong>
            <span id="next-stop-time"></span>
            <button type="button" id="next-stop-directions"></button>
          </section>
          <span id="day-modified" data-i18n="flowChanged" hidden></span><button type="button" id="undo-deletion-btn" data-i18n="flowUndo" hidden></button>
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
    const cost = this.shadowRoot.getElementById('cost-summary');
    if (cost) cost.style.display = 'none';
  }

  showResults(itineraryData, { access = 'private', id = null } = {}) {
    const userId = getCurrentUser()?.uid;
    if (userId) this.setSessionUser(userId);
    const reconciled = id || access === 'shared' ? itineraryData : this.reconcileWithConstraints(itineraryData);
    const entry = this.state.open(reconciled, {
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

  renderCurrentState() {
    try {
      this.invalidateMapRequest();
      this._itineraryVersion += 1;
      this.refreshAccessControls();
      this.setLoading(false);

      // 복원할 때 제약 조건 보정을 다시 적용하면 사용자의 편집·실제 이동시간이
      // 되돌아간다. 상태 모듈이 가진 최신 데이터와 선택 날짜를 그대로 표시한다.
      const safePlan = this.normalizeData(this.currentItinerary);

      if (!safePlan || !Array.isArray(safePlan.days) || safePlan.days.length === 0) {
        this.setError(`<div class="state-block"><p class="state-desc" data-i18n="viewNoItemsDesc">${t('viewNoItemsDesc')}</p></div>`);
        return;
      }

    const primaryBar = this.shadowRoot.getElementById('actions-primary');
    if (primaryBar) primaryBar.hidden = false;

    const shareBtn = this.shadowRoot.getElementById('share-itinerary-btn');
    if (shareBtn) shareBtn.style.display = 'block';

    const kakaoBtn = this.shadowRoot.getElementById('kakao-share-btn');
    if (kakaoBtn) kakaoBtn.style.display = 'block';

    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');
    if (downloadBtn) downloadBtn.style.display = 'block';

    // shortcut: native web views do not download blob links, so the apps hide this; add a share plugin to offer it there.
    const calendarBtn = this.shadowRoot.getElementById('calendar-export-btn');
    if (calendarBtn) calendarBtn.style.display = Capacitor.isNativePlatform() ? 'none' : 'block';

    this.renderDayTabs(safePlan);

    // Render initial
    this.requestMapRoute();
    } catch (error) {
      console.error('renderCurrentState error:', error);
    }
  }

  renderDayTabs(safePlan) {
    const tabsContainer = this.shadowRoot.getElementById('day-tabs-container');
    tabsContainer.innerHTML = '';
    
    if (safePlan.days.length > 1) {
      tabsContainer.style.display = 'flex';
      safePlan.days.forEach((dayData, idx) => {
        const tabBtn = document.createElement('button');
        tabBtn.className = `day-tab-btn ${idx === this.activeDayIndex ? 'active' : ''}`;
        
        // Use i18n formatter
        const dayLabelTemplate = t('day_n') || '{0}일차';
        const dayNum = dayData.day || idx + 1;
        const dayLabel = dayLabelTemplate.replace('{0}', dayNum);
        
        // 모양은 전부 itinerary-style.js 의 .day-tab-btn 이 맡는다.
        // 여기서 인라인으로 칠하던 보라 배경이 계약 밖에 있어 오래 남아 있었다.
        tabBtn.innerHTML = `<strong>${escapeHtml(dayLabel)}</strong><span class="tab-date">${escapeHtml(dayData.date)}</span>`;
        
        tabBtn.addEventListener('click', () => {
          this.selectDay(idx);
        });
        
        tabsContainer.appendChild(tabBtn);
      });
    } else {
      tabsContainer.style.display = 'none';
    }
    this.renderPageHeading(safePlan.days);
  }

  renderActiveDay(safePlan) {
    const source = this.currentItinerary;
    const dayIndex = this.activeDayIndex;
    const request = this._mapRequest;
    const container = this.shadowRoot.getElementById('timeline-container');
    if (!container) return;

    // 날짜를 바꾸면 경고/안내/비용도 그 날짜 기준으로 다시 계산해야 한다.
    this.refreshEndTimeWarning();
    this.refreshTransitNotice();
    this.refreshCostSummary();
    
    // Update Tabs UI
    const tabsContainer = this.shadowRoot.getElementById('day-tabs-container');
    const tabs = tabsContainer.querySelectorAll('.day-tab-btn');
    // 모양은 .day-tab-btn / .active 가 맡는다. 여기서 인라인으로 다시
    // 칠하던 코드가 있었는데, 최초 렌더만 고쳐 놓고 "탭 색을 고쳤다"고
    // 믿게 만들었다. 클릭하면 곧바로 보라로 돌아왔다.
    tabs.forEach((tab, idx) => {
      tab.classList.toggle('active', idx === this.activeDayIndex);
    });

    // Fade Out
    container.style.opacity = '0';
    // 계산이 빠르게 끝나도 이전 날짜의 카드에 결과를 붙이지 않는다.
    container.innerHTML = '';
    
    setTimeout(() => {
      if (source !== this.currentItinerary || dayIndex !== this.activeDayIndex
        || request !== this._mapRequest) return;
      container.innerHTML = ''; // Clear old
      
      const dayData = safePlan.days[this.activeDayIndex];
      if (!dayData) {
        container.style.opacity = '1';
        return;
      }

      let globalIdx = 0;
      const items = dayData.scheduleItems || [];
      const tripId = this.visitTripId;
      const userId = this.state.userId;
      const visited = tripId ? visitedStops.visited(tripId, userId) : null;
      const keys = stopKeys(dayData);
      this.updateNextStop(dayData);
      
      // 최후의 방어벽: 구버전 데이터 파손으로 인해 scheduleItems가 없을 때
      if (items.length === 0) {
        const fallbackItem = document.createElement('div');
        fallbackItem.className = 'timeline-item';
        fallbackItem.innerHTML = `
          <div class="time-badge">--:--</div>
          <div class="schedule-card" style="border-color: var(--cp-danger); border-left-color: var(--cp-danger); background: var(--cp-danger-bg);">
            <div class="schedule-title" style="color: var(--cp-danger);" data-i18n="viewNoItemsTitle">${t('viewNoItemsTitle')}</div>
            <div class="schedule-desc" style="color: var(--cp-danger);" data-i18n="viewNoItemsDesc">${t('viewNoItemsDesc')}</div>
          </div>
        `;
        container.appendChild(fallbackItem);
        container.style.opacity = '1';
        return;
      }

      items.forEach((scheduleItem) => {
        const idx = globalIdx++;
      const item = document.createElement('div');
      item.className = 'timeline-item';

      item.innerHTML = renderScheduleCard(scheduleItem, idx, this.canEdit(), visited?.has(keys[idx]));
      item.querySelector('.visited-btn')?.addEventListener('click', (e) => {
        // Place lookups and measured times change the day after render without rebuilding the cards.
        const day = this.normalizeData(this.currentItinerary)?.days?.[this.activeDayIndex] || dayData;
        const on = visitedStops.toggle(tripId, stopKeys(day)[idx], userId);
        e.currentTarget.setAttribute('aria-pressed', String(on));
        e.currentTarget.closest('.schedule-card').toggleAttribute('data-visited', on);
        this.updateNextStop(day);
      });

      // 길찾기 버튼 이벤트 바인딩 — anchorEl(버튼 자체)을 넘겨 뷰포트 좌표 계산
      item.querySelectorAll('.item-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handleItemEdit(btn.dataset.edit, Number(btn.dataset.idx));
        });
      });

      const navBtn = item.querySelector('.nav-btn');
      item.querySelector('.visit-time-btn')?.addEventListener('click',()=>openVisitTimeEditor(this,item.querySelector('.schedule-card'),idx));
      item.querySelector('.replace-place-btn')?.addEventListener('click', () =>
        this.openReplacement(item.querySelector('.schedule-card'), idx));
      if (navBtn) {
        navBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const loc = navBtn.getAttribute('data-location');
          const gmaps = navBtn.getAttribute('data-gmaps');
          openNavPopup(loc, gmaps, navBtn, this.shadowRoot);
        });
      }

      container.appendChild(item);

      // 카드 사이 이동 정보 슬롯: 지도(map-view)가 계산한 실제 경로가 채워진다
      if (idx < items.length - 1) {
        const transitSlot = document.createElement('div');
        transitSlot.className = 'transit-info hidden';
        transitSlot.id = `transit-info-${idx}`;
        container.appendChild(transitSlot);

        // 여기에 장소를 끼워 넣을 수 있다는 걸 자리로 보여준다. 도착 뒤에는
        // 넣을 수 없으므로 마지막 카드 다음에는 만들지 않는다.
        const nextItem = items[idx + 1];
        if (this.canEdit() && (isEditableItem(scheduleItem) || isEditableItem(nextItem))) {
          container.appendChild(this.buildInsertSlot(idx + 1));
        }
      }
    });

      // 지도 응답이 카드의 전환 애니메이션보다 빨랐어도 새 카드에 표시한다.
      this.applyResolvedPlaces(this.lastResolvedPlaces);
      this.renderTransitInfo(this.lastTransitRoutes);
      refreshHours(this);

      // Fade In
      requestAnimationFrame(() => {
        if (source === this.currentItinerary && request === this._mapRequest) container.style.opacity = '1';
      });
      
    }, 150); // wait for fade out
  }

  updateNextStop(dayData) {
    const panel = this.shadowRoot.getElementById('next-stop');
    if (!panel || !this.hasAttribute?.('mobile-summary')) return;
    const now = new Date();
    const timeZone = travelRegion(this.currentItinerary?.request || this.currentItinerary?.metadata?.request).timeZone;
    const today = localTravelDate(now, timeZone);
    const isToday = String(dayData.date).slice(0, 10) === today;
    const currentTime = new Intl.DateTimeFormat('en-GB', {timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(now);
    const tripId = this.visitTripId;
    const stop = pickNextStop(dayData, { visited: tripId ? visitedStops.visited(tripId, this.state.userId) : null, currentTime: isToday ? currentTime : undefined });
    panel.hidden = !stop;
    if (!stop) return;
    this.shadowRoot.getElementById('next-stop-label').textContent = t(isToday ? 'nextStopToday' : 'firstStop');
    this.shadowRoot.getElementById('next-stop-title').textContent = stop.title;
    this.shadowRoot.getElementById('next-stop-time').textContent = stop.time || '';
    const directions = this.shadowRoot.getElementById('next-stop-directions');
    directions.textContent = t('directionsBtn');
    directions.onclick = () => openNavPopup(
      typeof stop.location === 'string' && stop.location ? stop.location : stop.title,
      safeHttpUrl(stop.googleMapsUrl), directions, this.shadowRoot,
    );
  }
}

customElements.define('itinerary-view', ItineraryView);
