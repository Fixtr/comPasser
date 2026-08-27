/**
 * 서비스 워커가 조용히 화면을 망가뜨리지 않게 한다.
 *
 * 사용자 콘솔에 둘이 떠 있었다.
 *
 *   TypeError: Failed to convert value to 'Response'.
 *   TypeError: Failed to execute 'clone' on 'Response': Response body is already used
 *
 * 둘 다 같은 반복문에서 나온다.
 *  ① 네트워크가 실패했는데 캐시에도 없으면 `catch(() => cached)` 가 `undefined`
 *     를 돌려주고, `respondWith(undefined)` 는 "Response 로 못 바꾼다"고 터진다.
 *  ② `response.clone()` 을 `caches.open().then()` **안에서** 부른다. 그때는 이미
 *     `return response` 로 몸통을 넘겨준 뒤라, 브라우저가 읽기 시작했으면
 *     복제할 수 없다. **복제는 넘겨주기 전에 해야 한다.**
 *
 * 그리고 개발 중에는 아무것도 캐시하지 않는다 — 오늘 이것 때문에 dev 서버가
 * 죽은 줄 모르고 옛 번들을 한참 들여다봤다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stripSourceComments } from './helpers/style-contract.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const sw = stripSourceComments(readFileSync(`${ROOT}public/sw.js`, 'utf8'));
const main = stripSourceComments(readFileSync(`${ROOT}src/app/main.js`, 'utf8'));

test('응답 복제는 넘겨주기 전에 한다', () => {
  // `caches.open(...).then(cache => cache.put(request, response.clone()))` 처럼
  // 나중 마이크로태스크에서 복제하면 몸통이 이미 읽히고 있을 수 있다.
  assert.ok(
    !/caches\.open\([^)]*\)\s*\.then\([^)]*=>\s*[a-zA-Z]+\.put\([^)]*\.clone\(\)/.test(sw),
    'clone() 이 caches.open().then() 안에 있다 — 그때는 늦다'
  );
});

test('돌려줄 응답이 없으면 오류 응답이라도 돌려준다', () => {
  // respondWith(undefined) 는 "Failed to convert value to 'Response'" 로 터진다.
  const handlers = sw.split('event.respondWith').slice(1);
  assert.ok(handlers.length >= 3, `respondWith 가 ${handlers.length}개뿐이다`);
  for (const [i, body] of handlers.entries()) {
    assert.ok(
      /Response\.error\(\)/.test(body.slice(0, 700)),
      `${i + 1}번째 respondWith 에 마지막 대비(Response.error())가 없다`
    );
  }
});

test('개발 서버의 것은 캐시하지 않는다', () => {
  // Vite 가 주는 모듈을 캐시하면 고친 코드가 화면에 안 나온다.
  assert.match(sw, /@vite|isDev|localhost/, '개발 중 예외 처리가 없다');
});

test('개발 중에는 서비스 워커를 아예 등록하지 않는다', () => {
  assert.match(
    main,
    /import\.meta\.env\.(PROD|DEV)[\s\S]{0,200}?serviceWorker\.register|serviceWorker[\s\S]{0,200}?import\.meta\.env\.(PROD|DEV)/,
    '등록 자체를 배포 빌드에서만 해야 한다'
  );
});
