import { offlineTrips } from '../../itinerary/services/offline-trips.mjs';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { icons } from '../../../ui/icons.js';
import { getUserItineraries, deleteItinerary, renameItinerary } from '../../itinerary/services/firestore-service.js';
import { buildItineraryTitle, itineraryCity } from '../../itinerary/services/itinerary-title.mjs';
import { showToast, showErrorToast } from '../../../utils/toast.js';
import { t, getLang } from '../../../utils/i18n.js';
import { showConfirm } from '../../../utils/confirm-dialog.js';

/** 목록 자리에 한 줄짜리 안내를 놓는다(불러오는 중·실패·비어 있음). */
function stateBlock(className, text) {
  const box = document.createElement('div');
  box.className = className;
  box.textContent = text;
  return box;
}

// Titles saved before cities were added, renamed, or saved in the other language may not name
// the city; the card's date line names it then.
const tripCityPrefix = (item, title) => {
    const city = itineraryCity(item.itineraryPlan, getLang());
    return city && !['ko', 'en'].some(lang => title.includes(itineraryCity(item.itineraryPlan, lang))) ? `${city} · ` : '';
};

export async function fetchItineraries(view) {
    const user = getCurrentUser();
    if (!user || view.isLoadingItineraries) return;

    if (navigator.onLine === false) { view.itineraries=offlineTrips.list(user.uid); view.renderItineraries(); return; }
    view.isLoadingItineraries = true;
    const listContainer = view.shadowRoot.getElementById('itineraries-list');
    if (listContainer) {
        listContainer.textContent = '';
        listContainer.append(stateBlock('loading-state', t('loadingItineraries')));
    }

    try {
        const items = await getUserItineraries(user.uid);
        if (getCurrentUser()?.uid !== user.uid) return;
        if (navigator.onLine === false) view.itineraries=offlineTrips.list(user.uid);
        else {
            view.itineraries=items;
            try { offlineTrips.refresh(user.uid, items); } catch { showToast(t('offlineFailed'), { tone: 'warning' }); }
        }
        view.renderItineraries();
    } catch (error) {
        if (getCurrentUser()?.uid !== user.uid) return;
        console.error('Failed to fetch itineraries:', error);
        if (listContainer) {
            listContainer.textContent = '';
            listContainer.append(stateBlock('error-state', t('loadItinerariesFailed')));
        }
    } finally {
        view.isLoadingItineraries = false;
    }
}

export function renderItineraries(view) {
    const listContainer = view.shadowRoot.getElementById('itineraries-list');
    if (!listContainer) return;

    if (view.itineraries.length === 0) {
        listContainer.textContent = '';
        const offline = navigator.onLine === false;
        const empty = stateBlock('empty-state', t(offline ? 'offlineEmpty' : 'noSavedItineraries'));
        // Translated again on a language switch, like the button below.
        empty.dataset.i18n = offline ? 'offlineEmpty' : 'noSavedItineraries';
        listContainer.append(empty);
        // An empty list starts a trip from the same place as home's 일정 만들기.
        if (!offline) {
            const start = document.createElement('button');
            start.type = 'button';
            start.className = 'btn-view btn-new-trip';
            start.dataset.i18n = 'viewNewPlanBtn';
            start.textContent = t('viewNewPlanBtn');
            start.addEventListener('click', () => window.navigate ? window.navigate('/recommend') : (window.location.href = '/recommend'));
            listContainer.append(start);
        }
        return;
    }

    listContainer.innerHTML = '';
    view.itineraries.forEach(item => {
        const dateObj = item.createdAt?.toDate?.() || new Date(item.createdAtMillis || item.savedAt || Date.now());
        const dateString = dateObj.toLocaleDateString(getLang() === 'en' ? 'en-US' : 'ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
        const anchorsCount = item.itineraryPlan?.days?.reduce((acc, day) => acc + (day.scheduleItems?.filter(i => i.type === 'AnchorSchedule').length || 0), 0) || 0;
        // 저장 시 기록해 둔 제목을 쓰고, 그전에 저장된 문서는 지금 계산해 채운다.
        const tripTitle = item.title || buildItineraryTitle(item.itineraryPlan, getLang());
        const anchorSuffix = anchorsCount > 0 ? ` · ${t('flowPlaces')} ${anchorsCount}` : '';

        const card = document.createElement('div');
        card.className = 'trip-card';
        card.innerHTML = `
                <div class="trip-info">
                    <div class="trip-title-row">
                        <span class="trip-title"></span>
                        <span class="trip-anchor-suffix">${anchorSuffix}</span>
                        <button class="btn-rename" data-i18n-title="renameTitle" title="${t('renameTitle')}" data-i18n-aria="renameAria" aria-label="${t('renameAria')}">${icons.pencil}</button>
                    </div>
                    <div class="trip-date"><span class="trip-city">${tripCityPrefix(item, tripTitle)}</span>${t('savedOn').replace('{0}', dateString)}</div>
                </div>
                <div class="trip-actions">
                    <button class="btn-view" data-id="${item.id}" data-i18n="viewBtn">${t('viewBtn')}</button>
                    <button class="btn-duplicate" type="button" data-i18n="duplicateBtn">${t('duplicateBtn')}</button>
                    <button class="btn-public-course" type="button"></button><button class="btn-offline" type="button"></button><span class="offline-badge"></span>
                    <button class="btn-delete-trip" data-id="${item.id}" data-i18n="deleteBtn">${t('deleteBtn')}</button>
                </div>
            `;
        card.querySelector('.trip-title').textContent = tripTitle;
        const publicButton = card.querySelector('.btn-public-course');
        publicButton.textContent = t('publicCourseManage');
        publicButton.onclick = () => view.editPublicCourse(item, card);
        const uid=getCurrentUser()?.uid;
        const offlineButton=card.querySelector('.btn-offline');
        const saved=offlineTrips.get(uid,item.id);
        offlineButton.textContent=t(saved ? 'offlineRemove':'offlineSave');
        card.querySelector('.offline-badge').textContent=saved?t('offlineSaved'):'';
        offlineButton.onclick=()=> { try {
          if(saved)offlineTrips.remove(uid,item.id);else offlineTrips.save(uid,item);
          view.renderItineraries();
        } catch { showErrorToast(t('offlineFailed')); } };
        if(navigator.onLine===false) card.querySelectorAll('.btn-rename,.btn-delete-trip,.btn-public-course,.btn-offline,.btn-duplicate').forEach(button=>button.disabled=true);


        card.querySelector('.btn-view').onclick = (e) => {
            e.stopPropagation();
            view.viewTrip(item);
        };
        card.querySelector('.btn-delete-trip').onclick = (e) => {
            e.stopPropagation();
            view.handleDeleteItinerary(item.id, card);
        };
        card.querySelector('.btn-rename').onclick = (e) => {
            e.stopPropagation();
            view.startRename(item, card, tripTitle);
        };
        card.querySelector('.btn-duplicate').onclick = (e) => {
            e.stopPropagation();
            view.openDuplicate(item, e.currentTarget);
        };

        listContainer.appendChild(card);
    });
}

/**
 * 카드의 제목을 인라인 입력으로 바꿔 이름을 편집한다.
 *
 * 별도 화면이나 prompt() 없이 그 자리에서 고치게 한다. 저장은 title
 * 한 필드만 수정하므로 일정 내용은 그대로 유지된다(firestore.rules 도
 * 같은 조건으로 제한한다).
 */
export function startRename(view, item, card, currentTitle) {
    const row = card.querySelector('.trip-title-row');
    if (!row || row.dataset.editing === 'true') return;
    row.dataset.editing = 'true';

    const original = row.innerHTML;
    row.innerHTML = `
            <input class="rename-input" type="text" maxlength="100" data-i18n-aria="itineraryNameAria" aria-label="${t('itineraryNameAria')}">
            <button class="btn-rename-save" data-i18n="saveBtn">${t('saveBtn')}</button>
            <button class="btn-rename-cancel" data-i18n="cancelBtn">${t('cancelBtn')}</button>
        `;

    const input = row.querySelector('.rename-input');
    input.value = currentTitle;
    input.focus();
    input.select();

    const restore = () => {
        row.innerHTML = original;
        row.dataset.editing = 'false';
        card.querySelector('.btn-rename').onclick = (e) => {
            e.stopPropagation();
            view.startRename(item, card, card.querySelector('.trip-title').textContent);
        };
    };

    const commit = async () => {
        const next = input.value.trim();
        if (!next) {
            input.setCustomValidity(t('tripNameRequired'));
            input.reportValidity();
            input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
            return;
        }
        if (next === currentTitle) return restore();

        const saveBtn = row.querySelector('.btn-rename-save');
        saveBtn.disabled = true;
        saveBtn.textContent = t('savingBtn');
        try {
            await renameItinerary(item.id, next);
            item.title = next; // 다시 불러오지 않아도 목록 상태가 최신이 되도록
            restore();
            card.querySelector('.trip-title').textContent = next;
            card.querySelector('.trip-city').textContent = tripCityPrefix(item, next);
        } catch (error) {
            console.error('Rename failed:', error);
            saveBtn.disabled = false;
            saveBtn.textContent = t('saveBtn');
            input.setCustomValidity(t('tripRenameFailed'));
            input.reportValidity();
            setTimeout(() => input.setCustomValidity(''), 0);
        }
    };

    row.querySelector('.btn-rename-save').onclick = (e) => { e.stopPropagation(); commit(); };
    row.querySelector('.btn-rename-cancel').onclick = (e) => { e.stopPropagation(); restore(); };
    input.onclick = (e) => e.stopPropagation();
    input.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); restore(); }
    };
}

export function viewTrip(view, item) {
    if (!item.itineraryPlan || !item.id) return;
    if (window.navigate) {
        // [Routing] 동적 파라미터 경로(/view/:id)로 이동
        window.navigate('/view/' + item.id + (navigator.onLine === false ? '?offline=1' : ''));
    }
}

export async function handleDeleteItinerary(view, id, cardEl) {
    if (navigator.onLine === false) return;
    const userId = getCurrentUser()?.uid;
    const ok = await showConfirm({
        title: t('tripDeleteTitle'),
        message: t('tripDeleteMessage'),
        confirmText: t('deleteBtn'),
        cancelText: t('cancelBtn')
    });
    if (ok && userId && getCurrentUser()?.uid === userId) {
        try {
            await deleteItinerary(id);
            try { offlineTrips.remove(userId,id); } catch { showErrorToast(t('offlineFailed')); }
            window.dispatchEvent(new CustomEvent('itinerary-deleted', { detail: { id, userId } }));
            cardEl.style.opacity = '0.5';
            cardEl.style.pointerEvents = 'none';
            setTimeout(() => {
                cardEl.remove();
                view.itineraries = view.itineraries.filter(it => it.id !== id);
                if (view.itineraries.length === 0) view.renderItineraries();
            }, 300);
        } catch (error) {
            showErrorToast(t('tripDeleteFailed'));
        }
    }
}
