import { offlineTrips } from '../../itinerary/services/offline-trips.mjs';
import { unblockAllAuthors } from '../../itinerary/services/blocked-authors.mjs';
import { getCurrentUser, logout, requireRecentLoginForDeletion } from '../../auth/services/firebase-auth.js';
import { icons } from '../../../ui/icons.js';
import { getUserItineraries, deleteItinerary, renameItinerary, saveItinerary } from '../../itinerary/services/firestore-service.js';
import { shiftItineraryDates, itineraryStartDate, copyTitle } from '../../itinerary/services/itinerary-duplicate.mjs';
import { todayString } from '../../planner/services/trip-date.mjs';
import { accountDeletionClient } from '../services/account-deletion-api.js';
import { loadFirestore } from '../../../lib/firestore-lazy.mjs';
import { createEmptyProfile, createProfileService } from '../services/profile-service.mjs';
import { buildItineraryTitle, itineraryCity } from '../../itinerary/services/itinerary-title.mjs';
import { profileMarkup } from './profile-template.js';
import { editPublicCourse } from './profile-public-course.js';
import { showToast, showErrorToast } from '../../../utils/toast.js';
import { t, getLang, setLang, applyTranslations } from '../../../utils/i18n.js';
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

class ProfileView extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.activeTab = 'personal';
        this.itineraries = [];
        this.isLoadingItineraries = false;
        this.userData = createEmptyProfile();
        this.generationCredits = undefined;
        this.profileService = createProfileService({
            getCurrentUser, loadFirestore,
            requireRecentLogin: requireRecentLoginForDeletion,
            requestAccountDeletion: userId => accountDeletionClient.request(userId),
        });
        this.editingField = null;
    }

    disconnectedCallback() {
        window.removeEventListener('i18n-changed', this._i18nHandler);
        window.removeEventListener('offline', this._networkHandler); window.removeEventListener('online', this._networkHandler);
        clearTimeout(this._deletionTimer);
        this._deletionWatch = null;
        this._visibilityObserver?.disconnect();
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        this.loadUserData();
        this.fetchItineraries();
        this._networkHandler=()=>this.fetchItineraries();
        window.addEventListener('offline',this._networkHandler); window.addEventListener('online',this._networkHandler);

        // 언어를 바꾸면 이 화면도 따라와야 한다. 마크업의 data-i18n 은
        // 첫 그림만 t() 로 채워지고, 이후 전환은 이 자리가 맡는다.
        this._i18nHandler = () => {
            applyTranslations(this.shadowRoot);
            this.shadowRoot.getElementById('profile-language').value = getLang();
            const user = getCurrentUser(); if (user) this.updateBasicAuthUI(user);
            if (this.userData && !this.editingField) this.updateExtendedProfileUI();
            this.renderDeletionStatus(); this.renderGenerationCredits(); if (this.itineraries.length) this.renderItineraries();
        };
        window.addEventListener('i18n-changed', this._i18nHandler);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const container = this.closest('.page-container');
                    if (container) {
                        const display = window.getComputedStyle(container).display;
                        if (display !== 'none') {
                            this.loadUserData();
                            this.fetchItineraries();
                        }
                    }
                }
            });
        });
        this._visibilityObserver = observer;
        const container = this.closest('.page-container');
        if (container) {
            observer.observe(container, { attributes: true });
        }
    }

    async loadUserData() {
        const user = getCurrentUser();
        this.watchDeletion(user);
        const logoutBtn = this.shadowRoot.getElementById('btn-logout');
        if (logoutBtn) logoutBtn.hidden = !user;
        if (user) {
            // 1. Set Auth Data
            this.updateBasicAuthUI(user);

            // 2. 프로필 문서 접근과 기본값은 서비스가 담당한다.
            try {
                const result = await this.profileService.loadProfile();
                if (!result || result.userId !== getCurrentUser()?.uid) return;
                this.userData = result.profile;
                this.updateExtendedProfileUI();
            } catch (error) {
                console.error("Error loading extended profile:", error);
            }
        }
    }

    watchDeletion(user, { restart = false } = {}) {
        if (!restart && this._deletionWatch?.user === user) return;
        clearTimeout(this._deletionTimer);
        const watch = user ? { user } : null;
        this._deletionWatch = watch;
        if (!restart) this.deletionState = user ? 'checking' : null;
        this.renderDeletionStatus();
        if (!watch) return;
        const stillCurrent = () => this._deletionWatch === watch && getCurrentUser()?.uid === user.uid
            && getCurrentUser()?.metadata?.creationTime === user.metadata?.creationTime;
        const check = async () => {
            if (!stillCurrent()) return;
            try {
                const status = await accountDeletionClient.status(user);
                if (!stillCurrent()) return;
                if (status.state === 'not-found' && accountDeletionClient.hasReceipt(user)) {
                    // Submission can still be in flight after a lost response.
                    this.deletionState = 'unknown';
                    this.renderDeletionStatus();
                } else await this.applyDeletionStatus(status, user.uid, user.metadata?.creationTime);
                if (status.state === 'completed' || status.state === 'blocked' || (status.state === 'not-found' && !accountDeletionClient.hasReceipt(user))) return;
            } catch {
                if (!stillCurrent()) return;
                // Missing deployment/offline is not proof of either deletion or preservation.
                this.deletionState = accountDeletionClient.hasReceipt(user) ? 'unknown' : null;
                this.renderDeletionStatus();
            }
            if (stillCurrent()) {
                this._deletionTimer = setTimeout(check, 15_000);
            }
        };
        void check();
    }

    renderDeletionStatus() {
        const status = this.shadowRoot.getElementById('account-deletion-status');
        const key = { checking: 'accountDeletionChecking', pending: 'accountDeletionPending', blocked: 'accountDeletionBlocked', unknown: 'accountDeletionUnknown', completed: 'accountDeletionCompleted' }[this.deletionState];
        if (status) {
            status.textContent = key ? t(key) : '';
            status.dataset.state = this.deletionState || '';
        }
        const button = this.shadowRoot.getElementById('btn-delete-account-trigger');
        if (button) button.disabled = ['checking', 'pending', 'unknown', 'blocked', 'completed'].includes(this.deletionState);
    }

    setGenerationCredits(balance) {
        this.generationCredits = balance;
        this.renderGenerationCredits();
    }

    renderGenerationCredits() {
        const value = this.shadowRoot?.getElementById('generation-credit-balance');
        if (value) value.textContent = this.generationCredits === 'unlimited' ? t('generationCreditsUnlimited') : Number.isSafeInteger(this.generationCredits)
            ? t('generationCreditsCount').replace('{0}', this.generationCredits)
            : t(this.generationCredits === undefined ? 'generationCreditsLoading' : 'generationCreditsUnavailable');
    }

    async applyDeletionStatus(status, userId, identityCreatedAt = getCurrentUser()?.metadata?.creationTime) {
        if (getCurrentUser()?.uid !== userId || getCurrentUser()?.metadata?.creationTime !== identityCreatedAt) return;
        if (status.state === 'not-found' && ['pending', 'completed', 'blocked'].includes(this.deletionState)) return;
        this.deletionState = status.state;
        this.renderDeletionStatus();
        if (status.state !== 'completed' || this._finishingDeletion) return;
        this._finishingDeletion = true;
        try {
            window.dispatchEvent(new CustomEvent('itinerary-deleted', { detail: { id: null, userId } }));
            await logout();
            if (!getCurrentUser()) window.location.href = '/account-deletion-status';
        } catch (error) {
            console.error('Completed deletion sign-out failed:', error);
            if (getCurrentUser()?.uid === userId) showErrorToast(t('accountDeletionSignOutFailed'));
        } finally { this._finishingDeletion = false; }
    }

    updateBasicAuthUI(user) {
        const photoHeroEl = this.shadowRoot.getElementById('user-photo-hero');
        const photoSmallEl = this.shadowRoot.getElementById('user-photo-small');
        const nameEl = this.shadowRoot.getElementById('user-name');
        const emailEl = this.shadowRoot.getElementById('user-email');
        const method = this.shadowRoot.getElementById('profile-login-method');
        if (method) method.textContent = user.providerData?.map(provider => provider.providerId === 'password' ? t('labelEmail') : provider.providerId === 'google.com' ? 'Google' : provider.providerId).join(' / ') || (user.email ? t('labelEmail') : '—');
        const headerNameEl = this.shadowRoot.getElementById('header-name');

        const initial = encodeURIComponent(user.displayName || 'User');
        // 기본 아바타도 무채색으로. 보라(7c3aed)는 지도에서 "고정 일정"을
        // 뜻하는 색이라, 사진 없는 사용자마다 그 색이 화면에 하나씩 늘었다.
        const defaultAvatar = `https://ui-avatars.com/api/?name=${initial}&background=EBEBE7&color=141414`;
        const avatarUrl = user.photoURL || defaultAvatar;

        if (photoHeroEl) photoHeroEl.src = avatarUrl;
        if (photoSmallEl) photoSmallEl.src = avatarUrl;
        if (nameEl) nameEl.textContent = user.displayName || t('noName');
        if (emailEl) emailEl.textContent = user.email || t('noEmail');
        if (headerNameEl) headerNameEl.textContent = t('profileGreeting').replace('{0}', user.displayName || t('someone'));
    }

    updateExtendedProfileUI() {
        this.renderField('birthday', t('labelBirthday'), this.userData.birthday, 'date');
    }

    renderField(field, label, value, inputType) {
        const container = this.shadowRoot.getElementById(`field-${field}`);
        if (!container) return;

        const isEditing = this.editingField === field;
        const displayValue = value || t('profileFieldNotSet');
        const hasValue = !!value;

        if (isEditing) {
            container.innerHTML = `
                <div class="edit-mode-container">
                    <input type="${inputType}" id="input-${field}" class="inline-input" value="${value || ''}" placeholder="${t('fieldInputPlaceholder').replace('{0}', label)}">
                    <div class="edit-actions">
                        <button class="btn-save" data-field="${field}" data-i18n="saveBtn">${t('saveBtn')}</button>
                        <button class="btn-cancel" data-field="${field}" data-i18n="cancelBtn">${t('cancelBtn')}</button>
                    </div>
                </div>
            `;
            const input = container.querySelector('input');
            input.focus();
            container.querySelector('.btn-save').onclick = () => this.handleSave(field);
            container.querySelector('.btn-cancel').onclick = () => this.handleCancel();
        } else {
            container.innerHTML = `
                <div class="value-wrapper">
                    <span class="value-text ${!hasValue ? 'not-set' : ''}">${displayValue}</span>
                </div>
                <button class="btn-edit-inline" data-field="${field}" data-i18n="editFieldBtn">${t('editFieldBtn')}</button>
            `;
            container.querySelector('.btn-edit-inline').onclick = () => this.handleEdit(field);
        }
    }

    handleEdit(field) {
        this.editingField = field;
        this.updateExtendedProfileUI();
    }

    handleCancel() {
        this.editingField = null;
        this.updateExtendedProfileUI();
    }

    async handleSave(field) {
        const input = this.shadowRoot.getElementById(`input-${field}`);
        const newValue = input.value;
        const user = getCurrentUser();

        if (!user) return;

        try {
            const result = await this.profileService.saveField(field, newValue);
            if (!result || result.userId !== getCurrentUser()?.uid) return;
            this.userData = { ...this.userData, ...result.changes };

            this.editingField = null;
            this.updateExtendedProfileUI();
        } catch (error) {
            console.error("Failed to save data:", error);
            showErrorToast(t('profileSaveFailed'));
        }
    }

    async fetchItineraries() {
        const user = getCurrentUser();
        if (!user || this.isLoadingItineraries) return;

        if (navigator.onLine === false) { this.itineraries=offlineTrips.list(user.uid); this.renderItineraries(); return; }
        this.isLoadingItineraries = true;
        const listContainer = this.shadowRoot.getElementById('itineraries-list');
        if (listContainer) {
            listContainer.textContent = '';
            listContainer.append(stateBlock('loading-state', t('loadingItineraries')));
        }

        try {
            const items = await getUserItineraries(user.uid);
            if (getCurrentUser()?.uid !== user.uid) return;
            if (navigator.onLine === false) this.itineraries=offlineTrips.list(user.uid);
            else {
                this.itineraries=items;
                try { offlineTrips.refresh(user.uid, items); } catch { showToast(t('offlineFailed'), { tone: 'warning' }); }
            }
            this.renderItineraries();
        } catch (error) {
            if (getCurrentUser()?.uid !== user.uid) return;
            console.error('Failed to fetch itineraries:', error);
            if (listContainer) {
                listContainer.textContent = '';
                listContainer.append(stateBlock('error-state', t('loadItinerariesFailed')));
            }
        } finally {
            this.isLoadingItineraries = false;
        }
    }

    renderItineraries() {
        const listContainer = this.shadowRoot.getElementById('itineraries-list');
        if (!listContainer) return;

        if (this.itineraries.length === 0) {
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
        this.itineraries.forEach(item => {
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
            publicButton.onclick = () => this.editPublicCourse(item, card);
            const uid=getCurrentUser()?.uid;
            const offlineButton=card.querySelector('.btn-offline');
            const saved=offlineTrips.get(uid,item.id);
            offlineButton.textContent=t(saved ? 'offlineRemove':'offlineSave');
            card.querySelector('.offline-badge').textContent=saved?t('offlineSaved'):'';
            offlineButton.onclick=()=> { try {
              if(saved)offlineTrips.remove(uid,item.id);else offlineTrips.save(uid,item);
              this.renderItineraries();
            } catch { showErrorToast(t('offlineFailed')); } };
            if(navigator.onLine===false) card.querySelectorAll('.btn-rename,.btn-delete-trip,.btn-public-course,.btn-offline,.btn-duplicate').forEach(button=>button.disabled=true);


            card.querySelector('.btn-view').onclick = (e) => {
                e.stopPropagation();
                this.viewTrip(item);
            };
            card.querySelector('.btn-delete-trip').onclick = (e) => {
                e.stopPropagation();
                this.handleDeleteItinerary(item.id, card);
            };
            card.querySelector('.btn-rename').onclick = (e) => {
                e.stopPropagation();
                this.startRename(item, card, tripTitle);
            };
            card.querySelector('.btn-duplicate').onclick = (e) => {
                e.stopPropagation();
                this.openDuplicate(item, e.currentTarget);
            };

            listContainer.appendChild(card);
        });
    }

    editPublicCourse(item, card) { return editPublicCourse(item, card); }

    /**
     * 카드의 제목을 인라인 입력으로 바꿔 이름을 편집한다.
     *
     * 별도 화면이나 prompt() 없이 그 자리에서 고치게 한다. 저장은 title
     * 한 필드만 수정하므로 일정 내용은 그대로 유지된다(firestore.rules 도
     * 같은 조건으로 제한한다).
     */
    startRename(item, card, currentTitle) {
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
                this.startRename(item, card, card.querySelector('.trip-title').textContent);
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

    /** Opens the new-start-date dialog; confirm saves a shifted copy and never writes the original. */
    openDuplicate(item, trigger) {
        const input = this.shadowRoot.getElementById('duplicate-date');
        this._duplicate = { item, trigger, uid: getCurrentUser()?.uid };
        input.value = itineraryStartDate(item.itineraryPlan);
        input.min = todayString();
        input.setCustomValidity('');
        this.shadowRoot.getElementById('duplicate-modal').classList.add('show');
        input.focus();
    }

    closeDuplicate() {
        if (this.shadowRoot.getElementById('btn-duplicate-confirm').disabled) return; // saving
        this.shadowRoot.getElementById('duplicate-modal').classList.remove('show');
        this._duplicate?.trigger?.focus?.();
        this._duplicate = null;
    }

    async confirmDuplicate() {
        const input = this.shadowRoot.getElementById('duplicate-date');
        const confirm = this.shadowRoot.getElementById('btn-duplicate-confirm');
        const user = getCurrentUser();
        const { item, trigger, uid } = this._duplicate || {};
        if (!item || confirm.disabled) return;
        // The account changed while the dialog was open: never save one account's trip into another.
        if (!user || user.uid !== uid || user.uid !== item.userId) { this.closeDuplicate(); return; }
        if (navigator.onLine === false) { showErrorToast(t('duplicateFailed')); return; }
        let plan;
        try { plan = shiftItineraryDates(item.itineraryPlan, input.value, todayString()); } catch {
            input.setCustomValidity(t('duplicateDateInvalid'));
            input.reportValidity();
            return;
        }
        confirm.disabled = true;
        if (trigger) trigger.disabled = true;
        try {
            // An untitled trip shows a title built from its dates, so the copy saves none and gets one from its new dates.
            const id = await saveItinerary(user.uid, plan, copyTitle(item.title, item.itineraryPlan, plan, t('duplicateSuffix')));
            confirm.disabled = false;
            this.closeDuplicate();
            showToast(t('duplicateDone'));
            if (getCurrentUser()?.uid !== user.uid) return;
            await this.fetchItineraries();
            // The refresh replaced every card, so focus the copy, else the original's duplicate button, else the list.
            const list = this.shadowRoot.getElementById('itineraries-list');
            const target = list?.querySelector(`.btn-view[data-id="${id}"]`)
                || list?.querySelector(`.btn-view[data-id="${item.id}"]`)?.closest('.trip-card')?.querySelector('.btn-duplicate');
            if (target) target.focus();
            else if (list) { list.tabIndex = -1; list.focus(); }
        } catch (error) {
            console.error('Duplicate failed:', error);
            showErrorToast(t('duplicateFailed'));
        } finally {
            confirm.disabled = false;
            if (trigger) trigger.disabled = false;
        }
    }

    viewTrip(item) {
        if (!item.itineraryPlan || !item.id) return;
        if (window.navigate) {
            // [Routing] 동적 파라미터 경로(/view/:id)로 이동
            window.navigate('/view/' + item.id + (navigator.onLine === false ? '?offline=1' : ''));
        }
    }

    async handleDeleteItinerary(id, cardEl) {
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
                    this.itineraries = this.itineraries.filter(it => it.id !== id);
                    if (this.itineraries.length === 0) this.renderItineraries();
                }, 300);
            } catch (error) {
                showErrorToast(t('tripDeleteFailed'));
            }
        }
    }

    setupEventListeners() {
        const language=this.shadowRoot.getElementById('profile-language');
        language.value=getLang(); language.onchange=()=>setLang(language.value);
        const tabs = this.shadowRoot.querySelectorAll('.nav-item');
        const sections = this.shadowRoot.querySelectorAll('.content-section');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                if (window.navigate) {
                    window.navigate(target === 'trips' ? '/profile/personal?tab=trips' : '/profile/' + target);
                } else {
                    this.setTabFromPath(target);
                }
            });
        });

        // The Ionic shell dropped the old header, so this is the only sign-out control.
        this.shadowRoot.getElementById('btn-unblock-all')?.addEventListener('click', async () => {
            if (!(await showConfirm({ title: t('unblockAllBtn'), message: t('unblockAllNotice'), confirmText: t('unblockAllConfirm'), cancelText: t('cancelBtn') }))) return;
            showToast(unblockAllAuthors() ? t('unblockAllDone') : t('unblockAllNone'));
        });
        this.shadowRoot.getElementById('btn-logout')?.addEventListener('click', async () => {
            try {
                await logout();
                if (window.navigate) window.navigate('/home');
            } catch (error) {
                console.error('Logout failed:', error);
                showErrorToast(t('logoutFailed'));
            }
        });

        const duplicateModal = this.shadowRoot.getElementById('duplicate-modal');
        const duplicateInput = this.shadowRoot.getElementById('duplicate-date');
        const duplicateCancel = this.shadowRoot.getElementById('btn-duplicate-cancel');
        const duplicateConfirm = this.shadowRoot.getElementById('btn-duplicate-confirm');
        duplicateCancel?.addEventListener('click', () => this.closeDuplicate());
        duplicateConfirm?.addEventListener('click', () => this.confirmDuplicate());
        duplicateInput?.addEventListener('input', () => duplicateInput.setCustomValidity(''));
        duplicateModal?.addEventListener('click', e => { if (e.target === duplicateModal) this.closeDuplicate(); });
        // Escape closes and Tab stays inside the dialog, like the shared confirm dialog.
        duplicateModal?.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); this.closeDuplicate(); return; }
            if (e.key === 'Enter' && e.target === duplicateInput) { e.preventDefault(); this.confirmDuplicate(); return; }
            if (e.key !== 'Tab') return;
            const focusables = [duplicateInput, duplicateCancel, duplicateConfirm].filter(control => !control.disabled);
            const index = focusables.indexOf(this.shadowRoot.activeElement);
            e.preventDefault();
            focusables[(index + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length].focus();
        });

        const deleteBtn = this.shadowRoot.getElementById('btn-delete-account-trigger');
        const modal = this.shadowRoot.getElementById('delete-modal');
        const cancelBtn = this.shadowRoot.getElementById('btn-modal-cancel');
        const confirmBtn = this.shadowRoot.getElementById('btn-modal-confirm');
        const closeX = this.shadowRoot.getElementById('modal-close-x');

        let deletionCancelled = false;
        let deletionStarted = false;
        const openModal = () => {
            if (confirmBtn?.disabled || deleteBtn?.disabled) return;
            deletionCancelled = false;
            modal.classList.add('show');
        };
        const closeModal = () => {
            if (deletionStarted) return;
            deletionCancelled = true;
            modal.classList.remove('show');
        };

        if (deleteBtn) deleteBtn.addEventListener('click', openModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        if (closeX) closeX.addEventListener('click', closeModal);

        const homeBtn = this.shadowRoot.getElementById('btn-back-home');
        if (homeBtn) {
            homeBtn.addEventListener('click', () => {
                if (window.navigate) window.navigate('/home');
            });
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                const user = getCurrentUser();
                if (!user || confirmBtn.disabled) return;

                confirmBtn.disabled = true;
                confirmBtn.textContent = t('checkingAccountDeletionBtn');

                try {
                    const result = await this.profileService.deleteAccount({
                        isCancelled: () => deletionCancelled,
                        onDeletionStarted: () => {
                            deletionStarted = true;
                            if (cancelBtn) cancelBtn.disabled = true;
                            confirmBtn.textContent = t('deletingDataBtn');
                        },
                    });
                    if (result && getCurrentUser()?.uid === result.userId) {
                        await this.applyDeletionStatus(result, result.userId, result.identityCreatedAt);
                        if (result.state === 'pending') this.watchDeletion(user, { restart: true });
                    }
                } catch (err) {
                    console.error("Account deletion failed:", err);
                    if (deletionCancelled) return;
                    if (getCurrentUser()?.uid !== user.uid || getCurrentUser()?.metadata?.creationTime !== user.metadata?.creationTime) return;
                    if (err.code === 'auth/requires-recent-login') {
                        showErrorToast(t('accountDeletionSignInRequired'), { duration: 5000 });
                        try {
                            await logout();
                            // 인증 구독이 먼저 /login으로 보내도 next를 붙여 계정 관리로 복귀한다.
                            // 다른 계정으로 바뀌었으면 새 세션의 화면을 건드리지 않는다.
                            if (!getCurrentUser()) {
                                const path = '/login?next=%2Fprofile%2Fsecurity';
                                if (window.navigate) window.navigate(path);
                                else window.location.href = path;
                            }
                        } catch (logoutError) {
                            console.error('Re-login preparation failed:', logoutError);
                            // 토스트는 한 번에 하나라, 앞의 재로그인 안내를 함께 담는다.
                            if (getCurrentUser()?.uid === user.uid) showErrorToast(`${t('accountDeletionSignInRequired')} ${t('accountDeletionSignOutFailed')}`, { duration: 8000 });
                        }
                    } else {
                        showErrorToast(t(err.deletionStatusUnknown ? 'accountDeletionUnknown' : 'accountDeletionCheckFailed'));
                        if (err.deletionStatusUnknown) {
                            this.deletionState = 'unknown';
                            this.watchDeletion(user, { restart: true });
                        }
                    }
                } finally {
                    deletionStarted = false;
                    if (cancelBtn) cancelBtn.disabled = false;
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = t('confirmDeleteAccountBtn');
                    closeModal();
                }
            });
        }
    }

    setTabFromPath(tabId) {
        if (!tabId) tabId = 'personal';
        // Map common aliases if needed
        if (tabId === 'personal-info') tabId = 'personal';
        if (tabId === 'my-trips') tabId = 'trips';

        this.activeTab = tabId;
        this.shadowRoot.querySelector('.profile-wrapper')?.classList.toggle('standalone-trips',tabId==='trips' && this.hasAttribute?.('standalone-trips'));
        const tabs = this.shadowRoot.querySelectorAll('.nav-item');
        const sections = this.shadowRoot.querySelectorAll('.content-section');

        let found = false;
        tabs.forEach(t => {
            const isActive = t.dataset.tab === tabId;
            t.classList.toggle('active', isActive);
            // 시각적 강조만으로는 스크린리더가 현재 위치를 알 수 없다.
            if (isActive) t.setAttribute('aria-current', 'page');
            else t.removeAttribute('aria-current');
            if (isActive) found = true;
        });

        sections.forEach(s => s.classList.toggle('active', s.id === tabId));

        // Fallback for invalid tab ids
        if (!found && tabId !== 'personal') {
            this.setTabFromPath('personal');
        }

        // Trigger data fetch if switching to trips
        if (tabId === 'trips') {
            this.fetchItineraries();
        }
    }

    render() {
        this.shadowRoot.innerHTML = profileMarkup();
    }
}

customElements.define('profile-view', ProfileView);
