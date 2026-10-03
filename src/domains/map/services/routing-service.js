export class RoutingService {
    constructor(loader) {
        this.loader = loader;
        this.directionsService = null;
    }

    async init() {
        if (!this.initPromise) {
            this.initPromise = (async () => {
                const { DirectionsService } = await this.loader.importLibrary("routes");
                this.directionsService = new DirectionsService();
            })();
        }
        await this.initPromise;
    }

    /**
     * Calculates a TRANSIT route between coordinates or place/address text.
     * @param {google.maps.LatLng|string} origin
     * @param {google.maps.LatLng|string} destination
     * @param {Date|null} departureTime Scheduled departure; omitted = "now",
     *   which picks timetables (e.g. night buses) matching the generation
     *   moment instead of the itinerary.
     * @returns {Promise<google.maps.DirectionsResult>}
     */
    async getTransitRoute(origin, destination, departureTime = null) {
        await this.init();

        const request = {
            origin,
            destination,
            travelMode: google.maps.TravelMode.TRANSIT
        };

        if (departureTime instanceof Date && !Number.isNaN(departureTime.getTime())) {
            request.transitOptions = { departureTime };
        }

        return this.directionsService.route(request);
    }
}
