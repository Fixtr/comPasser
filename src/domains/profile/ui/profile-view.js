import { getCurrentUser, logout, requireRecentLoginForDeletion } from '../../auth/services/firebase-auth.js';
import { accountDeletionClient } from '../services/account-deletion-api.js';
import { loadFirestore } from '../../../lib/firestore-lazy.mjs';
import { createEmptyProfile, createProfileService } from '../services/profile-service.mjs';
import { profileMarkup } from './profile-template.js';
import { fetchItineraries, renderItineraries, startRename, viewTrip, handleDeleteItinerary } from './profile-trips.js';
import { openDuplicate, closeDuplicate, confirmDuplicate, setupDuplicateListeners } from './profile-trip-duplicate.js';
import { setupSecurityListeners, setupAccountDeletionListeners } from './profile-security.js';
import { editPublicCourse } from './profile-public-course.js';
import { showErrorToast } from '../../../utils/toast.js';
import { t, getLang, applyTranslations } from '../../../utils/i18n.js';

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

    fetchItineraries() { return fetchItineraries(this); }

    renderItineraries() { return renderItineraries(this); }

    editPublicCourse(item, card) { return editPublicCourse(item, card); }

    startRename(item, card, currentTitle) { return startRename(this, item, card, currentTitle); }

    /** Opens the new-start-date dialog; confirm saves a shifted copy and never writes the original. */
    openDuplicate(item, trigger) { return openDuplicate(this, item, trigger); }

    closeDuplicate() { return closeDuplicate(this); }

    confirmDuplicate() { return confirmDuplicate(this); }

    viewTrip(item) { return viewTrip(this, item); }

    handleDeleteItinerary(id, cardEl) { return handleDeleteItinerary(this, id, cardEl); }

    setupEventListeners() {
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

        setupSecurityListeners(this);
        setupDuplicateListeners(this);
        setupAccountDeletionListeners(this);

        const homeBtn = this.shadowRoot.getElementById('btn-back-home');
        if (homeBtn) {
            homeBtn.addEventListener('click', () => {
                if (window.navigate) window.navigate('/home');
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
