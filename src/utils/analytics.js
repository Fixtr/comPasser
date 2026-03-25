export const trackEvent = (eventName, eventParams = {}) => {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, eventParams);
    // console.log(`[GA4] Event tracked: ${eventName}`, eventParams);
  } else {
    // console.warn(`[GA4] gtag is not defined. Event dropped: ${eventName}`, eventParams);
  }
};
