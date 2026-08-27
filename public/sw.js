/**
 * ComPasser 서비스 워커.
 *
 * 이전에는 PWA 설치 조건(fetch 핸들러 존재)만 만족시키는 빈 껍데기였다.
 * 브라우저가 "no-op fetch handler" 경고를 냈고 오프라인에서는 아무것도
 * 동작하지 않았다. 여행지에서 데이터가 끊기는 상황이 실제 사용 시나리오라
 * 최소한 앱 껍데기와 저장된 화면은 뜨도록 한다.
 *
 * 전략
 *  - 내비게이션(HTML): 네트워크 우선, 실패하면 캐시된 index.html.
 *    index.html 은 파일명에 해시가 없어 항상 새 버전을 먼저 확인해야 한다.
 *  - 빌드 산출물(/assets/*): 파일명에 콘텐츠 해시가 있어 내용이 바뀌면 이름도
 *    바뀐다. 따라서 캐시 우선이 안전하고 가장 빠르다.
 *  - 그 외 same-origin 정적 파일(아이콘 등): stale-while-revalidate.
 *  - 외부 요청(Firebase, Google Maps, 광고): 건드리지 않는다. 인증/실시간
 *    데이터를 캐시하면 오래된 값이나 잘못된 응답을 돌려줄 위험이 있다.
 */

const VERSION = 'v1';
const SHELL_CACHE = `compasser-shell-${VERSION}`;
const ASSET_CACHE = `compasser-assets-${VERSION}`;
const SHELL_URL = '/index.html';

// 오프라인에서 최소한 껍데기가 뜨도록 미리 받아둔다.
const PRECACHE_URLS = [SHELL_URL, '/', '/manifest.json', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // 하나라도 실패하면 설치 전체가 실패하므로 개별적으로 처리한다.
    await Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith('compasser-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

/** Vite 개발 서버가 주는 것들(모듈·HMR 클라이언트·소스 파일). */
function isDevRequest(url) {
  return url.pathname.startsWith('/@')        // /@vite/client, /@fs/, /@id/
    || url.pathname.startsWith('/src/')
    || url.pathname.startsWith('/node_modules/');
}

/** 콘텐츠 해시가 붙은 빌드 산출물인지. */
function isHashedAsset(url) {
  return url.pathname.startsWith('/assets/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // GET 이 아닌 요청은 캐시 대상이 아니다.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 외부 도메인(Firebase, Google, 광고 등)은 그대로 통과시킨다.
  if (!isSameOrigin(url)) return;

  // 서비스 워커 자신은 캐시하지 않는다(업데이트가 막힌다).
  if (url.pathname === '/sw.js') return;

  // 개발 서버가 주는 것은 통째로 건드리지 않는다. Vite 의 모듈을 캐시하면
  // 고친 코드가 화면에 안 나온다 — 실제로 dev 서버가 죽은 줄 모르고 캐시된
  // 옛 번들을 한참 들여다본 적이 있다. 등록 자체도 배포 빌드에서만 하지만,
  // 예전에 등록된 워커가 남아 있을 수 있으니 여기서도 막는다.
  if (isDevRequest(url)) return;

  // 1) 페이지 이동: 네트워크 우선 -> 실패 시 캐시된 셸
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) {
          // 복제는 **돌려주기 전에** 한다. 넘겨준 뒤에는 몸통이 이미 읽히고
          // 있을 수 있어 clone() 이 터진다.
          const copy = fresh.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put(SHELL_URL, copy)).catch(() => {});
        }
        return fresh;
      } catch {
        const cached = await caches.match(SHELL_URL);
        // SPA 라우팅이라 어떤 경로든 같은 셸을 돌려주면 된다.
        return cached || Response.error();
      }
    })());
    return;
  }

  // 2) 해시가 붙은 빌드 산출물: 캐시 우선(이름이 곧 버전이라 갱신이 필요 없다)
  if (isHashedAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        if (fresh.ok) {
          const copy = fresh.clone();   // 돌려주기 전에 복제한다
          caches.open(ASSET_CACHE).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return fresh;
      } catch {
        // 캐시에도 없고 네트워크도 죽었다. respondWith 에 아무것도 안 주면
        // "Failed to convert value to 'Response'" 로 터진다.
        return Response.error();
      }
    })());
    return;
  }

  // 3) 나머지 same-origin 정적 파일: 캐시를 먼저 주고 뒤에서 갱신
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(response => {
      if (response.ok) {
        // **먼저 복제한다.** 예전에는 caches.open().then() 안에서 복제했는데,
        // 그 시점에는 이미 return 으로 몸통을 넘겨준 뒤라 브라우저가 읽기
        // 시작했으면 "Response body is already used" 로 터졌다.
        const copy = response.clone();
        caches.open(ASSET_CACHE).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(() => cached);
    // 캐시에도 없고 네트워크도 죽으면 network 는 undefined 로 끝난다.
    // respondWith(undefined) 는 "Failed to convert value to 'Response'" 다.
    return cached || (await network) || Response.error();
  })());
});
