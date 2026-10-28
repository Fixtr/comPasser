import { useLayoutEffect, useRef } from 'react';

import { animateScreen } from '../ui/screen-motion.js';

const visible = element => element.getClientRects().length > 0;

// Land keyboard and screen-reader users on the new heading, but only when their focus was lost:
// the button they used was removed or hidden with the old page. A field, dialog or tab they are
// on stays focused. Domain views keep their headings one shadow root down. Before the user has
// done anything (first page, deep-link redirects) the browser's starting focus is kept.
export function focusHeading(root, tries = 10) {
  const active = document.activeElement;
  if (!root || !visible(root) || navigator.userActivation?.hasBeenActive === false) return;
  const held = active && active !== document.body && active.isConnected && visible(active);
  // The old page's sheet (the result sheet on Back) traps focus until it unmounts; look again then.
  const sheet = document.querySelector('ion-modal.show-modal');
  if (held || (sheet && !root.contains(sheet))) {
    if (!root.contains(active) && tries > 0) setTimeout(() => focusHeading(root, tries - 1), 100);
    return;
  }
  const shadowHeadings = [...root.querySelectorAll('*')].flatMap(element => element.shadowRoot ? [...element.shadowRoot.querySelectorAll('h1, h2')] : []);
  const heading = [...root.querySelectorAll('h1, h2'), ...shadowHeadings].find(visible);
  // Lazily loaded views (login, planner) render after their page shows; look again for up to a second.
  if (!heading) { if (tries > 0) setTimeout(() => focusHeading(root, tries - 1), 100); return; }
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

// The first run is the page's own entry, which installPageTransitions handles; focusOnMount is
// for content that replaces another step on mount (the city step embedded in /recommend).
export function useStageTransition(stage, { focusOnMount = false } = {}) {
  const ref = useRef(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const animation = animateScreen(ref.current, true);
    if (mounted.current || focusOnMount) focusHeading(ref.current);
    mounted.current = true;
    return () => animation?.cancel();
  }, [stage]);
  return ref;
}

export function installPageTransitions() {
  let shownPage;
  // Keyed on the element only: the old page re-renders right after the URL changes, while it is
  // still the only visible page, and must not count as a new page.
  const show = page => {
    if (!page || shownPage === page) return;
    if (shownPage) focusHeading(page);
    shownPage = page;
    animateScreen(page);
  };
  const outlet = document.querySelector('ion-router-outlet');
  const checkVisiblePage = () => {
    const pages = [...outlet.children].filter(page => page.classList.contains('ion-page')
      && !page.classList.contains('ion-page-hidden') && !page.classList.contains('ion-page-invisible') && page.getClientRects().length);
    // Mid-transition both pages show for a moment; wait until the leaving one is hidden, so the
    // entering page is the one animated and focus has really left the old page.
    if (pages.length === 1) show(pages[0]);
  };
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
  // ionViewDidEnter can fire while the leaving page still shows, so it goes through the same check.
  const enter = () => checkVisiblePage();
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
