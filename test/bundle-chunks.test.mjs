/**
 * 첫 화면이 받는 청크에 저장/조회 전용 코드가 섞이지 않는다.
 *
 * firebase 를 10 → 12 로 올리면서 첫 로드 preload 목록의 catch-all `vendor`
 * 청크가 **3.4KB → 147KB** 로 불었다. 범인은 `re2js` — firebase 11 부터
 * `@firebase/firestore` 가 끌어오는 정규식 엔진이다(144KB).
 *
 * Firestore 자체는 `src/lib/firestore-lazy.mjs` 가 동적 import 로 미뤄 두는데,
 * `manualChunks` 의 마지막 `return 'vendor'` 가 그 딸린 패키지를 낚아채
 * **이름 붙은 청크**로 만들어 버렸다. 이름이 붙으면 첫 화면 코드와 한 덩어리가
 * 된다 — 캡처 엔진(html2canvas-pro)이 정확히 같은 이유로 preload 목록을
 * 254KB 로 불렸던 적이 있다(vite.config.js 주석).
 *
 * 그래서 규칙은 하나다: **어떤 패키지가 Firestore 를 통해서만 들어온다면
 * `vendor-firestore` 로 보낸다.** 그 청크는 preload 되지 않으므로, 저장 화면에
 * 들어간 사람만 받는다.
 *
 * 텍스트로 "그렇게 적혀 있다"를 보지 않고 실제 함수를 불러 확인한다 —
 * 조건의 순서가 뒤집혀도(catch-all 이 먼저 걸려도) 잡히도록.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const config = (await import('../vite.config.js')).default;
const manualChunks = config.build.rollupOptions.output.manualChunks;

const idFor = pkg => `/repo/node_modules/${pkg}/dist/index.js`;

test('Firestore 전용 의존성은 첫 로드 청크에 들어가지 않는다', () => {
  // re2js: @firebase/firestore 의 dependencies 에만 있다(144KB).
  assert.equal(
    manualChunks(idFor('re2js')),
    'vendor-firestore',
    're2js 가 catch-all vendor 로 가면 첫 로드 preload 가 144KB 무거워진다'
  );
});

test('idb 는 Firestore 규칙에 끌려가지 않고 catch-all 에 남는다', () => {
  // idb: @firebase/app 의 dependencies. Auth itself now loads after first paint, but idb still shares the catch-all.
  assert.equal(manualChunks(idFor('idb')), 'vendor');
});

test('앱 코드와 동적 import 전용 패키지는 이름을 받지 않는다', () => {
  assert.equal(manualChunks('/repo/src/app/main.js'), undefined);
  assert.equal(manualChunks(idFor('html2canvas-pro')), undefined);
  // The home globe loads after first paint; its map math must not join the first-load vendor chunk.
  for (const pkg of ['d3-geo', 'd3-array', 'internmap', 'topojson-client']) assert.equal(manualChunks(idFor(pkg)), undefined, pkg);
});

test('firebase 모듈별 청크 분리는 그대로다', () => {
  assert.equal(manualChunks(idFor('@firebase/firestore')), 'vendor-firestore');
  assert.equal(manualChunks(idFor('@firebase/functions')), 'vendor-functions');
  assert.equal(manualChunks(idFor('@firebase/auth')), 'vendor-auth');
  assert.equal(manualChunks(idFor('@firebase/app')), 'vendor-firebase-core');
  assert.equal(manualChunks(idFor('@googlemaps/js-api-loader')), 'vendor-maps');
});

test('네이티브 로그인 플러그인은 이름 붙은 청크를 받지 않는다', () => {
  // 함정: `@capacitor-firebase/authentication` 라는 경로 안에는 문자열
  // `firebase/auth` 가 **그대로 들어 있다**("@capacitor-firebase/authentication").
  // 그래서 vendor-auth 규칙에 걸려 첫 로드 preload 청크로 빨려 들어갔다
  // — 실측 124KB → 174KB. 웹에서는 한 줄도 실행되지 않는 코드다.
  //
  // 이름을 안 붙이면 Rollup 이 동적 import 지점을 보고 별도 async 청크로
  // 뗀다. 네이티브 앱에서 로그인 버튼을 누른 그 순간에만 읽힌다.
  assert.equal(
    manualChunks(idFor('@capacitor-firebase/authentication')),
    undefined,
    '경로에 firebase/auth 가 들어 있어 vendor-auth 로 새기 쉽다'
  );
});

test('Capacitor 코어는 첫 로드 청크에 남는다', () => {
  // isNativePlatform() 은 로그인 분기에서 매번 부르므로 첫 화면 일이 맞다.
  // 위 규칙이 여기까지 번지면 안 된다.
  assert.equal(manualChunks(idFor('@capacitor/core')), 'vendor');
});

test('Ionic stays unnamed and side-effect free, so its unused components drop out of the first load', () => {
  // Any named chunk reaching @ionic pulls in every component it re-exports (468 -> 313 KB gzip without one).
  for (const pkg of ['@ionic/core', '@ionic/react', '@ionic/react-router', 'ionicons', '@stencil/react-output-target', '@lit/react']) assert.equal(manualChunks(idFor(pkg)), undefined, pkg);
  const sideEffects = config.build.rollupOptions.treeshake.moduleSideEffects;
  assert.equal(sideEffects(idFor('@ionic/core')), false);
  assert.equal(sideEffects(idFor('ionicons')), false);
  assert.equal(sideEffects(idFor('@ionic/react')), true);
  assert.equal(sideEffects('/repo/src/prototype/ionic-shell.jsx'), true);
});

test('the entry statically imports neither auth nor the planner and course catalogues', () => {
  const seen = new Set();
  const walk = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const [, target] of source.matchAll(/^(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) walk(resolve(dirname(file), target));
  };
  walk(resolve('src/prototype/ionic-shell.jsx'));
  const reached = [...seen].map(file => file.split('/').pop());
  assert.ok(reached.includes('home-screen.jsx') && reached.includes('planner-draft.mjs'), 'the walk follows the entry');
  for (const name of ['firebase-auth.js', 'planner-constraints.mjs', 'travel-destinations.mjs', 'public-route.mjs', 'course-draft.mjs', 'course-community.mjs']) assert.ok(!reached.includes(name), name);
});
