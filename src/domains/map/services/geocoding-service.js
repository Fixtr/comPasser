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
     * @param {string} location Address or place name
     * @param {{lat:number,lng:number}} [biasCenter] Optional point to bias results toward
     * @returns {Promise<google.maps.LatLng|null>} The coordinate, or null if failed
     */
    async getCoordinate(location, biasCenter = null) {
        if (!location) return null;
        await this.init();

        try {
            const request = {
                textQuery: location,
                language: 'ko',
                region: 'kr',
                fields: ['location']
            };
            if (biasCenter) {
                request.locationBias = biasCenter;
            }
            const { places } = await this.Place.searchByText(request);
            if (places && places.length > 0) {
                return places[0].location;
            }
        } catch (err) {
            console.error(`Geocoding failed for: "${location}"`, err);
        }
        return null;
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

            const latLng = await this.getCoordinate(item.location, biasCenter);
            if (latLng) {
                return { ...item, latLng };
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
