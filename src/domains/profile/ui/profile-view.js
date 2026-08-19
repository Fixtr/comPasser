import { getCurrentUser, deleteCurrentUser, logout } from '../../auth/services/firebase-auth.js';
import { getUserItineraries, deleteItinerary, deleteAllUserItineraries, renameItinerary } from '../../itinerary/services/firestore-service.js';
import { loadFirestore } from '../../../lib/firestore-lazy.mjs';
import { buildItineraryTitle } from '../../itinerary/services/itinerary-title.mjs';
import { profileStyles } from './profile-style.js';
import { showToast, showErrorToast } from '../../../utils/toast.js';
import { showConfirm } from '../../../utils/confirm-dialog.js';

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

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        this.loadUserData();
        this.fetchItineraries();

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
        const defaultAvatar = `https://ui-avatars.com/api/?name=${initial}&background=7c3aed&color=fff`;
        const avatarUrl = user.photoURL || defaultAvatar;

        if (photoHeroEl) photoHeroEl.src = avatarUrl;
        if (photoSmallEl) photoSmallEl.src = avatarUrl;
        if (nameEl) nameEl.textContent = user.displayName || '이름 없음';
        if (emailEl) emailEl.textContent = user.email || '이메일 없음';
        if (headerNameEl) headerNameEl.textContent = `반가워요, ${user.displayName || '사용자'}님!`;
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
                    <div class="cert-msg">✅ 인증이 완료되었습니다. 번호를 입력하고 저장하세요.</div>
                    <input type="tel" id="input-phoneNumber" class="inline-input" value="${value || ''}" placeholder="번호 입력">
                    <div class="edit-actions">
                        <button class="btn-save" data-field="phoneNumber">💾 저장</button>
                        <button class="btn-cancel" data-field="phoneNumber">❌ 취소</button>
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
                    <input type="${inputType}" id="input-${field}" class="inline-input" value="${value || ''}" placeholder="${label} 입력">
                    <div class="edit-actions">
                        <button class="btn-save" data-field="${field}">💾 저장</button>
                        <button class="btn-cancel" data-field="${field}">❌ 취소</button>
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
            const badge = (isPhone && isVerified) ? '<span class="verified-badge">인증완료 ✅</span>' : '';
            const buttonText = isPhone ? '📱 본인인증' : '✏️ 수정';

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

    handleCertification() {
        if (!window.IMP) {
            showToast("인증 모듈을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
            return;
        }

        const IMP = window.IMP;
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
        if (listContainer) listContainer.innerHTML = '<div class="loading-state">일정을 불러오는 중...</div>';

        try {
            this.itineraries = await getUserItineraries(user.uid);
            this.renderItineraries();
        } catch (error) {
            console.error('Failed to fetch itineraries:', error);
            if (listContainer) listContainer.innerHTML = '<div class="error-state">일정을 불러오지 못했습니다.</div>';
        } finally {
            this.isLoadingItineraries = false;
        }
    }

    renderItineraries() {
        const listContainer = this.shadowRoot.getElementById('itineraries-list');
        if (!listContainer) return;

        if (this.itineraries.length === 0) {
            listContainer.innerHTML = '<div class="empty-state">저장된 일정이 없습니다. 새로운 여행을 계획해 보세요!</div>';
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
                        <button class="btn-rename" title="이름 바꾸기" aria-label="일정 이름 바꾸기">✏️</button>
                    </div>
                    <div class="trip-date">저장일: ${dateString}</div>
                </div>
                <div class="trip-actions">
                    <button class="btn-view" data-id="${item.id}">보기</button>
                    <button class="btn-delete-trip" data-id="${item.id}">삭제</button>
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
            <input class="rename-input" type="text" maxlength="100" aria-label="일정 이름">
            <button class="btn-rename-save">저장</button>
            <button class="btn-rename-cancel">취소</button>
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
            saveBtn.textContent = '저장 중...';
            try {
                await renameItinerary(item.id, next);
                item.title = next; // 다시 불러오지 않아도 목록 상태가 최신이 되도록
                restore();
                card.querySelector('.trip-title').textContent = next;
            } catch (error) {
                console.error('Rename failed:', error);
                saveBtn.disabled = false;
                saveBtn.textContent = '저장';
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
            // 🚀 [Routing] 동적 파라미터 경로(/view/:id)로 이동
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
                confirmBtn.textContent = '데이터 정리 중...';

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
                    confirmBtn.textContent = '회원 탈퇴 확정';
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
                <nav class="sidebar" aria-label="프로필 메뉴">
                    <button id="btn-back-home" class="btn-back-home">
                        <span>←</span> <span>홈으로 돌아가기</span>
                    </button>
                    <button type="button" class="nav-item active" data-tab="personal" aria-current="page">
                        <span class="nav-icon" aria-hidden="true">👤</span> <span>개인 정보</span>
                    </button>
                    <button type="button" class="nav-item" data-tab="trips">
                        <span class="nav-icon" aria-hidden="true">🗺️</span> <span>내 여행 일정</span>
                    </button>
                    <button type="button" class="nav-item" data-tab="security">
                        <span class="nav-icon" aria-hidden="true">🛡️</span> <span>보안 및 계정</span>
                    </button>
                </nav>

                <main class="main-content">
                    <div class="header-banner">
                        <img id="user-photo-hero" class="photo-hero" src="" alt="Profile" />
                        <h1 id="header-name">반가워요!</h1>
                        <p>ComPasser에서 당신의 정보를 안전하게 관리하세요.</p>
                    </div>

                    <div id="personal" class="content-section active">
                        <div class="card">
                            <div class="card-header">
                                <h2>기본 정보</h2>
                                <p>서비스 이용 시 표시되는 나의 프로필 정보입니다.</p>
                            </div>
                            <div class="list-item">
                                <div class="list-label">프로필 사진</div>
                                <div class="list-value">
                                    <img id="user-photo-small" class="photo-small" src="" alt="Profile" />
                                </div>
                            </div>
                            <div class="list-item">
                                <div class="list-label">이름</div>
                                <div class="list-value">
                                    <span id="user-name" class="value-text">로딩 중...</span>
                                </div>
                            </div>
                            <div class="list-item">
                                <div class="list-label">생년월일</div>
                                <div id="field-birthday" class="list-value">
                                    <span class="not-set">로딩 중...</span>
                                </div>
                            </div>
                        </div>

                        <div class="card">
                            <div class="card-header">
                                <h2>연락처 정보</h2>
                            </div>
                            <div class="list-item">
                                <div class="list-label">이메일</div>
                                <div class="list-value">
                                    <span id="user-email" class="value-text">로딩 중...</span>
                                </div>
                            </div>
                            <div class="list-item">
                                <div class="list-label">휴대전화</div>
                                <div id="field-phoneNumber" class="list-value">
                                    <span class="not-set">로딩 중...</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="trips" class="content-section">
                        <div class="card">
                            <div class="card-header">
                                <h2>저장된 일정 관리</h2>
                                <p>AI가 생성한 당신만의 최적화된 여행 경로들입니다.</p>
                            </div>
                            <div id="itineraries-list" class="itineraries-container"></div>
                        </div>
                    </div>

                    <div id="security" class="content-section">
                        <div class="card">
                            <div class="card-header"><h2>계정 보안</h2></div>
                            <div class="list-item">
                                <div class="list-label">로그인 방식</div>
                                <div class="list-value"><span class="value-text">구글 계정 / 이메일 인증</span></div>
                            </div>
                            <div class="list-item">
                                <div class="list-label">비밀번호</div>
                                <div class="list-value"><span class="not-set">외부 로그인 연동 중</span></div>
                            </div>
                        </div>

                        <div class="card danger-section">
                            <div class="card-header danger-header">
                                <h2>계정 삭제</h2>
                                <p>ComPasser 계정을 영구적으로 삭제합니다. 모든 일정이 삭제됩니다.</p>
                            </div>
                            <button id="btn-delete-account-trigger" class="btn-danger-trigger">탈퇴 진행하기</button>
                        </div>
                    </div>
                </main>
            </div>

            <div id="delete-modal" class="modal-overlay">
                <div class="modal-content">
                    <span id="modal-close-x" class="modal-close-x">&times;</span>
                    <h3>정말로 탈퇴하시겠습니까?</h3>
                    <p>모든 여행 일정과 데이터가 즉시 삭제되며 절대 복구할 수 없습니다.</p>
                    <div class="modal-actions">
                        <button id="btn-modal-cancel" class="btn-modal-cancel">취소</button>
                        <button id="btn-modal-confirm" class="btn-modal-confirm">회원 탈퇴 확정</button>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('profile-view', ProfileView);
