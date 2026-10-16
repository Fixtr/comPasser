import { travelRegion } from '../functions/travel-region.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTransitDepartureTime } from '../src/domains/map/services/transit-time.mjs';

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
function harness({ geocode = async items => geocoded(items), route = async () => response(), library } = {}) {
  const events = [], created = { markers: [], routes: [], fallbacks: [] }, frames = [], listeners = new Map();
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
      setMap(map) { this.map = map; }
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
    getLang: () => 'ko', buildTransitDepartureTime,
    getComputedStyle: () => ({ getPropertyValue: () => '' }), document: { documentElement: {} },
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
  return { map, events, created, frames, listeners };
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
