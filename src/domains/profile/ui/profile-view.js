import { getCurrentUser, deleteCurrentUser, logout } from '../../auth/services/firebase-auth.js';
import { icons } from '../../../ui/icons.js';
import { loadPortOne } from '../../../utils/external-scripts.js';
import { getUserItineraries, deleteItinerary, deleteAllUserItineraries, renameItinerary } from '../../itinerary/services/firestore-service.js';
import { loadFirestore } from '../../../lib/firestore-lazy.mjs';
import { buildItineraryTitle } from '../../itinerary/services/itinerary-title.mjs';
import { profileStyles } from './profile-style.js';
import { showToast, showErrorToast } from '../../../utils/toast.js';
import { t, applyTranslations } from '../../../utils/i18n.js';
import { showConfirm } from '../../../utils/confirm-dialog.js';

/** 목록 자리에 한 줄짜리 안내를 놓는다(불러오는 중·실패·비어 있음). */
function stateBlock(className, text) {
  const box = document.createElement('div');
  box.className = className;
  box.textContent = text;
  return box;
}

class ProfileView extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.activeTab = 'personal';
        this.itineraries = [];
        this.isLoadingItineraries = false;
        this.userData = {
            phoneNumber: '',
            birthday: '',
            isVerified: false
        };
        this.editingField = null; // 'phoneNumber' or 'birthday'
        this.showCertificationInput = false;
    }

    disconnectedCallback() {
        window.removeEventListener('i18n-changed', this._i18nHandler);
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        this.loadUserData();
        this.fetchItineraries();

        // 언어를 바꾸면 이 화면도 따라와야 한다. 마크업의 data-i18n 은
        // 첫 그림만 t() 로 채워지고, 이후 전환은 이 자리가 맡는다.
        this._i18nHandler = () => applyTranslations(this.shadowRoot);
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
        const container = this.closest('.page-container');
        if (container) {
            observer.observe(container, { attributes: true });
        }
    }

    async loadUserData() {
        const user = getCurrentUser();
        if (user) {
            // 1. Set Auth Data
            this.updateBasicAuthUI(user);

            // 2. Fetch Firestore Data
            try {
                const { db, doc, getDoc } = await loadFirestore();
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    this.userData = { ...this.userData, ...userDocSnap.data() };
                }
                this.updateExtendedProfileUI();
            } catch (error) {
                console.error("Error loading extended profile:", error);
            }
        }
    }

    updateBasicAuthUI(user) {
        const photoHeroEl = this.shadowRoot.getElementById('user-photo-hero');
        const photoSmallEl = this.shadowRoot.getElementById('user-photo-small');
        const nameEl = this.shadowRoot.getElementById('user-name');
        const emailEl = this.shadowRoot.getElementById('user-email');
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
        this.renderField('birthday', '생년월일', this.userData.birthday, 'date');
        this.renderField('phoneNumber', '휴대전화', this.userData.phoneNumber, 'tel', this.userData.isVerified);
    }

    renderField(field, label, value, inputType, isVerified = false) {
        const container = this.shadowRoot.getElementById(`field-${field}`);
        if (!container) return;

        const isEditing = this.editingField === field;
        const displayValue = value || '설정되지 않음';
        const hasValue = !!value;

        // Special Case: PortOne Certification Flow for Phone Number
        if (field === 'phoneNumber' && this.showCertificationInput) {
            container.innerHTML = `
                <div class="edit-mode-container certification-success">
                    <div class="cert-msg">${icons.check}<span data-i18n="phoneVerifiedHint">${t('phoneVerifiedHint')}</span></div>
                    <input type="tel" id="input-phoneNumber" class="inline-input" value="${value || ''}" data-i18n-placeholder="phoneInputPlaceholder" placeholder="${t('phoneInputPlaceholder')}">
                    <div class="edit-actions">
                        <button class="btn-save" data-field="phoneNumber" data-i18n="saveBtn">${t('saveBtn')}</button>
                        <button class="btn-cancel" data-field="phoneNumber" data-i18n="cancelBtn">${t('cancelBtn')}</button>
                    </div>
                </div>
            `;
            const input = container.querySelector('input');
            input.focus();
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9-]/g, '');
            });

            container.querySelector('.btn-save').onclick = () => this.handleSave('phoneNumber', true);
            container.querySelector('.btn-cancel').onclick = () => {
                this.showCertificationInput = false;
                this.updateExtendedProfileUI();
            };
            return;
        }

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
            if (inputType === 'tel') {
                input.addEventListener('input', (e) => {
                    e.target.value = e.target.value.replace(/[^0-9-]/g, '');
                });
            }

            container.querySelector('.btn-save').onclick = () => this.handleSave(field);
            container.querySelector('.btn-cancel').onclick = () => this.handleCancel();
        } else {
            const isPhone = field === 'phoneNumber';
            const badge = (isPhone && isVerified) ? `<span class="verified-badge" data-i18n="verifiedBadge">${t('verifiedBadge')}</span>` : '';
            const buttonText = isPhone ? '본인인증' : '수정';

            container.innerHTML = `
                <div class="value-wrapper">
                    <span class="value-text ${!hasValue ? 'not-set' : ''}">${displayValue}</span>
                    ${badge}
                </div>
                <button class="btn-edit-inline" data-field="${field}">${buttonText}</button>
            `;

            if (isPhone) {
                container.querySelector('.btn-edit-inline').onclick = () => this.handleCertification();
            } else {
                container.querySelector('.btn-edit-inline').onclick = () => this.handleEdit(field);
            }
        }
    }

    async handleCertification() {
        // 본인인증을 시작한 지금 불러온다. 실패해도 이 기능 하나만 막히고
        // 앱 전체는 살아 있다.
        let IMP;
        try {
            IMP = await loadPortOne();
        } catch (e) {
            showErrorToast("본인인증 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
            return;
        }

        IMP.init('imp66802662'); // TODO: 실제 식별코드로 변경 (현재는 테스트 가맹점 코드)

        IMP.certification({
            pg: 'inicis_unified',
            merchant_uid: 'cert_' + new Date().getTime(),
            popup: true
        }, (rsp) => {
            if (rsp.success) {
                this.showCertificationInput = true;
                this.updateExtendedProfileUI();
            } else {
                showErrorToast("본인인증에 실패했습니다: " + rsp.error_msg);
            }
        });
    }

    handleEdit(field) {
        this.editingField = field;
        this.updateExtendedProfileUI();
    }

    handleCancel() {
        this.editingField = null;
        this.updateExtendedProfileUI();
    }

    async handleSave(field, isVerifiedUpdate = false) {
        const input = this.shadowRoot.getElementById(`input-${field}`);
        const newValue = input.value.trim();
        const user = getCurrentUser();

        if (!user) return;

        try {
            const { db, doc, setDoc } = await loadFirestore();
            const userDocRef = doc(db, "users", user.uid);
            const updateData = { [field]: newValue };
            if (isVerifiedUpdate) {
                updateData.isVerified = true;
            }

            await setDoc(userDocRef, updateData, { merge: true });

            this.userData[field] = newValue;
            if (isVerifiedUpdate) {
                this.userData.isVerified = true;
                this.showCertificationInput = false;
            }

            this.editingField = null;
            this.updateExtendedProfileUI();
        } catch (error) {
            console.error("Failed to save data:", error);
            showErrorToast("저장에 실패했습니다.");
        }
    }

    async fetchItineraries() {
        const user = getCurrentUser();
        if (!user || this.isLoadingItineraries) return;

        this.isLoadingItineraries = true;
        const listContainer = this.shadowRoot.getElementById('itineraries-list');
        if (listContainer) {
            listContainer.textContent = '';
            listContainer.append(stateBlock('loading-state', t('loadingItineraries')));
        }

        try {
            this.itineraries = await getUserItineraries(user.uid);
            this.renderItineraries();
        } catch (error) {
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
            listContainer.append(stateBlock('empty-state', t('noSavedItineraries')));
            return;
        }

        listContainer.innerHTML = '';
        this.itineraries.forEach(item => {
            const dateObj = item.createdAt?.toDate() || new Date();
            const dateString = dateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
            const anchorsCount = item.itineraryPlan?.days?.reduce((acc, day) => acc + (day.scheduleItems?.filter(i => i.type === 'AnchorSchedule').length || 0), 0) || 0;
            // 저장 시 기록해 둔 제목을 쓰고, 그전에 저장된 문서는 지금 계산해 채운다.
            const tripTitle = item.title || buildItineraryTitle(item.itineraryPlan);
            const anchorSuffix = anchorsCount > 0 ? ` · 필수 ${anchorsCount}곳` : '';

            const card = document.createElement('div');
            card.className = 'trip-card';
            card.innerHTML = `
                <div class="trip-info">
                    <div class="trip-title-row">
                        <span class="trip-title">${tripTitle}</span>
                        <span class="trip-anchor-suffix">${anchorSuffix}</span>
                        <button class="btn-rename" data-i18n-title="renameTitle" title="${t('renameTitle')}" data-i18n-aria="renameAria" aria-label="${t('renameAria')}">${icons.pencil}</button>
                    </div>
                    <div class="trip-date">${t('savedOn').replace('{0}', dateString)}</div>
                </div>
                <div class="trip-actions">
                    <button class="btn-view" data-id="${item.id}" data-i18n="viewBtn">${t('viewBtn')}</button>
                    <button class="btn-delete-trip" data-id="${item.id}" data-i18n="deleteBtn">${t('deleteBtn')}</button>
                </div>
            `;

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
            if (!next || next === currentTitle) return restore();

            const saveBtn = row.querySelector('.btn-rename-save');
            saveBtn.disabled = true;
            saveBtn.textContent = t('savingBtn');
            try {
                await renameItinerary(item.id, next);
                item.title = next; // 다시 불러오지 않아도 목록 상태가 최신이 되도록
                restore();
                card.querySelector('.trip-title').textContent = next;
            } catch (error) {
                console.error('Rename failed:', error);
                saveBtn.disabled = false;
                saveBtn.textContent = t('saveBtn');
                input.setCustomValidity(error.message || '이름을 바꾸지 못했습니다.');
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

    viewTrip(item) {
        if (!item.itineraryPlan || !item.id) return;
        if (window.navigate) {
            // [Routing] 동적 파라미터 경로(/view/:id)로 이동
            window.navigate('/view/' + item.id);
        }
    }

    async handleDeleteItinerary(id, cardEl) {
        const ok = await showConfirm({
            title: '일정 삭제',
            message: '정말로 이 여행 일정을 삭제하시겠습니까? 삭제한 일정은 되돌릴 수 없습니다.',
            confirmText: '삭제',
            cancelText: '취소'
        });
        if (ok) {
            try {
                await deleteItinerary(id);
                cardEl.style.opacity = '0.5';
                cardEl.style.pointerEvents = 'none';
                setTimeout(() => {
                    cardEl.remove();
                    this.itineraries = this.itineraries.filter(it => it.id !== id);
                    if (this.itineraries.length === 0) this.renderItineraries();
                }, 300);
            } catch (error) {
                showErrorToast("일정 삭제에 실패했습니다.");
            }
        }
    }

    setupEventListeners() {
        const tabs = this.shadowRoot.querySelectorAll('.nav-item');
        const sections = this.shadowRoot.querySelectorAll('.content-section');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                if (window.navigate) {
                    window.navigate('/profile/' + target);
                } else {
                    this.setTabFromPath(target);
                }
            });
        });

        const deleteBtn = this.shadowRoot.getElementById('btn-delete-account-trigger');
        const modal = this.shadowRoot.getElementById('delete-modal');
        const cancelBtn = this.shadowRoot.getElementById('btn-modal-cancel');
        const confirmBtn = this.shadowRoot.getElementById('btn-modal-confirm');
        const closeX = this.shadowRoot.getElementById('modal-close-x');

        const openModal = () => modal.classList.add('show');
        const closeModal = () => modal.classList.remove('show');

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
                if (!user) return;

                confirmBtn.disabled = true;
                confirmBtn.textContent = t('deletingDataBtn');

                try {
                    // 1. Delete all itineraries
                    await deleteAllUserItineraries(user.uid);

                    // 2. Delete user document from Firestore
                    const { db, doc, deleteDoc } = await loadFirestore();
                    await deleteDoc(doc(db, "users", user.uid));

                    // 3. Delete Auth account
                    await deleteCurrentUser();

                    window.location.href = '/login';
                } catch (err) {
                    console.error("Account deletion failed:", err);
                    if (err.code === 'auth/requires-recent-login') {
                        showErrorToast('보안을 위해 다시 로그인한 후 탈퇴를 진행해 주세요.', { duration: 5000 });
                        await logout();
                    } else {
                        showErrorToast('회원 탈퇴 처리 중 오류가 발생했습니다.');
                    }
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
        this.shadowRoot.innerHTML = `
            <style>
                ${profileStyles}
            </style>

            <div class="profile-wrapper">
                <nav class="sidebar" data-i18n-aria="profileMenuAria" aria-label="${t('profileMenuAria')}">
                    <button id="btn-back-home" class="btn-back-home">
                        <span>←</span> <span data-i18n="backHome">${t('backHome')}</span>
                    </button>
                    <button type="button" class="nav-item active" data-tab="personal" aria-current="page">
                        <span class="nav-icon" aria-hidden="true">${icons.user}</span> <span data-i18n="navPersonal">${t('navPersonal')}</span>
                    </button>
                    <button type="button" class="nav-item" data-tab="trips">
                        <span class="nav-icon" aria-hidden="true">${icons.map}</span> <span data-i18n="navItineraries">${t('navItineraries')}</span>
                    </button>
                    <button type="button" class="nav-item" data-tab="security">
                        <span class="nav-icon" aria-hidden="true">${icons.shield}</span> <span data-i18n="navSecurity">${t('navSecurity')}</span>
                    </button>
                </nav>

                <main class="main-content">
                    <div class="header-banner">
                        <img id="user-photo-hero" class="photo-hero" src="" alt="Profile" />
                        <h1 id="header-name" data-i18n="profileGreetingPlain">${t('profileGreetingPlain')}</h1>
                        <p data-i18n="profileHeaderDesc">${t('profileHeaderDesc')}</p>
                    </div>

                    <div id="personal" class="content-section active">
                        <div class="card">
                            <div class="card-header">
                                <h2 data-i18n="sectionBasicInfo">${t('sectionBasicInfo')}</h2>
                                <p data-i18n="sectionBasicInfoDesc">${t('sectionBasicInfoDesc')}</p>
                            </div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelProfilePhoto">${t('labelProfilePhoto')}</div>
                                <div class="list-value">
                                    <img id="user-photo-small" class="photo-small" src="" alt="Profile" />
                                </div>
                            </div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelName">${t('labelName')}</div>
                                <div class="list-value">
                                    <span id="user-name" class="value-text" data-i18n="loadingShort">${t('loadingShort')}</span>
                                </div>
                            </div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelBirthday">${t('labelBirthday')}</div>
                                <div id="field-birthday" class="list-value">
                                    <span class="not-set" data-i18n="loadingShort">${t('loadingShort')}</span>
                                </div>
                            </div>
                        </div>

                        <div class="card">
                            <div class="card-header">
                                <h2 data-i18n="sectionContact">${t('sectionContact')}</h2>
                            </div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelEmail">${t('labelEmail')}</div>
                                <div class="list-value">
                                    <span id="user-email" class="value-text" data-i18n="loadingShort">${t('loadingShort')}</span>
                                </div>
                            </div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelPhone">${t('labelPhone')}</div>
                                <div id="field-phoneNumber" class="list-value">
                                    <span class="not-set" data-i18n="loadingShort">${t('loadingShort')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="trips" class="content-section">
                        <div class="card">
                            <div class="card-header">
                                <h2 data-i18n="sectionSavedItineraries">${t('sectionSavedItineraries')}</h2>
                                <p data-i18n="sectionSavedItinerariesDesc">${t('sectionSavedItinerariesDesc')}</p>
                            </div>
                            <div id="itineraries-list" class="itineraries-container"></div>
                        </div>
                    </div>

                    <div id="security" class="content-section">
                        <div class="card">
                            <div class="card-header"><h2 data-i18n="sectionSecurity">${t('sectionSecurity')}</h2></div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelLoginMethod">${t('labelLoginMethod')}</div>
                                <div class="list-value"><span data-i18n="loginMethodValue">${t('loginMethodValue')}</span></div>
                            </div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelPassword">${t('labelPassword')}</div>
                                <div class="list-value"><span class="not-set" data-i18n="passwordExternal">${t('passwordExternal')}</span></div>
                            </div>
                        </div>

                        <div class="card danger-section">
                            <div class="card-header danger-header">
                                <h2 data-i18n="sectionDeleteAccount">${t('sectionDeleteAccount')}</h2>
                                <p data-i18n="deleteAccountDesc">${t('deleteAccountDesc')}</p>
                            </div>
                            <button id="btn-delete-account-trigger" class="btn-danger-trigger" data-i18n="deleteAccountBtn">${t('deleteAccountBtn')}</button>
                        </div>
                    </div>
                </main>
            </div>

            <div id="delete-modal" class="modal-overlay">
                <div class="modal-content">
                    <span id="modal-close-x" class="modal-close-x">&times;</span>
                    <h3 data-i18n="deleteAccountConfirmTitle">${t('deleteAccountConfirmTitle')}</h3>
                    <p data-i18n="deleteAccountConfirmDesc">${t('deleteAccountConfirmDesc')}</p>
                    <div class="modal-actions">
                        <button id="btn-modal-cancel" class="btn-modal-cancel" data-i18n="cancelBtn">${t('cancelBtn')}</button>
                        <button id="btn-modal-confirm" class="btn-modal-confirm" data-i18n="confirmDeleteAccountBtn">${t('confirmDeleteAccountBtn')}</button>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('profile-view', ProfileView);
