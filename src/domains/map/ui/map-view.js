import { getMapsLoader } from "../services/google-maps-loader.js";
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

    this.loader = getMapsLoader();

    // Initialize domain services
    this.geocodingService = new GeocodingService(this.loader);
    this.routingService = new RoutingService(this.loader);
  }

  connectedCallback() {
    this.render();
    this.initMap();

    // Listen for manual route render requests (e.g. when loading by ID)
    window.removeEventListener('render-map-route', this._renderRouteHandler);
    this._renderRouteHandler = (e) => {
      if (e.detail) this.renderRoute(e.detail);
    };
    window.addEventListener('render-map-route', this._renderRouteHandler);
  }

  disconnectedCallback() {
    window.removeEventListener('render-map-route', this._renderRouteHandler);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
          min-height: 500px;
          background: transparent;
          margin-top: 2rem;
          color: var(--text-secondary);
          position: relative;
        }

        #map-container {
          width: 100%;
          height: 500px;
          border-radius: var(--radius-lg, 16px);
          box-shadow: var(--shadow-md);
          border: 1px solid oklch(90% 0.02 260);
          transition: opacity 0.5s ease;
          display: none; /* Hidden until itinerary is generated */
          background: var(--bg-primary, #fcfcfc);
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

  clearMap() {
    this.clearMapLayers();
  }

  async renderRoute(itineraryPlan) {
    if (!this.map) return;

    // Ensure map container is visible
    const mapContainer = this.shadowRoot.getElementById('map-container');
    if (mapContainer && mapContainer.style.display !== 'block') {
      mapContainer.style.display = 'block';
      // Inform Google Maps that the container size has changed (lazy load)
      // Re-triggering resize event or setting center to force redraw if needed.
      if (google && google.maps && google.maps.event) {
        google.maps.event.trigger(this.map, 'resize');
      }
    }

    // Clear Transit info for UI
    window.dispatchEvent(new CustomEvent('transit-info-ready', { detail: [] }));
    this.setLoading(true, "Analyzing locations...");
    this.clearMapLayers();

    const day = itineraryPlan.days[0];
    if (!day || !day.scheduleItems) {
      this.setLoading(false);
      return;
    }

    try {
      // 1. Delegate Geocoding to GeocodingService
      // Tag every item with its timeline position first: geocoding drops
      // failures, so array order alone would desync pins from the list below.
      const scheduleItems = day.scheduleItems.map((item, index) => ({ ...item, displayIndex: index + 1 }));
      const geocodedItems = await this.geocodingService.geocodeSchedule(scheduleItems);

      if (geocodedItems.length === 0) {
        this.setLoading(false);
        return;
      }

      // 2. Center Map on Anchor Schedule, or first item
      const anchorItem = geocodedItems.find(item => item.type === 'AnchorSchedule');
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
    } catch (err) {
      console.error("[Map Rendering Error]", err);
      // Optional: Dispatch event to notify itinerary-view to display error message
    } finally {
      this.setLoading(false);
    }
  }

  async renderMarkers(geocodedItems) {
    const { AdvancedMarkerElement, PinElement } = await this.loader.importLibrary("marker");

    geocodedItems.forEach((item, index) => {
      const isAnchor = item.type === 'AnchorSchedule';
      const displayNumber = item.displayIndex ?? index + 1;
      const isStart = displayNumber === 1;

      const pinView = new PinElement({
        background: isAnchor ? "#7c3aed" : (isStart ? "#10b981" : "#3b82f6"),
        borderColor: isAnchor ? "#5b21b6" : (isStart ? "#047857" : "#2563eb"),
        glyphColor: "white",
        glyph: `${displayNumber}`
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
    // map()을 활용하여 병렬 Promise 배열 생성 후 Promise.all()로 처리
    const routePromises = geocodedItems.slice(0, -1).map((item, i) => {
      const origin = geocodedItems[i].latLng;
      const destination = geocodedItems[i + 1].latLng;
      const segmentColor = PATH_COLORS[i % PATH_COLORS.length];
      // Timeline positions (0-based) so the itinerary list can attach this
      // segment to the right cards even when geocoding dropped items.
      const fromIndex = (geocodedItems[i].displayIndex ?? i + 1) - 1;
      const toIndex = (geocodedItems[i + 1].displayIndex ?? i + 2) - 1;

      // Delegate to RoutingService
      return this.routingService.getTransitRoute(origin, destination).then(response => {
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
        let routeResult = null;
        
        if (leg) {
          let primaryVehicleType = null;
          let primaryLineName = null;
          let transitDetailsExtended = null;

          // Search steps for the most relevant transit line
          if (leg.steps && leg.steps.length > 0) {
            const transitSteps = leg.steps.filter(s => s.travel_mode === 'TRANSIT' && s.transit);

            if (transitSteps.length > 0) {
              const firstTransit = transitSteps[0].transit;
              const lastTransit = transitSteps[transitSteps.length - 1].transit;

              const line = firstTransit.line;
              if (line) {
                primaryVehicleType = line.vehicle?.type || 'TRANSIT';
                primaryLineName = line.short_name || line.name || null;
              }

              const departureStop = firstTransit.departure_stop?.name || '';
              const arrivalStop = lastTransit.arrival_stop?.name || '';

              transitDetailsExtended = {
                departureStop,
                arrivalStop
              };
            }
          }

          routeResult = {
            fromIndex,
            toIndex,
            duration: leg.duration.text,
            distance: leg.distance.text,
            mode: 'TRANSIT', /* Ubiquitous Language */
            vehicleType: primaryVehicleType,
            lineName: primaryLineName,
            transitDetailsExtended
          };
        }
        return routeResult;
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

        return {
          fromIndex,
          toIndex,
          duration: 'Short Walk',
          distance: 'Nearby',
          mode: 'WALKING'
        };
      });
    });

    // 한꺼번에 병렬로 요청 대기 및 결과 취합 (null 값 제외)
    let transitRoutes = await Promise.all(routePromises);
    transitRoutes = transitRoutes.filter(route => route !== null);

    // Broadcast transit details back to itinerary view using the old bus channel
    window.dispatchEvent(new CustomEvent('transit-info-ready', { detail: transitRoutes }));
  }
}

customElements.define('map-view', MapView);
