// Entry point for the frontend logic
import '../domains/auth/ui/login-view.js';
import '../domains/auth/ui/join-view.js';
import '../domains/auth/ui/verify-view.js';
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
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        z-index: 99999; /* Fix overlapping video players */
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        text-align: center;
        padding: 2rem;
    `;

    overlay.innerHTML = `
        
        <div style="max-width: 500px; animation: fadeIn 0.5s ease-out; position: relative;">
            <button id="close-x-btn" style="
                position: absolute;
                top: -20px;
                right: -20px;
                background: none;
                border: none;
                color: rgba(255,255,255,0.6);
                font-size: 1.5rem;
                cursor: pointer;
            ">✖</button>
            <h1 style="font-size: 2.5rem; margin-bottom: 1rem;">🧭 Compasser</h1>
            <p style="font-size: 1.2rem; line-height: 1.6; margin-bottom: 2rem;">
                당신의 소중한 일정을 중심으로<br>AI가 최적의 여행 경로를 설계해 드립니다.
            </p>
            <button id="close-welcome-btn" style="
                background: var(--accent-primary, #7c3aed);
                color: white;
                border: none;
                padding: 1rem 2rem;
                font-size: 1.1rem;
                font-weight: 700;
                border-radius: 12px;
                cursor: pointer;
                transition: transform 0.2s;
            ">시작하기 ✨</button>
        </div>
        <style>
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        </style>
    `;

    document.body.appendChild(overlay);


    const closeBtn = overlay.querySelector('#close-welcome-btn');
    const closeXBtn = overlay.querySelector('#close-x-btn');

    const closeModal = () => {
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.remove();
            localStorage.setItem('hasSeenTutorial', 'true');
        }, 300);
    };

    closeBtn.addEventListener('click', closeModal);
    if (closeXBtn) closeXBtn.addEventListener('click', closeModal);


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
            loadingText.style.color = '#f59e0b'; // Optional: orange hue for warning/retry
        }
    });

    // ----------------------------------------------------
    // [Paged Architecture] SPA Router
    // ----------------------------------------------------
    window.navigate = function (path) {
        window.history.pushState({}, '', path);
        handleRouteChange(); // Immediately trigger route change logic
    };

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

        if (user && (path === '/' || path === '/login' || path === '/join' || path === '/home')) {
            console.log('[Router] Authenticated user at home, redirecting to plan.');
            window.navigate('/plan');
            return;
        }

        // 1. Hide all pages by default
        if (pageHome) pageHome.style.display = 'none';
        if (pageLogin) pageLogin.style.display = 'none';
        if (pageVerify) pageVerify.style.display = 'none';
        if (pageJoin) pageJoin.style.display = 'none';
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
            } else if (path === '/view') {
                // Case: /view (Temporary memory-based itinerary or just generated)
                console.log('[Router] Static /view route: Looking for memory state.');
                
                const savedPhase = sessionStorage.getItem('currentPhase');
                if (savedPhase === '3') {
                    const rawData = sessionStorage.getItem('savedItineraryData');
                    if (rawData) {
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
                } else if (!sessionStorage.getItem('savedItineraryData')) {
                    window.navigate('/plan');
                }
            }
        } else if (path === '/plan') {
            if (!localStorage.getItem('hasSeenTutorial')) {
                showWelcomeOverlay();
            }

            if (pagePlan) pagePlan.style.display = 'flex';

            // CRITICAL: State Preservation (Seamless Editor)
            if (travelFormView) {
                travelFormView.style.display = 'block';
                travelFormView.classList.remove('hidden-view');
            }
            if (loadingTransitionView) {
                loadingTransitionView.style.display = 'none';
                loadingTransitionView.classList.add('hidden-view');
            }
            sessionStorage.setItem('currentPhase', '1');
        } else if (path === '/home' || path === '/') {
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
        if (user && !user.emailVerified) {
            console.log('[Auth] User unverified. Logging them out immediately to prevent redirection hijack.');
            logout().catch(err => console.error(err));
            return;
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

    // 1. [← 이전 화면으로] 버튼: Hash 변경만으로 폼 보존
    const goBackBtn = document.getElementById('go-back-btn');
    if (goBackBtn) {
        goBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('[Routing] "Go Back" clicked: Moving to /plan (Data preserved seamlessly).');
            window.navigate('/plan');
        });
    }

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

            if (travelFormView && travelFormView.populateForm && requestData) {
                travelFormView.populateForm(requestData);
            } else {
                console.warn('[Auto-fill] Failed to find existing requestData to populate.');
            }
            window.navigate('/plan');
        });
    }

    // Theme initialization
    const currentTheme = localStorage.getItem('theme') || 'light';
    if (currentTheme === 'dark') {
        document.body.classList.add('dark');
        if (themeToggleBtn) themeToggleBtn.textContent = '☀️ Light Mode';
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark');
            const isDark = document.body.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    }

    if (langToggleBtn) {
        langToggleBtn.textContent = getLang() === 'ko' ? '🌐 English' : '🌐 한국어';
        langToggleBtn.addEventListener('click', () => {
            const newLang = getLang() === 'ko' ? 'en' : 'ko';
            setLang(newLang);
            langToggleBtn.textContent = newLang === 'ko' ? '🌐 English' : '🌐 한국어';
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
            loadingText.style.color = 'var(--accent-primary)';
            loadingSubtext.textContent = '잠시만 기다려주세요.';
            loadingSubtext.style.display = 'block';
            showResultsBtn.style.display = 'none';
            showResultsBtn.textContent = '✨ 경로 확인하기';

            loadingTransitionView.style.display = 'flex';
            void loadingTransitionView.offsetWidth; // Reflow
            loadingTransitionView.classList.remove('hidden-view');

            // Start ad banner carousel during loading
            startBannerCarousel();

            try {
                const itineraryPlan = await generateOptimizedItinerary(e.detail);
                itineraryView.showResults(itineraryPlan);
                if (mapView) mapView.renderRoute(itineraryPlan);

                sessionStorage.setItem('currentPhase', '3');
                sessionStorage.setItem('savedItineraryData', JSON.stringify(itineraryPlan));

                // Success State! Delay routing so user can process visual cue
                loadingSpinner.style.display = 'none';
                loadingText.textContent = '✨ 경로 설계가 완료되었습니다!';
                loadingSubtext.style.display = 'none';
                showResultsBtn.style.display = 'inline-block';

                showResultsBtn.onclick = () => {
                    // 🚀 [Routing] Proceed to View via Router Function
                    window.navigate('/view');
                };

            } catch (error) {
                console.error("Failed to generate itinerary:", error);

                loadingSpinner.style.display = 'none';
                loadingText.textContent = '❌ 일정을 생성하지 못했습니다.';
                loadingText.style.color = '#ef4444';
                loadingSubtext.textContent = error.message || '다시 시도해주세요.';
                loadingSubtext.style.display = 'block';

                showResultsBtn.textContent = '🔙 돌아가기';
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
                    alert('⏳ ' + error.message);
                }
            } finally {
                stopBannerCarousel();
                window.dispatchEvent(new CustomEvent('itinerary-generation-complete'));
            }
        });
    }
});