// Entry point for the frontend logic
import '../domains/auth/ui/login-view.js';
import '../domains/planner/ui/travel-form.js';
import '../domains/map/ui/map-view.js';
import '../domains/itinerary/ui/itinerary-view.js';
import { generateOptimizedItinerary } from '../domains/planner/services/gemini-optimizer.js';
import { subscribeToAuthChanges, logout } from '../domains/auth/services/firebase-auth.js';

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

    // Subscribe to Firebase Auth and handle routing
    subscribeToAuthChanges((user) => {
        if (user) {
            // Logged in
            loginView.style.display = 'none';
            appContent.style.display = 'block';
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
        } else {
            // Not logged in
            loginView.style.display = 'block';
            appContent.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'none';
        }
    });

    if (travelForm && itineraryView) {
        travelForm.addEventListener('generate-itinerary', async (e) => {
            console.log('App main received itinerary generation event:', e.detail);

            // Update UI state to loading
            itineraryView.setLoading(true);

            try {
                // Call the AI Service
                const itineraryPlan = await generateOptimizedItinerary(e.detail);

                // Pass the generated data to the itinerary view to start rendering the timeline
                itineraryView.showResults(itineraryPlan);

                // Map Update Map Mock
                mapView.renderRoute(itineraryPlan);
            } catch (error) {
                console.error("Failed to generate itinerary:", error);

                // Friendly error handling via alert for 429, or itineraryView for others
                if (error.message.includes("429")) {
                    alert('⏳ ' + error.message);
                }

                itineraryView.setError(error.message || "Failed to generate your trip. Please try again.");
            } finally {
                // Signal to form that generation is done (success or fail)
                window.dispatchEvent(new CustomEvent('itinerary-generation-complete'));
            }
        });
    }
});