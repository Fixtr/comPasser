import { visitedStops, stopKeys, pickNextStop } from '../services/visited-stops.mjs';
import { t, getLang } from '../../../utils/i18n.js';
import { escapeHtml, safeHttpUrl } from '../../../utils/html-safety.mjs';
import { renderScheduleCard } from './itinerary-schedule-card.js';
import { openNavPopup } from './nav-popup.js';
import { isEditableItem } from '../services/itinerary-edit.mjs';
import { refreshHours } from './itinerary-hours.js';
import { refreshRainBanner } from './rain-banner.js';
import { refreshReplanButton } from './itinerary-replan.js';
import { openVisitTimeEditor } from './visit-time-editor.js';
import { attachStopNoteControl } from './stop-note-editor.js';
import { stopNoteKeys } from '../services/stop-notes.mjs';
import { localTravelDate, travelRegion } from '../../../../functions/travel-region.mjs';
import { localizeBoundaryItem } from '../../planner/services/planner-constraints.mjs';
import { Capacitor } from '@capacitor/core';

// The page's h1. A single day shows it; several days keep it for screen readers only, above their day tabs.
export function renderPageHeading(view, days) {
  const headerEl = view.shadowRoot.getElementById('day-title-header');
  if (!headerEl) return;
  const several = days.length > 1;
  const dates = several ? `${days[0]?.date || ''} – ${days.at(-1)?.date || ''}` : days[0]?.date || '';
  headerEl.textContent = (t('itineraryHeader') || '{0}').replace('{0}', dates);
  headerEl.classList.toggle('visually-hidden', several);
  headerEl.style.display = 'block';
}

export function renderCurrentState(view) {
  try {
    view.invalidateMapRequest();
    view._itineraryVersion += 1;
    view.refreshAccessControls();
    view.setLoading(false);

    // 복원할 때 제약 조건 보정을 다시 적용하면 사용자의 편집·실제 이동시간이
    // 되돌아간다. 상태 모듈이 가진 최신 데이터와 선택 날짜를 그대로 표시한다.
    const safePlan = view.normalizeData(view.currentItinerary);

    if (!safePlan || !Array.isArray(safePlan.days) || safePlan.days.length === 0) {
      view.setError(`<div class="state-block"><p class="state-desc" data-i18n="viewNoItemsDesc">${t('viewNoItemsDesc')}</p></div>`);
      return;
    }

  const primaryBar = view.shadowRoot.getElementById('actions-primary');
  if (primaryBar) primaryBar.hidden = false;

  const shareBtn = view.shadowRoot.getElementById('share-itinerary-btn');
  if (shareBtn) shareBtn.style.display = 'block';

  const kakaoBtn = view.shadowRoot.getElementById('kakao-share-btn');
  if (kakaoBtn) kakaoBtn.style.display = 'block';

  const downloadBtn = view.shadowRoot.getElementById('download-image-btn');
  if (downloadBtn) downloadBtn.style.display = 'block';

  // shortcut: native web views do not download blob links, so the apps hide this; add a share plugin to offer it there.
  const calendarBtn = view.shadowRoot.getElementById('calendar-export-btn');
  if (calendarBtn) calendarBtn.style.display = Capacitor.isNativePlatform() ? 'none' : 'block';

  view.renderDayTabs(safePlan);

  // Render initial
  view.requestMapRoute();
  } catch (error) {
    console.error('renderCurrentState error:', error);
  }
}

export function renderDayTabs(view, safePlan) {
  const tabsContainer = view.shadowRoot.getElementById('day-tabs-container');
  tabsContainer.innerHTML = '';
  
  if (safePlan.days.length > 1) {
    tabsContainer.style.display = 'flex';
    safePlan.days.forEach((dayData, idx) => {
      const tabBtn = document.createElement('button');
      tabBtn.className = `day-tab-btn ${idx === view.activeDayIndex ? 'active' : ''}`;
      
      // Use i18n formatter
      const dayLabelTemplate = t('day_n') || '{0}일차';
      const dayNum = dayData.day || idx + 1;
      const dayLabel = dayLabelTemplate.replace('{0}', dayNum);
      
      // 모양은 전부 itinerary-style.js 의 .day-tab-btn 이 맡는다.
      // 여기서 인라인으로 칠하던 보라 배경이 계약 밖에 있어 오래 남아 있었다.
      tabBtn.innerHTML = `<strong>${escapeHtml(dayLabel)}</strong><span class="tab-date">${escapeHtml(dayData.date)}</span>`;
      
      tabBtn.addEventListener('click', () => {
        view.selectDay(idx);
      });
      
      tabsContainer.appendChild(tabBtn);
    });
  } else {
    tabsContainer.style.display = 'none';
  }
  view.renderPageHeading(safePlan.days);
}

// 최후의 방어벽: 구버전 데이터 파손으로 인해 scheduleItems가 없을 때
function emptyDayItem() {
  const fallbackItem = document.createElement('div');
  fallbackItem.className = 'timeline-item';
  fallbackItem.innerHTML = `
    <div class="time-badge">--:--</div>
    <div class="schedule-card" style="border-color: var(--cp-danger); border-left-color: var(--cp-danger); background: var(--cp-danger-bg);">
      <div class="schedule-title" style="color: var(--cp-danger);" data-i18n="viewNoItemsTitle">${t('viewNoItemsTitle')}</div>
      <div class="schedule-desc" style="color: var(--cp-danger);" data-i18n="viewNoItemsDesc">${t('viewNoItemsDesc')}</div>
    </div>
  `;
  return fallbackItem;
}

/** 카드 하나를 만들고 그 안의 버튼을 연결한다. */
function buildTimelineItem(view, ctx, scheduleItem, idx) {
  const { dayData, tripId, userId, visited, keys, noteKeys } = ctx;
  const item = document.createElement('div');
  item.className = 'timeline-item';

  item.innerHTML = renderScheduleCard(localizeBoundaryItem(scheduleItem, getLang()), idx, view.canEdit(), visited?.has(keys[idx]));
  if (noteKeys[idx]) attachStopNoteControl(view, item.querySelector('.schedule-card'), idx, noteKeys[idx]);
  item.querySelector('.visited-btn')?.addEventListener('click', (e) => {
    // Place lookups and measured times change the day after render without rebuilding the cards.
    const day = view.normalizeData(view.currentItinerary)?.days?.[view.activeDayIndex] || dayData;
    const on = visitedStops.toggle(tripId, stopKeys(day)[idx], userId);
    e.currentTarget.setAttribute('aria-pressed', String(on));
    e.currentTarget.closest('.schedule-card').toggleAttribute('data-visited', on);
    view.updateNextStop(day);
    refreshReplanButton(view);
    refreshRainBanner(view);
  });

  // 길찾기 버튼 이벤트 바인딩 — anchorEl(버튼 자체)을 넘겨 뷰포트 좌표 계산
  item.querySelectorAll('.item-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.handleItemEdit(btn.dataset.edit, Number(btn.dataset.idx));
    });
  });

  const navBtn = item.querySelector('.nav-btn');
  item.querySelector('.visit-time-btn')?.addEventListener('click',()=>openVisitTimeEditor(view,item.querySelector('.schedule-card'),idx));
  item.querySelector('.replace-place-btn')?.addEventListener('click', () =>
    view.openReplacement(item.querySelector('.schedule-card'), idx));
  item.querySelector('.indoor-alternatives-btn')?.addEventListener('click', () =>
    view.openReplacement(item.querySelector('.schedule-card'), idx, true));
  if (navBtn) {
    navBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const loc = navBtn.getAttribute('data-location');
      const gmaps = navBtn.getAttribute('data-gmaps');
      openNavPopup(loc, gmaps, navBtn, view.shadowRoot);
    });
  }
  return item;
}

// 카드 사이 이동 정보 슬롯: 지도(map-view)가 계산한 실제 경로가 채워진다
function appendGapSlots(view, container, items, idx) {
  const transitSlot = document.createElement('div');
  transitSlot.className = 'transit-info hidden';
  transitSlot.id = `transit-info-${idx}`;
  container.appendChild(transitSlot);

  // 여기에 장소를 끼워 넣을 수 있다는 걸 자리로 보여준다. 도착 뒤에는
  // 넣을 수 없으므로 마지막 카드 다음에는 만들지 않는다.
  const nextItem = items[idx + 1];
  if (view.canEdit() && (isEditableItem(items[idx]) || isEditableItem(nextItem))) {
    container.appendChild(view.buildInsertSlot(idx + 1));
  }
}

export function renderActiveDay(view, safePlan) {
  const source = view.currentItinerary;
  const dayIndex = view.activeDayIndex;
  const request = view._mapRequest;
  const container = view.shadowRoot.getElementById('timeline-container');
  if (!container) return;

  // 날짜를 바꾸면 경고/안내/비용도 그 날짜 기준으로 다시 계산해야 한다.
  view.refreshEndTimeWarning();
  view.refreshTransitNotice();
  view.refreshCostSummary();
  refreshRainBanner(view);
  
  // Update Tabs UI
  const tabsContainer = view.shadowRoot.getElementById('day-tabs-container');
  const tabs = tabsContainer.querySelectorAll('.day-tab-btn');
  // 모양은 .day-tab-btn / .active 가 맡는다. 여기서 인라인으로 다시
  // 칠하던 코드가 있었는데, 최초 렌더만 고쳐 놓고 "탭 색을 고쳤다"고
  // 믿게 만들었다. 클릭하면 곧바로 보라로 돌아왔다.
  tabs.forEach((tab, idx) => {
    tab.classList.toggle('active', idx === view.activeDayIndex);
  });

  // Fade Out
  container.style.opacity = '0';
  // 계산이 빠르게 끝나도 이전 날짜의 카드에 결과를 붙이지 않는다.
  container.innerHTML = '';
  
  setTimeout(() => {
    if (source !== view.currentItinerary || dayIndex !== view.activeDayIndex
      || request !== view._mapRequest) return;
    container.innerHTML = ''; // Clear old
    
    const dayData = safePlan.days[view.activeDayIndex];
    if (!dayData) {
      container.style.opacity = '1';
      return;
    }

    const items = dayData.scheduleItems || [];
    const tripId = view.visitTripId;
    const userId = view.state.userId;
    const visited = tripId ? visitedStops.visited(tripId, userId) : null;
    const keys = stopKeys(dayData);
    const noteKeys = view.state.current?.source.kind === 'private' && view.canEdit() ? stopNoteKeys(dayData) : [];
    view.updateNextStop(dayData);
    
    if (items.length === 0) {
      container.appendChild(emptyDayItem());
      container.style.opacity = '1';
      return;
    }

    const ctx = { dayData, tripId, userId, visited, keys, noteKeys };
    items.forEach((scheduleItem, idx) => {
      container.appendChild(buildTimelineItem(view, ctx, scheduleItem, idx));
      if (idx < items.length - 1) appendGapSlots(view, container, items, idx);
    });

    // 지도 응답이 카드의 전환 애니메이션보다 빨랐어도 새 카드에 표시한다.
    view.applyResolvedPlaces(view.lastResolvedPlaces);
    view.renderTransitInfo(view.lastTransitRoutes);
    refreshHours(view);

    // Fade In
    requestAnimationFrame(() => {
      if (source === view.currentItinerary && request === view._mapRequest) container.style.opacity = '1';
    });
    
  }, 150); // wait for fade out
}

export function updateNextStop(view, dayData) {
  const panel = view.shadowRoot.getElementById('next-stop');
  if (!panel || !view.hasAttribute?.('mobile-summary')) return;
  const now = new Date();
  const timeZone = travelRegion(view.currentItinerary?.request || view.currentItinerary?.metadata?.request).timeZone;
  const today = localTravelDate(now, timeZone);
  const isToday = String(dayData.date).slice(0, 10) === today;
  const currentTime = new Intl.DateTimeFormat('en-GB', {timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(now);
  const tripId = view.visitTripId;
  const stop = pickNextStop(dayData, { visited: tripId ? visitedStops.visited(tripId, view.state.userId) : null, currentTime: isToday ? currentTime : undefined });
  panel.hidden = !stop;
  if (!stop) return;
  view.shadowRoot.getElementById('next-stop-label').textContent = t(isToday ? 'nextStopToday' : 'firstStop');
  view.shadowRoot.getElementById('next-stop-title').textContent = stop.title;
  view.shadowRoot.getElementById('next-stop-time').textContent = stop.time || '';
  const directions = view.shadowRoot.getElementById('next-stop-directions');
  directions.textContent = t('directionsBtn');
  directions.onclick = () => openNavPopup(
    typeof stop.location === 'string' && stop.location ? stop.location : stop.title,
    safeHttpUrl(stop.googleMapsUrl), directions, view.shadowRoot,
  );
}
