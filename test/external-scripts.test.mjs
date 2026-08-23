import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stripComments } from './helpers/style-contract.mjs';

/**
 * 외부 SDK 를 언제 불러오는가.
 *
 * index.html 은 html2canvas·Kakao·PortOne 을 async 없이 동기 <script> 로
 * 걸고 있었다. 브라우저는 세 CDN 의 응답을 다 받을 때까지 문서 파싱을
 * 멈춘다. 네트워크가 느리거나 CDN 이 막힌 곳에서는 앱이 아예 뜨지 않고,
 * 오프라인에서는 sw.js 가 외부 요청을 캐시하지 않아 매번 실패한다.
 *
 * 셋 다 첫 화면에는 필요 없다 — 이미지 저장을 누를 때, 카카오 로그인을
 * 누를 때, 본인인증을 시작할 때 필요하다.
 */
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('첫 화면을 막는 외부 스크립트가 없다', () => {
  const tags = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)];
  const blocking = tags
    .filter(m => !/\basync\b|\bdefer\b|type=["']module["']/.test(m[0]))
    .map(m => m[1]);
  assert.deepEqual(blocking, [],
    `문서 파싱을 멈추는 스크립트가 남아 있다:\n${blocking.join('\n')}`);
});

test('캡처 라이브러리를 CDN 에서 받지 않는다', () => {
  // 번들에 넣으면 오프라인에서도 되고 버전이 고정된다.
  // 주석은 지우고 본다 — 걷어낸 이유를 주석으로 남겼는데 그 글자에
  // 정규식이 걸리면, 기록을 지우거나 테스트를 무디게 만드는 선택을 강요받는다.
  assert.doesNotMatch(stripComments(html), /html2canvas/, 'index.html 이 아직 CDN 을 건다');
  const view = src('../src/domains/itinerary/ui/itinerary-view.js');
  assert.match(view, /import\(\s*['"]html2canvas-pro['"]\s*\)|loadHtml2Canvas/,
    '캡처 엔진을 동적 import 로 가져와야 한다');
  const pkg = JSON.parse(src('../package.json'));
  assert.ok(pkg.dependencies['html2canvas-pro'],
    'package.json 에 없으면 새로 받아 설치할 때 빌드가 깨진다');
});

test('카카오 앱 키가 한 곳에서만 나온다', () => {
  // main.js 는 하드코딩된 키로, login-view 는 .env 키로 각각 init 하고
  // 있었다. 먼저 실행되는 쪽이 이겨서, 공유와 로그인이 다른 앱으로 붙을 수
  // 있었다.
  for (const f of ['../src/app/main.js', '../src/domains/auth/ui/login-view.js',
                   '../src/domains/itinerary/ui/itinerary-view.js']) {
    assert.doesNotMatch(src(f), /Kakao\.init\(/, `${f} 이 직접 init 한다`);
    assert.doesNotMatch(src(f), /[0-9a-f]{32}/, `${f} 에 키처럼 보이는 값이 박혀 있다`);
  }
  const loader = src('../src/utils/external-scripts.js');
  assert.match(loader, /VITE_KAKAO_APP_KEY/, '로더가 환경변수에서 키를 읽어야 한다');
  assert.match(loader, /isInitialized\(\)/, '로더가 초기화까지 책임져야 한다');
});

test('호출부가 전역 대신 로더를 기다린다', () => {
  const cases = [
    ['../src/domains/auth/ui/login-view.js', /loadKakaoSdk/],
    ['../src/domains/itinerary/ui/itinerary-view.js', /loadKakaoSdk/],
    ['../src/domains/profile/ui/profile-view.js', /loadPortOne/],
  ];
  for (const [file, re] of cases) {
    assert.match(src(file), re, `${file} 이 로더를 쓰지 않는다`);
  }
});

/**
 * 여기서부터는 로더의 실제 동작. 가짜 document 를 끼워 넣고 돌린다.
 * 정규식으로 "그렇게 적혀 있다"만 확인하면 두 번 로드하거나, 한 번 실패한
 * 뒤 영영 막히는 문제를 못 잡는다.
 */
function fakeDom() {
  const scripts = [];
  const head = { appendChild: (el) => scripts.push(el) };
  const doc = {
    head,
    querySelector: (sel) => {
      const m = /script\[src="([^"]+)"\]/.exec(sel);
      return m ? scripts.find(s => s.src === m[1] && s.attached !== false) || null : null;
    },
    createElement: () => {
      const listeners = {};
      return {
        dataset: {},
        set src(v) { this._src = v; }, get src() { return this._src; },
        addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
        remove() { this.attached = false; },
        _fire: (type) => (listeners[type] || []).forEach(fn => fn()),
      };
    },
  };
  return { doc, scripts };
}

async function withDom(fn) {
  const { doc, scripts } = fakeDom();
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = doc;
  globalThis.window = globalThis.window || {};
  try {
    // 모듈 안의 캐시가 테스트마다 새로 시작하도록 매번 다시 불러온다.
    const mod = await import(`../src/utils/external-scripts.js?t=${Math.random()}`);
    return await fn(mod, scripts);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
}

test('같은 스크립트를 두 번 붙이지 않는다', async () => {
  await withDom(async ({ loadScriptOnce }, scripts) => {
    const a = loadScriptOnce('https://example.test/a.js');
    const b = loadScriptOnce('https://example.test/a.js');
    assert.equal(scripts.length, 1, '<script> 가 하나만 붙어야 한다');
    scripts[0]._fire('load');
    await Promise.all([a, b]);
  });
});

test('한 번 실패해도 다음 시도가 막히지 않는다', async () => {
  // 실패한 Promise 를 캐시에 남겨 두면, 잠깐 끊겼다 돌아온 사용자가
  // 새로고침 전까지 그 기능을 영영 못 쓴다.
  await withDom(async ({ loadScriptOnce }, scripts) => {
    const first = loadScriptOnce('https://example.test/b.js');
    scripts[0]._fire('error');
    await assert.rejects(() => first);

    const second = loadScriptOnce('https://example.test/b.js');
    assert.equal(scripts.length, 2, '다시 붙여서 재시도해야 한다');
    scripts[1]._fire('load');
    await second;
  });
});

test('지연 로드한 것을 빌드가 다시 첫 화면으로 끌어오지 않는다', () => {
  // manualChunks 로 이름을 붙이면 그 청크는 "이 이름을 쓰는 모든 코드"의
  // 것이 되어, 첫 화면에서 불리는 코드와 한 덩어리가 된다. 실제로 캡처
  // 엔진이 catch-all 'vendor' 로 들어가 preload 목록이 3.4KB → 254KB 로
  // 불었다. 동적 import 로만 쓰는 것은 Rollup 이 알아서 떼게 둔다.
  const config = src('../vite.config.js');
  const fn = config.slice(config.indexOf('manualChunks'));
  const guard = /if \(id\.includes\('html2canvas'\)\) return undefined;/;
  assert.match(fn, guard, '캡처 엔진이 vendor 청크로 묶이면 지연 로드가 무의미해진다');
  // catch-all 보다 먼저 걸러야 한다.
  assert.ok(fn.indexOf("html2canvas") < fn.indexOf("return 'vendor'"),
    'catch-all 뒤에 두면 걸러지지 않는다');
});
