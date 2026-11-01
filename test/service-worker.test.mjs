import test, { mock } from 'node:test';
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

function makeResponse(body, ok = true, redirected = false, status = ok ? 200 : 500) {
  return { body, ok, redirected, status, clone: () => makeResponse(body, ok, redirected, status) };
}

/** sw.js 를 가짜 환경에서 실행하고 조작용 핸들을 돌려준다. */
function runServiceWorker({ networkFails = false, cached = {}, redirectedUrls = [], network = null, store = new Map(), version, precache, failingAdds = [], holdAdds = null } = {}) {
  const listeners = {};
  // store: cacheName -> Map(url -> response). A worker's open Cache keeps writing to its Map after
  // caches.delete, like a real doomed cache, and a store passed in is shared between workers.
  const fetchCalls = [];
  const lifetime = [];

  const download = async (url) => {
    if (holdAdds) await holdAdds;
    if (networkFails || failingAdds.includes(url)) throw new Error(`cannot fetch ${url}`);
    if (network) {
      const response = await network(url);
      if (!response.ok) throw new Error(`bad status for ${url}`);
    }
    // A real server sends Vary: Origin here, so a request with an Origin header misses without ignoreVary.
    return { ...makeResponse(`precached:${url}`, true, redirectedUrls.includes(url)), varyOrigin: true };
  };
  const path = (key) => key.replace('https://app.example', '');
  const lookup = (entries, req, options) => {
    const key = typeof req === 'string' ? req : req.url;
    for (const [stored, response] of entries) {
      if (path(stored) !== path(key)) continue;
      if (response.varyOrigin && req.origin && !options?.ignoreVary) continue;
      return response;
    }
    return undefined;
  };

  const openCache = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name);
    return Promise.resolve({
      add: async (url) => { entries.set(url, await download(url)); },
      addAll: async (urls) => {
        const responses = await Promise.all(urls.map(download));
        urls.forEach((url, index) => entries.set(url, responses[index]));
      },
      put: (req, res) => { entries.set(typeof req === 'string' ? req : req.url, res); return Promise.resolve(); },
      keys: () => Promise.resolve([...entries.keys()].map(url => ({ url }))),
      match: (req, options) => Promise.resolve(lookup(entries, req, options))
    });
  };

  const caches = {
    open: openCache,
    keys: () => Promise.resolve([...store.keys()]),
    delete: (name) => Promise.resolve(store.delete(name)),
    // Like the real one: creation order, or only the named cache.
    match: (req, options) => {
      const searched = options?.cacheName ? [store.get(options.cacheName) ?? new Map()] : store.values();
      for (const entries of searched) {
        const found = lookup(entries, req, options);
        if (found) return Promise.resolve(found);
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
    __BUILD_ID__: version,
    __PRECACHE_ASSETS__: precache,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() }
  };

  const fetchImpl = (req) => {
    const url = typeof req === 'string' ? req : req.url;
    fetchCalls.push(url);
    if (network) return network(url);
    return networkFails ? Promise.reject(new Error('offline')) : Promise.resolve(makeResponse(`network:${url}`));
  };

  // sw.js 를 그대로 실행
  const fn = new Function('self', 'caches', 'fetch', 'URL', 'Response', 'Promise', 'console', SW_SOURCE);
  // `new Response(...)` builds a real one (the offline route page); Response.error() stays a marked fake.
  const FakeResponse = Object.assign(function FakeResponse(body, init) { return new Response(body, init); }, { error: () => makeResponse('error', false) });
  fn(self, caches, fetchImpl, URL, FakeResponse, Promise, console);

  /** fetch 이벤트를 흘리고 respondWith 결과를 돌려준다. undefined 면 SW 가 관여하지 않은 것. */
  const dispatchFetch = (request) => {
    let responded;
    listeners.fetch({ request, respondWith: (p) => { responded = p; }, waitUntil: (p) => { lifetime.push(p); } });
    return responded;
  };

  const dispatchLifecycle = async (type) => {
    let work;
    listeners[type]({ waitUntil: (p) => { work = p; } });
    await work;
  };

  const backgroundWork = () => Promise.all(lifetime);

  return { dispatchFetch, dispatchLifecycle, backgroundWork, store, fetchCalls };
}

const req = (url, { method = 'GET', mode = 'no-cors', origin } = {}) => ({ url, method, mode, origin });

const ASSETS = ['/assets/index-A.js', '/assets/lazy-A.js'];

test('install precaches the app shell', async () => {
  const sw = runServiceWorker();
  await sw.dispatchLifecycle('install');

  const shell = sw.store.get('compasser-shell-v1');
  assert.ok(shell, '셸 캐시가 만들어져야 한다');
  assert.ok(shell.has('/'), '오프라인에서 띄울 셸이 있어야 한다');
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
      'compasser-shell-v1': { '/': 'current' },
      'unrelated-cache': { '/x': 'keep' }
    }
  });
  await sw.dispatchLifecycle('activate');

  const names = [...sw.store.keys()];
  assert.ok(!names.includes('compasser-shell-v0'), '이전 버전은 지운다');
  assert.ok(names.includes('compasser-shell-v1'), '현재 버전은 남긴다');
  assert.ok(names.includes('unrelated-cache'), '우리 것이 아닌 캐시는 건드리지 않는다');
});

test('a production install fails as a whole when any precache entry fails', async () => {
  // A partial worker would activate and delete the last good cache.
  const sw = runServiceWorker({ precache: ASSETS, failingAdds: ['/assets/lazy-A.js'] });
  await assert.rejects(() => sw.dispatchLifecycle('install'));
});

test('install deletes nothing, because an open older page still lazy-loads its chunks from those caches', async () => {
  const sw = runServiceWorker({ version: 'v2', precache: ASSETS, cached: { 'compasser-shell-v1': { '/': 'v1' }, 'compasser-assets-v1': { '/x': 'v1' } } });
  await sw.dispatchLifecycle('install');
  assert.deepEqual([...sw.store.keys()], ['compasser-shell-v1', 'compasser-assets-v1', 'compasser-shell-v2']);
});

test('a precached chunk is found offline for a module request with an Origin header', async () => {
  const sw = runServiceWorker({ precache: ASSETS });
  await sw.dispatchLifecycle('install');
  const offline = runServiceWorker({ networkFails: true, store: sw.store });
  const res = await offline.dispatchFetch(req('https://app.example/assets/lazy-A.js', { origin: 'https://app.example' }));
  assert.equal(res.body, 'precached:/assets/lazy-A.js');
});

/** v1 is gone and v2 active with a good shell, while v3 installed into a cache v2 deleted midway. */
async function raceV3ShellAway(options = {}) {
  const store = new Map();
  const v2 = runServiceWorker({ store, version: 'v2', precache: ASSETS });
  await v2.dispatchLifecycle('install');
  let releaseInstall;
  const holdAdds = new Promise(resolve => { releaseInstall = resolve; });
  const v3 = runServiceWorker({ store, version: 'v3', precache: ASSETS, holdAdds });
  const installing = v3.dispatchLifecycle('install');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(store.has('compasser-shell-v3'), 'v3 is mid-install');
  await v2.dispatchLifecycle('activate');
  assert.ok(!store.has('compasser-shell-v3'), 'v2 deleted the shell v3 is still writing to');
  releaseInstall();
  await installing;
  // The same worker wakes up with the network the scenario needs.
  const worker = runServiceWorker({ store, version: 'v3', precache: ASSETS, ...options });
  await worker.dispatchLifecycle('activate');
  return worker;
}

test('a worker whose shell was deleted during install keeps the older shell for offline starts', async () => {
  const v3 = await raceV3ShellAway({ networkFails: true });
  assert.equal(v3.store.get('compasser-shell-v2').size, 5, 'the only complete shell must survive');
  const res = await v3.dispatchFetch(req('https://app.example/', { mode: 'navigate' }));
  assert.equal(res.body, 'precached:/');
  await v3.backgroundWork();
  assert.equal(v3.store.get('compasser-shell-v3').size, 0, 'an offline repair stores nothing');
});

test('the next online navigation refills that shell and serves it offline, keeping the older one for pages still open', async () => {
  const v3 = await raceV3ShellAway();
  await v3.dispatchFetch(req('https://app.example/', { mode: 'navigate' }));
  await v3.backgroundWork();
  assert.deepEqual([...v3.store.get('compasser-shell-v3').keys()].sort(), ['/', ...ASSETS].sort());
  assert.ok(v3.store.has('compasser-shell-v2'), 'a page started offline from it may still lazy-load chunks');

  // Older cache first in creation order, so a plain caches.match would pick the v2 shell.
  v3.store.get('compasser-shell-v3').set('/', makeResponse('v3 shell'));
  const offline = runServiceWorker({ networkFails: true, store: v3.store, version: 'v3', precache: ASSETS });
  assert.equal((await offline.dispatchFetch(req('https://app.example/', { mode: 'navigate' }))).body, 'v3 shell');
});

test('a repair that cannot fetch everything stores nothing, and later navigations try again', async () => {
  const failing = ['/assets/lazy-A.js'];
  const v3 = await raceV3ShellAway({ failingAdds: failing });
  await v3.dispatchFetch(req('https://app.example/', { mode: 'navigate' }));
  await v3.backgroundWork();
  assert.equal(v3.store.get('compasser-shell-v3').size, 0);
  failing.length = 0;
  await v3.dispatchFetch(req('https://app.example/', { mode: 'navigate' }));
  await v3.backgroundWork();
  assert.equal(v3.store.get('compasser-shell-v3').size, 3);
});

test('activate never waits on the network, because fetch events are held until it finishes', async () => {
  // A stalled link during activation would otherwise hang every page of the origin.
  const v3 = await raceV3ShellAway({ network: () => new Promise(() => {}) });
  assert.ok(v3.store.has('compasser-shell-v2'));
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

test('navigation prefers the network without replacing the installed shell', async () => {
  const sw = runServiceWorker();
  await sw.dispatchLifecycle('install');
  const res = await sw.dispatchFetch(req('https://app.example/view/abc', { mode: 'navigate' }));

  assert.match(res.body, /^network:/, '온라인이면 항상 최신 셸을 쓴다');
  const shell = sw.store.get('compasser-shell-v1');
  assert.equal(shell.get('/').body, 'precached:/', '오프라인 셸은 설치 버전과 일치해야 한다');
});

test('navigation falls back to the cached shell when offline', async () => {
  const sw = runServiceWorker({
    networkFails: true,
    cached: { 'compasser-shell-v1': { '/': 'shell' } }
  });
  // SPA 라우팅이라 어떤 경로로 들어와도 같은 셸을 돌려주면 된다.
  const res = await sw.dispatchFetch(req('https://app.example/view/xyz', { mode: 'navigate' }));
  assert.equal(res.body, 'shell');
});

test('offline navigation never gets a redirected shell', async () => {
  // Cloudflare Pages answers /index.html with 308 -> /. Browsers turn a redirected
  // response to a navigation into a network error, so the shell must be cached unredirected.
  const sw = runServiceWorker({ redirectedUrls: ['/index.html'] });
  await sw.dispatchLifecycle('install');
  const offline = runServiceWorker({ networkFails: true });
  for (const [name, entries] of sw.store) offline.store.set(name, entries);

  const res = await offline.dispatchFetch(req('https://app.example/recommend', { mode: 'navigate' }));
  assert.match(res.body, /^precached:/);
  assert.equal(res.redirected, false);
});

test('a stalled navigation shows the cached shell after 3 seconds', async (t) => {
  // Lie-fi: the connection is up but never answers, so fetch neither resolves nor rejects.
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ['setTimeout'] });
  const sw = runServiceWorker({ network: () => new Promise(() => {}), cached: { 'compasser-shell-v1': { '/': 'shell' } } });
  const pending = sw.dispatchFetch(req('https://app.example/courses', { mode: 'navigate' }));
  mock.timers.tick(3000);
  assert.equal((await pending).body, 'shell');
});

test('a slow first visit with no cached shell keeps waiting for the network', async (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ['setTimeout'] });
  const answers = [];
  const sw = runServiceWorker({ network: () => new Promise(resolve => { answers.push(resolve); }) });
  const pending = sw.dispatchFetch(req('https://app.example/', { mode: 'navigate' }));
  mock.timers.tick(3000);
  await new Promise(resolve => setImmediate(resolve));
  for (const answer of answers) answer(makeResponse('network:/'));
  assert.equal((await pending).body, 'network:/');
});

test('a server error on navigation shows the cached shell, or the error page when none is cached', async () => {
  const failing = () => Promise.resolve(makeResponse('down', false, false, 503));
  const withShell = runServiceWorker({ network: failing, cached: { 'compasser-shell-v1': { '/': 'shell' } } });
  assert.equal((await withShell.dispatchFetch(req('https://app.example/home', { mode: 'navigate' }))).body, 'shell');
  const withoutShell = runServiceWorker({ network: failing });
  assert.equal((await withoutShell.dispatchFetch(req('https://app.example/home', { mode: 'navigate' }))).status, 503);
  // A redirect is the server's answer, not a failure.
  const redirect = runServiceWorker({ network: () => Promise.resolve({ ...makeResponse('', false, false, 0), type: 'opaqueredirect' }), cached: { 'compasser-shell-v1': { '/': 'shell' } } });
  assert.equal((await redirect.dispatchFetch(req('https://app.example/index.html', { mode: 'navigate' }))).type, 'opaqueredirect');
});

test('route pages always come from the network, and offline get an explanation instead of a cached copy', async () => {
  const online = runServiceWorker({ cached: { 'compasser-shell-v1': { '/': 'shell' } } });
  assert.match((await online.dispatchFetch(req('https://app.example/en/routes/curated-seoul', { mode: 'navigate' }))).body, /^network:/);
  assert.equal(online.dispatchFetch(req('https://app.example/en/routes/curated-seoul/qr.svg')), undefined, 'the QR image is left to the browser');
  const offline = runServiceWorker({ networkFails: true, cached: { 'compasser-shell-v1': { '/': 'shell' } } });
  const page = await offline.dispatchFetch(req('https://app.example/en/routes/curated-seoul', { mode: 'navigate' }));
  assert.equal(page.status, 503);
  assert.match(await page.text(), /You are offline/);
  assert.equal([...offline.store.values()].some(entries => [...entries.keys()].some(url => url.includes('/en/'))), false, 'nothing under /en is cached');
});

test('navigations to real files and the privacy page never get the app shell', () => {
  const sw = runServiceWorker({ network: () => new Promise(() => {}), cached: { 'compasser-shell-v1': { '/': 'shell' } } });
  for (const path of ['/privacy', '/privacy.html', '/privacy/', '/compasser-preview', '/compasser-preview.html', '/demo.gif']) {
    assert.equal(sw.dispatchFetch(req(`https://app.example${path}`, { mode: 'navigate' })), undefined, path);
  }
});

test('hashed build assets are served from cache first', async () => {
  const sw = runServiceWorker({
    cached: { 'compasser-assets-v1': { 'https://app.example/assets/index-ABC123.js': 'cachedAsset' } }
  });
  const res = await sw.dispatchFetch(req('https://app.example/assets/index-ABC123.js'));

  assert.equal(res.body, 'cachedAsset');
  assert.equal(sw.fetchCalls.length, 0, '파일명에 해시가 있으니 다시 받을 이유가 없다');
});

test('the HTML Pages answers for a removed asset is never stored under the asset URL', async () => {
  const removed = 'https://app.example/assets/removed-OLD.js';
  const sw = runServiceWorker({ network: async () => ({ ...makeResponse('<!doctype html>'), headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }), clone() { return this; } }) });
  await sw.dispatchFetch(req(removed));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sw.store.get('compasser-assets-v1')?.has(removed) ?? false, false);
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
