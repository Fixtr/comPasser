// 공개 웹 주소는 docs/PLAY_STORE.md의 배포 주소와 맞춘다.
export const DEFAULT_PUBLIC_APP_URL = 'https://hackerton-48w.pages.dev';
// Inside the native app a bare /privacy falls back to index.html, so the policy opens at its public address.
export const PRIVACY_POLICY_URL = `${DEFAULT_PUBLIC_APP_URL}/privacy`;

/** 앱 내부의 localhost 대신, 받는 사람이 열 수 있는 웹 공유 주소를 만든다. */
export function buildSharedItineraryUrl(id, { origin, isNative = false, publicAppUrl } = {}) {
  if (typeof id !== 'string' || id.match(/^[a-zA-Z0-9]+$/)?.[0] !== id) {
    throw new Error('Invalid shared itinerary ID');
  }
  const base = new URL(isNative ? (publicAppUrl || DEFAULT_PUBLIC_APP_URL) : origin);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) {
    throw new Error('Invalid public app URL');
  }
  if (isNative && (base.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) {
    throw new Error('Native sharing requires a public HTTPS URL');
  }
  return `${base.origin}/share/${id}`;
}
