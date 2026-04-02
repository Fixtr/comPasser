import { getCurrentUser, deleteCurrentUser, logout } from '../../auth/services/firebase-auth.js';
import { getUserItineraries, deleteItinerary } from '../../itinerary/services/firestore-service.js';

class ProfileView extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.activeTab = 'personal-info';
        this.itineraries = [];
        this.isLoadingItineraries = false;
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        this.loadUserData();
        
        // Initial load of itineraries if we are on that tab, or just load them anyway
        this.fetchItineraries();

        // Observe visibility to refresh data if needed
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const display = window.getComputedStyle(this.closest('.page-container')).display;
                    if (display !== 'none') {
                        this.loadUserData();
                        this.fetchItineraries();
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

            card.querySelector('.btn-view').addEventListener('click', () => this.viewTrip(item));
            card.querySelector('.btn-delete-trip').addEventListener('click', () => this.handleDeleteItinerary(item.id, card));

            listContainer.appendChild(card);
        });
    }

    viewTrip(item) {
        if (!item.itineraryPlan) return;
        
        // Use Global navigate function defined in main.js
        if (window.navigate) {
            window.navigate('/view');
            
            // Replicate the logic from main.js for loading saved itinerary
            let requestData = item.itineraryPlan.request || item.itineraryPlan.metadata?.request;
            if (requestData) {
                sessionStorage.setItem('currentFormData', JSON.stringify(requestData));
            }
            sessionStorage.setItem('currentPhase', '3');
            sessionStorage.setItem('savedItineraryData', JSON.stringify(item.itineraryPlan));

            // Heavy lifting after a frame to keep UI smooth
            requestAnimationFrame(() => {
                const itineraryView = document.querySelector('itinerary-view');
                const mapView = document.querySelector('map-view');
                if (itineraryView) itineraryView.showResults(item.itineraryPlan);
                if (mapView) mapView.renderRoute(item.itineraryPlan);
            });
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
                    if (this.itineraries.length === 0) {
                        this.renderItineraries();
                    }
                }, 300);
            } catch (error) {
                alert("일정 삭제에 실패했습니다.");
            }
        }
    }

    setupEventListeners() {
        // Tab Management
        const tabs = this.shadowRoot.querySelectorAll('.nav-item');
        const sections = this.shadowRoot.querySelectorAll('.content-section');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                this.activeTab = target;

                tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === target));
                sections.forEach(s => s.classList.toggle('active', s.id === target));
            });
        });

        // Account Deletion Modal
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

        // Home Button
        const homeBtn = this.shadowRoot.getElementById('btn-back-home');
        if (homeBtn) {
            homeBtn.addEventListener('click', () => {
                if (window.navigate) window.navigate('/home');
            });
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                confirmBtn.disabled = true;
                confirmBtn.textContent = '처리 중...';
                try {
                    await deleteCurrentUser();
                    window.location.href = '/login'; 
                } catch (err) {
                    console.error(err);
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

                /* Sidebar Navigation */
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
                    background-color: rgba(124, 58, 237, 0.1); /* purple tint */
                    color: var(--accent-primary, #7c3aed);
                    font-weight: 700;
                }

                .nav-icon {
                    font-size: 1.25rem;
                }

                /* Main Content Area */
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

                .content-section {
                    display: none;
                }

                .content-section.active {
                    display: block;
                    animation: fadeInUp 0.4s ease-out;
                }

                /* Card Design */
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

                .card-header h2 {
                    margin: 0;
                    font-size: 1.3rem;
                    font-weight: 700;
                }

                .card-header p {
                    margin: 0.5rem 0 0 0;
                    color: var(--text-secondary);
                    font-size: 0.95rem;
                }

                .list-item {
                    display: flex;
                    align-items: center;
                    padding: 1.5rem 2rem;
                    border-bottom: 1px solid oklch(96% 0.01 260);
                    transition: background 0.2s;
                }

                .list-item:last-child {
                    border-bottom: none;
                }

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
                    gap: 1rem;
                }

                .photo-small {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    object-fit: cover;
                }

                .value-text {
                    font-weight: 500;
                    font-size: 1.05rem;
                }

                .not-set {
                    color: var(--text-secondary);
                    font-style: italic;
                    font-size: 0.95rem;
                }

                /* My Trips Styling */
                .itineraries-container {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    padding: 1rem;
                }

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

                .trip-card:hover {
                    border-color: var(--accent-primary);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                }

                .trip-title {
                    font-weight: 700;
                    color: var(--accent-primary);
                    margin-bottom: 0.25rem;
                }

                .trip-date {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                }

                .trip-actions {
                    display: flex;
                    gap: 0.75rem;
                }

                .btn-view {
                    background: var(--accent-primary);
                    color: white;
                    border: none;
                    padding: 0.5rem 1.25rem;
                    border-radius: 8px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: opacity 0.2s;
                }

                .btn-view:hover {
                    opacity: 0.9;
                }

                .btn-delete-trip {
                    background: transparent;
                    color: #ef4444;
                    border: 1px solid #ef4444;
                    padding: 0.5rem 1rem;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .btn-delete-trip:hover {
                    background: rgba(239, 68, 68, 0.05);
                }

                /* Security / Danger Zone */
                .danger-section {
                    border-color: rgba(239, 68, 68, 0.2);
                }

                .danger-header {
                    background-color: rgba(239, 68, 68, 0.02);
                }

                .danger-header h2 {
                    color: #ef4444;
                }

                .btn-danger-trigger {
                    background: #ef4444;
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    margin: 1.5rem 2rem;
                    transition: transform 0.2s, box-shadow 0.2s;
                }

                .btn-danger-trigger:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
                }

                /* Modal Styling */
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.4);
                    backdrop-filter: blur(8px);
                    z-index: 2000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.3s ease;
                }

                .modal-overlay.show {
                    opacity: 1;
                    pointer-events: auto;
                }

                .modal-content {
                    background: white;
                    width: 90%;
                    max-width: 480px;
                    border-radius: 24px;
                    padding: 2rem;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.2);
                    transform: scale(0.9);
                    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    position: relative;
                }

                .modal-overlay.show .modal-content {
                    transform: scale(1);
                }

                .modal-close-x {
                    position: absolute;
                    top: 1.5rem;
                    right: 1.5rem;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: var(--text-secondary);
                    line-height: 1;
                }

                .modal-content h3 {
                    margin: 0 0 1rem 0;
                    color: #ef4444;
                    font-size: 1.5rem;
                    font-weight: 800;
                }

                .modal-content p {
                    color: var(--text-secondary);
                    line-height: 1.6;
                    margin-bottom: 2rem;
                }

                .modal-actions {
                    display: flex;
                    gap: 1rem;
                    justify-content: flex-end;
                }

                .btn-modal-cancel {
                    background: oklch(94% 0.02 260);
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 12px;
                    font-weight: 700;
                    cursor: pointer;
                }

                .btn-modal-confirm {
                    background: #ef4444;
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 12px;
                    font-weight: 700;
                    cursor: pointer;
                }

                /* Mobile Adjustment */
                @media (max-width: 850px) {
                    .profile-wrapper {
                        flex-direction: column;
                        padding-top: 1rem;
                    }
                    .sidebar {
                        width: 100%;
                        flex-direction: row;
                        overflow-x: auto;
                        padding-bottom: 1rem;
                        border-bottom: 1px solid oklch(90% 0.02 260);
                    }
                    .nav-item {
                        white-space: nowrap;
                    }
                    .list-item {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 0.75rem;
                    }
                    .list-label {
                        width: 100%;
                    }
                    .list-value {
                        width: 100%;
                    }
                }

                @keyframes fadeInDown {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .loading-state, .empty-state, .error-state {
                    padding: 3rem;
                    text-align: center;
                    color: var(--text-secondary);
                }
            </style>

            <div class="profile-wrapper">
                <nav class="sidebar">
                    <button id="btn-back-home" class="btn-back-home">
                        <span>←</span> <span>홈으로 돌아가기</span>
                    </button>
                    <div class="nav-item active" data-tab="personal-info">
                        <span class="nav-icon">👤</span> <span>개인 정보</span>
                    </div>
                    <div class="nav-item" data-tab="my-trips">
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
                        <p>Compasser에서 당신의 정보를 안전하게 관리하세요.</p>
                    </div>

                    <!-- 섹션 1: 개인 정보 -->
                    <div id="personal-info" class="content-section active">
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
                                <div class="list-value">
                                    <span class="not-set">설정되지 않음</span>
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
                                <div class="list-value">
                                    <span class="not-set">인증되지 않음</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 섹션 2: 내 여행 일정 -->
                    <div id="my-trips" class="content-section">
                        <div class="card">
                            <div class="card-header">
                                <h2>저장된 일정 관리</h2>
                                <p>AI가 생성한 당신만의 최적화된 여행 경로들입니다.</p>
                            </div>
                            <div id="itineraries-list" class="itineraries-container">
                                <!-- JS에서 동적으로 삽입됨 -->
                            </div>
                        </div>
                    </div>

                    <!-- 섹션 3: 보안 및 계정 -->
                    <div id="security" class="content-section">
                        <div class="card">
                            <div class="card-header">
                                <h2>계정 보안</h2>
                                <p>로그인 및 비밀번호를 안전하게 관리하세요.</p>
                            </div>
                            <div class="list-item">
                                <div class="list-label">로그인 방식</div>
                                <div class="list-value">
                                    <span class="value-text">구글 계정 / 이메일 인증</span>
                                </div>
                            </div>
                            <div class="list-item">
                                <div class="list-label">비밀번호</div>
                                <div class="list-value">
                                    <span class="not-set">외부 로그인 연동 중 (준비 중)</span>
                                </div>
                            </div>
                        </div>

                        <div class="card danger-section">
                            <div class="card-header danger-header">
                                <h2>계정 삭제</h2>
                                <p>Compasser 계정을 영구적으로 삭제합니다. 탈퇴 시 모든 일정이 복구 불가능하게 삭제됩니다.</p>
                            </div>
                            <button id="btn-delete-account-trigger" class="btn-danger-trigger">탈퇴 진행하기</button>
                        </div>
                    </div>
                </main>
            </div>

            <!-- 탈퇴 확인 모달 -->
            <div id="delete-modal" class="modal-overlay">
                <div class="modal-content">
                    <span id="modal-close-x" class="modal-close-x">&times;</span>
                    <h3>정말로 탈퇴하시겠습니까?</h3>
                    <p>
                        활동 중인 계정을 삭제하면 그동안 AI와 함께 만든 모든 여행 일정과 데이터가 즉시 삭제되며 절대 복구할 수 없습니다.<br><br>
                        Compasser를 정말로 떠나시겠습니까?
                    </p>
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
