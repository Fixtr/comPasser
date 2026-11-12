import { distanceMeters } from './recommendation-place.mjs';

// Shared by every instance: generation checks and the result map ask for the same legs, like lookupPlaceHours.
export const routeCache = new Map();
const ROUTE_TTL_MS = 300000;
// Slow pace (4 km/h) with a street detour on the straight line, so the estimate errs long.
const WALK_METERS_PER_SECOND = 4000 / 3600, WALK_DETOUR = 1.3, ESTIMATE_MAX_METERS = 1500;

const coordinate = value => {
    const lat = typeof value?.lat === 'function' ? value.lat() : value?.lat;
    const lng = typeof value?.lng === 'function' ? value.lng() : value?.lng;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};
const validDate = value => value instanceof Date && !Number.isNaN(value.getTime());
const routeKey = (origin, destination, departureTime) => JSON.stringify([
    ...[origin, destination].map(point => {
        const c = coordinate(point);
        return c ? `${c.lat.toFixed(6)},${c.lng.toFixed(6)}` : typeof point === 'string' ? point.trim() : point;
    }),
    validDate(departureTime) ? Math.floor(departureTime.getTime() / 60000) : null
]);

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
     * Results (in flight or settled) are shared for five minutes per origin,
     * destination and departure minute; failures and estimates are not kept.
     * @param {google.maps.LatLng|string} origin
     * @param {google.maps.LatLng|string} destination
     * @param {Date|null} departureTime Scheduled departure; omitted = "now",
     *   which picks timetables (e.g. night buses) matching the generation
     *   moment instead of the itinerary.
     * @returns {Promise<google.maps.DirectionsResult>} or, when the provider
     *   cannot route a leg of at most 1.5 km, `{ estimated: true, routes }`
     *   with a straight-line walking duration that must not be shown as a route.
     */
    getTransitRoute(origin, destination, departureTime = null) {
        const now = Date.now();
        for (const [key, entry] of routeCache) if (now - entry.at >= ROUTE_TTL_MS) routeCache.delete(key);
        const key = routeKey(origin, destination, departureTime);
        if (routeCache.has(key)) return routeCache.get(key).promise;
        const promise = this.requestRoute(origin, destination, departureTime);
        routeCache.set(key, { at: now, promise });
        // A failure may be transient (quota, network), so the next caller asks again.
        const drop = () => { if (routeCache.get(key)?.promise === promise) routeCache.delete(key); };
        promise.then(result => { if (result?.estimated) drop(); }, drop);
        return promise;
    }

    async requestRoute(origin, destination, departureTime) {
        await this.init();

        const request = {
            origin,
            destination,
            travelMode: google.maps.TravelMode.TRANSIT
        };

        if (validDate(departureTime)) {
            request.transitOptions = { departureTime };
        }

        const transit = this.directionsService.route(request);
        const from = coordinate(origin), to = coordinate(destination);
        const meters = from && to ? distanceMeters(from, to) : Infinity;
        // Ask for walking on every leg that could get an estimate, so an estimate only replaces a failed walk.
        const walking = meters <= ESTIMATE_MAX_METERS ? this.directionsService.route({ origin, destination, travelMode: 'WALKING' }).catch(() => null) : Promise.resolve(null);
        const [bus, walk] = await Promise.allSettled([transit, walking]);
        const seconds = result => result?.routes?.[0]?.legs?.[0]?.duration?.value;
        const walkSeconds = seconds(walk.value), busSeconds = seconds(bus.value);
        if (Number.isFinite(walkSeconds) && walkSeconds >= 0 && walkSeconds <= 1200 &&
            (!Number.isFinite(busSeconds) || walkSeconds <= busSeconds)) return walk.value;
        if (bus.status === 'rejected') {
            // A measured walk, even a long detour, beats both an unknown leg and a straight-line guess.
            if (Number.isFinite(walkSeconds) && walkSeconds >= 0) return walk.value;
            // Google Maps Platform coverage lists no walking directions for KR (ZERO_RESULTS), and transit
            // can fail for a short hop too; without this the leg stays unknown and blocks schedule fitting.
            if (meters > ESTIMATE_MAX_METERS) throw bus.reason;
            return { estimated: true, routes: [{ legs: [{
                duration: { value: Math.ceil(meters * WALK_DETOUR / WALK_METERS_PER_SECOND) },
                distance: { value: Math.round(meters) }
            }] }] };
        }
        return bus.value;
    }
}
