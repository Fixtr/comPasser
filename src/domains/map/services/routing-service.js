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
     * Calculates a TRANSIT route between two LatLng coordinates.
     * @param {google.maps.LatLng} origin 
     * @param {google.maps.LatLng} destination 
     * @returns {Promise<google.maps.DirectionsResult>}
     */
    async getTransitRoute(origin, destination) {
        await this.init();

        return this.directionsService.route({
            origin,
            destination,
            travelMode: google.maps.TravelMode.TRANSIT
        });
    }
}
