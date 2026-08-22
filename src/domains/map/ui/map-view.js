import { getMapsLoader } from "../services/google-maps-loader.js";
import { GeocodingService } from "../services/geocoding-service.js";
import { RoutingService } from "../services/routing-service.js";
import { buildTransitDepartureTime } from "../services/transit-time.mjs";
import { getLang } from "../../../utils/i18n.js";

function latLngToString(latLng) {
  const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
  const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
  return `${lat},${lng}`;
}

/**
 * 두 좌표가 사실상 같은 지점인지 판정한다(소수점 5자리 ≈ 1m).
 * 마커 병합과 같은 기준을 쓰므로 "핀은 하나인데 경로는 요청" 같은 불일치가 없다.
 */
function isSameCoordinate(a, b) {
  if (!a || !b) return false;
  const [aLat, aLng] = latLngToString(a).split(',').map(Number);
  const [bLat, bLng] = latLngToString(b).split(',').map(Number);
  return aLat.toFixed(5) === bLat.toFixed(5) && aLng.toFixed(5) === bLng.toFixed(5);
}

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
    // 언어를 함수로 넘긴다. 사용자가 언어를 바꾸면 다음 지오코딩부터
    // 바로 반영되어야 하기 때문이다(생성 시점 값 고정 금지).
    this.geocodingService = new GeocodingService(this.loader, { getLanguage: getLang });
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

  /**
   * 지도가 실제 이동시간을 구하지 못했음을 타임라인에 알린다.
   *
   * 예전에는 지오코딩/Directions 실패 시 그냥 return 해버려서, 타임라인에는
   * AI 추정 시각이 검증된 것처럼 남고 사용자는 그 사실을 알 수 없었다.
   * @param {string} reason 로그용 사유
   */
  notifyTransitUnavailable(reason) {
    console.warn(`[Map] 실제 이동시간을 계산하지 못했습니다: ${reason}`);
    window.dispatchEvent(new CustomEvent('transit-unavailable', { detail: { reason } }));
  }

  async renderRoute(itineraryPlan) {
    if (!this.map) {
      this.notifyTransitUnavailable('지도를 초기화하지 못했습니다.');
      return;
    }

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
      this.notifyTransitUnavailable('일정에 표시할 항목이 없습니다.');
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
        this.notifyTransitUnavailable('장소를 좌표로 변환하지 못했습니다.');
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

      // 지도가 실제로 어떤 장소를 찾았는지 타임라인에 알린다. 화면에는 AI 가
      // 쓴 문자열이 그대로 떠 있어서, 엉뚱한 곳으로 매칭돼도 사용자가 알
      // 방법이 없었다. displayIndex 로 위치를 맞춰 보낸다(지오코딩에 실패한
      // 항목은 빠지므로 배열 순서만으로는 어긋난다).
      window.dispatchEvent(new CustomEvent('places-resolved', {
        detail: geocodedItems
          .filter(item => item.resolvedName || item.resolvedAddress)
          .map(item => ({
            index: (item.displayIndex ?? 0) - 1,
            name: item.resolvedName || '',
            address: item.resolvedAddress || ''
          }))
      }));

      // 4. Delegate Routing to RoutingService and Render Lines
      if (geocodedItems.length > 1) {
        this.setLoading(true, "Calculating routes...");
        await this.renderTransitSegments(geocodedItems, day.date);
      } else {
        this.notifyTransitUnavailable('좌표를 구한 장소가 하나뿐이라 경로를 계산할 수 없습니다.');
      }
    } catch (err) {
      console.error("[Map Rendering Error]", err);
      this.notifyTransitUnavailable(err?.message || '지도 렌더링 중 오류가 발생했습니다.');
    } finally {
      this.setLoading(false);
    }
  }

  async renderMarkers(geocodedItems) {
    const { AdvancedMarkerElement, PinElement } = await this.loader.importLibrary("marker");

    // Same-coordinate stops (e.g. a trip starting and ending at one hotel)
    // would stack pins and hide all but the last; merge them into one pin.
    const groups = new Map();
    geocodedItems.forEach((item, index) => {
      const [lat, lng] = latLngToString(item.latLng).split(',').map(Number);
      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ item, index });
    });

    groups.forEach(entries => {
      const numbers = entries.map(({ item, index }) => item.displayIndex ?? index + 1);
      const isAnchor = entries.some(({ item }) => item.type === 'AnchorSchedule');
      const isStart = numbers.includes(1);

      const pinView = new PinElement({
        background: isAnchor ? "#7c3aed" : (isStart ? "#10b981" : "#3b82f6"),
        borderColor: isAnchor ? "#5b21b6" : (isStart ? "#047857" : "#2563eb"),
        glyphColor: "white",
        glyph: numbers.join('·'),
        scale: numbers.length > 1 ? 1.25 : 1
      });

      const marker = new AdvancedMarkerElement({
        map: this.map,
        position: entries[0].item.latLng,
        title: entries.map(({ item }) => item.title).join(' / '),
        content: pinView.element
      });

      this.markers.push(marker);
    });
  }

  async renderTransitSegments(geocodedItems, dayDate) {
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
      // Route for the scheduled departure (origin item's end time), not "now".
      const departureTime = buildTransitDepartureTime(
        dayDate,
        geocodedItems[i].endTime || geocodedItems[i].time
      );
      // Same segment in the Google Maps UI, so users can verify the route.
      const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(latLngToString(origin))}&destination=${encodeURIComponent(latLngToString(destination))}&travelmode=transit`;

      // 같은 장소에서 이어지는 일정(예: 쇼핑몰 방문 -> 그 몰 안에서 저녁 식사)은
      // 출발지와 목적지 좌표가 같다. Directions API 에 그대로 요청하면
      // ZERO_RESULTS 가 떨어져 "실패한 구간"으로 잡히고, 그 결과 타임라인에
      // "일부 구간만 확인됨" 안내가 뜨며 콘솔에도 오류가 쌓인다. 애초에
      // 이동이 없는 구간이므로 요청하지 않고 소요시간 0으로 확정한다.
      // (마커 병합도 같은 기준으로 좌표를 비교한다.)
      if (isSameCoordinate(origin, destination)) {
        return Promise.resolve({
          fromIndex,
          toIndex,
          duration: '',
          durationMinutes: 0,
          distance: '',
          mode: 'SAME_PLACE',
          samePlace: true,
          steps: [],
          directionsUrl
        });
      }

      // Delegate to RoutingService
      return this.routingService.getTransitRoute(origin, destination, departureTime).then(response => {
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
          let hasTransitStep = false;

          // Full per-step breakdown (walks, waits, each transit line) so the
          // timeline can show the whole leg instead of one lump sum.
          const steps = (leg.steps || []).map(s => {
            if (s.travel_mode === 'TRANSIT' && s.transit) {
              const line = s.transit.line || {};
              return {
                mode: 'TRANSIT',
                duration: s.duration?.text || '',
                distance: s.distance?.text || '',
                vehicleType: line.vehicle?.type || 'TRANSIT',
                lineName: line.short_name || line.name || '',
                departureStop: s.transit.departure_stop?.name || '',
                arrivalStop: s.transit.arrival_stop?.name || '',
                numStops: s.transit.num_stops || null
              };
            }
            return {
              mode: s.travel_mode || 'WALKING',
              duration: s.duration?.text || '',
              distance: s.distance?.text || ''
            };
          });

          // Search steps for the most relevant transit line
          if (leg.steps && leg.steps.length > 0) {
            const transitSteps = leg.steps.filter(s => s.travel_mode === 'TRANSIT' && s.transit);
            hasTransitStep = transitSteps.length > 0;

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
            // 실제 이동 소요시간(분, 반올림). 일정 카드 시간을 이동시간만큼
            // 밀어내는 보정(applyTransitDelays)에 쓰인다. Directions API가
            // 항상 초 단위 value를 주므로 여기서만 분으로 환산해둔다.
            durationMinutes: typeof leg.duration.value === 'number'
              ? Math.round(leg.duration.value / 60)
              : null,
            distance: leg.distance.text,
            mode: hasTransitStep ? 'TRANSIT' : 'WALKING', /* Ubiquitous Language */
            vehicleType: primaryVehicleType,
            lineName: primaryLineName,
            transitDetailsExtended,
            steps,
            directionsUrl
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
          duration: '',
          durationMinutes: null, // 실패한 구간은 실제 소요시간을 모르므로 시간 보정에서 제외됨
          distance: '',
          mode: 'WALKING',
          steps: [],
          directionsUrl
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
