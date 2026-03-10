// Entry point for the frontend logic
import '../domains/auth/ui/login-view.js';
import '../domains/planner/ui/travel-form.js';
import '../domains/map/ui/map-view.js';
import '../domains/itinerary/ui/itinerary-view.js';
import { generateOptimizedItinerary } from '../domains/planner/services/gemini-optimizer.js';
import { subscribeToAuthChanges, logout, getCurrentUser } from '../domains/auth/services/firebase-auth.js';
import { getUserItineraries } from '../domains/itinerary/services/firestore-service.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("App initialized. Event-based routing ready.");

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

    // View Transition Elements
    const travelFormView = document.getElementById('travel-form-view');
    const loadingTransitionView = document.getElementById('loading-transition-view');
    const loadingSpinner = document.getElementById('loading-spinner');
    const loadingText = document.getElementById('loading-text');
    const loadingSubtext = document.getElementById('loading-subtext');
    const showResultsBtn = document.getElementById('show-results-btn');
    const resultsLayout = document.getElementById('results-layout');

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
            themeToggleBtn.textContent = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
        });
    }

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
                    `;

                    const dateObj = item.createdAt?.toDate() || new Date();
                    const dateString = dateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                    const anchorsCount = item.itineraryPlan?.days[0]?.scheduleItems?.filter(i => i.type === 'AnchorSchedule').length || 0;

                    card.innerHTML = `
                        <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 0.5rem; color: var(--accent-primary);">여행 일정 (${anchorsCount}개의 핵심 방문지)</div>
                        <div style="font-size: 0.9rem; color: var(--text-secondary);">저장일: ${dateString}</div>
                    `;

                    card.addEventListener('mouseover', () => {
                        card.style.borderColor = 'var(--accent-primary)';
                        card.style.transform = 'translateY(-2px)';
                    });

                    card.addEventListener('mouseout', () => {
                        card.style.borderColor = 'oklch(90% 0.02 260)';
                        card.style.transform = 'none';
                    });

                    card.addEventListener('click', () => {
                        itinerariesModal.style.display = 'none';
                        if (item.itineraryPlan) {
                            itineraryView.showResults(item.itineraryPlan);
                            mapView.renderRoute(item.itineraryPlan);
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
            }, 100);

            try {
                // Call the AI Service
                const itineraryPlan = await generateOptimizedItinerary(e.detail);

                // Pass the generated data to the itinerary view to start rendering the timeline
                itineraryView.showResults(itineraryPlan);

                // Map Update Map Mock
                mapView.renderRoute(itineraryPlan);

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