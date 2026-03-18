// Entry point for the frontend logic
import '../domains/auth/ui/login-view.js';
import '../domains/planner/ui/travel-form.js';
import '../domains/map/ui/map-view.js';
import '../domains/itinerary/ui/itinerary-view.js';
import { generateOptimizedItinerary } from '../domains/planner/services/gemini-optimizer.js';
import { subscribeToAuthChanges, logout, getCurrentUser } from '../domains/auth/services/firebase-auth.js';
import { getUserItineraries, deleteItinerary, getSharedItinerary } from '../domains/itinerary/services/firestore-service.js';
import { t, getLang, setLang } from '../utils/i18n.js';

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

    // Auth & Routing
    const loginView = document.getElementById('login-view');
    const appContent = document.getElementById('app-content');
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

    // 2. 초기 렌더링 시점 (Restore State or Share URL)
    const urlParams = new URLSearchParams(window.location.search);
    const sharedId = urlParams.get('id');
    const savedPhase = sessionStorage.getItem('currentPhase');

    if (sharedId) {
        try {
            console.log("[Share] Found shared itinerary ID. Fetching from Firestore...");
            
            // Phase 1 컨테이너 숨기고 UI 즉각 준비 (웰컴 모달/빈화면 방지)
            if (travelFormView) {
                travelFormView.style.display = 'none';
                travelFormView.classList.add('hidden-view');
            }
            if (resultsLayout) {
                resultsLayout.style.display = 'grid';
                resultsLayout.classList.remove('hidden-view');
            }
            if (mapView) {
                mapView.hideEmptyState();
                mapView.setLoading(true, "공유된 일정을 불러오는 중입니다...");
            }

            const parsedItinerary = await getSharedItinerary(sharedId);
            
            if (!parsedItinerary) throw new Error("Itinerary not found in Firestore.");

            // 컴포넌트 마운트를 위한 약간의 지연 후 렌더링
            setTimeout(() => {
                if (mapView) mapView.renderRoute(parsedItinerary);
                if (itineraryView) itineraryView.showResults(parsedItinerary);
                window.dispatchEvent(new Event('resize'));

                // 깔끔하게 URL 세탁 (history.replaceState)
                const newUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
                console.log("[Share] URL cleaned up.");
            }, 100);

        } catch (error) {
            console.error("[Share Error]", error);
            alert("공유된 일정을 불러오는 데 실패했습니다.");
        }
    } else if (savedPhase === '3') {
        // [방어막 3] 세션 복구 시에는 웰컴 모달을 절대 띄우지 않음
        try {
            const rawData = sessionStorage.getItem('savedItineraryData');
            if (!rawData) throw new Error("No savedItineraryData found.");

            const parsedItinerary = JSON.parse(rawData);

            // Phase 1 컨테이너 숨기기
            if (travelFormView) {
                travelFormView.style.display = 'none';
                travelFormView.classList.add('hidden-view');
            }

            // Phase 3 컨테이너 보이기
            if (resultsLayout) {
                resultsLayout.style.display = 'grid';
                resultsLayout.classList.remove('hidden-view');
            }

            // 컴포넌트 마운트를 위한 약간의 지연 후 렌더링
            setTimeout(() => {
                if (mapView) mapView.renderRoute(parsedItinerary);
                if (itineraryView) itineraryView.showResults(parsedItinerary);
                window.dispatchEvent(new Event('resize'));
            }, 100);

        } catch (error) {
            console.error("[State Restore Error]", error);
            // 3. 안전한 Fallback (조용히 청소하고 Phase 1 띄우기)
            sessionStorage.removeItem('currentPhase');
            sessionStorage.removeItem('savedItineraryData');

            if (travelFormView) {
                travelFormView.style.display = 'block';
                travelFormView.classList.remove('hidden-view');
            }
            if (resultsLayout) {
                resultsLayout.style.display = 'none';
            }
        }
    } else {
        // [방어막 1 & 2] 로컬 스토리지 및 Phase 1 상태 확인 후 웰컴 모달 노출
        showWelcomeOverlay();
    }

    // Show results button listener (Phase 2 -> Phase 3)
    if (showResultsBtn) {
        showResultsBtn.onclick = () => {
            loadingTransitionView.classList.add('hidden-view');
            setTimeout(() => {
                loadingTransitionView.style.display = 'none';
                resultsLayout.style.display = 'grid';
                void resultsLayout.offsetWidth; // Reflow
                resultsLayout.classList.remove('hidden-view');

                // Ensure map resizes correctly
                window.dispatchEvent(new Event('resize'));
            }, 400);
        };
    }

    // ----------------------------------------------------
    // [View Transition Manager] Phase 3 -> Phase 1
    // 순수 화면 전환만 담당 (Display 변경, 세션 초기화)
    // ----------------------------------------------------
    function returnToPhase1() {
        if (resultsLayout) {
            resultsLayout.classList.add('hidden-view');
            setTimeout(() => {
                resultsLayout.style.display = 'none';
                if (travelFormView) {
                    travelFormView.style.display = 'block';
                    void travelFormView.offsetWidth; // Reflow
                    travelFormView.classList.remove('hidden-view');
                    sessionStorage.setItem('currentPhase', '1');
                    sessionStorage.removeItem('savedItineraryData'); // Clear stored layout buffer
                }
            }, 400);
        }
    }

    // 1. [← 이전 화면으로] 버튼: 순수 뒤로 가기
    const goBackBtn = document.getElementById('go-back-btn');
    if (goBackBtn) {
        goBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('[Routing] "Go Back" clicked: Pure CSS transition. No data injection.');
            // Only trigger visual transition. ZERO auto-fill manipulation.
            returnToPhase1();
        });
    }

    // 2. [일정 수정하기] 버튼: 데이터 불러와서 채우기(Auto-fill) 후 뒤로 가기
    const editItineraryBtn = document.getElementById('edit-itinerary-btn');
    if (editItineraryBtn) {
        editItineraryBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('[Routing] "Edit Itinerary" clicked: Injecting data, then transitioning.');

            // 데이터 파싱
            let requestData = null;
            if (itineraryView && itineraryView.currentItinerary && itineraryView.currentItinerary.request) {
                requestData = itineraryView.currentItinerary.request;
            } else if (itineraryView && itineraryView.currentItinerary && itineraryView.currentItinerary.metadata && itineraryView.currentItinerary.metadata.request) {
                requestData = itineraryView.currentItinerary.metadata.request;
            }

            // Phase 1 폼 주입 (Auto-fill) 시작 전에 화면 전환 방지 -> 주입 완료 후 전환
            if (travelFormView && travelFormView.populateForm && requestData) {
                travelFormView.populateForm(requestData);
            } else {
                console.warn('[Auto-fill] Failed to find existing requestData to populate.');
            }

            // 주입이 끝난 후 CSS 전환 로직 실행
            returnToPhase1();
        });
    } else {
        console.error('[Routing] Cannot find edit-itinerary-btn in DOM!');
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
            // Do not override with hardcoded text, let i18n handle it if possible, or swap key
        });
    }

    // Language initialization & toggle
    // updateTexts(); // Moved to top-level for immediate execution
    if (langToggleBtn) {
        // Set initial button text based on current lang
        langToggleBtn.textContent = getLang() === 'ko' ? '🌐 English' : '🌐 한국어';

        langToggleBtn.addEventListener('click', () => {
            const newLang = getLang() === 'ko' ? 'en' : 'ko';
            setLang(newLang);
            langToggleBtn.textContent = newLang === 'ko' ? '🌐 English' : '🌐 한국어';
            updateTexts();
        });
    }

    // Listen for global i18n changes, just in case
    window.addEventListener('i18n-changed', () => {
        updateTexts();
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await logout();
            } catch (err) {
                console.error('Logout failed:', err);
            }
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            itinerariesModal.style.display = 'none';
        });
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
                        transition: all 0.2s;
                        position: relative;
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
                                background: none; 
                                border: none; 
                                color: oklch(60% 0.15 20); 
                                font-size: 1.2rem; 
                                cursor: pointer; 
                                padding: 0.5rem; 
                                margin: -0.5rem -0.5rem 0 0;
                                border-radius: 50%;
                                transition: transform 0.2s, opacity 0.2s;
                                opacity: 0.7;
                            ">🗑️</button>
                        </div>
                    `;

                    // Delete button hover effect
                    const deleteBtn = card.querySelector('.delete-itinerary-btn');
                    deleteBtn.addEventListener('mouseover', () => { deleteBtn.style.opacity = '1'; deleteBtn.style.transform = 'scale(1.1)'; });
                    deleteBtn.addEventListener('mouseout', () => { deleteBtn.style.opacity = '0.7'; deleteBtn.style.transform = 'none'; });

                    // Delete action with stopPropagation
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation(); // Prevent loading the itinerary

                        if (confirm("정말로 이 일정을 삭제하시겠습니까?")) {
                            try {
                                deleteBtn.style.pointerEvents = 'none';
                                deleteBtn.style.opacity = '0.3';

                                await deleteItinerary(item.id);

                                // Remove from DOM
                                card.remove();

                                // Check if list is empty now
                                if (itinerariesList.children.length === 0) {
                                    itinerariesList.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">저장된 일정이 없습니다.</p>';
                                }

                                // Show Toast
                                if (itineraryView && typeof itineraryView.showToast === 'function') {
                                    itineraryView.showToast("일정이 성공적으로 삭제되었습니다.");
                                } else {
                                    alert("일정이 성공적으로 삭제되었습니다.");
                                }
                            } catch (error) {
                                console.error('Failed to delete itinerary:', error);
                                alert("일정 삭제에 실패했습니다.");
                                deleteBtn.style.pointerEvents = 'auto';
                                deleteBtn.style.opacity = '0.7';
                            }
                        }
                    });

                    card.addEventListener('mouseover', () => {
                        card.style.borderColor = 'var(--accent-primary)';
                        card.style.transform = 'translateY(-2px)';
                    });

                    card.addEventListener('mouseout', () => {
                        card.style.borderColor = 'oklch(90% 0.02 260)';
                        card.style.transform = 'none';
                    });

                    card.addEventListener('click', async () => {
                        itinerariesModal.style.display = 'none';
                        if (!item.itineraryPlan) return;

                        try {
                            // 🚀 [Auto-fill Sync] 모달에서 일정을 불러오는 즉시 백그라운드 폼(Phase 1)도 완벽 동기화
                            let requestData = null;
                            if (item.itineraryPlan?.request) {
                                requestData = item.itineraryPlan.request;
                            } else if (item.itineraryPlan?.metadata?.request) {
                                requestData = item.itineraryPlan.metadata.request;
                            }

                            if (travelFormView && travelFormView.populateForm && requestData) {
                                console.log('[Sync] Synchronizing loaded itinerary to background form:', requestData);
                                travelFormView.populateForm(requestData);
                                // 백그라운드 폼 캐시도 최신화해서 새로고침 시에도 폼 데이터 유지
                                sessionStorage.setItem('currentFormData', JSON.stringify(requestData));
                            }

                            // Phase 1 숨기기
                            if (travelFormView) {
                                travelFormView.classList.add('hidden-view');
                                travelFormView.style.display = 'none';
                            }

                            // Phase 3 띄우기
                            if (resultsLayout) {
                                resultsLayout.style.display = 'grid';
                                void resultsLayout.offsetWidth; // Reflow
                                resultsLayout.classList.remove('hidden-view');
                                // 지도가 깨지지 않도록 resize 이벤트 트리거
                                window.dispatchEvent(new Event('resize'));
                            }

                            if (itineraryView) itineraryView.showResults(item.itineraryPlan);
                            if (mapView) await mapView.renderRoute(item.itineraryPlan);

                            // 현재 세션 상태 동기화 (새로고침 대비)
                            sessionStorage.setItem('currentPhase', '3');
                            sessionStorage.setItem('savedItineraryData', JSON.stringify(item.itineraryPlan));
                        } catch (error) {
                            console.error('[Load Itinerary Error] Failed to load the itinerary rendering flow:', error);

                            // Revert to Phase 1 securely in case of error
                            if (travelFormView) {
                                travelFormView.style.display = 'block';
                                travelFormView.classList.remove('hidden-view');
                            }
                            if (resultsLayout) {
                                resultsLayout.style.display = 'none';
                            }
                            if (mapView && typeof mapView.setLoading === 'function') {
                                mapView.setLoading(false);
                            }
                            if (loadingTransitionView) {
                                loadingTransitionView.style.display = 'none';
                            }
                            alert("이 일정을 불러오는 중 오류가 발생했습니다. 데이터 구조가 호환되지 않을 수 있습니다.");
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

    // Subscribe to Firebase Auth and handle routing
    subscribeToAuthChanges((user) => {
        if (user) {
            // Logged in
            loginView.style.display = 'none';
            appContent.style.display = 'block';
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            if (myItinerariesBtn) myItinerariesBtn.style.display = 'inline-block';
        } else {
            // Not logged in
            loginView.style.display = 'block';
            appContent.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (myItinerariesBtn) myItinerariesBtn.style.display = 'none';
        }
    });

    if (travelForm && itineraryView) {
        travelForm.addEventListener('generate-itinerary', async (e) => {
            console.log('App main received itinerary generation event:', e.detail);

            // 🚨 기존 데이터 클린업 (Clean-up Logic) 🚨
            console.log('[Clean-up] Generating new itinerary, clearing map and timeline');
            itineraryView.clear();
            mapView.clearMap();

            // Phase 1 -> Phase 2 Transition
            if (travelFormView) travelFormView.classList.add('hidden-view');
            if (resultsLayout) resultsLayout.classList.add('hidden-view');

            setTimeout(() => {
                if (travelFormView) travelFormView.style.display = 'none';
                if (resultsLayout) resultsLayout.style.display = 'none';

                // Setup Phase 2
                loadingSpinner.style.display = 'block';
                loadingText.textContent = 'AI가 최적의 경로를 분석하고 있습니다...';
                loadingText.style.color = 'var(--accent-primary)';
                loadingSubtext.textContent = '잠시만 기다려주세요.';
                loadingSubtext.style.display = 'block';
                showResultsBtn.style.display = 'none';
                showResultsBtn.textContent = '✨ 경로 확인하기';

                loadingTransitionView.style.display = 'flex';
                // Trigger reflow
                void loadingTransitionView.offsetWidth;
                loadingTransitionView.classList.remove('hidden-view');

                sessionStorage.setItem('currentPhase', '2');
            }, 100);

            try {
                // Call the AI Service
                const itineraryPlan = await generateOptimizedItinerary(e.detail);

                // Pass the generated data to the itinerary view to start rendering the timeline
                itineraryView.showResults(itineraryPlan);

                // Map Update Map Mock
                mapView.renderRoute(itineraryPlan);

                // 1. 데이터 저장 시점 (Save State) - 'Generate' 완료 직후
                sessionStorage.setItem('currentPhase', '3');

                // 저장 객체가 구글 맵스 순환참조를 포함하지 않도록 주의. (gemini-optimizer 반환값은 순수 JSON 객체임)
                sessionStorage.setItem('savedItineraryData', JSON.stringify(itineraryPlan));

                // Phase 2: Complete Waiting -> Ready for Phase 3
                loadingSpinner.style.display = 'none';
                loadingText.textContent = '✨ 경로 설계가 완료되었습니다!';
                loadingSubtext.style.display = 'none';
                showResultsBtn.style.display = 'inline-block';

                // Set click action for success
                showResultsBtn.onclick = () => {
                    loadingTransitionView.classList.add('hidden-view');
                    setTimeout(() => {
                        loadingTransitionView.style.display = 'none';
                        resultsLayout.style.display = 'grid';
                        void resultsLayout.offsetWidth; // Reflow
                        resultsLayout.classList.remove('hidden-view');
                        window.dispatchEvent(new Event('resize'));
                    }, 400);
                };

            } catch (error) {
                console.error("Failed to generate itinerary:", error);

                // Phase 2: Error state
                loadingSpinner.style.display = 'none';
                loadingText.textContent = '❌ 일정을 생성하지 못했습니다.';
                loadingText.style.color = '#ef4444';
                loadingSubtext.textContent = error.message || '다시 시도해주세요.';
                loadingSubtext.style.display = 'block';

                // Allow user to go back to Phase 1
                showResultsBtn.textContent = '🔙 돌아가기';
                showResultsBtn.style.display = 'inline-block';
                showResultsBtn.onclick = () => {
                    loadingTransitionView.classList.add('hidden-view');
                    setTimeout(() => {
                        loadingTransitionView.style.display = 'none';
                        if (travelFormView) {
                            travelFormView.style.display = 'block';
                            void travelFormView.offsetWidth;
                            travelFormView.classList.remove('hidden-view');
                        }
                    }, 400);
                };

                // Friendly error handling via alert for 429, or itineraryView for others
                if (error.message.includes("429")) {
                    alert('⏳ ' + error.message);
                }
            } finally {
                // Signal to form that generation is done (success or fail)
                window.dispatchEvent(new CustomEvent('itinerary-generation-complete'));
            }
        });
    }
});