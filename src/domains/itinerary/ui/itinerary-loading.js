import { loadItineraryDocument, watchSharedItinerary } from '../services/firestore-service.js';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { t } from '../../../utils/i18n.js';
import { icons } from '../../../ui/icons.js';

export async function loadItineraryById(view, id, { sharedOnly = false, userId = getCurrentUser()?.uid } = {}) {
  if (userId) view.setSessionUser(userId);
  const key = `${sharedOnly ? 'shared' : userId || 'guest'}:${id}`;
  if (view._pendingDocument?.key === key) return view._pendingDocument.promise;
  const previous = view.state.current;
  const cached = !sharedOnly && view.state.activateDocument(id, { sharedOnly, userId });
  if (cached && cached.source.kind !== 'shared') {
    if (cached !== previous) {
      view.cancelPendingLoad();
      view.renderCurrentState();
    } else {
      view.resumeMapRoute();
      view.refreshAccessControls();
    }
    return true;
  }
  const pending = { key, promise: fetchItineraryById(view, id, { sharedOnly, userId }) };
  view._pendingDocument = pending;
  try {
    return await pending.promise;
  } finally {
    if (view._pendingDocument === pending) view._pendingDocument = null;
  }
}

async function fetchItineraryById(view, id, { sharedOnly, userId }) {
  view.clear();
  const version = view._loadVersion;
  try {
    view.setLoading(true);

    const document = await loadItineraryDocument(id, { sharedOnly, userId });
    if (version !== view._loadVersion) return false;

    if (document?.deleted) {
      view.showMissing(`<div class="state-block" role="alert"><h1 class="state-title" data-i18n="sharedDeleted">${t('sharedDeleted')}</h1></div>`);
      return false;
    }

    if (!document) {
      // 예전 /view 링크는 개인·공유가 섞여 있다. 게스트는 공유본만 조회한
      // 뒤, 개인 일정일 수 있는 경우 로그인하고 같은 주소로 돌아온다.
      if (!sharedOnly && !userId) {
        window.navigate('/login?next=' + encodeURIComponent('/view/' + id));
        return false;
      }
      view.showMissing(`
        <div class="state-block" role="alert">
           <div class="state-icon">${icons.search}</div>
           <h1 class="state-title" data-i18n="viewNotFoundTitle">${t('viewNotFoundTitle')}</h1>
           <p class="state-desc"><span data-i18n="viewNotFoundDesc1">${t('viewNotFoundDesc1')}</span><br><span data-i18n="viewNotFoundDesc2">${t('viewNotFoundDesc2')}</span></p>
           <button class="state-action" onclick="window.navigate('/recommend')" data-i18n="viewNewPlanBtn">${t('viewNewPlanBtn')}</button>
        </div>
      `);
      return false;
    }

    if (!view.showResults(document.itineraryPlan, { access: document.access, id })) return false;
    if (document.access === 'shared') {
      const stop = await watchSharedItinerary(id, () => {
        if (version === view._loadVersion && view.sharedId === id) {
          // Drop cached content before the authoritative deletion/error check.
          fetchItineraryById(view, id, { sharedOnly: true, userId: getCurrentUser()?.uid });
        }
      });
      if (version === view._loadVersion && view.sharedId === id) view._stopSharedWatch = stop;
      else stop();
    }

    return true;
  } catch (error) {
    if (version !== view._loadVersion) return false;
    view.clear();
    console.error('🔥 렌더링 치명적 오류:', error);
    view.showMissing(`
      <div class="state-block danger" role="alert">
         <div class="state-icon">${icons.warn}</div>
         <h1 class="state-title" data-i18n="viewLoadErrorTitle">${t('viewLoadErrorTitle')}</h1>
         <p class="state-desc" data-i18n="sharedLoadRetry">${t('sharedLoadRetry')}</p>
         <button type="button" class="state-action" id="retry-load-btn" data-i18n="shellRetry">${t('shellRetry')}</button>
      </div>
    `);
    view._failedLoad = { id, sharedOnly, path: window.location.pathname };
    const retry = view.shadowRoot.getElementById('retry-load-btn');
    retry.addEventListener('click', () => { retry.focus(); view.retryFailedLoad(); });
    return false;
  } finally {
    if (version === view._loadVersion) view.setLoading(false);
  }
}

/** Ionic keeps left pages mounted, so a hidden view must not reload (it could redirect) when the connection returns. */
export async function retryFailedLoad(view) {
  const failed = view._failedLoad;
  if (!failed || failed.path !== window.location.pathname) return;
  // The retry replaces the card, so keyboard focus on its button must move with it.
  const hadFocus = view.shadowRoot.activeElement?.id === 'retry-load-btn';
  const loaded = await view.loadItineraryById(failed.id, { sharedOnly: failed.sharedOnly });
  if (loaded) view.dispatchEvent(new CustomEvent('itinerary-recovered'));
  // A control the user moved to while it loaded keeps focus.
  if (!hadFocus || (document.activeElement && document.activeElement !== document.body)) return;
  const timeline = view.shadowRoot.getElementById('timeline-container');
  timeline.tabIndex = -1;
  (view.shadowRoot.getElementById('retry-load-btn') || timeline).focus();
}
