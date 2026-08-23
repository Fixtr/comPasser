// Entry point for the frontend logic

// 디자인 토큰. UI 는 무채색, 색은 지도 마커 규칙에만 — 결과 화면부터 적용 중.
import '../styles/tokens.css';

import '../domains/auth/ui/login-view.js';
import '../domains/auth/ui/join-view.js';
import '../domains/auth/ui/verify-view.js';
import '../domains/planner/ui/preference-view.js';
import '../domains/planner/ui/travel-form.js';
import '../domains/map/ui/map-view.js';
import '../domains/itinerary/ui/itinerary-view.js';
import '../domains/profile/ui/profile-view.js';
import { generateOptimizedItinerary } from '../domains/planner/services/gemini-optimizer.js';
import { deleteCurrentUser, subscribeToAuthChanges, logout, getCurrentUser } from '../domains/auth/services/firebase-auth.js';
import { getUserItineraries, deleteItinerary, getSharedItinerary } from '../domains/itinerary/services/firestore-service.js';
import { t, getLang, setLang } from '../utils/i18n.js';
import { trackEvent } from '../utils/analytics.js';
import { affiliateAds } from '../config/ads.js';
import { showErrorToast } from '../utils/toast.js';

window.addEventListener('unhandledrejection', event => console.error('🔥 숨겨진 비동기 에러:', event.reason));

// ====== Affiliate Ad Banner Carousel Logic ======
// Ads data is imported from src/config/ads.js

let bannerIntervalId = null;
let currentBannerIndex = 0;

function renderBanner(container, index) {
    const ad = affiliateAds[index];
    if (!ad) return;

    // Use image if available, fallback to icon
    const iconContent = ad.imageUrl ? `<img src="${ad.imageUrl}" alt="${ad.title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="width: 100%; height: 100%; object-fit: contain;">` : '';
    const fallbackIcon = `<div class="ad-banner-icon-inner" style="display: ${ad.imageUrl ? 'none' : 'flex'};">${ad.icon}</div>`;

    container.innerHTML = `
    <div class="ad-banner" style="background-color: ${ad.bgColor};" onclick="window.open('${ad.link}', '_blank')">
      <span class="ad-badge">AD</span>
      <div class="ad-banner-icon">
        ${iconContent}
        ${fallbackIcon}
      </div>
      <div class="ad-banner-content">
        <div class="ad-banner-title">${ad.title}</div>
        <div class="ad-banner-desc">${ad.desc}</div>
      </div>
    </div>
    <div class="ad-dots">
      ${affiliateAds.map((_, i) => `<span class="ad-dot${i === index ? ' active' : ''}"></span>`).join('')}
    </div>
  `;
    // Trigger fade-in on next frame
    requestAnimationFrame(() => {
        const bannerEl = container.querySelector('.ad-banner');
        if (bannerEl) bannerEl.classList.add('fade-in');
    });
}

function startBannerCarousel() {
    const container = document.getElementById('ad-banner-carousel');
    if (!container) return;

    // Reset state
    stopBannerCarousel();
    currentBannerIndex = 0;
    container.style.display = 'block';
    renderBanner(container, currentBannerIndex);

    bannerIntervalId = setInterval(() => {
        const bannerEl = container.querySelector('.ad-banner');
        if (bannerEl) {
            bannerEl.classList.remove('fade-in');
            bannerEl.classList.add('fade-out');
        }
        // After fade-out animation completes, switch to next banner
        setTimeout(() => {
            currentBannerIndex = (currentBannerIndex + 1) % affiliateAds.length;
            renderBanner(container, currentBannerIndex);
        }, 500); // matches CSS transition duration
    }, 3500);
}

function stopBannerCarousel() {
    if (bannerIntervalId) {
        clearInterval(bannerIntervalId);
        bannerIntervalId = null;
    }
    const container = document.getElementById('ad-banner-carousel');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}
// ====== End Ad Banner Carousel ======
// ====== Dynamic Loading Message Logic ======
const loadingMessages = [
    "AI가 최적의 여행 장소를 탐색하고 있습니다",
    "추천 장소 간의 이동 동선을 계산하는 중입니다",
    "방문 시간에 맞춰 일정을 최적화하고 있습니다",
    "거의 다 준비되었습니다! 조금만 더 기다려주세요"
];

let loadingMessageIntervalId = null;
let currentMessageIndex = 0;

function startLoadingMessageRotation() {
    const loadingSubtext = document.getElementById('loading-subtext');
    if (!loadingSubtext) return;

    // Reset state
    stopLoadingMessageRotation();
    currentMessageIndex = 0;
    
    // Initial message
    loadingSubtext.textContent = loadingMessages[currentMessageIndex];
    loadingSubtext.classList.add('loading-text-fade');

    loadingMessageIntervalId = setInterval(() => {
        currentMessageIndex = (currentMessageIndex + 1) % loadingMessages.length;
        
        // CSS animation handles the transition if we just update the text 
        // synchronized with the 3s interval defined in style.css (.loading-text-fade)
        loadingSubtext.textContent = loadingMessages[currentMessageIndex];
    }, 3000);
}

function stopLoadingMessageRotation() {
    if (loadingMessageIntervalId) {
        clearInterval(loadingMessageIntervalId);
        loadingMessageIntervalId = null;
    }
    const loadingSubtext = document.getElementById('loading-subtext');
    if (loadingSubtext) {
        loadingSubtext.classList.remove('loading-text-fade');
    }
}
// ====== End Dynamic Loading Message Logic ======

// PWA Service Worker 등록
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('ServiceWorker registered:', reg.scope))
            .catch(err => console.log('ServiceWorker registration failed:', err));
    });
}

function updateTexts() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        // Handle input placeholders specifically
        if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
            el.setAttribute('placeholder', t(key));
        } else {
            // Some elements might have child elements (like icons) we want to preserve?
            // For now, replacing textContent is safest for simple texts.
            el.textContent = t(key);
        }
    });
}

// 1. 초기 로드 시 다국어(i18n) 자동 적용 (즉시 실행)
updateTexts();

/**
 * [Phase 1 전용] 웰컴 모달 관리 함수
 * - 최초 1회만 노출 (LocalStorage)
 * - 공유 링크(?share=)로 접속 시 절대 뜨지 않음
 * - 세션 복구(Phase 3) 시에도 뜨지 않음
 */
function showWelcomeOverlay() {
    // 1. 이미 본 유저인지 확인 (2차 방어막)
    if (localStorage.getItem('hasSeenTutorial') === 'true') {
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'welcome-overlay';
    // 화면 전체를 덮는 모달이므로 역할과 이름을 알려준다.
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'ComPasser 시작 안내');
    // 모양은 style.css 의 .welcome-overlay 가 맡는다. 예전에는 여기서
    // cssText 로 칠했는데, 그 안에 보라 버튼과 backdrop-filter 가 들어 있어
    // 계약 밖에서 조용히 살아남았다.
    overlay.className = 'welcome-overlay';

    overlay.innerHTML = `
        <div class="welcome-card">
            <button id="close-x-btn" type="button" class="welcome-close" aria-label="안내 닫기">&times;</button>
            <h1>ComPasser</h1>
            <p>당신의 소중한 일정을 중심으로<br>AI가 최적의 여행 경로를 설계해 드립니다.</p>
            <button id="close-welcome-btn" class="welcome-start">시작하기</button>
        </div>
    `;

    document.body.appendChild(overlay);


    const closeBtn = overlay.querySelector('#close-welcome-btn');
    const closeXBtn = overlay.querySelector('#close-x-btn');

    const closeModal = () => {
        document.removeEventListener('keydown', escHandler, true);
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.remove();
            localStorage.setItem('hasSeenTutorial', 'true');
        }, 300);
    };

    // Escape 로도 닫히지 않으면 키보드 사용자는 모달에 갇힌다.
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeModal();
        }
    };
    document.addEventListener('keydown', escHandler, true);

    closeBtn.addEventListener('click', closeModal);
    if (closeXBtn) closeXBtn.addEventListener('click', closeModal);

    // 모달이 열리면 포커스를 안으로 옮겨 바로 조작할 수 있게 한다.
    closeBtn.focus();


    closeBtn.addEventListener('mouseover', () => closeBtn.style.transform = 'scale(1.05)');
    closeBtn.addEventListener('mouseout', () => closeBtn.style.transform = 'scale(1)');
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log("App initialized. Event-based routing ready.");

    // Initialize Kakao SDK
    if (typeof Kakao !== 'undefined' && !Kakao.isInitialized()) {
        Kakao.init('164b3385a56f88dfb3d04e05b873426f');
        console.log('Kakao initialized:', Kakao.isInitialized());
    }

    const travelForm = document.querySelector('travel-form');
    const itineraryView = document.querySelector('itinerary-view');
    const mapView = document.querySelector('map-view');

    // Auth & Routing Containers
    const loginView = document.getElementById('login-view');
    const appContent = document.getElementById('app-content');
    const pageLogin = document.getElementById('page-login');
    const pageJoin = document.getElementById('page-join');
    const pageHome = document.getElementById('page-home');
    const pageVerify = document.getElementById('page-verify');
    const pagePlan = document.getElementById('page-plan');
    const pagePreference = document.getElementById('page-preference');
    const pageView = document.getElementById('page-view');
    const pageProfile = document.getElementById('page-profile');

    // Always show app-content container now that we control child pages
    if (appContent) appContent.style.display = 'block';

    // UI Buttons and Elements
    const logoutBtn = document.getElementById('logout-btn');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const langToggleBtn = document.getElementById('lang-toggle');
    const mainHeader = document.getElementById('main-header');

    // View Transition Elements
    const travelFormView = document.getElementById('travel-form-view');
    const loadingTransitionView = document.getElementById('loading-transition-view');
    const loadingSpinner = document.getElementById('loading-spinner');
    const loadingText = document.getElementById('loading-text');
    const loadingSubtext = document.getElementById('loading-subtext');
    const showResultsBtn = document.getElementById('show-results-btn');
    const resultsLayout = document.getElementById('results-layout');

    window.addEventListener('ai-retry-status', (e) => {
        if (loadingText) {
            loadingText.textContent = e.detail.message;
            // 색은 style.css 의 #loading-text[data-tone] 이 맡는다.
            // 여기서 직접 칠하면 다크 모드에서 대비가 무너진다.
            loadingText.dataset.tone = 'warn';
        }
    });

    // ----------------------------------------------------
    // [Paged Architecture] SPA Router
    // ----------------------------------------------------
    window.navigate = function (path) {
        window.history.pushState({}, '', path);
        handleRouteChange(); // Immediately trigger route change logic
    };

    // handleRouteChange 는 popstate/navigate 뿐 아니라 Firebase
    // onAuthStateChanged(토큰 확정 시 재발화 등)에서도 호출된다. /view 는
    // 이동시간 보정(applyTransitDelays)이 반영된 뒤 sessionStorage 는
    // 갱신되지 않으므로, 매 재호출마다 showResults/renderRoute 를 다시
    // 부르면 원본(보정 전) 시각으로 되돌아간다. 같은 데이터를 이미
    // 로드했다면 재호출을 건너뛴다.
    let lastLoadedStaticViewData = null;
    let lastLoadedViewId = null;

    async function handleRouteChange() {
        const path = window.location.pathname;
        const user = getCurrentUser();

        console.log(`[Router] Navigation to: '${path}', User logged in: ${!!user}`);

        // Track page view
        trackEvent('page_view', { page_path: path });

        // Route Guards
        if (!user && path !== '/login' && path !== '/join' && !path.startsWith('/verify') && path !== '/' && path !== '/home') {
            console.log('[Router] Unauthenticated access denied, redirecting to home.');
            window.navigate('/login');
            return;
        }

        if (user && (path === '/login' || path === '/join')) {
            // 이미 preference를 선택했으면 /plan으로, 아니면 /preference/1로
            const hasPreference = sessionStorage.getItem('userPreference');
            const targetPath = hasPreference ? '/plan' : '/preference/1';
            console.log(`[Router] Authenticated user at login/join, redirecting to ${targetPath}.`);
            window.navigate(targetPath);
            return;
        }

        // 1. Hide all pages by default
        if (pageHome) pageHome.style.display = 'none';
        if (pageLogin) pageLogin.style.display = 'none';
        if (pageVerify) pageVerify.style.display = 'none';
        if (pageJoin) pageJoin.style.display = 'none';
        if (pagePreference) pagePreference.style.display = 'none';
        if (pagePlan) pagePlan.style.display = 'none';
        if (pageView) pageView.style.display = 'none';
        if (pageProfile) pageProfile.style.display = 'none';

        // 1.5 Toggle Main Header Visibility (Hide on Profile Page)
        if (mainHeader) {
            mainHeader.style.display = (path.startsWith('/profile')) ? 'none' : 'block';
        }

        // 2. Evaluate Route
        if (path.startsWith('/view')) {
            if (pageView) {
                pageView.style.display = 'grid'; // Grid layout applied
                pageView.classList.remove('hidden-view');
                window.dispatchEvent(new Event('resize')); // Fix map sizing
            }

            // [Dynamic Parameter Routing]
            // Format: /view/:id (e.g., /view/abc123def)
            const idMatch = path.match(/^\/view\/([a-zA-Z0-9]+)$/);
            
            if (idMatch && idMatch[1]) {
                const docId = idMatch[1];

                // 이미 이 id 를 로드한 상태면 재호출하지 않는다(예: 인증 상태
                // 재발화로 handleRouteChange 가 다시 실행되는 경우). 그대로
                // 다시 부르면 지도가 재계산한 이동시간 보정이 초기화된다.
                if (docId !== lastLoadedViewId) {
                    lastLoadedViewId = docId;
                    console.log(`[Router] Dynamic route detected with ID: ${docId}`);

                    try {
                        const itineraryView = document.querySelector('itinerary-view');
                        if (itineraryView && typeof itineraryView.loadItineraryById === 'function') {
                            // 기존에 삽입되어 있는 컴포넌트에 명시적으로 로드 명령 하달
                            itineraryView.loadItineraryById(docId);
                        } else {
                            throw new Error('ItineraryView 컴포넌트가 DOM에 존재하지 않거나 loadItineraryById 메서드가 없습니다.');
                        }
                    } catch (error) {
                        console.error('🔥 라우팅/마운트 에러:', error);
                    }
                }
            } else if (path === '/view') {
                // Case: /view (Temporary memory-based itinerary or just generated)
                console.log('[Router] Static /view route: Looking for memory state.');

                // 볼 일정이 있느냐만 보면 된다. 예전에는 currentPhase === '3'
                // 도 함께 요구했는데, /plan 을 한 번 들르면 phase 가 '1' 로
                // 바뀌어(아래 /plan 분기) 되돌아왔을 때 일정이 있는데도 복원되지
                // 않고 빈 화면이 남았다(폼으로 돌아갔다가 뒤로 가기).
                const rawData = sessionStorage.getItem('savedItineraryData');
                if (!rawData) {
                    window.navigate('/plan');
                } else if (rawData !== lastLoadedStaticViewData) {
                    // 같은 데이터를 이미 로드했다면 재호출하지 않는다(위와 같은 이유).
                    lastLoadedStaticViewData = rawData;
                    try {
                        const parsedItinerary = JSON.parse(rawData);
                        setTimeout(() => {
                            if (mapView) mapView.renderRoute(parsedItinerary);
                            if (itineraryView) itineraryView.showResults(parsedItinerary);
                            window.dispatchEvent(new Event('resize'));
                        }, 50);
                    } catch (e) {
                        console.error("[Router] State parse error", e);
                        window.navigate('/plan');
                    }
                }
            }
        } else if (path.startsWith('/preference')) {
            if (path === '/preference/2') {
                const savedPrefs = sessionStorage.getItem('userPreference');
                let hasDates = false;
                if (savedPrefs) {
                    try {
                        const parsed = JSON.parse(savedPrefs);
                        if (parsed.date && parsed.date.length > 0) hasDates = true;
                    } catch (e) {}
                }
                if (!hasDates) {
                    console.log('[Router] Missing Step 1 data, redirecting to /preference/1.');
                    window.navigate('/preference/1');
                    return;
                }
            } else if (path === '/preference') {
                window.navigate('/preference/1');
                return;
            }

            if (pagePreference) pagePreference.style.display = 'flex';
            
            const prefView = document.querySelector('preference-view');
            if (prefView && typeof prefView.setStep === 'function') {
                const step = path.endsWith('/2') ? 2 : 1;
                if (prefView.shadowRoot) {
                    prefView.setStep(step);
                } else {
                    setTimeout(() => prefView.setStep(step), 50);
                }
            }
        } else if (path === '/plan') {
            if (!localStorage.getItem('hasSeenTutorial')) {
                showWelcomeOverlay();
            }

            if (pagePlan) pagePlan.style.display = 'flex';

            // Ensure preference badges are updated every time we visit /plan
            const travelForm = document.querySelector('travel-form');
            if (travelForm && typeof travelForm.renderPreferenceBadges === 'function') {
                travelForm.renderPreferenceBadges();
            }

            // CRITICAL: State Preservation (Seamless Editor)
            if (travelFormView) {
                travelFormView.style.display = 'block';
                travelFormView.classList.remove('hidden-view');
            }
            if (loadingTransitionView) {
                loadingTransitionView.style.display = 'none';
                loadingTransitionView.classList.add('hidden-view');
            }
        } else if (path === '/home' || path === '/' || path.endsWith('/index.html')) {
            if (pageHome) pageHome.style.display = 'flex';
        } else if (path === '/login') {
            if (pageLogin) pageLogin.style.display = 'block';
        } else if (path === '/join') {
            if (pageJoin) pageJoin.style.display = 'block';
        } else if (path.startsWith('/verify')) {
            if (pageVerify) pageVerify.style.display = 'block';
            const oobCode = new URLSearchParams(window.location.search).get('oobCode');
            const verifyView = document.getElementById('verify-view');
            if (oobCode && verifyView && typeof verifyView.verify === 'function') {
                verifyView.verify(oobCode);
            }
        } else if (path.startsWith('/profile')) {
            if (pageProfile) pageProfile.style.display = 'block';

            // [Nested Routing] Extract tab parameter from /profile/:tab
            const tabMatch = path.match(/^\/profile\/([a-zA-Z0-9-]+)$/);
            const subPath = tabMatch ? tabMatch[1] : 'personal';

            const profileView = document.querySelector('profile-view');
            if (profileView && typeof profileView.setTabFromPath === 'function') {
                // Ensure the component is rendered before calling setTab
                if (profileView.shadowRoot) {
                    profileView.setTabFromPath(subPath);
                } else {
                    // Fallback for initial load if component hasn't rendered yet
                    setTimeout(() => profileView.setTabFromPath(subPath), 50);
                }
            }

            // Normalize base /profile URL to /profile/personal
            if (path === '/profile') {
                window.history.replaceState({}, '', '/profile/personal');
            }
        }
    }

    // Attach Router listener
    window.addEventListener('popstate', handleRouteChange);

    // Initial Routing Evaluation (Handles ?id= legacy query params to maintain backward compatibility)
    const urlParams = new URLSearchParams(window.location.search);
    const legacySharedId = urlParams.get('id');
    if (legacySharedId) {
        // Clean up URL and redirect to deep link immediately
        const newUrl = window.location.origin + '/view/' + legacySharedId;
        window.history.replaceState({}, document.title, newUrl);
    } else if (window.location.hash) {
        // Fallback for returning users with # links
        const newPath = window.location.hash.replace('#', '');
        if (newPath) {
            window.history.replaceState({}, document.title, window.location.origin + newPath);
        }
    }

    // Subscribe to Firebase Auth and trigger initial route
    const userAvatar = document.getElementById('user-avatar');

    subscribeToAuthChanges((user) => {
        if (user) {
            const isEmailPasswordUser = user.providerData.some(p => p.providerId === 'password');
            const needsVerification = isEmailPasswordUser && !user.emailVerified;
            
            if (needsVerification) {
                console.warn('[Auth] Email password user unverified. Logging them out immediately.');
                logout().catch(err => console.error(err));
                return;
            }
        }
        if (user) {
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            if (userAvatar) {
                userAvatar.style.cursor = 'pointer';
                userAvatar.onclick = () => window.navigate('/profile');
                userAvatar.onerror = () => {
                    userAvatar.onerror = null; // Prevent infinite loop
                    userAvatar.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234b5563' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E";
                };
                if (user.photoURL) {
                    userAvatar.src = user.photoURL;
                } else {
                    userAvatar.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User') + '&background=random';
                }
                userAvatar.style.display = 'block';
            }
        } else {
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (userAvatar) {
                userAvatar.style.display = 'none';
                userAvatar.src = '';
            }
        }
        // Force router re-evaluation on auth state changes (which also handles standard initial load)
        handleRouteChange();
    });

    // ----------------------------------------------------
    // [UI Events & Actions]
    // ----------------------------------------------------


    // 2. [일정 수정하기] 버튼: 데이터 불러와서 채우기(Auto-fill) 후 뒤로 가기
    const editItineraryBtn = document.getElementById('edit-itinerary-btn');
    if (editItineraryBtn) {
        editItineraryBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('[Routing] "Edit Itinerary" clicked: Injecting data, then routing.');
            let requestData = null;
            if (itineraryView && itineraryView.currentItinerary && itineraryView.currentItinerary.request) {
                requestData = itineraryView.currentItinerary.request;
            } else if (itineraryView && itineraryView.currentItinerary && itineraryView.currentItinerary.metadata && itineraryView.currentItinerary.metadata.request) {
                requestData = itineraryView.currentItinerary.metadata.request;
            } else {
                const storedForm = sessionStorage.getItem('currentFormData');
                if (storedForm) {
                    try { requestData = JSON.parse(storedForm); } catch (err) { }
                }
            }

            // populateForm 을 직접 부르면 /plan 으로 이동한 뒤 폼이 보이는 순간
            // refreshFromStorage() 가 form.reset() 후 sessionStorage 값으로 다시
            // 채우면서 방금 넣은 값을 덮어썼다(그래서 이 버튼이 '이전 화면으로'와
            // 똑같이 동작했다). 무엇으로 채울지 예약해 두고 이동한다.
            if (travelFormView && travelFormView.setPendingFormData && requestData) {
                travelFormView.setPendingFormData(requestData);
            } else {
                console.warn('[Auto-fill] 지금 보고 있는 일정의 조건을 찾지 못했습니다.');
            }
            window.navigate('/plan');
        });
    }

    // ====== 테마 ======
    // 첫 페인트 전에 index.html 의 head 스크립트가 html[data-theme] 를 이미
    // 정해 두었다. 여기서는 그 값을 body.dark 와 맞추고, 토글과 시스템 설정
    // 변경을 잇는다.
    const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.toggle('dark', theme === 'dark');
        if (themeToggleBtn) {
            // 버튼은 "지금 상태"가 아니라 "누르면 갈 곳"을 말한다.
            // data-i18n 도 함께 바꿔 둔다 — 언어를 바꾸면 updateTexts() 가
            // 이 속성을 보고 다시 번역하는데, 키가 고정돼 있으면 다크 모드에서
            // 버튼이 "다크 모드"로 되돌아간다.
            const key = theme === 'dark' ? 'lightMode' : 'darkMode';
            themeToggleBtn.setAttribute('data-i18n', key);
            themeToggleBtn.textContent = t(key);
        }
    };

    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const next = document.body.classList.contains('dark') ? 'light' : 'dark';
            applyTheme(next);
            // 여기서부터는 사용자가 고른 값이 시스템 설정보다 앞선다.
            try { localStorage.setItem('theme', next); } catch (e) { /* 저장이 막힐 수 있다 */ }
        });
    }

    // 시스템 테마가 바뀌면 따라간다 — 단, 사용자가 아직 고른 적이 없을 때만.
    // 한 번 고르고 나면 그 선택이 이긴다.
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    systemDark.addEventListener('change', (e) => {
        let stored = null;
        try { stored = localStorage.getItem('theme'); } catch (err) { /* 무시 */ }
        if (stored) return;
        applyTheme(e.matches ? 'dark' : 'light');
    });

    if (langToggleBtn) {
        langToggleBtn.textContent = getLang() === 'ko' ? 'English' : '한국어';
        langToggleBtn.addEventListener('click', () => {
            const newLang = getLang() === 'ko' ? 'en' : 'ko';
            setLang(newLang);
            langToggleBtn.textContent = newLang === 'ko' ? 'English' : '한국어';
            updateTexts();
            trackEvent('change_language', { language: newLang });
        });
    }

    window.addEventListener('i18n-changed', () => updateTexts());

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try { await logout(); } catch (err) { console.error('Logout failed:', err); }
        });
    }

    if (travelForm && itineraryView) {
        travelForm.addEventListener('generate-itinerary', async (e) => {
            console.log('App main received itinerary generation event.', e.detail);

            itineraryView.clear();
            if (mapView) mapView.clearMap();

            // Phase 2: Start Loading Transition INSIDE #page-plan
            if (travelFormView) travelFormView.style.display = 'none';

            loadingSpinner.style.display = 'block';
            loadingText.textContent = 'AI가 최적의 경로를 분석하고 있습니다...';
            delete loadingText.dataset.tone;
            loadingSubtext.textContent = '잠시만 기다려주세요.';
            loadingSubtext.style.display = 'block';
            showResultsBtn.style.display = 'none';
            showResultsBtn.textContent = '경로 확인하기';

            loadingTransitionView.style.display = 'flex';
            void loadingTransitionView.offsetWidth; // Reflow
            loadingTransitionView.classList.remove('hidden-view');

            // Start ad banner carousel during loading
            startBannerCarousel();
            // Start dynamic loading messages
            startLoadingMessageRotation();

            try {
                const itineraryPlan = await generateOptimizedItinerary(e.detail);
                itineraryView.showResults(itineraryPlan);
                if (mapView) mapView.renderRoute(itineraryPlan);

                sessionStorage.setItem('savedItineraryData', JSON.stringify(itineraryPlan));

                // Success State! Delay routing so user can process visual cue
                loadingSpinner.style.display = 'none';
                loadingText.textContent = '경로 설계가 완료되었습니다!';
                loadingSubtext.style.display = 'none';
                stopLoadingMessageRotation(); // Stop rotation on success
                showResultsBtn.style.display = 'inline-block';

                showResultsBtn.onclick = () => {
                    // 🚀 [Routing] Proceed to View via Router Function
                    window.navigate('/view');
                };

            } catch (error) {
                console.error("Failed to generate itinerary:", error);

                loadingSpinner.style.display = 'none';
                loadingText.textContent = '일정을 생성하지 못했습니다.';
                loadingText.dataset.tone = 'danger';
                loadingSubtext.textContent = error.message || '다시 시도해주세요.';
                loadingSubtext.style.display = 'block';
                stopLoadingMessageRotation(); // Stop rotation on error

                showResultsBtn.textContent = '돌아가기';
                showResultsBtn.style.display = 'inline-block';
                showResultsBtn.onclick = () => {
                    // Safe reset within #page-plan
                    loadingTransitionView.style.display = 'none';
                    if (travelFormView) {
                        travelFormView.style.display = 'block';
                        void travelFormView.offsetWidth;
                        travelFormView.classList.remove('hidden-view');
                    }
                };

                if (error.message.includes("429")) {
                    showErrorToast('⏳ ' + error.message);
                }
            } finally {
                stopBannerCarousel();
                stopLoadingMessageRotation(); // Ensure timer is cleared in any case
                window.dispatchEvent(new CustomEvent('itinerary-generation-complete'));
            }
        });
    }
});