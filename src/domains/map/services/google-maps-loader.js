import { Loader } from "@googlemaps/js-api-loader";

// Singleton wrapper for the Google Maps API Loader
let loaderInstance = null;

export function getMapsLoader() {
  if (!loaderInstance) {
    loaderInstance = new Loader({
      apiKey: import.meta.env.VITE_MAPS_API_KEY,
      version: "beta",
      libraries: ["marker", "geocoding", "routes", "maps", "core", "places"],
      language: "ko",
      region: "KR"
    });
  }
  return loaderInstance;
}
