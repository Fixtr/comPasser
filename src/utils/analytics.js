import { Capacitor } from '@capacitor/core';
import { loadScriptOnce } from './external-scripts.js';

export const trackEvent = (eventName, eventParams = {}) => {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, eventParams);
  }
};

let started = false;
let lastLocation;

// Web only (스펙 9): the Capacitor apps declare that they collect no analytics, so they never load the script.
function startAnalytics() {
  if (started) return;
  started = true;
  const id = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (!id || Capacitor.isNativePlatform()) return;
  window.dataLayer = window.dataLayer || [];
  // gtag.js reads the queue entries as `arguments` objects; an array is ignored.
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // The shell sends every page_view itself, with the masked address.
  window.gtag('config', id, { send_page_view: false });
  // Blocked or offline: events just queue in dataLayer and the app goes on.
  loadScriptOnce(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`).catch(() => {});
}

/**
 * @param {string} pagePath already masked by analyticsPagePath; the real address must not come here.
 */
export function trackPageView(pagePath) {
  startAnalytics();
  if (typeof window.gtag !== 'function') return;
  const page_location = window.location.origin + pagePath;
  // An outside referrer keeps its origin only; inside the app it is the previous masked page.
  const page_referrer = lastLocation ?? (document.referrer ? new URL(document.referrer).origin : '');
  lastLocation = page_location;
  // `set` keeps later events off the real address too: gtag would otherwise read location.href and document.referrer.
  window.gtag('set', { page_location, page_referrer });
  trackEvent('page_view', { page_location, page_referrer, page_path: pagePath });
}
