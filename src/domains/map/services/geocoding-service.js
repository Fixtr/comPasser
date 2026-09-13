import { matchesPlaceIdentity, schedulePlaceName } from './place-match.mjs';

/** Places 요청에 실을 수 있는 언어. 그 밖의 값은 한국어로 떨어진다. */
const SUPPORTED_LANGUAGES = new Set(['ko', 'en']);

export class GeocodingService {
    /**
     * @param {object} loader Google Maps JS API 로더
     * @param {{getLanguage?: () => string}} [options]
     *   언어를 값이 아니라 함수로 받는다. 사용자가 도중에 언어를 바꿔도
     *   다음 요청부터 바로 반영되어야 하는데, 생성 시점 값을 붙잡아 두면
     *   토글 후에도 옛 언어가 남기 때문이다.
     */
    constructor(loader, { getLanguage } = {}) {
        this.loader = loader;
        this.Place = null;
        this.getLanguage = typeof getLanguage === 'function' ? getLanguage : () => 'ko';
    }

    /** 현재 언어를 Places 가 이해하는 코드로 정규화한다. */
    resolveLanguage() {
        const lang = this.getLanguage();
        return SUPPORTED_LANGUAGES.has(lang) ? lang : 'ko';
    }

    async init() {
        if (!this.initPromise) {
            this.initPromise = (async () => {
                const { Place } = await this.loader.importLibrary("places");
                this.Place = Place;
            })();
        }
        await this.initPromise;
    }

    /**
     * Converts a text location into a LatLng object.
     *
     * Uses the Places API's text search rather than the plain Geocoding API.
     * The Geocoding API is built for postal addresses — a bare landmark name
     * like "경복궁" (no district/city) can silently match an unrelated
     * same-named place (a restaurant, a building) anywhere in the country,
     * with no error to signal it. Places text search ranks well-known
     * landmarks/POIs correctly and supports biasing toward the rest of the
     * trip for the remaining ambiguous cases.
     *
     * 좌표뿐 아니라 "실제로 무엇을 찾았는지"(이름·주소)도 함께 돌려준다.
     * 예전에는 좌표만 받아와서, 화면에는 AI 가 쓴 문자열이 그대로 남았다.
     * 지도가 엉뚱한 곳을 잡아도(예: "경복궁" 이 20km 떨어진 동명 장소로
     * 매칭) 사용자가 알 방법이 없었다. 같은 응답에 이미 들어있는 값이라
     * 추가 호출 비용은 없다.
     *
     * @param {string} location Address or place name
     * @param {{lat:number,lng:number}} [biasCenter] Optional point to bias results toward
     * @returns {Promise<{latLng: object, displayName: string, formattedAddress: string}|null>}
     */
    async resolvePlace(location, biasCenter = null, expectedName = '') {
        if (!location) return null;
        await this.init();

        try {
            const request = {
                textQuery: expectedName ? `${expectedName} ${location}` : location,
                // 한국어로 고정돼 있던 값. 영어 모드에서 AI 가 쓴 영문 이름과
                // 지도가 돌려준 한글 이름이 맞붙어, 같은 곳인데도 거의 모든
                // 항목에 "다른 곳을 찾았다" 경고가 붙었다.
                language: this.resolveLanguage(),
                // 지역은 KR 로 유지한다(PRD: 한국 여행 한정 서비스).
                region: 'kr',
                fields: ['location', 'displayName', 'formattedAddress']
            };
            if (biasCenter) {
                request.locationBias = biasCenter;
            }
            let { places = [] } = await this.Place.searchByText(request);
            const select = candidates => candidates.find(place => place.location &&
                (!expectedName || matchesPlaceIdentity(expectedName, place.displayName)));
            let place = select(places);
            // An AI-supplied street address can itself be wrong. Retry once by
            // venue name with the trip bias, never fall back to that wrong address.
            if (!place && expectedName && location !== expectedName) {
                ({ places = [] } = await this.Place.searchByText({ ...request, textQuery: expectedName }));
                place = select(places);
            }
            if (place) {
                return {
                    latLng: place.location,
                    displayName: place.displayName || '',
                    formattedAddress: place.formattedAddress || ''
                };
            }
        } catch (err) {
            console.error(`Geocoding failed for: "${location}"`, err);
        }
        return null;
    }

    /**
     * 좌표만 필요한 호출부를 위한 얇은 래퍼.
     * @returns {Promise<google.maps.LatLng|null>}
     */
    async getCoordinate(location, biasCenter = null) {
        const resolved = await this.resolvePlace(location, biasCenter);
        return resolved ? resolved.latLng : null;
    }

    /**
     * Processes a list of schedule items and adds a latLng property to each.
     *
     * The first item (always the day's departure point, given as a full
     * address) is geocoded on its own first. Its coordinate then biases every
     * other item's search, so short landmark names resolve near the rest of
     * the trip instead of an unrelated same-named place elsewhere in Korea.
     *
     * @param {Array} scheduleItems List of items containing a location string
     * @returns {Promise<Array>} The same list but with .latLng objects attached
     */
    async geocodeSchedule(scheduleItems) {
        if (!Array.isArray(scheduleItems) || scheduleItems.length === 0) return [];

        const geocodeOne = async (item, biasCenter) => {
            const expectedName = schedulePlaceName(item);
            // Already geocoded (e.g., loaded from a shared or saved itinerary)
            if (item.latLng && (!expectedName || matchesPlaceIdentity(expectedName, item.resolvedName))) return item;

            const resolved = await this.resolvePlace(item.location, biasCenter, expectedName);
            if (resolved) {
                // 지도가 실제로 찾은 장소를 함께 실어 보낸다. 타임라인이 이걸
                // 표시하면 오매칭이 화면에서 바로 드러난다.
                return {
                    ...item,
                    latLng: resolved.latLng,
                    resolvedName: resolved.displayName,
                    resolvedAddress: resolved.formattedAddress
                };
            }
            return null;
        };

        const [first, ...rest] = scheduleItems;
        const firstResult = await geocodeOne(first, null);

        let biasCenter = null;
        const firstLatLng = firstResult?.latLng;
        if (firstLatLng) {
            biasCenter = typeof firstLatLng.lat === 'function'
                ? { lat: firstLatLng.lat(), lng: firstLatLng.lng() }
                : { lat: firstLatLng.lat, lng: firstLatLng.lng };
        }

        const restResults = await Promise.all(rest.map((item) => geocodeOne(item, biasCenter)));

        return [firstResult, ...restResults].filter(item => item !== null);
    }
}
