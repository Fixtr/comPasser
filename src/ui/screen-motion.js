export function animateScreen(element, stage = false) {
  if (!element?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  element.getAnimations().filter(animation => animation.id === 'compasser-screen').forEach(animation => animation.cancel());
  return element.animate([
    { opacity: 0, ...(stage ? { transform: 'translateY(8px)' } : {}) },
    { opacity: 1, ...(stage ? { transform: 'translateY(0)' } : {}) },
  ], { id: 'compasser-screen', duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
}

