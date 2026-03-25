// Entry point for the frontend logic
import '../domains/auth/ui/login-view.js';
import '../domains/planner/ui/travel-form.js';
import '../domains/map/ui/map-view.js';
import '../domains/itinerary/ui/itinerary-view.js';
import { generateOptimizedItinerary } from '../domains/planner/services/gemini-optimizer.js';
import { subscribeToAuthChanges, logout, getCurrentUser } from '../domains/auth/services/firebase-auth.js';
import { getUserItineraries, deleteItinerary, getSharedItinerary } from '../domains/itinerary/services/firestore-service.js';
import { t, getLang, setLang } from '../utils/i18n.js';
import { trackEvent } from '../utils/analytics.js';

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
    if (localStorage.getItem('hasSeenWelcomeOverlay') === 'true') {
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'welcome-overlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        text-align: center;
        padding: 2rem;
    `;

    overlay.innerHTML = `
        <div style="max-width: 500px; animation: fadeIn 0.5s ease-out;">
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
    closeBtn.addEventListener('click', () => {
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.remove();
            // 쐐기 박기 (로컬 스토리지 저장)
            localStorage.setItem('hasSeenWelcomeOverlay', 'true');
        }, 300);
    });

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
    const pageHome = document.getElementById('page-home');
    const pagePlan = document.getElementById('page-plan');
    const pageView = document.getElementById('page-view');
    
    // Always show app-content container now that we control child pages
    if (appContent) appContent.style.display = 'block';

    // UI Buttons and Elements
    const logoutBtn = document.getElementById('logout-btn');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const myItinerariesBtn = document.getElementById('my-itineraries-btn');
    const itinerariesModal = document.getElementById('itineraries-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const itinerariesList = document.getElementById('itineraries-list');
    const langToggleBtn = document.getElementById('lang-toggle');

    // View Transition Elements
    const travelFormView = document.getElementById('travel-form-view');
    const loadingTransitionView = document.getElementById('loading-transition-view');
    const loadingSpinner = document.getElementById('loading-spinner');
    const loadingText = document.getElementById('loading-text');
    const loadingSubtext = document.getElementById('loading-subtext');
    const showResultsBtn = document.getElementById('show-results-btn');
    const resultsLayout = document.getElementById('results-layout');

    // ----------------------------------------------------
    // [Paged Architecture] SPA Router
    // ----------------------------------------------------
    window.navigate = function(path) {
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
        if (!user && path !== '/home' && path !== '/') {
            console.log('[Router] Unauthenticated access denied, redirecting to home.');
            window.navigate('/home');
            return;
        }

        if (user && (path === '/' || path === '/home')) {
            console.log('[Router] Authenticated user at home, redirecting to plan.');
            window.navigate('/plan');
            return;
        }

        // 1. Hide all pages by default
        if (pageHome) pageHome.style.display = 'none';
        if (pagePlan) pagePlan.style.display = 'none';
        if (pageView) pageView.style.display = 'none';

        // 2. Evaluate Route
        if (path.startsWith('/view')) {
            if (pageView) {
                pageView.style.display = 'grid'; // Grid layout applied
                pageView.classList.remove('hidden-view');
                window.dispatchEvent(new Event('resize')); // Fix map sizing
            }

            // Check for Deep Link (Shared Itinerary URL)
            const idMatch = path.match(/^\/view\/(.+)/);
            if (idMatch && idMatch[1]) {
                const sharedId = idMatch[1];
                try {
                    console.log(`[Share] Fetching shared itinerary ID: ${sharedId}`);
                    if (mapView) {
                        mapView.hideEmptyState();
                        mapView.setLoading(true, "공유된 일정을 불러오는 중입니다...");
                    }
                    const parsedItinerary = await getSharedItinerary(sharedId);
                    if (!parsedItinerary) throw new Error("Itinerary not found in Firestore.");
                    
                    if (mapView) mapView.renderRoute(parsedItinerary);
                    if (itineraryView) itineraryView.showResults(parsedItinerary);
                    
                    // Cleanup URL visually
                    const newUrl = window.location.origin + '/view';
                    window.history.replaceState({}, document.title, newUrl);
                    
                } catch (error) {
                    console.error("[Share Error]", error);
                    alert("공유된 일정을 불러오는 데 실패했습니다.");
                    window.navigate('/plan');
                }
            } else {
                // Determine if we arrived properly from a loaded state.
                const savedPhase = sessionStorage.getItem('currentPhase');
                if (savedPhase === '3') {
                    // Valid phase 3 state exists
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
                    // No generated data available, fallback to plan
                    window.navigate('/plan');
                }
            }
        } else if (path === '/plan') {
            showWelcomeOverlay(); // Safe to call, auto-aborts if already seen
            
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
        } else {
            // Default: /home
            if (pageHome) pageHome.style.display = 'block';
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
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            if (myItinerariesBtn) myItinerariesBtn.style.display = 'inline-block';
            if (userAvatar) {
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
            if (myItinerariesBtn) myItinerariesBtn.style.display = 'none';
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
                    try { requestData = JSON.parse(storedForm); } catch(err) {}
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

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => { itinerariesModal.style.display = 'none'; });
    }

    if (myItinerariesBtn) {
        myItinerariesBtn.addEventListener('click', async () => {
            const user = getCurrentUser();
            if (!user) return;

            itinerariesModal.style.display = 'flex';
            itinerariesList.innerHTML = '<p style="text-align:center;">불러오는 중...</p>';

            try {
                const itineraries = await getUserItineraries(user.uid);

                if (itineraries.length === 0) {
                    itinerariesList.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">저장된 일정이 없습니다.</p>';
                    return;
                }

                itinerariesList.innerHTML = '';
                itineraries.forEach(item => {
                    const card = document.createElement('div');
                    card.style.cssText = `
                        background: var(--bg-secondary);
                        padding: 1.5rem;
                        border-radius: 12px;
                        border: 1px solid oklch(90% 0.02 260);
                        cursor: pointer;
                        transition: all 0.2s ease;
                        position: relative;
                        box-shadow: var(--shadow-sm);
                    `;

                    const dateObj = item.createdAt?.toDate() || new Date();
                    const dateString = dateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const anchorsCount = item.itineraryPlan?.days?.[0]?.scheduleItems?.filter(i => i.type === 'AnchorSchedule').length || 0;

                    card.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 0.5rem; color: var(--accent-primary);">여행 일정 (${anchorsCount}개의 핵심 방문지)</div>
                                <div style="font-size: 0.9rem; color: var(--text-secondary);">저장일: ${dateString}</div>
                            </div>
                            <button class="delete-itinerary-btn" title="삭제" style="
                                background: none; border: none; color: oklch(60% 0.15 20); font-size: 1.2rem; cursor: pointer; padding: 0.5rem; margin: -0.5rem -0.5rem 0 0; border-radius: 50%; transition: transform 0.2s, opacity 0.2s; opacity: 0.7;
                            ">🗑️</button>
                        </div>
                    `;

                    const deleteBtn = card.querySelector('.delete-itinerary-btn');
                    deleteBtn.addEventListener('mouseover', () => { deleteBtn.style.opacity = '1'; deleteBtn.style.transform = 'scale(1.1)'; });
                    deleteBtn.addEventListener('mouseout', () => { deleteBtn.style.opacity = '0.7'; deleteBtn.style.transform = 'none'; });

                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm("정말로 이 일정을 삭제하시겠습니까?")) {
                            try {
                                deleteBtn.style.pointerEvents = 'none';
                                deleteBtn.style.opacity = '0.3';
                                await deleteItinerary(item.id);
                                card.remove();
                                if (itinerariesList.children.length === 0) {
                                    itinerariesList.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">저장된 일정이 없습니다.</p>';
                                }
                                if (itineraryView && typeof itineraryView.showToast === 'function') {
                                    itineraryView.showToast("일정이 성공적으로 삭제되었습니다.");
                                } else alert("일정이 성공적으로 삭제되었습니다.");
                            } catch (error) {
                                console.error('Failed to delete itinerary:', error);
                                alert("일정 삭제에 실패했습니다.");
                                deleteBtn.style.pointerEvents = 'auto';
                                deleteBtn.style.opacity = '0.7';
                            }
                        }
                    });

                    card.addEventListener('mouseover', () => { card.style.borderColor = 'var(--accent-primary)'; card.style.transform = 'translateY(-2px)'; card.style.boxShadow = 'var(--shadow-md)'; });
                    card.addEventListener('mouseout', () => { card.style.borderColor = 'oklch(90% 0.02 260)'; card.style.transform = 'none'; card.style.boxShadow = 'var(--shadow-sm)'; });

                    card.addEventListener('click', async () => {
                        itinerariesModal.style.display = 'none';
                        if (!item.itineraryPlan) return;

                        try {
                            // 🚀 [Routing] 1. Route to View Phase immediately to prevent form flickering on /plan
                            window.navigate('/view');

                            let requestData = null;
                            if (item.itineraryPlan?.request) requestData = item.itineraryPlan.request;
                            else if (item.itineraryPlan?.metadata?.request) requestData = item.itineraryPlan.metadata.request;

                            // 2. Save only to JS state (session storage). DO NOT touch DOM (travelFormView) during transition.
                            if (requestData) {
                                sessionStorage.setItem('currentFormData', JSON.stringify(requestData));
                            }

                            sessionStorage.setItem('currentPhase', '3');
                            sessionStorage.setItem('savedItineraryData', JSON.stringify(item.itineraryPlan));

                            // 3. Smooth transition: show loading and delay heavy render by a frame tick
                            if (mapView && mapView.setLoading) {
                                mapView.setLoading(true, "일정을 시각화하는 중입니다...");
                            }

                            requestAnimationFrame(async () => {
                                if (itineraryView) itineraryView.showResults(item.itineraryPlan);
                                if (mapView) await mapView.renderRoute(item.itineraryPlan);
                            });
                            
                        } catch (error) {
                            console.error('[Load Itinerary Error]', error);
                            alert("이 일정을 불러오는 중 오류가 발생했습니다.");
                            window.navigate('/plan');
                        }
                    });

                    itinerariesList.appendChild(card);
                });
            } catch (error) {
                console.error('Failed to fetch itineraries:', error);
                itinerariesList.innerHTML = '<p style="text-align:center; color: red;">일정을 불러오는 데 실패했습니다.</p>';
            }
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
                window.dispatchEvent(new CustomEvent('itinerary-generation-complete'));
            }
        });
    }
});