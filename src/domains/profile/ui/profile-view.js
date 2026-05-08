import { getCurrentUser, deleteCurrentUser, logout } from '../../auth/services/firebase-auth.js';
import { getUserItineraries, deleteItinerary, deleteAllUserItineraries } from '../../itinerary/services/firestore-service.js';
import { db } from '../../../lib/firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

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
            alert("인증 모듈을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
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
                alert("본인인증에 실패했습니다: " + rsp.error_msg);
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
            alert("저장에 실패했습니다.");
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

            const card = document.createElement('div');
            card.className = 'trip-card';
            card.innerHTML = `
                <div class="trip-info">
                    <div class="trip-title">여행 일정 (${anchorsCount}개의 핵심 장소)</div>
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

            listContainer.appendChild(card);
        });
    }

    viewTrip(item) {
        if (!item.itineraryPlan || !item.id) return;
        if (window.navigate) {
            // 🚀 [Routing] 동적 파라미터 경로(/view/:id)로 이동
            window.navigate('/view/' + item.id);
        }
    }

    async handleDeleteItinerary(id, cardEl) {
        if (confirm("정말로 이 여행 일정을 삭제하시겠습니까?")) {
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
                alert("일정 삭제에 실패했습니다.");
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
                    await deleteDoc(doc(db, "users", user.uid));

                    // 3. Delete Auth account
                    await deleteCurrentUser();

                    window.location.href = '/login';
                } catch (err) {
                    console.error("Account deletion failed:", err);
                    if (err.code === 'auth/requires-recent-login') {
                        alert('보안을 위해 다시 로그인한 후 탈퇴를 진행해 주세요.');
                        await logout();
                    } else {
                        alert('회원 탈퇴 처리 중 오류가 발생했습니다.');
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
                :host {
                    display: block;
                    width: 100%;
                    min-height: 100vh;
                    background-color: oklch(98% 0.01 260);
                    color: var(--text-primary);
                    font-family: 'Inter', sans-serif;
                }

                .profile-wrapper {
                    max-width: 1200px;
                    margin: 0 auto;
                    display: flex;
                    gap: 2rem;
                    padding: 3rem 1.5rem;
                }

                .sidebar {
                    width: 280px;
                    flex-shrink: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .btn-back-home {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 1rem 1.5rem;
                    margin-bottom: 1rem;
                    border-radius: 12px;
                    background: white;
                    border: 1px solid oklch(90% 0.02 260);
                    color: var(--text-primary);
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                }

                .btn-back-home:hover {
                    background: oklch(98% 0.01 260);
                    border-color: var(--accent-primary);
                    transform: translateX(-4px);
                }

                .nav-item {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 1rem 1.5rem;
                    border-radius: 12px;
                    cursor: pointer;
                    font-weight: 500;
                    color: var(--text-secondary);
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    user-select: none;
                }

                .nav-item:hover {
                    background-color: oklch(94% 0.02 260);
                    color: var(--text-primary);
                }

                .nav-item.active {
                    background-color: rgba(124, 58, 237, 0.1);
                    color: var(--accent-primary, #7c3aed);
                    font-weight: 700;
                }

                .nav-icon { font-size: 1.25rem; }

                .main-content {
                    flex-grow: 1;
                    max-width: 800px;
                }

                .header-banner {
                    text-align: center;
                    margin-bottom: 3rem;
                    animation: fadeInDown 0.6s ease-out;
                }

                .photo-hero {
                    width: 100px;
                    height: 100px;
                    border-radius: 50%;
                    object-fit: cover;
                    margin-bottom: 1.5rem;
                    border: 4px solid white;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                }

                .header-banner h1 {
                    font-size: 2rem;
                    font-weight: 800;
                    margin: 0;
                    letter-spacing: -0.02em;
                }

                .header-banner p {
                    color: var(--text-secondary);
                    margin-top: 0.5rem;
                    font-size: 1.1rem;
                }

                .content-section { display: none; }
                .content-section.active {
                    display: block;
                    animation: fadeInUp 0.4s ease-out;
                }

                .card {
                    background: white;
                    border: 1px solid oklch(90% 0.02 260);
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                    margin-bottom: 2rem;
                }

                .card-header {
                    padding: 1.5rem 2rem;
                    border-bottom: 1px solid oklch(94% 0.02 260);
                }

                .card-header h2 { margin: 0; font-size: 1.3rem; font-weight: 700; }
                .card-header p { margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.95rem; }

                .list-item {
                    display: flex;
                    align-items: center;
                    padding: 1.5rem 2rem;
                    border-bottom: 1px solid oklch(96% 0.01 260);
                    transition: background 0.2s;
                }

                .list-item:last-child { border-bottom: none; }

                .list-label {
                    width: 30%;
                    font-weight: 600;
                    color: var(--text-secondary);
                    font-size: 0.9rem;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .list-value {
                    width: 70%;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 1rem;
                }

                .photo-small { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; }
                .value-text { font-weight: 500; font-size: 1.05rem; }
                .not-set { color: var(--text-secondary); font-style: italic; font-size: 0.95rem; }

                /* Inline Form UI */
                .edit-mode-container {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    width: 100%;
                }

                .inline-input {
                    flex-grow: 1;
                    padding: 0.6rem 1rem;
                    border-radius: 8px;
                    border: 2px solid var(--accent-primary);
                    font-size: 1rem;
                    outline: none;
                    background: oklch(99% 0.01 260);
                }

                .edit-actions { display: flex; gap: 0.5rem; }

                .btn-save, .btn-cancel, .btn-edit-inline {
                    padding: 0.5rem 0.75rem;
                    border-radius: 8px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }

                .btn-save { background: var(--accent-primary); color: white; }
                .btn-cancel { background: oklch(94% 0.02 260); color: var(--text-secondary); }
                .btn-edit-inline {
                    background: transparent;
                    color: var(--accent-primary);
                    border: 1px solid var(--accent-primary);
                }
                .btn-edit-inline:hover { background: rgba(124, 58, 237, 0.05); }

                .value-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .verified-badge {
                    background: oklch(95% 0.1 150);
                    color: oklch(40% 0.15 150);
                    font-size: 0.75rem;
                    font-weight: 700;
                    padding: 0.2rem 0.6rem;
                    border-radius: 20px;
                    border: 1px solid oklch(85% 0.1 150);
                }

                .certification-success {
                    flex-direction: column;
                    align-items: flex-start;
                    width: 100%;
                }

                .cert-msg {
                    font-size: 0.9rem;
                    color: var(--accent-primary);
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                }

                /* My Trips */
                .itineraries-container { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
                .trip-card {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.5rem;
                    background: oklch(98% 0.01 260);
                    border: 1px solid oklch(92% 0.02 260);
                    border-radius: 16px;
                    transition: all 0.2s;
                }
                .trip-card:hover { border-color: var(--accent-primary); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
                .trip-title { font-weight: 700; color: var(--accent-primary); margin-bottom: 0.25rem; }
                .trip-date { font-size: 0.85rem; color: var(--text-secondary); }
                .trip-actions { display: flex; gap: 0.75rem; }

                .btn-view { background: var(--accent-primary); color: white; border: none; padding: 0.5rem 1.25rem; border-radius: 8px; font-weight: 700; cursor: pointer; }
                .btn-delete-trip { background: transparent; color: #ef4444; border: 1px solid #ef4444; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; cursor: pointer; }

                /* Danger Zone */
                .danger-section { border-color: rgba(239, 68, 68, 0.2); }
                .danger-header { background-color: rgba(239, 68, 68, 0.02); }
                .danger-header h2 { color: #ef4444; }
                .btn-danger-trigger { background: #ef4444; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 12px; font-weight: 700; cursor: pointer; margin: 1.5rem 2rem; transition: transform 0.2s; }
                .btn-danger-trigger:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); }

                /* Modal */
                .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px); z-index: 2000; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
                .modal-overlay.show { opacity: 1; pointer-events: auto; }
                .modal-content { background: white; width: 90%; max-width: 480px; border-radius: 24px; padding: 2rem; box-shadow: 0 20px 40px rgba(0,0,0,0.2); transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); position: relative; }
                .modal-overlay.show .modal-content { transform: scale(1); }
                .modal-close-x { position: absolute; top: 1.5rem; right: 1.5rem; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary); }
                .modal-content h3 { margin: 0 0 1rem 0; color: #ef4444; font-size: 1.5rem; font-weight: 800; }
                .modal-actions { display: flex; gap: 1rem; justify-content: flex-end; }
                .btn-modal-cancel { background: oklch(94% 0.02 260); border: none; padding: 0.75rem 1.5rem; border-radius: 12px; font-weight: 700; cursor: pointer; }
                .btn-modal-confirm { background: #ef4444; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 12px; font-weight: 700; cursor: pointer; }

                @keyframes fadeInDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                .loading-state, .empty-state, .error-state { padding: 3rem; text-align: center; color: var(--text-secondary); }

                @media (max-width: 768px) {
                    .profile-wrapper {
                        flex-direction: column;
                        padding: 1.5rem 1rem;
                        gap: 1.5rem;
                    }
                    .sidebar {
                        width: 100%;
                    }
                    .main-content {
                        max-width: 100%;
                    }
                    .list-item {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 0.5rem;
                        padding: 1rem 1.25rem;
                    }
                    .list-label {
                        width: 100%;
                    }
                    .list-value {
                        width: 100%;
                    }
                    .value-text, #user-email {
                        word-break: break-all;
                        overflow-wrap: break-word;
                    }
                    .edit-mode-container {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 0.75rem;
                    }
                    .edit-actions {
                        justify-content: flex-end;
                    }
                    .trip-card {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 1rem;
                    }
                    .trip-actions {
                        width: 100%;
                        justify-content: flex-end;
                    }
                    .btn-danger-trigger {
                        margin: 1.5rem;
                        width: calc(100% - 3rem);
                    }
                }
            </style>

            <div class="profile-wrapper">
                <nav class="sidebar">
                    <button id="btn-back-home" class="btn-back-home">
                        <span>←</span> <span>홈으로 돌아가기</span>
                    </button>
                    <div class="nav-item active" data-tab="personal">
                        <span class="nav-icon">👤</span> <span>개인 정보</span>
                    </div>
                    <div class="nav-item" data-tab="trips">
                        <span class="nav-icon">🗺️</span> <span>내 여행 일정</span>
                    </div>
                    <div class="nav-item" data-tab="security">
                        <span class="nav-icon">🛡️</span> <span>보안 및 계정</span>
                    </div>
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
