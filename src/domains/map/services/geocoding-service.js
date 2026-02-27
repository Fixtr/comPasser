export class GeocodingService {
    constructor(loader) {
        this.loader = loader;
        this.geocoder = null;
    }

    async init() {
        if (!this.geocoder) {
            const { Geocoder } = await this.loader.importLibrary("geocoding");
            this.geocoder = new Geocoder();
        }
    }

    /**
     * Converts a text location into a LatLng object.
     * @param {string} location Address or place name
     * @returns {Promise<google.maps.LatLng|null>} The coordinate, or null if failed
     */
    async getCoordinate(location) {
        if (!location) return null;
        await this.init();

        try {
            const results = await this.geocoder.geocode({ address: location });
            if (results && results.results && results.results.length > 0) {
                return results.results[0].geometry.location;
            }
        } catch (err) {
            console.error(`Geocoding failed for: "${location}"`, err);
        }
        return null;
    }

    /**
     * Processes a list of schedule items and adds a latLng property to each.
     * @param {Array} scheduleItems List of items containing a location string
     * @returns {Promise<Array>} The same list but with .latLng objects attached
     */
    async geocodeSchedule(scheduleItems) {
        const geocodedItems = [];
        for (const item of scheduleItems) {
            const latLng = await this.getCoordinate(item.location);
            if (latLng) {
                geocodedItems.push({ ...item, latLng });
            }
        }
        return geocodedItems;
    }
}
