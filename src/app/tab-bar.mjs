export const TABS = [
  { id: 'home', path: '/home', labelKey: 'tabHome', icon: 'home' },
  { id: 'trips', path: '/profile/trips', labelKey: 'tabTrips', icon: 'list' },
  { id: 'profile', path: '/profile/personal', labelKey: 'tabProfile', icon: 'user' },
];
const normalize = path => typeof path === 'string' ? path.split(/[?#]/)[0].replace(/\/+$/, '') || '/' : '';
export function activeTabId(path) {
  const target = normalize(path);
  if (target === '/' || target === '/home') return 'home';
  if (target === '/profile/trips') return 'trips';
  if (target === '/profile' || target.startsWith('/profile/')) return 'profile';
  return null;
}
export function shouldShowTabBar({ path } = {}) { return activeTabId(path) !== null; }
