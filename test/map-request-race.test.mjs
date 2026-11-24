import { travelRegion } from '../functions/travel-region.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeDepartureClock } from '../src/domains/itinerary/services/itinerary-schedule-adjust.mjs';
import { buildTransitDepartureTime } from '../src/domains/map/services/transit-time.mjs';
import { buildLegList } from '../src/domains/map/services/map-legs.mjs';

const source = readFileSync(new URL('../src/domains/map/ui/map-view.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace('export class', 'class').replaceAll('import.meta.env', 'environment');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
const context = id => ({ itineraryVersion: 1, dayIndex: id, requestId: id + 1 });
const plan = name => ({ days: [{ date: '2026-09-08', scheduleItems: [
  { title: name, time: '09:00', endTime: '10:00' }, { title: `${name} 도착`, time: '11:00' },
] }] });
const geocoded = items => items.map((item, index) => ({
  ...item, latLng: { lat: 37 + index, lng: 127 }, resolvedName: item.title, resolvedAddress: `${item.title} 주소`,
}));

test('all unresolved recommendations still emit a clearing result with the current request context', async () => {
  const app=harness({geocode:async()=>[]});
  const data={days:[{scheduleItems:[{type:'dining',title:'점심',placeIntent:{purpose:'점심',category:'restaurant'}}]}]};
  await app.map.renderRoute(data,context(0));
  const event=app.events.find(e=>e.type==='places-resolved');
  assert.deepEqual(event.detail.context,context(0));
  assert.deepEqual(event.detail.places,[{index:0,name:'',address:'',resolvedPlace:null,verifiedPlace:null,unresolvedReason:null}]);
});

test('map event includes the actual recommended Place ID and original item index', async () => {
  const verifiedPlace={placeId:'real-place'};
  const app=harness({geocode:async items=>geocoded(items).map(i=>({...i,verifiedPlace}))});
  const data=plan('점심');
  data.days[0].scheduleItems[1].placeIntent={purpose:'점심',category:'restaurant'};
  await app.map.renderRoute(data,context(0));
  const places=app.events.find(e=>e.type==='places-resolved').detail.places;
  assert.equal(places[1].index,1);
  assert.deepEqual(places[1].verifiedPlace,verifiedPlace);
  assert.equal(Object.hasOwn(places[0],'verifiedPlace'),false);
});

test('map forwards the itinerary budget to place resolution', async () => {
  let seenBudget;
  const app=harness({geocode:async (items,_date,_excluded,budget)=>{
    seenBudget=budget;
    return geocoded(items);
  }});
  await app.map.renderRoute({...plan('예산'),budget:'flex'},context(0));
  assert.equal(seenBudget,'flex');
});
const response = () => ({ routes: [{ legs: [{ duration: { text: '30분', value: 1800 }, distance: { text: '1km' }, steps: [] }] }] });

test('위치를 확인하지 못한 중간 장소를 건너뛰는 경로를 만들지 않는다', async () => {
  let calls = 0;
  const app = harness({ route: async () => { calls++; return response(); } });
  await app.map.renderTransitSegments([
    {latLng: {lat:37,lng:127}, displayIndex:1},
    {latLng: {lat:38,lng:127}, displayIndex:3}
  ], '2026-09-14', context(0));
  assert.equal(calls, 0);
  assert.equal(app.created.routes.length, 0);
  assert.deepEqual(app.events[0].detail.routes, []);
});

// 지도 클래스의 실제 async 경로를 실행한다. Google 통신과 그리기 객체만 대체한다.
function harness({ geocode = async items => geocoded(items), route = async () => response(), library, styles = {} } = {}) {
  const events = [], created = { markers: [], routes: [], fallbacks: [] }, frames = [], listeners = new Map(), tracked = [];
  const libraries = {
    marker: {
      PinElement: class { constructor(options) { Object.assign(this, options); } },
      AdvancedMarkerElement: class { constructor(options) { Object.assign(this, options); created.markers.push(this); } },
    },
    routes: { DirectionsRenderer: class {
      constructor(options) { Object.assign(this, options); created.routes.push(this); }
      setDirections(data) { this.data = data; } setMap(map) { this.map = map; }
    } },
    maps: { Polyline: class {
      constructor(options) { Object.assign(this, options); created.fallbacks.push(this); }
      setMap(map) { this.map = map; } setOptions(options) { Object.assign(this, options); }
    } },
    core: { SymbolPath: { CIRCLE: 'circle' } },
  };
  const deps = {
    HTMLElement: class { attachShadow() { this.shadowRoot = { getElementById: () => ({ style: { display: 'block' } }) }; } },
    travelRegion,
    customElements: { define() {} }, environment: {},
    getMapsLoader: () => ({ importLibrary: async name => {
      if (library) await library(name);
      return libraries[name];
    } }),
    GeocodingService: class { geocodeSchedule(...args) { return geocode(...args); } },
    RoutingService: class { getTransitRoute(...args) { return route(...args); } },
    trackEvent: (...args) => { tracked.push(args); },
    getLang: () => 'ko', t: key => key, buildTransitDepartureTime, routeDepartureClock, buildLegList,
    getComputedStyle: () => ({ getPropertyValue: name => styles[name] || '' }),
    document: { documentElement: {}, createElement: tag => ({ tag, style: {}, children: [], append(...nodes) { this.children.push(...nodes); } }) },
    CustomEvent: class { constructor(type, { detail } = {}) { this.type = type; this.detail = detail; } },
    window: {
      dispatchEvent(event) { events.push(event); },
      addEventListener(type, handler) { listeners.set(type, handler); },
      removeEventListener(type) { listeners.delete(type); },
    },
    IntersectionObserver: class { observe() {} disconnect() {} },
    MIN_PADDING: 24, console: { warn() {}, error() {} },
  };
  const View = new Function(...Object.keys(deps), `${source}\nreturn MapView;`)(...Object.values(deps));
  const map = new View();
  map.map = {};
  map.ensureMap = async () => true;
  map.setLoading = loading => { map.loading = loading; };
  map.frameToItems = items => frames.push(items[0].title);
  return { map, events, created, frames, listeners, tracked };
}

test('느린 1일차 지오코딩이 2일차 완료 뒤 도착해도 마커·장소·이동정보를 덮지 않는다', async () => {
  const first = deferred();
  const app = harness({ geocode: items => items[0].title === '첫날' ? first.promise : Promise.resolve(geocoded(items)) });
  const old = app.map.renderRoute(plan('첫날'), context(0));
  await flush();
  await app.map.renderRoute(plan('다음날'), context(1));
  first.resolve(geocoded(plan('첫날').days[0].scheduleItems));
  await old;
  assert.deepEqual(app.frames, ['다음날']);
  assert.equal(app.created.markers.length, 2);
  assert.ok(app.created.markers.every(marker => marker.title.startsWith('다음날')));
  assert.equal(app.created.routes.length, 1);
  assert.equal(app.events.length, 2);
  assert.ok(app.events.every(event => event.detail.context.requestId === 2));
});

for (const fail of [false, true]) {
  test(`이전 경로 요청이 늦게 ${fail ? '실패' : '성공'}해도 새 경로·로딩 상태를 바꾸지 않는다`, async () => {
    const oldRoute = deferred(), newRoute = deferred();
    let calls = 0;
    const app = harness({ route: () => (++calls === 1 ? oldRoute.promise : newRoute.promise) });
    const old = app.map.renderRoute(plan('첫날'), context(0));
    await flush();
    const latest = app.map.renderRoute(plan('다음날'), context(1));
    await flush();
    if (fail) oldRoute.reject(new Error('old request failed'));
    else oldRoute.resolve(response());
    await old;
    assert.equal(app.map.loading, true, '최신 요청이 아직 계산 중이다');
    assert.equal(app.created.routes.length, 0);
    assert.equal(app.created.fallbacks.length, 0);
    assert.equal(app.events.some(event => event.type === 'transit-unavailable'), false);
    newRoute.resolve(response());
    await latest;
    assert.equal(app.map.loading, false);
    const results = app.events.filter(event => event.type === 'transit-info-ready');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0].detail.context, context(1));
  });
}

test('마커 SDK를 기다리다 화면을 나가면 옛 마커가 다시 생기지 않는다', async () => {
  const markerReady = deferred();
  const app = harness({ library: name => name === 'marker' ? markerReady.promise : undefined });
  const pending = app.map.renderRoute(plan('첫날'), context(0));
  await flush();
  app.map.clearMap();
  markerReady.resolve();
  await pending;
  assert.equal(app.created.markers.length, 0);
  assert.deepEqual(app.events, []);
  assert.equal(app.map.loading, false);
});

test('지도 초기화 도중 취소한 요청은 지오코딩도 시작하지 않는다', async () => {
  const ready = deferred();
  let calls = 0;
  const app = harness({ geocode: async () => { calls++; return []; } });
  app.map.ensureMap = () => ready.promise;
  const pending = app.map.renderRoute(plan('첫날'), context(0));
  app.map.clearMap();
  ready.resolve(true);
  await pending;
  assert.equal(calls, 0);
  assert.deepEqual(app.events, []);
});

test('같은 날짜에서 다시 계산해도 이전 요청 번호의 실패는 무시한다', async () => {
  const oldGeocode = deferred();
  let calls = 0;
  const app = harness({ geocode: items => ++calls === 1 ? oldGeocode.promise : Promise.resolve(geocoded(items)) });
  const old = app.map.renderRoute(plan('편집 전'), context(0));
  await flush();
  await app.map.renderRoute(plan('편집 후'), { ...context(0), requestId: 2 });
  oldGeocode.reject(new Error('late failure'));
  await old;
  assert.ok(app.events.every(event => event.detail.context.requestId === 2));
  assert.ok(app.created.markers.every(marker => marker.title.startsWith('편집 후')));
});

test('현재 요청의 실패는 숨기지 않고 같은 대상의 실패 안내와 대체선을 표시한다', async () => {
  const failure = harness({ geocode: async () => { throw new Error('network'); } });
  await failure.map.renderRoute(plan('첫날'), context(0));
  assert.equal(failure.events[0].type, 'transit-unavailable');
  assert.deepEqual(failure.events[0].detail.context, context(0));
  const fallback = harness({ route: async () => { throw new Error('route unavailable'); } });
  await fallback.map.renderRoute(plan('첫날'), context(0));
  assert.equal(fallback.created.fallbacks.length, 1);
  assert.equal(fallback.events.at(-1).detail.routes[0].durationMinutes, null);
  // 오류만으로는 경로가 없다고 단정하지 않는다. Google 이 ZERO_RESULTS 로 답한 경우만 표시한다.
  assert.equal(fallback.events.at(-1).detail.routes[0].noRoute, false);
  const zero = harness({ route: async () => { throw Object.assign(new Error('DIRECTIONS_ROUTE: ZERO_RESULTS'), { code: 'ZERO_RESULTS' }); } });
  await zero.map.renderRoute(plan('첫날'), context(0));
  assert.equal(zero.events.at(-1).detail.routes[0].noRoute, true);
});

test('전역 취소 이벤트와 컴포넌트 해제도 대기 중인 경로를 무효화한다', async () => {
  for (const disconnected of [false, true]) {
    const delayed = deferred();
    const app = harness({ route: () => delayed.promise });
    app.map.render = () => {};
    app.map.connectedCallback();
    const pending = app.map.renderRoute(plan('첫날'), context(0));
    await flush();
    if (disconnected) app.map.disconnectedCallback();
    else app.listeners.get('cancel-map-route')();
    delayed.resolve(response());
    await pending;
    assert.equal(app.created.routes.length, 0);
    assert.equal(app.map.markers.length, 0);
    assert.equal(app.events.some(event => event.type === 'transit-info-ready'), false);
  }
});

test('map pins keep their light colours in dark mode, because Google map tiles stay light', async () => {
  // Dark mode swaps the theme tokens on :root; the pin tokens stay put.
  const styles = { '--cp-anchor': '#a78bfa', '--cp-start': '#34d399', '--cp-stop': '#60a5fa', '--cp-surface': '#1A1A19',
    '--cp-pin-anchor': '#5820b0', '--cp-pin-start': '#10b981', '--cp-pin-stop': '#3b82f6', '--cp-pin-glyph': '#FFFFFF' };
  const app = harness({ styles });
  await app.map.renderMarkers([
    { latLng: { lat: 37, lng: 127 }, displayIndex: 1 },
    { latLng: { lat: 37.1, lng: 127 }, displayIndex: 2 },
    { latLng: { lat: 37.2, lng: 127 }, displayIndex: 3, type: 'AnchorSchedule' },
  ]);
  assert.deepEqual(app.created.markers.map(marker => [marker.content.background, marker.content.glyphColor]),
    [['#10b981', '#FFFFFF'], ['#3b82f6', '#FFFFFF'], ['#5820b0', '#FFFFFF']]);
});

test('a merged pin uses a pill that widens with its numbers instead of a pin they overflow', async () => {
  const app = harness();
  await app.map.renderMarkers([
    { latLng: { lat: 37, lng: 127 }, displayIndex: 10, title: 'Hotel' },
    { latLng: { lat: 37, lng: 127 }, displayIndex: 11, title: 'Hotel again' },
    { latLng: { lat: 37.1, lng: 127 }, displayIndex: 12 },
  ]);
  const [merged, single] = app.created.markers;
  // PinElement's number grows with its scale, so no scale fits '10·11' (measured on Maps JS, 2026-11-03).
  assert.equal(merged.content.glyphText, undefined);
  assert.equal(merged.content.textContent, '10·11');
  assert.equal(merged.content.style.whiteSpace, 'nowrap');
  assert.equal(merged.title, 'Hotel / Hotel again');
  assert.equal(single.content.glyphText, '12');
});

test('an estimated walking leg is drawn dashed and labelled as an estimate, never as a Google route', async () => {
  const app = harness({ route: async () => ({ estimated: true, routes: [{ legs: [{ duration: { value: 1050 }, distance: { value: 884 } }] }] }) });
  await app.map.renderTransitSegments([
    { latLng: { lat: 37.5, lng: 127 }, displayIndex: 1, endTime: '10:00' },
    { latLng: { lat: 37.5, lng: 127.01 }, displayIndex: 2 },
  ], '2026-09-14', context(0));
  assert.equal(app.created.routes.length, 0);
  assert.equal(app.created.fallbacks.length, 1);
  const [leg] = app.events.find(e => e.type === 'transit-info-ready').detail.routes;
  assert.equal(leg.estimated, true);
  assert.equal(leg.durationMinutes, 18);
  assert.equal(leg.mode, 'WALKING');
  assert.equal(leg.duration, 'estimatedWalkDuration');
  assert.deepEqual(leg.warnings, ['estimatedWalkNote']);
});

// 구간 보기(스펙 7): 이미 그린 선 가운데 하나를 고르고 범위만 맞춘다.
const threeStops = () => ({ days: [{ date: '2026-09-08', scheduleItems: [
  { title: '호텔', time: '09:00', endTime: '09:30' }, { title: '시장', time: '10:00', endTime: '11:00' }, { title: '역', time: '12:00' },
] }] });
function legHarness(options) {
  let calls = 0;
  const app = harness({ route: async () => { calls++; return response(); }, ...options });
  const framed = [];
  app.map.frameToItems = items => framed.push(items.map(item => item.latLng));
  return { ...app, framed, calls: () => calls };
}

test('구간을 고르면 그 선만 진해지고 양 끝 핀만 번호로 남으며 경로를 다시 묻지 않는다', async () => {
  const app = legHarness();
  app.map.render = () => {};
  app.map.connectedCallback();
  await app.map.renderRoute(threeStops(), context(0));
  const [first, second] = app.created.fallbacks;
  const pins = app.created.markers.map(marker => marker.content);
  assert.equal(app.calls(), 2);
  // 전체 보기: 선과 번호 핀만 있고 노선 표지를 그리는 렌더러는 지도에 없다.
  assert.ok(app.created.routes.every(renderer => !renderer.map));
  assert.ok([first, second].every(line => line.map === app.map.map && line.strokeWeight === 4));

  app.listeners.get('show-map-leg')({ detail: { fromIndex: 1 } });
  assert.equal(app.map.activeLeg, 1);
  assert.deepEqual([second.strokeWeight, second.strokeOpacity], [6, 1]);
  assert.deepEqual([first.strokeWeight, first.strokeOpacity], [4, 0.25]);
  assert.equal(first.strokeColor, second.strokeColor, '구간은 색이 아니라 진하기와 굵기로 구분한다');
  assert.deepEqual(app.created.routes.map(renderer => Boolean(renderer.map)), [false, true]);
  assert.equal(app.created.markers[0].content.glyphText, undefined, '끝이 아닌 핀은 점으로 줄인다');
  assert.equal(app.created.markers[0].content.style.background, pins[0].background, '점도 핀의 색을 따른다');
  assert.deepEqual(app.created.markers.slice(1).map(marker => marker.content.glyphText), ['2', '3']);
  assert.deepEqual(app.framed.at(-1), [{ lat: 38, lng: 127 }, { lat: 39, lng: 127 }]);

  app.map.showLeg(0);
  app.map.showLeg(7); // 없는 구간은 무시한다
  assert.equal(app.map.activeLeg, 0);
  app.map.showOverview();
  assert.equal(app.map.activeLeg, null);
  assert.ok(app.created.routes.every(renderer => !renderer.map));
  assert.deepEqual([first.strokeWeight, first.strokeOpacity, second.strokeOpacity], [4, 0.8, 0.8]);
  assert.deepEqual(app.created.markers.map(marker => marker.content), pins);
  assert.equal(app.framed.at(-1).length, 3, '전체 보기는 그날의 모든 장소에 맞춘다');
  assert.equal(app.calls(), 2, '구간을 넘기는 동안 Directions 요청은 늘지 않는다');
});

test('날짜를 바꾸거나 경로를 다시 그리면 전체 보기로 돌아온다', async () => {
  const app = legHarness();
  await app.map.renderRoute(threeStops(), context(0));
  app.map.showLeg(1);
  await app.map.renderRoute(plan('다음날'), context(1));
  assert.equal(app.map.activeLeg, null);
  assert.equal(app.map.legs.length, 1);
  assert.equal(app.created.markers.at(-1).content.glyphText, '2');
  app.map.showLeg(1); // 지난 날짜의 구간은 더 이상 없다
  assert.equal(app.map.activeLeg, null);
  app.map.clearMap();
  assert.equal(app.map.legs.length, 0);
});

test('추정 구간은 넘기기에 들어가고, 같은 장소 구간과 합쳐진 핀은 규칙대로 다룬다', async () => {
  const same = { lat: 37, lng: 127 };
  const app = legHarness({
    geocode: async items => items.map((item, index) => ({ ...item, latLng: [same, same, { lat: 37.01, lng: 127 }, same][index] })),
    route: async () => ({ estimated: true, routes: [{ legs: [{ duration: { value: 600 } }] }] }),
  });
  const data = threeStops();
  data.days[0].scheduleItems.push({ title: '호텔 복귀', time: '13:00' });
  await app.map.renderRoute(data, context(0));
  // 0→1 은 같은 장소라 선이 없다.
  assert.deepEqual(app.map.legs.map(leg => leg.fromIndex), [1, 2]);
  const [merged, single] = app.created.markers;
  assert.equal(merged.content.textContent, '1·2·4');
  app.map.showLeg(1);
  assert.equal(merged.content.textContent, '1·2·4', '번호 하나라도 구간의 끝이면 합쳐진 핀을 그대로 둔다');
  assert.equal(single.content.glyphText, '3');
  const [dashed, other] = app.created.fallbacks;
  assert.deepEqual([dashed.icons[0].icon.fillOpacity, dashed.icons[0].icon.scale], [1, 4]);
  assert.equal(other.icons[0].icon.fillOpacity, 0.25);
  assert.deepEqual(app.framed.at(-1), [same, { lat: 37.01, lng: 127 }], '추정 구간은 양 끝 두 점에 맞춘다');
});

test('넘기기: 다음을 누르면 1 → 2 에서 2 → 3 으로 바뀌고 끝에서는 버튼을 숨긴다', async () => {
  const app = legHarness();
  const nodes = new Map();
  const node = id => nodes.get(id) || nodes.set(id, { id, style: { display: 'block' }, hidden: false, textContent: '',
    addEventListener(type, handler) { this[type] = () => handler({ currentTarget: this }); },
    querySelector: () => ({ focus() { nodes.focused = true; } }) }).get(id);
  app.map.shadowRoot = { getElementById: node };
  app.map.render();
  assert.match(app.map.shadowRoot.innerHTML, /<p id="leg-description" aria-live="polite">/, '설명 줄은 바뀌면 낭독된다');
  assert.equal((app.map.shadowRoot.innerHTML.match(/<button type="button" id="leg-/g) || []).length, 3);
  const shown = () => ['leg-prev', 'leg-next', 'leg-overview'].filter(id => !node(id).hidden).join();

  app.map.clearMap();
  assert.equal(node('leg-stepper').hidden, true, '구간이 없으면 넘기기를 그리지 않는다');
  await app.map.renderRoute(threeStops(), context(0));
  assert.equal(node('leg-stepper').hidden, false);
  assert.equal(node('leg-label').textContent, 'mapLegAll');
  assert.equal(shown(), 'leg-next');

  node('leg-next').click();
  assert.equal(node('leg-label').textContent, '1 → 2');
  assert.equal(node('leg-description').textContent, '호텔 → 시장 · walkText durationMinutes');
  assert.equal(shown(), 'leg-next,leg-overview', '첫 구간에서는 이전을 숨긴다');
  node('leg-next').click();
  assert.equal(node('leg-label').textContent, '2 → 3');
  assert.equal(node('leg-description').textContent, '시장 → 역 · walkText durationMinutes');
  assert.equal(shown(), 'leg-prev,leg-overview', '마지막 구간에서는 다음을 숨긴다');
  assert.equal(nodes.focused, true, '숨은 버튼에 초점을 남기지 않는다');
  node('leg-prev').click();
  assert.equal(node('leg-label').textContent, '1 → 2');
  assert.deepEqual(app.tracked, [['leg_focus_open', { opened_from: 'map_stepper' }]], '전체 보기에서 구간을 열 때 한 번만, 구간 정보 없이 보낸다');

  node('leg-overview').click();
  assert.equal(node('leg-label').textContent, 'mapLegAll');
  assert.equal(node('leg-description').textContent, '');
  assert.equal(app.map.activeLeg, null);
  assert.equal(app.calls(), 2);

  // 언어를 바꾸면 일정 화면은 지도를 다시 요청하지 않는다. 넘기기 줄이 스스로 다시 읽어야 한다.
  app.map.connectedCallback();
  node('leg-label').textContent = '옛 언어';
  node('leg-next').ariaLabel = '옛 언어';
  app.listeners.get('i18n-changed')();
  assert.deepEqual([node('leg-label').textContent, node('leg-next').ariaLabel], ['mapLegAll', 'mapLegNext']);
  app.map.disconnectedCallback();
  assert.equal(app.listeners.has('i18n-changed'), false);
});
