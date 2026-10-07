import { distanceMeters } from './recommendation-place.mjs';

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

        const transit = this.directionsService.route(request);
        const coordinate = value => {
            const lat = typeof value?.lat === 'function' ? value.lat() : value?.lat;
            const lng = typeof value?.lng === 'function' ? value.lng() : value?.lng;
            return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
        };
        const from = coordinate(origin), to = coordinate(destination);
        const short = from && to && distanceMeters(from, to) <= 1000;
        const walking = short ? this.directionsService.route({ origin, destination, travelMode: 'WALKING' }).catch(() => null) : Promise.resolve(null);
        const [bus, walk] = await Promise.allSettled([transit, walking]);
        const seconds = result => result?.routes?.[0]?.legs?.[0]?.duration?.value;
        const walkSeconds = seconds(walk.value), busSeconds = seconds(bus.value);
        if (Number.isFinite(walkSeconds) && walkSeconds >= 0 && walkSeconds <= 1200 &&
            (!Number.isFinite(busSeconds) || walkSeconds <= busSeconds)) return walk.value;
        if (bus.status === 'rejected') throw bus.reason;
        return bus.value;
    }
}
