// Entry point for the frontend logic
import './src/components/travel-form.js';
import './src/components/map-view.js';
import './src/components/itinerary-view.js';
import { generateOptimizedItinerary } from './src/lib/optimization-service.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("App initialized. Event-based routing ready.");

    const travelForm = document.querySelector('travel-form');
    const itineraryView = document.querySelector('itinerary-view');
    const mapView = document.querySelector('map-view');
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

    if (travelForm && itineraryView) {
        travelForm.addEventListener('generate-itinerary', async (e) => {
            console.log('App main received itinerary generation event:', e.detail);

            // Update UI state to loading
            itineraryView.setLoading(true);

            try {
                // Call the AI Service
                const optimizedPlan = await generateOptimizedItinerary(e.detail);

                // Pass the generated data to the itinerary view to start rendering the timeline
                itineraryView.showResults(optimizedPlan);

                // Map Update Map Mock
                mapView.renderRoute(optimizedPlan);
            } catch (error) {
                console.error("Failed to generate itinerary:", error);
                itineraryView.setError("Failed to generate your trip. Please try again.");
            }
        });
    }
});