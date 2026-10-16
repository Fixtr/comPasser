import { useLayoutEffect, useRef } from 'react';

import { animateScreen } from '../ui/screen-motion.js';

export function useStageTransition(stage) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const animation = animateScreen(ref.current, true);
    return () => animation?.cancel();
  }, [stage]);
  return ref;
}

export function installPageTransitions() {
  let shownPage;
  let shownPath;
  const show = page => {
    const path = window.location.pathname;
    if (!page || (shownPage === page && shownPath === path)) return;
    shownPage = page;
    shownPath = path;
    animateScreen(page);
  };
  const enter = event => show(event.target);
  const outlet = document.querySelector('ion-router-outlet');
  const checkVisiblePage = () => show([...outlet.children].find(page => page.classList.contains('ion-page')
    && !page.classList.contains('ion-page-hidden') && !page.classList.contains('ion-page-invisible') && page.getClientRects().length));
  // Tab commits can skip lifecycle events; watch only the outlet's page visibility.
  const observer = new MutationObserver(checkVisiblePage);
  observer.observe(outlet, { childList: true, attributes: true, attributeFilter: ['class'], subtree: true });
  checkVisiblePage();
  const cancel = event => event.target.getAnimations().filter(animation => animation.id === 'compasser-screen').forEach(animation => animation.cancel());
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stop = () => {
    if (motion.matches) document.getAnimations().filter(animation => animation.id === 'compasser-screen').forEach(animation => animation.cancel());
  };
  // Ionic lifecycle events do not bubble; capture also covers cached pages and tab switches.
  document.addEventListener('ionViewDidEnter', enter, true);
  document.addEventListener('ionViewWillLeave', cancel, true);
  motion.addEventListener('change', stop);
  return () => {
    observer.disconnect();
    document.removeEventListener('ionViewDidEnter', enter, true);
    document.removeEventListener('ionViewWillLeave', cancel, true);
    motion.removeEventListener('change', stop);
  };
}
