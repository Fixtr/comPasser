import { offlineTrips } from '../services/offline-trips.mjs';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { t, getLang } from '../../../utils/i18n.js';
import { trackEvent } from '../../../utils/analytics.js';
import { showConfirm } from '../../../utils/confirm-dialog.js';
import { exportItineraryImage } from './itinerary-image-export.js';
import { measuredTransit } from '../services/boarding-pass.mjs';
import { buildItineraryCalendar } from '../services/itinerary-calendar.mjs';
import { itineraryShareDelivery } from './itinerary-share-delivery.js';
import { showToast as showGlobalToast } from '../../../utils/toast.js';

export function setupSaveListener(view) {
  const saveBtn = view.shadowRoot.getElementById('save-itinerary-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      trackEvent('save_itinerary_click');
      const path = window.location.pathname;
      return saveCurrent(view, { onSavedId: id => openSavedTrip(view, id, path) });
    });
  }
}

// Replace the pre-save /view or /share entry so Back can't reopen a copy that offers Save again.
// A user who already left keeps the page they went to.
function openSavedTrip(view, id, path) {
  if (window.navigate && window.location.pathname === path) window.navigate('/view/' + id, { replace: true });
}

async function saveCurrent(view, { onSavedId }) {
  const saveBtn = view.shadowRoot.getElementById('save-itinerary-btn');
  try {
    view._saving = true;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = t('savingStateBtn') || '저장 중...';
    }
    const result = await view.actions.save({
      language: getLang(),
      onSaved: id => {
        // Toast first: an offline-copy warning from refreshOfflineCopy then replaces it instead of being hidden.
        view.showToast(t('itinerarySaveToast') || '일정이 성공적으로 저장되었습니다.');
        refreshOfflineCopy(view, id);
        view.renderCurrentState();
        onSavedId(id);
      },
    });
    if (result.status === 'login-required') {
      view.loginToSave();
    } else if (result.status === 'saved-earlier-version') {
      view.showToast(t('itinerarySavedEarlierVersion'));
    }
    return result;
  } catch (error) {
    console.error("Save error:", error);
    view.showToast(t('saveFailToast') || "저장에 실패했습니다.", true);
    return { status: 'failed' };
  } finally {
    view._saving = false;
    view.refreshAccessControls();
  }
}

// A trip kept for offline reading must show the saved changes at the trip site.
function refreshOfflineCopy(view, id) {
  try {
    const offline = offlineTrips.get(view.state.userId, id);
    if (offline) offlineTrips.save(offline.userId, { ...offline, itineraryPlan: view.currentItinerary });
  } catch {
    showGlobalToast(t('offlineFailed'), { tone: 'warning' });
  }
}

export async function getShareUrl(view) {
  // A running save or share would otherwise write a second trip or public document.
  if (view._saving || view._sharing) {
    showGlobalToast(t('creatingLink'), { tone: 'warning' });
    return null;
  }
  // Firestore writes wait forever without a connection, which would leave the button stuck.
  if (navigator.onLine === false) {
    view.showToast(t('shareLinkFailed'), true);
    return null;
  }
  const path = window.location.pathname;
  const leaving = new AbortController();
  const onLeave = () => leaving.abort();
  window.addEventListener('popstate', onLeave);
  let savedId = null;
  view._sharing = true;
  try {
    const result = await view.actions.getShareLink({
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
        const saved = await saveCurrent(view, { onSavedId: id => { savedId = id; } });
        return window.location.pathname === path ? saved : { status: 'left' };
      },
    });
    if (result.status === 'login-required') view.loginToSave();
    if (result.status === 'not-shared') showGlobalToast(t('shareNotCreatedAfterSave'), { tone: 'warning' });
    return result.status === 'ready' ? result.url : null;
  } finally {
    view._sharing = false;
    window.removeEventListener('popstate', onLeave);
    if (savedId) openSavedTrip(view, savedId, path);
  }
}

export function setupShareListener(view) {
  const shareBtn = view.shadowRoot.getElementById('share-itinerary-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      if (!view.currentItinerary) return;

      const originalText = shareBtn.textContent;
      try {
        shareBtn.textContent = t('creatingLink');
        shareBtn.disabled = true;

        const shareUrl = await view.getShareUrl();
        if (!shareUrl) return;

        await itineraryShareDelivery.copyLink(shareUrl);
        if (!await view.actions.linkDelivered(shareUrl)) throw new Error('The shared trip no longer opens');
        showGlobalToast(t('shareSuccessAlert') || "공유 링크가 클립보드에 복사되었습니다!", { tone: 'success' });
      } catch (error) {
        console.error("Share error:", error);
        view.showToast(t('shareLinkFailed'), true);
      } finally {
        shareBtn.textContent = originalText;
        shareBtn.disabled = false;
      }
    });
  }
}

export function setupKakaoShareListener(view) {
  const kakaoBtn = view.shadowRoot.getElementById('kakao-share-btn');
  if (kakaoBtn) {
    kakaoBtn.addEventListener('click', async () => {
      trackEvent('share_kakao_click');
      if (!view.currentItinerary) return;

      const originalText = kakaoBtn.textContent;
      try {
        kakaoBtn.textContent = t('creatingLink');
        kakaoBtn.disabled = true;

        const shareUrl = await view.getShareUrl();
        if (!shareUrl) return;

        await itineraryShareDelivery.shareToKakao(shareUrl);
        if (!await view.actions.linkDelivered(shareUrl)) throw new Error('The shared trip no longer opens');
      } catch (error) {
        console.error("Kakao Share error:", error);
        view.showToast(t('kakaoShareFailed'), true);
      } finally {
        kakaoBtn.textContent = originalText;
        kakaoBtn.disabled = false;
      }
    });
  }
}

export function setupDownloadListener(view) {
  const downloadBtn = view.shadowRoot.getElementById('download-image-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => view.downloadAsImage());
  }
  view.shadowRoot.getElementById('calendar-export-btn')?.addEventListener('click', () => view.downloadCalendar());
}

/** The whole trip as an .ics file; calendars import it from the download. */
export async function downloadCalendar(view) {
  const entry = view.state.current;
  const userId = getCurrentUser()?.uid || null;
  if (entry && entry.source.kind !== 'shared' && entry.source.ownerId !== userId) return;
  let url;
  try {
    const snapshot = view.state.snapshot();
    const ics = snapshot && await buildItineraryCalendar(snapshot.plan, view.state.calendarTripKey(), new Date(), getLang());
    if (entry !== view.state.current || userId !== (getCurrentUser()?.uid || null)) return;
    if (!ics) { view.showToast(t('nothingToShare'), true); return; }
    url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'compasser-trip.ics';
    link.click();
    view.showToast(t('calendarExportDone'));
  } catch (error) {
    console.error('Calendar export failed:', error);
    view.showToast(t('calendarExportFailed'), true);
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/** 내보낼 사본과 번역을 전달하고, 화면의 버튼·결과 알림만 관리한다. */
export async function downloadAsImage(view) {
  if (!view.currentItinerary) return;

  const downloadBtn = view.shadowRoot.getElementById('download-image-btn');

  try {
    if (downloadBtn) {
      downloadBtn.disabled = true;
      // 언어 전환 시에도 진행 상태를 번역하고, 완료 후에는 현재 언어를 사용한다.
      downloadBtn.dataset.i18n = 'generatingImage';
      downloadBtn.textContent = t('generatingImage');
    }
    const snapshot = view.state.snapshot();
    const result = await exportItineraryImage({
      plan: snapshot.plan,
      dayIndex: snapshot.dayIndex,
      language: getLang(),
      // lastTransitRoutes always belongs to the active day, which is the day being exported.
      transit: measuredTransit(view.normalizeData(snapshot.plan)?.days?.[snapshot.dayIndex]?.scheduleItems, view.lastTransitRoutes),
      labels: {
        fixedLabel: t('anchorBadge'),
        fromLabel: t('ticketFromLabel'),
        toLabel: t('ticketToLabel'),
        transitLabel: t('transitTotalLabel'),
        costLabel: t('costLabel'),
      },
    });
    if (result === 'empty') {
      view.showToast(t('nothingToShare'), true);
    } else if (result === 'shared') {
      view.showToast(t('shareImageDone'));
    } else if (result === 'downloaded') {
      view.showToast(t('saveImageDone'));
    }
  } catch (error) {
    console.error('[boarding-pass] 이미지 생성 실패:', error);
    view.showToast(t('captureUnsupported'), true);
  } finally {
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.dataset.i18n = 'downloadTicketBtn';
      downloadBtn.textContent = t('downloadTicketBtn');
    }
  }
}
