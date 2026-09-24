/**
 * 첫 화면은 바깥 도메인을 기다리지 않는다.
 *
 * html2canvas·카카오를 미뤄 둔 적이 있는데(external-scripts.js),
 * 실제 빌드를 띄워 재 보니 첫 화면에서 여전히 네 곳이 나가고 있었다 —
 * Google Maps, 애드센스, GA, gapi. 랜딩에는 지도도 광고도 없다.
 *
 * 넷을 같은 잣대로 보지는 않는다.
 *  - **지도**: `<map-view>` 와 `<travel-form>` 이 index.html 마크업에 있어
 *    모든 경로에서 붙는다. 붙자마자 라이브러리 여섯 벌(marker·geocoding·
 *    routes·maps·core·places)을 받아 왔다. 화면에 보일 때 받으면 된다.
 *  - **광고**: 광고 자리(`<ins class="adsbygoogle">`)는 결과 화면에만 있다.
 *  - **GA**: 랜딩의 page_view 를 세는 것이 일이라 첫 화면에 있어야 한다.
 *    async 라 파싱을 막지도 않는다. 그래서 남긴다.
 *  - **gapi(apis.google.com)**: Firebase Auth 가 끌어온다. 라우터가 로그인
 *    상태를 알아야 첫 화면을 그리므로 인증은 원래 첫 화면 일이다. 남긴다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stripSourceComments } from './helpers/style-contract.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const read = p => readFileSync(`${ROOT}${p}`, 'utf8');

const html = read('index.html');
const mapView = stripSourceComments(read('src/domains/map/ui/map-view.js'));
const travelForm = stripSourceComments(read('src/domains/planner/ui/travel-form.js'));
const itinerary = stripSourceComments(read('src/domains/itinerary/ui/itinerary-view.js'));
const externals = read('src/utils/external-scripts.js');

/** 메서드 하나의 본문을 중괄호를 세면서 떼어 온다. */
function methodBody(source, signature) {
  const at = source.indexOf(signature);
  assert.ok(at >= 0, `${signature} 를 찾지 못했다`);
  let i = source.indexOf('{', at);
  let depth = 0;
  const from = i;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  throw new Error(`${signature} 의 끝을 찾지 못했다`);
}

test('index.html 이 직접 부르는 외부 스크립트는 정해진 것뿐이다', () => {
  // 새 SDK 를 여기 그냥 붙이면 첫 화면이 그만큼 느려진다.
  // 미룰 수 없는 것만 남기고, 나머지는 external-scripts.js 로.
  const ALLOWED = ['www.googletagmanager.com'];
  const found = [...html.matchAll(/<script[^>]+src="(https?:\/\/[^"]+)"/g)]
    .map(m => new URL(m[1].replace(/%[A-Z_]+%/g, 'x')).hostname);
  const unexpected = found.filter(h => !ALLOWED.includes(h));
  assert.deepEqual(unexpected, [],
    'index.html 에서 직접 부르면 첫 화면이 그만큼 늦어진다. ' +
    'external-scripts.js 에서 필요한 순간에 불러라:\n' + unexpected.join('\n'));
});

test('지도는 붙자마자가 아니라 보일 때 불러온다', () => {
  const body = methodBody(mapView, 'connectedCallback()');
  assert.ok(!/this\.initMap\s*\(/.test(body),
    '<map-view> 는 index.html 마크업에 있어 모든 경로에서 붙는다. ' +
    'connectedCallback 에서 지도를 켜면 랜딩에서도 Maps JS 를 받는다');
  assert.match(mapView, /ensureMap\s*\(/, '필요할 때 켜는 자리가 없다');
});

test('지도가 아직 없으면 포기하지 않고 켠다', () => {
  const body = methodBody(mapView, 'async renderRoute(');
  assert.match(body, /await\s+this\.ensureMap\s*\(/,
    '경로를 그리라고 했는데 지도가 없다면, 알림 대신 그때 켜면 된다');
});

/**
 * `new IntersectionObserver( … )` 의 인자 영역을 괄호를 세면서 들어낸다.
 * 남는 것이 "붙자마자 그대로 도는 코드"다 — 콜백 안쪽은 화면에 보여야 돈다.
 */
function withoutObserverCallbacks(body) {
  let out = '';
  let i = 0;
  while (i < body.length) {
    const at = body.indexOf('new IntersectionObserver(', i);
    if (at < 0) { out += body.slice(i); break; }
    out += body.slice(i, at);
    let depth = 0;
    let j = body.indexOf('(', at);
    for (; j < body.length; j += 1) {
      if (body[j] === '(') depth += 1;
      else if (body[j] === ')') { depth -= 1; if (depth === 0) break; }
    }
    i = j + 1;
  }
  return out;
}

test('자동완성도 붙자마자 불러오지 않는다', () => {
  const body = methodBody(travelForm, 'connectedCallback()');
  assert.match(body, /this\.initPlaces\s*\(/, '자동완성을 아예 안 붙이면 폼이 반쪽이 된다');

  const onMount = withoutObserverCallbacks(body);
  assert.ok(!/this\.initPlaces\s*\(/.test(onMount),
    '<travel-form> 도 index.html 마크업에 있어 모든 경로에서 붙는다. ' +
    '붙자마자 부르면 랜딩에서도 Maps 의 places 를 받는다 — 폼이 보일 때 받으면 된다');
});

test('광고는 광고 자리가 생길 때 불러온다', () => {
  // 호출부(this.renderAds())가 아니라 선언부를 집는다.
  const body = methodBody(itinerary, 'async renderAds()');
  assert.match(body, /loadAdSense\s*\(/, '광고 자리를 만들면서 SDK 를 불러오지 않는다');
  assert.match(itinerary, /from\s+['"][^'"]*external-scripts\.js['"]/, '공용 로더를 쓰지 않는다');
});

test('광고 계정 번호를 아는 곳은 한 곳이다', () => {
  // 카카오 앱 키가 두 곳에서 나와 서로 다른 앱으로 붙던 적이 있다.
  const files = ['index.html', 'src/utils/external-scripts.js',
    'src/domains/itinerary/ui/itinerary-view.js'];
  const hits = files.filter(f => /ca-pub-\d+/.test(read(f)));
  assert.deepEqual(hits, ['src/utils/external-scripts.js'],
    '계정 번호는 external-scripts.js 한 곳에서만 나온다. 지금 나오는 곳:\n' + hits.join('\n'));
});

test('애드센스 로더가 있다', () => {
  assert.match(externals, /export\s+(async\s+)?function\s+loadAdSense/,
    'loadAdSense 를 내보내지 않는다');
});
