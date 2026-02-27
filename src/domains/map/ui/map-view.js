import { Loader } from "@googlemaps/js-api-loader";
import { GeocodingService } from "../services/geocoding-service.js";
import { RoutingService } from "../services/routing-service.js";

export class MapView extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.map = null;
        this.markers = [];
        this.directionsRenderers = [];
        this.fallbackPolylines = [];

        this.loader = new Loader({
            apiKey: import.meta.env.VITE_MAPS_API_KEY,
            version: "weekly",
            libraries: ["marker", "geocoding", "routes", "maps", "core"]
        });

        // Initialize domain services
        this.geocodingService = new GeocodingService(this.loader);
        this.routingService = new RoutingService(this.loader);
    }

    connectedCallback() {
        this.render();
        this.initMap();
    }

    render() {
        this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          height: 500px;
          background: var(--bg-primary, #fcfcfc);
          border-radius: var(--radius-lg, 16px);
          margin-top: 2rem;
          color: var(--text-secondary);
          box-shadow: var(--shadow-md);
          border: 1px solid oklch(90% 0.02 260);
          position: relative;
          overflow: hidden;
        }

        #map-container {
          width: 100%;
          height: 100%;
          transition: opacity 0.5s ease;
        }

        .loading-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(4px);
          z-index: 20;
          transition: opacity 0.3s;
        }

        .loading-overlay.hidden {
          opacity: 0;
          pointer-events: none;
        }
      </style>

      <div id="map-container"></div>

      <div class="loading-overlay" id="loading-overlay">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #7c3aed)" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <span style="margin-top: 1rem; font-weight: 500;" id="loading-text">Loading Map...</span>
      </div>
    `;
    }

    setLoading(isLoading, text = "Loading...") {
        const overlay = this.shadowRoot.getElementById('loading-overlay');
        const textEl = this.shadowRoot.getElementById('loading-text');
        if (isLoading) {
            if (textEl) textEl.textContent = text;
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    async initMap() {
        const apiKey = import.meta.env.VITE_MAPS_API_KEY;
        if (!apiKey) {
            console.error("VITE_MAPS_API_KEY is missing in .env");
            this.setLoading(true, "Map API Key Missing");
            return;
        }

        try {
            const { Map } = await this.loader.importLibrary("maps");

            this.map = new Map(this.shadowRoot.getElementById("map-container"), {
                center: { lat: 37.5665, lng: 126.9780 },
                zoom: 12,
                mapId: "DEMO_MAP_ID",
                disableDefaultUI: true,
                zoomControl: true,
            });

            this.setLoading(false);
        } catch (e) {
            console.error("Failed to load map:", e);
            this.setLoading(true, "Failed to load map API");
        }
    }

    clearMapLayers() {
        this.markers.forEach(m => m.map = null);
        this.markers = [];
        this.directionsRenderers.forEach(r => r.setMap(null));
        this.directionsRenderers = [];
        this.fallbackPolylines.forEach(p => p.setMap(null));
        this.fallbackPolylines = [];
    }

    async renderRoute(itineraryData) {
        if (!this.map) return;

        // Clear Transit info for UI
        window.dispatchEvent(new CustomEvent('transit-info-ready', { detail: [] }));
        this.setLoading(true, "Analyzing locations...");
        this.clearMapLayers();

        const day = itineraryData.days[0];
        if (!day || !day.events) {
            this.setLoading(false);
            return;
        }

        // 1. Delegate Geocoding to GeocodingService
        const scheduleItems = day.events;
        const geocodedItems = await this.geocodingService.geocodeSchedule(scheduleItems);

        if (geocodedItems.length === 0) {
            this.setLoading(false);
            return;
        }

        // 2. Center Map on Anchor Schedule, or first item
        const anchorItem = geocodedItems.find(item => item.type === 'anchor');
        const centerCoordinate = anchorItem ? anchorItem.latLng : geocodedItems[0].latLng;
        this.map.setCenter(centerCoordinate);
        this.map.setZoom(14);

        // 3. Render Markers on Map
        await this.renderMarkers(geocodedItems);

        // 4. Delegate Routing to RoutingService and Render Lines
        if (geocodedItems.length > 1) {
            this.setLoading(true, "Calculating routes...");
            await this.renderTransitSegments(geocodedItems);
        }

        this.setLoading(false);
    }

    async renderMarkers(geocodedItems) {
        const { AdvancedMarkerElement, PinElement } = await this.loader.importLibrary("marker");

        geocodedItems.forEach((item, index) => {
            const isAnchor = item.type === 'anchor';

            const pinView = new PinElement({
                background: isAnchor ? "#7c3aed" : (index === 0 ? "#10b981" : "#3b82f6"),
                borderColor: isAnchor ? "#5b21b6" : (index === 0 ? "#047857" : "#2563eb"),
                glyphColor: "white",
                glyph: `${index + 1}`
            });

            const marker = new AdvancedMarkerElement({
                map: this.map,
                position: item.latLng,
                title: item.title,
                content: pinView.element
            });

            this.markers.push(marker);
        });
    }

    async renderTransitSegments(geocodedItems) {
        const { DirectionsRenderer } = await this.loader.importLibrary("routes");
        const { Polyline } = await this.loader.importLibrary("maps");
        const { SymbolPath } = await this.loader.importLibrary("core");

        const PATH_COLORS = ['#e11d48', '#ea580c', '#d97706', '#65a30d', '#0284c7', '#4f46e5', '#9333ea'];
        const transitDetails = [];
        const routePromises = [];

        for (let i = 0; i < geocodedItems.length - 1; i++) {
            const origin = geocodedItems[i].latLng;
            const destination = geocodedItems[i + 1].latLng;
            const segmentColor = PATH_COLORS[i % PATH_COLORS.length];

            // Delegate to RoutingService
            routePromises.push(
                this.routingService.getTransitRoute(origin, destination).then(response => {
                    const renderer = new DirectionsRenderer({
                        map: this.map,
                        suppressMarkers: true,
                        preserveViewport: true,
                        polylineOptions: {
                            strokeColor: segmentColor,
                            strokeOpacity: 0.8,
                            strokeWeight: 4,
                        }
                    });
                    renderer.setDirections(response);
                    this.directionsRenderers.push(renderer);

                    const leg = response.routes[0]?.legs[0];
                    if (leg) {
                        transitDetails.push({
                            fromIndex: i,
                            duration: leg.duration.text,
                            distance: leg.distance.text,
                            mode: 'TRANSIT' /* Ubiquitous Language */
                        });
                    }
                }).catch(err => {
                    console.warn(`Transit route failed between "${geocodedItems[i].title}" and "${geocodedItems[i + 1].title}".Drawing walking line.`, err.message);

                    const dashedPolyline = new Polyline({
                        path: [origin, destination],
                        strokeOpacity: 0,
                        icons: [{
                            icon: { path: SymbolPath.CIRCLE, fillOpacity: 1, scale: 3 },
                            offset: "0",
                            repeat: "20px"
                        }],
                        strokeColor: segmentColor,
                        strokeWeight: 2,
                        map: this.map
                    });
                    this.fallbackPolylines.push(dashedPolyline);

                    transitDetails.push({
                        fromIndex: i,
                        duration: 'Short Walk',
                        distance: 'Nearby',
                        mode: 'WALKING'
                    });
                })
            );
        }

        await Promise.allSettled(routePromises);

        // Broadcast transit details back to itinerary view using the old bus channel
        window.dispatchEvent(new CustomEvent('transit-info-ready', { detail: transitDetails }));
    }
}

customElements.define('map-view', MapView);
