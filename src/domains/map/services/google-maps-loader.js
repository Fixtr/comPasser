import * as GoogleMapsLoaderPkg from "@googlemaps/js-api-loader";
import { getLang } from "../../../utils/i18n.js";

const Loader = GoogleMapsLoaderPkg.Loader || GoogleMapsLoaderPkg['default']?.Loader;

// Singleton wrapper for the Google Maps API Loader
let loaderInstance = null;

/**
 * Maps JS API 의 language 는 로드 시점에 굳는다.
 *
 * 그래서 여기서는 "첫 로드 시점의 언어"만 반영할 수 있다. 사용자가 도중에
 * 언어를 바꾸면 이미 그려진 지도 라벨은 그대로 남는다(페이지를 새로 열어야
 * 바뀐다). 반면 장소 이름(resolvedName)은 요청 단위라 GeocodingService 가
 * 토글 즉시 따라가므로, 타임라인에 보이는 이름은 바로 맞춰진다.
 *
 * 로더는 UI 두 곳(map-view, travel-form)에서 같은 인스턴스를 공유하므로
 * 언어를 인자로 받지 않는다 — 두 호출부가 서로 다른 값을 넘기면 어느 쪽이
 * 먼저 부르느냐에 따라 지도 언어가 달라지기 때문이다.
 */
export function getMapsLoader() {
  if (!loaderInstance) {
    loaderInstance = new Loader({
      apiKey: import.meta.env.VITE_MAPS_API_KEY,
      version: "beta",
      libraries: ["marker", "geocoding", "routes", "maps", "core", "places"],
      language: getLang() === 'en' ? 'en' : 'ko',
      region: "KR"
    });
  }
  return loaderInstance;
}
