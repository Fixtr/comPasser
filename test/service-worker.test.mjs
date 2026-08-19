import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * sw.js 는 브라우저 서비스 워커 스코프에서만 도는 파일이라 평소 테스트가
 * 닿지 않는다. 여기서는 self/caches/fetch 를 가짜로 만들어 스크립트를 실제로
 * 실행하고, 각 요청 유형에 어떤 전략이 적용되는지 확인한다.
 *
 * 잘못 캐시하면 오래된 화면이 남거나(셸) 로그인 토큰이 섞이는(외부 API)
 * 문제가 생기므로, "무엇을 캐시하지 않는가" 까지 함께 검증한다.
 */

const SW_SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function makeResponse(body, ok = true) {
  return { body, ok, clone: () => makeResponse(body, ok) };
}

/** sw.js 를 가짜 환경에서 실행하고 조작용 핸들을 돌려준다. */
function runServiceWorker({ networkFails = false, cached = {} } = {}) {
  const listeners = {};
  const store = new Map(); // cacheName -> Map(url -> response)
  const fetchCalls = [];

  const openCache = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name);
    return Promise.resolve({
      add: (url) => networkFails
        ? Promise.reject(new Error('offline'))
        : (entries.set(url, makeResponse(`precached:${url}`)), Promise.resolve()),
      put: (req, res) => { entries.set(typeof req === 'string' ? req : req.url, res); return Promise.resolve(); },
      keys: () => Promise.resolve([...entries.keys()].map(url => ({ url }))),
      match: (req) => Promise.resolve(entries.get(typeof req === 'string' ? req : req.url))
    });
  };

  const caches = {
    open: openCache,
    keys: () => Promise.resolve([...store.keys()]),
    delete: (name) => Promise.resolve(store.delete(name)),
    match: (req) => {
      const key = typeof req === 'string' ? req : req.url;
      for (const entries of store.values()) {
        if (entries.has(key)) return Promise.resolve(entries.get(key));
      }
      return Promise.resolve(undefined);
    }
  };

  // 미리 채워둘 캐시(오프라인 시나리오용)
  for (const [name, pairs] of Object.entries(cached)) {
    const entries = new Map();
    for (const [url, body] of Object.entries(pairs)) entries.set(url, makeResponse(body));
    store.set(name, entries);
  }

  const self = {
    location: { origin: 'https://app.example' },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() }
  };

  const fetchImpl = (req) => {
    const url = typeof req === 'string' ? req : req.url;
    fetchCalls.push(url);
    return networkFails ? Promise.reject(new Error('offline')) : Promise.resolve(makeResponse(`network:${url}`));
  };

  // sw.js 를 그대로 실행
  const fn = new Function('self', 'caches', 'fetch', 'URL', 'Response', 'Promise', 'console', SW_SOURCE);
  fn(self, caches, fetchImpl, URL, { error: () => makeResponse('error', false) }, Promise, console);

  /** fetch 이벤트를 흘리고 respondWith 결과를 돌려준다. undefined 면 SW 가 관여하지 않은 것. */
  const dispatchFetch = (request) => {
    let responded;
    listeners.fetch({ request, respondWith: (p) => { responded = p; } });
    return responded;
  };

  const dispatchLifecycle = async (type) => {
    let work;
    listeners[type]({ waitUntil: (p) => { work = p; } });
    await work;
  };

  return { dispatchFetch, dispatchLifecycle, store, fetchCalls };
}

const req = (url, { method = 'GET', mode = 'no-cors' } = {}) => ({ url, method, mode });

test('install precaches the app shell', async () => {
  const sw = runServiceWorker();
  await sw.dispatchLifecycle('install');

  const shell = sw.store.get('compasser-shell-v1');
  assert.ok(shell, '셸 캐시가 만들어져야 한다');
  assert.ok(shell.has('/index.html'), '오프라인에서 띄울 셸이 있어야 한다');
});

test('install still succeeds when some precache entries fail', async () => {
  // 하나라도 실패하면 설치 전체가 실패하는 구조면 오프라인 지원이 통째로 날아간다.
  const sw = runServiceWorker({ networkFails: true });
  await assert.doesNotReject(() => sw.dispatchLifecycle('install'));
});

test('activate deletes caches from older versions only', async () => {
  const sw = runServiceWorker({
    cached: {
      'compasser-shell-v0': { '/old.html': 'old' },
      'compasser-shell-v1': { '/index.html': 'current' },
      'unrelated-cache': { '/x': 'keep' }
    }
  });
  await sw.dispatchLifecycle('activate');

  const names = [...sw.store.keys()];
  assert.ok(!names.includes('compasser-shell-v0'), '이전 버전은 지운다');
  assert.ok(names.includes('compasser-shell-v1'), '현재 버전은 남긴다');
  assert.ok(names.includes('unrelated-cache'), '우리 것이 아닌 캐시는 건드리지 않는다');
});

test('cross-origin requests are left entirely to the network', () => {
  const sw = runServiceWorker();
  // Firebase/Google Maps/광고 등을 캐시하면 오래된 인증 응답이 돌아올 수 있다.
  assert.equal(sw.dispatchFetch(req('https://firestore.googleapis.com/v1/x')), undefined);
  assert.equal(sw.dispatchFetch(req('https://maps.googleapis.com/maps/api/js')), undefined);
});

test('non-GET requests are never cached', () => {
  const sw = runServiceWorker();
  assert.equal(sw.dispatchFetch(req('https://app.example/api', { method: 'POST' })), undefined);
});

test('the service worker itself is not cached, so updates are not blocked', () => {
  const sw = runServiceWorker();
  assert.equal(sw.dispatchFetch(req('https://app.example/sw.js')), undefined);
});

test('navigation prefers the network and refreshes the cached shell', async () => {
  const sw = runServiceWorker();
  const res = await sw.dispatchFetch(req('https://app.example/view/abc', { mode: 'navigate' }));

  assert.match(res.body, /^network:/, '온라인이면 항상 최신 셸을 쓴다');
  const shell = sw.store.get('compasser-shell-v1');
  assert.ok(shell.has('/index.html'), '받아온 셸을 다음 오프라인을 위해 저장한다');
});

test('navigation falls back to the cached shell when offline', async () => {
  const sw = runServiceWorker({
    networkFails: true,
    cached: { 'compasser-shell-v1': { '/index.html': 'shell' } }
  });
  // SPA 라우팅이라 어떤 경로로 들어와도 같은 셸을 돌려주면 된다.
  const res = await sw.dispatchFetch(req('https://app.example/view/xyz', { mode: 'navigate' }));
  assert.equal(res.body, 'shell');
});

test('hashed build assets are served from cache first', async () => {
  const sw = runServiceWorker({
    cached: { 'compasser-assets-v1': { 'https://app.example/assets/index-ABC123.js': 'cachedAsset' } }
  });
  const res = await sw.dispatchFetch(req('https://app.example/assets/index-ABC123.js'));

  assert.equal(res.body, 'cachedAsset');
  assert.equal(sw.fetchCalls.length, 0, '파일명에 해시가 있으니 다시 받을 이유가 없다');
});

test('a hashed asset missing from cache is fetched and stored', async () => {
  const sw = runServiceWorker();
  const res = await sw.dispatchFetch(req('https://app.example/assets/vendor-XYZ.js'));

  assert.match(res.body, /^network:/);
  const assets = sw.store.get('compasser-assets-v1');
  assert.ok(assets.has('https://app.example/assets/vendor-XYZ.js'));
});

test('other static files return the cached copy immediately (stale-while-revalidate)', async () => {
  const sw = runServiceWorker({
    cached: { 'compasser-assets-v1': { 'https://app.example/icon-192.png': 'oldIcon' } }
  });
  const res = await sw.dispatchFetch(req('https://app.example/icon-192.png'));

  assert.equal(res.body, 'oldIcon', '먼저 캐시를 주고 갱신은 뒤에서 한다');
});
