import { Loader } from "@googlemaps/js-api-loader";

export default class MapView extends HTMLElement {
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
      libraries: ["marker"]
    });
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
        <span style="margin-top: 1rem; font-weight: 500;">Loading Map...</span>
      </div>
    `;
  }

  async initMap() {
    const apiKey = import.meta.env.VITE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("VITE_MAPS_API_KEY is missing in .env");
      this.shadowRoot.getElementById('loading-overlay').innerHTML = "Map API Key Missing";
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

      this.shadowRoot.getElementById('loading-overlay').classList.add('hidden');
    } catch (e) {
      console.error("Failed to load map:", e);
    }
  }

  async renderRoute(itineraryData) {
    if (!this.map) return;

    window.dispatchEvent(new CustomEvent('transit-info-ready', { detail: [] }));

    // Show loading overlay during optimization/geocoding
    this.shadowRoot.getElementById('loading-overlay').classList.remove('hidden');

    // Clear old markers and direction layers
    this.markers.forEach(m => m.map = null);
    this.markers = [];
    if (this.directionsRenderers) {
      this.directionsRenderers.forEach(r => r.setMap(null));
    }
    this.directionsRenderers = [];
    if (this.fallbackPolylines) {
      this.fallbackPolylines.forEach(p => p.setMap(null));
    }
    this.fallbackPolylines = [];

    const { AdvancedMarkerElement, PinElement } = await this.loader.importLibrary("marker");
    const { Geocoder } = await this.loader.importLibrary("geocoding");
    const { DirectionsService, DirectionsRenderer } = await this.loader.importLibrary("routes");
    const { Polyline } = await this.loader.importLibrary("maps");
    const { SymbolPath } = await this.loader.importLibrary("core");

    const geocoder = new Geocoder();
    const directionsService = new DirectionsService();

    const day = itineraryData.days[0];
    if (!day || !day.events) return;

    const geocodedEvents = [];
    let anchorLatLng = null;

    // Sequential geocoding
    for (const ev of day.events) {
      if (ev.location) {
        try {
          const results = await geocoder.geocode({ address: ev.location });
          if (results.results && results.results.length > 0) {
            const latLng = results.results[0].geometry.location;
            geocodedEvents.push({ ...ev, latLng });
            if (ev.type === 'anchor') {
              anchorLatLng = latLng;
            }
          }
        } catch (err) {
          console.error("Geocoding failed for", ev.location, err);
        }
      }
    }

    if (geocodedEvents.length === 0) {
      this.shadowRoot.getElementById('loading-overlay').classList.add('hidden');
      return;
    }

    // Centering Map on Anchor Event per request
    if (anchorLatLng) {
      this.map.setCenter(anchorLatLng);
      this.map.setZoom(14);
    } else {
      this.map.setCenter(geocodedEvents[0].latLng);
      this.map.setZoom(14);
    }

    // Draw markers
    geocodedEvents.forEach((ev, index) => {
      const isAnchor = ev.type === 'anchor';

      const pinView = new PinElement({
        background: isAnchor ? "#7c3aed" : (index === 0 ? "#10b981" : "#3b82f6"),
        borderColor: isAnchor ? "#5b21b6" : (index === 0 ? "#047857" : "#2563eb"),
        glyphColor: "white",
        glyph: `${index + 1}`
      });

      const marker = new AdvancedMarkerElement({
        map: this.map,
        position: ev.latLng,
        title: ev.title,
        content: pinView.element
      });

      this.markers.push(marker);
    });

    // Segmented Directions Routing for Transit (Korea Maps API constraints)
    const PATH_COLORS = ['#e11d48', '#ea580c', '#d97706', '#65a30d', '#0284c7', '#4f46e5', '#9333ea'];
    const transitDetails = [];

    if (geocodedEvents.length > 1) {
      const routePromises = [];

      for (let i = 0; i < geocodedEvents.length - 1; i++) {
        const origin = geocodedEvents[i].latLng;
        const destination = geocodedEvents[i + 1].latLng;
        const segmentColor = PATH_COLORS[i % PATH_COLORS.length];

        routePromises.push(
          directionsService.route({
            origin,
            destination,
            travelMode: google.maps.TravelMode.TRANSIT
          }).then(response => {
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
                mode: 'TRANSIT'
              });
            }
          }).catch(err => {
            console.warn(`Transit route failed between "${geocodedEvents[i].title}" and "${geocodedEvents[i + 1].title}" (Likely too close, falling back to dashed walking line):`, err.message);
            // Fallback: draw a dashed straight line indicating a walk or short transit
            const lineSymbol = {
              path: SymbolPath.CIRCLE,
              fillOpacity: 1,
              scale: 3
            };

            const dashedPolyline = new Polyline({
              path: [origin, destination],
              strokeOpacity: 0,
              icons: [{
                icon: lineSymbol,
                offset: "0",
                repeat: "20px"
              }],
              strokeColor: segmentColor, // color coded dashed walk
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
      window.dispatchEvent(new CustomEvent('transit-info-ready', { detail: transitDetails }));
    }

    this.shadowRoot.getElementById('loading-overlay').classList.add('hidden');
  }
}

customElements.define('map-view', MapView);
