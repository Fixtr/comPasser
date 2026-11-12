import { routeDepartureClock } from '../../itinerary/services/itinerary-schedule-adjust.mjs';
import { travelRegion } from '../../../../functions/travel-region.mjs';
import { getMapsLoader } from "../services/google-maps-loader.js";
import { GeocodingService } from "../services/geocoding-service.js";
import { RoutingService } from "../services/routing-service.js";
import { buildTransitDepartureTime } from "../services/transit-time.mjs";
import { getLang, t } from "../../../utils/i18n.js";
import {
  MIN_PADDING, centerOffsetFor, toPoint, isSinglePlace
} from "../services/map-framing.mjs";

/**
 * 두 장소가 가까우면 `fitBounds` 는 배율을 끝까지 올린다 — 골목 하나만 남고
 * "이 하루가 어디쯤인가"는 사라진다. 여기서 멈춘다.
 */
const MAX_FIT_ZOOM = 16;

/** 사실상 한 곳뿐인 하루의 배율(예전부터 쓰던 값). */
const SINGLE_PLACE_ZOOM = 14;

/** 앱이 여백을 알려 주지 않을 때(미리보기 등) 쓰는 값. */
const DEFAULT_PADDING = { top: MIN_PADDING, right: MIN_PADDING, bottom: MIN_PADDING, left: MIN_PADDING };

/**
 * 핀 색을 CSS 토큰에서 읽는다.
 *
 * PinElement 는 CSS 변수를 못 받고 실제 색 문자열만 받는다. 그래서 값을
 * 코드에 박아 두면 타임라인(토큰)과 지도(하드코딩)가 조용히 갈라진다.
 * "화면에 남는 색 셋은 전부 지도 핀과 같은 뜻" 이라는 규칙이 깨지는 지점이
 * 정확히 여기라서, 한 곳(tokens.css)만 보게 만든다.
 */
/**
 * 토큰 값을 실제 색 문자열로 읽는다. PinElement 와 Polyline 은 CSS 변수를
 * 받지 못해 값이 필요하다.
 *
 * 구글 지도 타일은 우리 테마를 따르지 않고 항상 밝으므로, 지도에 그리는
 * 색은 다크 모드에서 바뀌지 않는 `--cp-route`·`--cp-pin-*` 만 읽는다.
 * 예전에는 `:root` 에서 읽으면 라이트 값이 나온다고 믿고 테마 토큰을 썼지만,
 * 다크 선택자가 `:root[data-theme="dark"]` 로 바뀌면서 그 전제가 깨졌다.
 */
function tokenColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * 같은 자리에 들르는 번호('10·11')를 담는 알약 모양 마커. PinElement 는
 * scale 을 키우면 글자도 같이 커져서, 세 글자부터는 어떤 크기로도 핀 밖으로
 * 넘친다(Maps JS 실측, 2026-11-03). 알약은 글자 길이만큼 넓어진다.
 */
function numberPill(text, fill, ink) {
  const pill = document.createElement('div');
  pill.textContent = text;
  Object.assign(pill.style, {
    padding: '4px 9px', borderRadius: '14px', background: fill, color: ink,
    font: '600 14px Roboto, Arial, sans-serif', lineHeight: '18px', whiteSpace: 'nowrap',
  });
  return pill;
}

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
    this._renderVersion = 0;

    this.loader = getMapsLoader();

    // Initialize domain services
    // 언어를 함수로 넘긴다. 사용자가 언어를 바꾸면 다음 지오코딩부터
    // 바로 반영되어야 하기 때문이다(생성 시점 값 고정 금지).
    this.geocodingService = new GeocodingService(this.loader, { getLanguage: getLang });
    this.routingService = new RoutingService(this.loader);
  }

  connectedCallback() {
    this.render();

    // 여기서 지도를 켜지 않는다. Maps JS 는 라이브러리 여섯 벌
    // (marker·geocoding·routes·maps·core·places)이라 가볍지 않다.
    //
    // 대신 그릴 경로가 생기면(renderRoute) 켠다. 지도 칸은 경로 전까지 숨어 있어
    // 미리 받아 봐야 보일 것이 없고, 느린 연결에서는 공유 일정을 읽는 Firestore 와
    // 대역폭을 다퉈 "없는 일정" 안내까지 늦춘다(Slow 3G 에서 34초).

    // Listen for manual route render requests (e.g. when loading by ID)
    window.removeEventListener('render-map-route', this._renderRouteHandler);
    this._renderRouteHandler = (e) => {
      if (e.detail?.plan) this.renderRoute(e.detail.plan, e.detail.context);
    };
    window.addEventListener('render-map-route', this._renderRouteHandler);
    this._cancelRouteHandler = () => this.clearMap();
    window.addEventListener('cancel-map-route', this._cancelRouteHandler);
  }

  disconnectedCallback() {
    window.removeEventListener('render-map-route', this._renderRouteHandler);
    window.removeEventListener('cancel-map-route', this._cancelRouteHandler);
    this.clearMap();
  }

  /**
   * 지도를 한 번만 켠다.
   *
   * 경로를 그려 달라는 요청(renderRoute)이 빠르게 겹쳐 올 수 있어, Promise 를
   * 붙잡아 두지 않으면 지도를 두 번 만들게 된다.
   *
   * 실패한 시도는 붙잡아 두지 않는다 — 네트워크가 잠깐 끊겼다 돌아온
   * 사용자가 새로고침 없이 다시 시도할 수 있어야 한다.
   * @returns {Promise<boolean>} 지도가 준비됐는지
   */
  ensureMap() {
    if (this.map) return Promise.resolve(true);
    if (!this._mapReady) {
      this._mapReady = this.initMap().then(() => Boolean(this.map));
      this._mapReady.then((ok) => { if (!ok) this._mapReady = null; });
    }
    return this._mapReady;
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        /* 이 컴포넌트는 결과 화면의 배경이다. 높이를 여기서 정하지 않고
           무대(#page-view)가 준 자리를 그대로 채운다 — 예전의 500px 고정과
           margin-top: 2rem 은 지도가 일정 위에 얹힌 카드였을 때의 값이다. */
        :host {
          display: block;
          width: 100%;
          height: 100%;
          background: transparent;
          color: var(--cp-muted);
          font-family: var(--cp-font);
          position: relative;
        }

        #map-container {
          width: 100%;
          height: 100%;
          border-radius: var(--cp-radius);
          border: var(--cp-hair) solid var(--cp-rule);
          transition: opacity 0.5s ease;
          display: none; /* 일정이 만들어지기 전까지는 숨긴다 */
          background: var(--cp-sunken);
        }

        /* 지도 위를 덮는 막. 흰색을 박아 두면 다크 모드에서 흰 판이 뜬다.
           backdrop-filter 는 저사양 안드로이드에서 비싸 쓰지 않는다. */
        .loading-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: var(--cp-paper);
          color: var(--cp-ink-2);
          z-index: 20;
          transition: opacity 0.3s;
        }

        .loading-overlay.hidden {
          opacity: 0;
          pointer-events: none;
        }

      </style>

      <div id="map-container"></div>


      <div class="loading-overlay hidden" id="loading-overlay" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <span style="margin-top: 1rem; font-weight: 500;" id="loading-text"></span>
      </div>
    `;
  }

  setLoading(isLoading, text = '') {
    const overlay = this.shadowRoot.getElementById('loading-overlay');
    const textEl = this.shadowRoot.getElementById('loading-text');

    if (isLoading) {
      if (textEl) textEl.textContent = text;
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
    // A faded overlay is still in the tree; keep screen readers from reading it.
    overlay.setAttribute('aria-hidden', String(!isLoading));
  }



  async initMap() {
    const apiKey = import.meta.env.VITE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("VITE_MAPS_API_KEY is missing in .env");
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
    } catch (e) {
      console.error("Failed to load map:", e);
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
    // API 요청 자체를 취소할 수 없어도 완료된 결과는 더 이상 사용하지 않는다.
    this._renderVersion += 1;
    this.clearMapLayers();
    this.setLoading(false);
  }

  /**
   * 지도가 실제 이동시간을 구하지 못했음을 타임라인에 알린다.
   *
   * 예전에는 지오코딩/Directions 실패 시 그냥 return 해버려서, 타임라인에는
   * AI 추정 시각이 검증된 것처럼 남고 사용자는 그 사실을 알 수 없었다.
   * @param {string} reason 로그용 사유
   */
  notifyTransitUnavailable(reason, context) {
    console.warn(`[Map] 실제 이동시간을 계산하지 못했습니다: ${reason}`);
    window.dispatchEvent(new CustomEvent('transit-unavailable', { detail: { context, reason } }));
  }

  async renderRoute(itineraryPlan, context) {
    const version = ++this._renderVersion;
    const isCurrent = () => version === this._renderVersion;
    this.clearMapLayers();
    this.setLoading(true, t('mapAnalyzing'));
    try {
      // 예전에는 지도가 없으면 여기서 포기했다. 지금은 지도를 늦게 켜므로,
      // 그리라는 요청이 먼저 도착하는 것이 정상이다 — 그때 켜면 된다.
      const ready = await this.ensureMap();
      if (!isCurrent()) return;
      if (!ready) {
        this.notifyTransitUnavailable('지도를 초기화하지 못했습니다.', context);
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

      const day = itineraryPlan?.days?.[0];
      if (!day || !day.scheduleItems) {
        this.notifyTransitUnavailable('일정에 표시할 항목이 없습니다.', context);
        return;
      }

      // 1. Delegate Geocoding to GeocodingService
      // Tag every item with its timeline position first: geocoding drops
      // failures, so array order alone would desync pins from the list below.
      const scheduleItems = day.scheduleItems.map((item, index) => ({ ...item, displayIndex: index + 1 }));
      const geocodedItems = await this.geocodingService.geocodeSchedule(scheduleItems, day.date, itineraryPlan.excludedPlaceIds, itineraryPlan.budget, travelRegion(itineraryPlan.request).countryCode, itineraryPlan.request?.destination?.id);
      if (!isCurrent()) return;

      // Report failures as well, even when no marker can be drawn. Persistence
      // must clear stale identities rather than keeping an older success.
      const notifyPlaces = () => window.dispatchEvent(new CustomEvent('places-resolved', {
        detail: { context, places: scheduleItems.map(item => {
          const found = geocodedItems.find(result => result.displayIndex === item.displayIndex);
          return { index: item.displayIndex - 1, name: found?.resolvedName || '', address: found?.resolvedAddress || '', resolvedPlace: found?.resolvedPlace || null,
            ...(found?.latLng ? { coordinates: {
              lat: typeof found.latLng.lat === 'function' ? found.latLng.lat() : found.latLng.lat,
              lng: typeof found.latLng.lng === 'function' ? found.latLng.lng() : found.latLng.lng,
            } } : {}),
            ...(!['departure', 'arrival', 'AnchorSchedule'].includes(item.type) && Object.hasOwn(item, 'placeIntent')
              ? { verifiedPlace: found?.verifiedPlace || null, unresolvedReason: item.unresolvedReason || null } : {}) };
        }) }
      }));

      if (geocodedItems.length === 0) {
        notifyPlaces();
        this.notifyTransitUnavailable('장소를 좌표로 변환하지 못했습니다.', context);
        return;
      }

      // 2. 그 날의 장소가 전부 보이게 맞춘다.
      //    예전에는 고정 일정 한 곳에 배율 14 를 박아, 나머지가 화면 밖에
      //    있어도 알 수 없었다. 한 곳뿐이면 그때 고정 일정을 가운데 둔다.
      const anchorItem = geocodedItems.find(item => item.type === 'AnchorSchedule');
      this.frameToItems(geocodedItems, anchorItem, isCurrent);

      // 3. Render Markers on Map
      await this.renderMarkers(geocodedItems, isCurrent);
      if (!isCurrent()) return;
      notifyPlaces();

      // 지도가 실제로 어떤 장소를 찾았는지 타임라인에 알린다. 화면에는 AI 가
      // 쓴 문자열이 그대로 떠 있어서, 엉뚱한 곳으로 매칭돼도 사용자가 알
      // 방법이 없었다. displayIndex 로 위치를 맞춰 보낸다(지오코딩에 실패한
      // 항목은 빠지므로 배열 순서만으로는 어긋난다).

      // 4. Delegate Routing to RoutingService and Render Lines
      if (geocodedItems.length > 1) {
        this.setLoading(true, t('mapRouting'));
        await this.renderTransitSegments(geocodedItems, day.date, context, isCurrent, day.timeZone || travelRegion(itineraryPlan.request).timeZone);
      } else {
        this.notifyTransitUnavailable('좌표를 구한 장소가 하나뿐이라 경로를 계산할 수 없습니다.', context);
      }
    } catch (err) {
      if (!isCurrent()) return;
      console.error("[Map Rendering Error]", err);
      this.notifyTransitUnavailable(err?.message || '지도 렌더링 중 오류가 발생했습니다.', context);
    } finally {
      if (isCurrent()) this.setLoading(false);
    }
  }

  /**
   * 지도 위에 얹힌 것들(일정 시트·버튼 줄)이 덮는 만큼을 여백으로 받는다.
   *
   * 값이 아니라 **함수**를 받는 이유: 시트는 접히고 펼쳐지고 창은 크기가
   * 바뀐다. 미리 받아 둔 숫자는 맞추는 순간에는 이미 틀린 값일 수 있다.
   * 재는 일은 그 DOM 을 아는 셸 화면이 하고(`ionic-screens.jsx`), 지도는 부르기만 한다.
   */
  currentPadding() {
    try {
      return this.getFrameInsets?.() || DEFAULT_PADDING;
    } catch (e) {
      console.warn('[Map] 여백을 재지 못했습니다.', e);
      return DEFAULT_PADDING;
    }
  }

  /** 화면 방향이 바뀌면 덮이는 자리가 달라지므로 마지막 경로를 다시 맞춘다. */
  reframe() {
    if (this.map && this._lastFrame) this.frameToItems(...this._lastFrame);
  }

  /**
   * 그 날의 장소가 전부 보이도록 지도를 맞춘다.
   * @param {Array} geocodedItems 좌표가 붙은 일정 항목들
   * @param {object|undefined} preferredItem 한 곳뿐일 때 가운데 둘 항목
   */
  frameToItems(geocodedItems, preferredItem, isCurrent = () => true) {
    const points = geocodedItems.map(item => toPoint(item.latLng)).filter(Boolean);
    if (points.length === 0) return;
    this._lastFrame = [geocodedItems, preferredItem];

    const padding = this.currentPadding();

    if (isSinglePlace(points)) {
      // 한 자리뿐인 하루는 fitBounds 로 맞출 수 없다(폭이 0 이라 끝까지 파고든다).
      // 대신 가운데에 놓고, 덮인 만큼 밀어 시트 뒤로 가지 않게 한다.
      const center = toPoint(preferredItem?.latLng) || points[0];
      this.map.setCenter(center);
      this.map.setZoom(SINGLE_PLACE_ZOOM);
      const offset = centerOffsetFor(padding);
      if (offset.x || offset.y) this.map.panBy(offset.x, offset.y);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    points.forEach(point => bounds.extend(point));
    this.map.fitBounds(bounds, padding);

    // 가까운 두 곳만 있으면 여기서 배율이 20 을 넘는다. 한 번만 되돌린다
    // (계속 듣고 있으면 사용자가 직접 확대하는 것까지 막는다).
    google.maps.event.addListenerOnce(this.map, 'idle', () => {
      if (!isCurrent()) return;
      if (this.map.getZoom() > MAX_FIT_ZOOM) this.map.setZoom(MAX_FIT_ZOOM);
    });
  }

  async renderMarkers(geocodedItems, isCurrent = () => true) {
    const { AdvancedMarkerElement, PinElement } = await this.loader.importLibrary("marker");
    if (!isCurrent()) return;

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

      // map/COMMAND_GUIDE.md: Anchor=보라 / 첫 장소=초록 / 나머지=파랑
      const fill = isAnchor
        ? tokenColor('--cp-pin-anchor', '#5820b0')
        : (isStart ? tokenColor('--cp-pin-start', '#10b981') : tokenColor('--cp-pin-stop', '#3b82f6'));

      const glyphColor = tokenColor('--cp-pin-glyph', '#FFFFFF');
      const pinView = numbers.length > 1
        ? numberPill(numbers.join('·'), fill, glyphColor)
        : new PinElement({ background: fill, borderColor: fill, glyphColor, glyphText: String(numbers[0]) });

      const marker = new AdvancedMarkerElement({
        map: this.map,
        position: entries[0].item.latLng,
        title: entries.map(({ item }) => item.title).join(' / '),
        content: pinView
      });

      this.markers.push(marker);
    });
  }

  async renderTransitSegments(geocodedItems, dayDate, context, isCurrent = () => true, timeZone = 'Asia/Seoul') {
    const { DirectionsRenderer } = await this.loader.importLibrary("routes");
    if (!isCurrent()) return;
    const { Polyline } = await this.loader.importLibrary("maps");
    if (!isCurrent()) return;
    const { SymbolPath } = await this.loader.importLibrary("core");
    if (!isCurrent()) return;

    // 예전에는 구간마다 다른 색(빨강·주황·초록·파랑·보라 …)을 돌려 썼다.
    // 그런데 이 화면에서 색은 이미 뜻을 갖고 있다 — 보라는 고정 일정,
    // 초록은 그날의 첫 장소, 파랑은 나머지 방문지(map/COMMAND_GUIDE.md).
    // 경로선이 같은 색을 쓰면 사용자는 그 색이 "5번째 구간"을 뜻하는지
    // "고정 일정"을 뜻하는지 알 수 없다. 게다가 구간 색을 읽는 곳은
    // 어디에도 없었다(타임라인은 이 값을 쓰지 않는다).
    const routeColor = tokenColor('--cp-route', '#3F3F3B');
    // map()을 활용하여 병렬 Promise 배열 생성 후 Promise.all()로 처리
    const routePromises = geocodedItems.slice(0, -1).map((item, i) => {
      const origin = geocodedItems[i].latLng;
      const destination = geocodedItems[i + 1].latLng;
      const segmentColor = routeColor;
      // Timeline positions (0-based) so the itinerary list can attach this
      // segment to the right cards even when geocoding dropped items.
      const fromIndex = (geocodedItems[i].displayIndex ?? i + 1) - 1;
      const toIndex = (geocodedItems[i + 1].displayIndex ?? i + 2) - 1;
      // An unresolved stop is not permission to bypass it with a direct route.
      if (toIndex !== fromIndex + 1) return Promise.resolve(null);
      // Route for the scheduled departure (origin item's end time), not "now".
      const departureTime = buildTransitDepartureTime(
        dayDate,
        routeDepartureClock(item), new Date(), timeZone
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
      const drawDashed = () => this.fallbackPolylines.push(new Polyline({
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
      }));
      return this.routingService.getTransitRoute(origin, destination, departureTime).then(response => {
        if (!isCurrent()) return null;
        if (response.estimated) {
          // A straight-line guess, not a route: no DirectionsRenderer path, and the card says so.
          drawDashed();
          const minutes = Math.ceil(response.routes[0].legs[0].duration.value / 60);
          return { fromIndex, toIndex, duration: t('estimatedWalkDuration').replace('{0}', minutes),
            durationMinutes: minutes, distance: '', mode: 'WALKING', estimated: true, steps: [],
            directionsUrl, warnings: [t('estimatedWalkNote')] };
        }
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
              ? Math.ceil(leg.duration.value / 60)
              : null,
            distance: leg.distance.text,
            mode: hasTransitStep ? 'TRANSIT' : 'WALKING', /* Ubiquitous Language */
            vehicleType: primaryVehicleType,
            lineName: primaryLineName,
            transitDetailsExtended,
            steps,
            directionsUrl: directionsUrl.replace('travelmode=transit', `travelmode=${hasTransitStep ? 'transit' : 'walking'}`),
            warnings: response.routes[0]?.warnings || []
          };
        }
        return routeResult;
      }).catch(err => {
        if (!isCurrent()) return null;
        console.warn(`Transit route failed between "${geocodedItems[i].title}" and "${geocodedItems[i + 1].title}".Drawing walking line.`, err.message);

        drawDashed();

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
    if (!isCurrent()) return;
    transitRoutes = transitRoutes.filter(route => route !== null);

    // Broadcast transit details back to itinerary view using the old bus channel
    window.dispatchEvent(new CustomEvent('transit-info-ready', { detail: { context, routes: transitRoutes } }));
  }
}

customElements.define('map-view', MapView);
