import { Capacitor } from '@capacitor/core';
import { buildSharedItineraryUrl } from './share-url.mjs';
import { publicRouteUrl } from './public-route.mjs';

export function getSharedItineraryUrl(id) {
  return buildSharedItineraryUrl(id, {
    origin: window.location.origin,
    isNative: Capacitor.isNativePlatform(),
    publicAppUrl: import.meta.env.VITE_PUBLIC_APP_URL,
  });
}

export function getPublicRouteUrl(id) {
  return publicRouteUrl(id, Capacitor.isNativePlatform() ? import.meta.env.VITE_PUBLIC_APP_URL : window.location.origin);
}
