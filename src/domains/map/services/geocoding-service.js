export class GeocodingService {
    constructor(loader) {
        this.loader = loader;
        this.Place = null;
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
    async resolvePlace(location, biasCenter = null) {
        if (!location) return null;
        await this.init();

        try {
            const request = {
                textQuery: location,
                language: 'ko',
                region: 'kr',
                fields: ['location', 'displayName', 'formattedAddress']
            };
            if (biasCenter) {
                request.locationBias = biasCenter;
            }
            const { places } = await this.Place.searchByText(request);
            if (places && places.length > 0) {
                const place = places[0];
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
            // Already geocoded (e.g., loaded from a shared or saved itinerary)
            if (item.latLng) return item;

            const resolved = await this.resolvePlace(item.location, biasCenter);
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
