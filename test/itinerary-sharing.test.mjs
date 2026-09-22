import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeData } from '../src/domains/itinerary/services/itinerary-normalize.mjs';
import { createItineraryState } from '../src/domains/itinerary/services/itinerary-state.mjs';
import { createItineraryActions } from '../src/domains/itinerary/services/itinerary-actions.mjs';
import { reconcileWithConstraints, getDayConstraints, getEndTimeWarning, buildItineraryViewModel } from '../src/domains/itinerary/services/itinerary-view-model.mjs';
import { buildItineraryTitle } from '../src/domains/itinerary/services/itinerary-title.mjs';
import { insertScheduleItem, removeScheduleItem, moveScheduleItem } from '../src/domains/itinerary/services/itinerary-edit.mjs';
import { trimScheduleToEndTime, applyTransitDelays } from '../src/domains/itinerary/services/itinerary-schedule-adjust.mjs';
import { fitMeasuredSchedule, hasFixedArrivalConflict } from '../src/domains/itinerary/services/itinerary-end-fit.mjs';
import { escapeHtml, safeHttpUrl } from '../src/utils/html-safety.mjs';
import { t, getLang, setLang, applyTranslations } from '../src/utils/i18n.js';

// Firebase 초기화와 브라우저 렌더링만 대체하고, 실제 화면 클래스의
// 불러오기·권한·공유·저장·편집 핸들러를 실행한다. 문자열 모양 검사가 아니다.
const source = readFileSync(new URL('../src/domains/itinerary/ui/itinerary-view.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace('export default class', 'class');

function fakeElement() {
  return {
    style: {}, dataset: {}, disabled: false, hidden: false,
    innerHTML: '', textContent: '', listeners: {},
    getAttribute(name) { return name === 'data-i18n' ? this.dataset.i18n : null; },
    children: [], appendChild(child) { this.children.push(child); },
    addEventListener(type, handler) { this.listeners[type] = handler; },
  };
}

function itineraryView({ user = null, load = async () => null, confirm = true, pathname = '/share/public123', mapEvents = false, storage = null, save, exportImage = async () => 'downloaded', copyLink = async () => {}, shareToKakao = async () => {}, realTranslations = false, watch = async () => () => {} } = {}) {
  const controls = new Map([
    'save-itinerary-btn', 'shared-notice', 'results', 'timeline-container',
    'actions-primary', 'share-itinerary-btn', 'download-image-btn', 'kakao-share-btn',
    'end-time-warning', 'transit-notice', 'fallback-warning', 'cost-summary',
    'day-tabs-container', 'day-title-header',
  ].map(id => [id, fakeElement()]));
  const editButton = fakeElement();
  const calls = { loads: [], saves: [], shares: [], confirms: [], navigations: [], events: [], renders: [], errors: [], exports: [], toasts: [], copies: [], kakao: [] };
  const state = { user, confirm };
  const listeners = new Map();
  const dependencies = {
    HTMLElement: class {
      attachShadow() { this.shadowRoot = {
        getElementById: id => controls.get(id) || null,
        querySelectorAll: selector => selector === '[data-i18n]' ? [...controls.values()].filter(el => el.dataset.i18n) : [],
      }; }
      setAttribute() {}
    },
    customElements: { define() {} },
    document: { getElementById: id => id === 'edit-itinerary-btn' ? editButton : null, createElement: fakeElement },
    window: {
      sessionStorage: storage,
      location: { origin: 'https://app.example', pathname },
      navigate: path => calls.navigations.push(path),
      dispatchEvent: event => { calls.events.push(event); listeners.get(event.type)?.(event); },
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: type => listeners.delete(type),
    },
    CustomEvent: class { constructor(type, { detail } = {}) { this.type = type; this.detail = detail; } },
    console: { error: (...args) => calls.errors.push(args) },
    getCurrentUser: () => state.user,
    loadItineraryDocument: async (id, options) => {
      calls.loads.push({ id, options });
      return load(id, options);
    },
    saveItinerary: async (...args) => { calls.saves.push(args); return save ? save(...args) : 'mycopy123'; },
    createSharedItinerary: async plan => { calls.shares.push(plan); return 'published123'; },
    watchSharedItinerary: watch,
    exportItineraryImage: input => { calls.exports.push(input); return exportImage(input); },
    getSharedItineraryUrl: id => `https://app.example/share/${id}`,
    itineraryShareDelivery: {
      copyLink: async url => { calls.copies.push(url); await copyLink(url); },
      shareToKakao: async url => { calls.kakao.push(url); await shareToKakao(url); },
    },
    showConfirm: async options => { calls.confirms.push(options); return typeof state.confirm === 'function' ? state.confirm() : state.confirm; },
    t: realTranslations ? t : key => key, getLang: realTranslations ? getLang : () => 'ko', applyTranslations,
    trackEvent() {}, showGlobalToast: message => calls.toasts.push([message]),
    icons: {}, normalizeData, reconcileWithConstraints, buildItineraryTitle, escapeHtml, safeHttpUrl, createItineraryState, createItineraryActions,
    insertScheduleItem, removeScheduleItem, moveScheduleItem, trimScheduleToEndTime, getDayConstraints, getEndTimeWarning, buildItineraryViewModel,
    applyTransitDelays, fitMeasuredSchedule, hasFixedArrivalConflict, refreshHours() {},
  };
  const View = new Function(...Object.keys(dependencies), `${source}\nreturn ItineraryView;`)(...Object.values(dependencies));
  const view = new View();
  // 타임라인 마크업/광고 렌더링은 이 회귀 테스트의 대상이 아니다.
  view.renderActiveDay = plan => calls.renders.push(plan);
  view.renderAds = () => {};
  view.showToast = (...args) => calls.toasts.push(args);
  view.setupSaveListener();
  view.setupShareListener();
  view.setupKakaoShareListener();
  if (mapEvents) {
    // 이벤트 수신과 데이터 보정은 실제 코드를 쓰고 DOM 표시만 대체한다.
    view.render = view.updateTexts = view.setupShareListener = view.setupKakaoShareListener = view.setupDownloadListener = () => {};
    view.refreshEndTimeWarning = view.refreshTransitNotice = view.refreshCostSummary = () => {};
    calls.transitRenders = [];
    view.renderTransitInfo = routes => calls.transitRenders.push(routes);
    view.connectedCallback();
  }
  return {
    view, calls, state, editButton,
    control: id => controls.get(id),
    save: () => controls.get('save-itinerary-btn').listeners.click(),
    copyShare: () => controls.get('share-itinerary-btn').listeners.click(),
    kakaoShare: () => controls.get('kakao-share-btn').listeners.click(),
    emit: (type, detail) => listeners.get(type)?.({ detail }),
  };
}

function samplePlan() {
  return {
    days: [{
      day: 1, date: '2026-09-06',
      scheduleItems: [
        { type: 'departure', title: '서울역', location: '서울역', time: '09:00', endTime: '09:00' },
        { type: 'attraction', title: '경복궁', location: '경복궁', time: '09:30', endTime: '11:00' },
        { type: 'dining', title: '점심', location: '광화문', time: '11:30', endTime: '12:30' },
        { type: 'arrival', title: '서울역', location: '서울역', time: '13:00', endTime: '13:00' },
      ],
    }],
  };
}

test('공유 재방문은 메모리 사본을 쓰지 않고 삭제 상태를 다시 확인한다', async () => {
  let deleted=false;
  const app=itineraryView({realTranslations:true,load:async()=>deleted
    ? {access:'shared',deleted:true} : {access:'shared',itineraryPlan:samplePlan()}});
  await app.view.loadItineraryById('linked',{sharedOnly:true});
  assert.ok(app.view.currentItinerary);
  deleted=true;
  assert.equal(await app.view.loadItineraryById('linked',{sharedOnly:true}),false);
  assert.equal(app.calls.loads.length,2);
  assert.equal(app.view.currentItinerary,null);
  assert.match(app.control('timeline-container').innerHTML,/이 일정은 삭제된 일정입니다/);
  assert.equal(app.control('day-title-header').textContent,'');
  assert.equal(app.control('actions-primary').hidden,true);
  assert.equal(app.control('share-itinerary-btn').style.display,'none');
  assert.ok(app.calls.events.some(e=>e.type==='cancel-map-route'));
});

test('공유본을 개인 사본으로 저장하면 원본 접근 감시를 중단한다', async()=>{
  let stopped=0;
  const app=itineraryView({user:{uid:'recipient'},load:async()=>({access:'shared',itineraryPlan:samplePlan()}),watch:async()=>()=>stopped++});
  await app.view.loadItineraryById('linked',{sharedOnly:true});
  await app.save();
  assert.equal(stopped,1);
  assert.equal(app.view.isReadOnly,false);
  assert.equal(app.view.state.current.source.id,'mycopy123');
});

test('개인/공유 문서를 불러올 때 생성 제약을 재실행하거나 실측 응답으로 저장 시각을 덮지 않는다', () => {
  for (const access of ['private','shared']) {
    const app=itineraryView({user:{uid:'owner'},mapEvents:true});
    const plan=samplePlan();
    plan.request={date:['2026-09-06'],startTime:'09:00',endTime:'23:51',startLocation:'서울역',endLocation:'서울역'};
    plan.days[0].scheduleItems.at(-1).time='21:52';
    plan.days[0].scheduleItems.at(-1).endTime='00:43';
    app.view.reconcileWithConstraints=()=>{throw Error('저장 시각 재보정 금지');};
    app.view.showResults(plan,{access,id:'saved'});
    const before=structuredClone(app.view.currentItinerary.days[0].scheduleItems);
    app.emit('transit-info-ready',{context:app.view._mapRequest,routes:[{fromIndex:2,toIndex:3,durationMinutes:999}]});
    assert.deepEqual(app.view.currentItinerary.days[0].scheduleItems,before);
    assert.equal(app.view.currentItinerary.days[0].scheduleItems.at(-1).endTime,'00:43');
  }
});

test('비로그인 공유 일정은 읽기 전용으로 표시하고 지도에는 같은 일정을 전달한다', async () => {
  const plan = samplePlan();
  const app = itineraryView({ load: async () => ({ itineraryPlan: plan, access: 'shared' }) });

  assert.equal(await app.view.loadItineraryById('public123', { sharedOnly: true }), true);

  assert.deepEqual(app.calls.loads, [{ id: 'public123', options: { sharedOnly: true, userId: undefined } }]);
  assert.equal(app.view.currentItinerary, plan);
  assert.equal(app.view.isReadOnly, true);
  assert.equal(app.view.sharedId, 'public123');
  assert.equal(app.view.canEdit(), false);
  assert.equal(app.control('shared-notice').hidden, false);
  assert.equal(app.control('save-itinerary-btn').textContent, 'loginToSaveSharedBtn');
  assert.equal(app.editButton.disabled, true);
  assert.deepEqual(app.calls.navigations, []);
  const requests = app.calls.events.filter(event => event.type === 'render-map-route');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].detail.plan, plan);
  assert.notEqual(requests[0].detail.plan.days, plan.days, '계산에는 원본과 분리된 스냅샷을 보낸다');
  assert.equal(requests[0].detail.context.dayIndex, 0);
  assert.deepEqual(app.calls.errors, []);
});

function latestMapRequest(app) {
  return app.calls.events.filter(event => event.type === 'render-map-route').at(-1).detail;
}

const transit = [{ fromIndex: 0, toIndex: 1, durationMinutes: 90 }];
const places = [{ index: 1, name: '확인된 장소', address: '확인된 주소' }];

test('다른 날짜의 오래된 장소·이동시간·실패 이벤트는 현재 일정과 저장 사본에 반영하지 않는다', async () => {
  const app = itineraryView({ user: { uid: 'reader' }, mapEvents: true });
  const plan = samplePlan();
  plan.days.push({ ...structuredClone(plan.days[0]), day: 2, date: '2026-09-07' });
  app.view.showResults(plan);
  const first = latestMapRequest(app);
  app.view.selectDay(1);
  const second = latestMapRequest(app);
  const before = structuredClone(plan);
  app.emit('places-resolved', { context: first.context, places });
  app.emit('transit-info-ready', { context: first.context, routes: transit });
  app.emit('transit-unavailable', { context: first.context, reason: 'old failure' });
  assert.deepEqual(plan, before);
  assert.deepEqual(app.view.lastTransitRoutes, []);
  assert.equal(app.view.transitUnavailable, false);
  assert.deepEqual(app.view.state.snapshot().plan, before);

  app.emit('places-resolved', { context: second.context, places });
  app.emit('transit-info-ready', { context: second.context, routes: transit });
  assert.deepEqual(plan.days[0], before.days[0]);
  assert.notDeepEqual(plan.days[1].scheduleItems, before.days[1].scheduleItems);
  assert.equal(plan.days[1].scheduleItems[1].resolvedName, '확인된 장소');
  assert.equal(second.context.dayIndex, 1);
  assert.equal(second.plan.days[0].date, '2026-09-07');
  await app.save();
  assert.deepEqual(app.calls.saves[0][1], plan);
});

test('같은 날짜 편집 후에는 새 요청 번호만 받고 계산 입력은 편집 전 스냅샷과 분리한다', () => {
  const app = itineraryView({ user: { uid: 'reader' }, mapEvents: true });
  const plan = samplePlan();
  app.view.showResults(plan);
  const old = latestMapRequest(app);
  app.view.insertPlaceAt(2, { title: '새 장소', location: '새 장소', stayMinutes: 20 });
  const current = latestMapRequest(app);
  assert.equal(current.context.dayIndex, old.context.dayIndex);
  assert.notEqual(current.context.requestId, old.context.requestId);
  assert.equal(old.plan.days[0].scheduleItems.length, 4);
  assert.equal(current.plan.days[0].scheduleItems.length, 5);
  const before = structuredClone(plan);
  app.emit('places-resolved', { context: old.context, places });
  app.emit('transit-info-ready', { context: old.context, routes: transit });
  assert.deepEqual(plan, before);
});

test('다른 일정의 같은 날짜, 대상 표식 없는 이벤트, 화면을 나간 뒤 응답은 모두 무시한다', () => {
  const app = itineraryView({ mapEvents: true });
  app.view.showResults(samplePlan());
  const old = latestMapRequest(app);
  const next = samplePlan();
  app.view.showResults(next);
  const current = latestMapRequest(app);
  assert.notEqual(old.context.itineraryVersion, current.context.itineraryVersion);
  const before = structuredClone(next);
  app.emit('places-resolved', { context: old.context, places });
  app.emit('transit-info-ready', transit);
  app.view.cancelPendingLoad();
  app.emit('places-resolved', { context: current.context, places });
  app.emit('transit-info-ready', { context: current.context, routes: transit });
  app.emit('transit-unavailable', { context: current.context, reason: 'late failure' });
  assert.deepEqual(next, before);
  assert.equal(app.view.transitUnavailable, false);
  app.view.resumeMapRoute();
  assert.notEqual(latestMapRequest(app).context.requestId, current.context.requestId);
  assert.equal(app.view.currentItinerary, next, '복귀할 때 편집된 일정을 원본으로 덮지 않는다');
});

test('A 일정 로딩이 B보다 늦어도 B 화면을 덮거나 다시 지도를 요청하지 않는다', async () => {
  let finishA;
  const app = itineraryView({ load: id => id === 'A'
    ? new Promise(resolve => { finishA = resolve; })
    : Promise.resolve({ access: 'shared', itineraryPlan: samplePlan() }) });
  const pendingA = app.view.loadItineraryById('A', { sharedOnly: true });
  assert.equal(await app.view.loadItineraryById('B', { sharedOnly: true }), true);
  const current = app.view.currentItinerary;
  const eventCount = app.calls.events.length;
  finishA({ access: 'shared', itineraryPlan: samplePlan() });
  assert.equal(await pendingA, false);
  assert.equal(app.view.currentItinerary, current);
  assert.equal(app.view.sharedId, 'B');
  assert.equal(app.calls.events.length, eventCount);
});

test('삭제 확인 중 날짜를 바꾸면 이전 날짜의 삭제를 뒤늦게 적용하지 않는다', async () => {
  let confirm;
  const app = itineraryView({ user: { uid: 'reader' }, confirm: () => new Promise(resolve => { confirm = resolve; }) });
  const plan = samplePlan();
  plan.days.push({ ...structuredClone(plan.days[0]), day: 2 });
  // 이 테스트에서는 날짜 탭 마크업이 아니라 날짜 선택 동작을 사용한다.
  app.view.state.open(plan);
  app.view.requestMapRoute();
  const before = structuredClone(plan);
  const pending = app.view.handleItemEdit('remove', 1);
  app.view.selectDay(1);
  confirm(true);
  await pending;
  assert.deepEqual(plan, before);
});

test('개인 일정 조회는 현재 사용자와 조회 모드를 전달하고 편집 권한을 유지한다', async () => {
  const app = itineraryView({
    user: { uid: 'owner123' },
    load: async () => ({ itineraryPlan: samplePlan(), access: 'private' }),
  });

  assert.equal(await app.view.loadItineraryById('private123'), true);

  assert.deepEqual(app.calls.loads, [{ id: 'private123', options: { sharedOnly: false, userId: 'owner123' } }]);
  assert.equal(app.view.isReadOnly, false);
  assert.equal(app.view.sharedId, null);
  assert.equal(app.view.canEdit(), true);
  assert.equal(app.editButton.disabled, false);
  assert.equal(app.control('shared-notice').hidden, true);
  assert.deepEqual(app.calls.errors, []);
});

test('옛 주소에서 공유본이 없으면 로그인 후 그 주소로 복귀하고 새 공유 주소는 없는 일정으로 안내한다', async () => {
  const legacy = itineraryView();
  assert.equal(await legacy.view.loadItineraryById('legacy123'), false);
  assert.deepEqual(legacy.calls.navigations, ['/login?next=%2Fview%2Flegacy123']);
  assert.equal(legacy.view.currentItinerary, null);

  const shared = itineraryView();
  assert.equal(await shared.view.loadItineraryById('missing123', { sharedOnly: true }), false);
  assert.deepEqual(shared.calls.navigations, []);
  assert.match(shared.control('timeline-container').innerHTML, /viewNotFoundTitle/);
  assert.equal(shared.control('actions-primary').hidden, true);
  assert.equal(shared.calls.events.some(event => event.type === 'render-map-route'), false);
});

test('게스트가 공유본을 재공유하면 새 문서나 공개 확인 없이 기존 링크를 돌려준다', async () => {
  const app = itineraryView();
  app.view.showResults(samplePlan(), { access: 'shared', id: 'public123' });

  assert.equal(await app.view.getShareUrl(), 'https://app.example/share/public123');

  assert.deepEqual(app.calls.shares, []);
  assert.deepEqual(app.calls.confirms, []);
  assert.deepEqual(app.calls.navigations, []);
});

test('개인 일정은 공개 안내를 취소하면 공유하지 않고 동의한 뒤에만 공유본을 만든다', async () => {
  const app = itineraryView({ user: { uid: 'owner123' }, confirm: false });
  const plan = samplePlan();
  app.view.showResults(plan, { id: 'mine123' });

  assert.equal(await app.view.getShareUrl(), null);
  assert.deepEqual(app.calls.shares, []);
  assert.equal(app.calls.confirms[0].message, 'sharePublicNotice');

  app.state.confirm = true;
  assert.equal(await app.view.getShareUrl(), 'https://app.example/share/published123');
  assert.deepEqual(app.calls.shares, [plan]);
  assert.equal(app.calls.confirms.length, 2);
  assert.equal(app.view.isReadOnly, false, '공유본을 만들어도 원래 개인 일정은 편집 가능하다');
});

test('게스트의 저장 버튼은 쓰기 없이 로그인으로 이동하며 공유 주소를 기억한다', async () => {
  const app = itineraryView({ pathname: '/view/legacy123' });
  app.view.showResults(samplePlan(), { access: 'shared', id: 'public123' });

  await app.save();

  assert.deepEqual(app.calls.saves, []);
  assert.deepEqual(app.calls.navigations, ['/login?next=%2Fshare%2Fpublic123']);
});

test('로그인 사용자는 공유본을 자기 계정의 새 일정으로 저장한 뒤 그 사본으로 이동한다', async () => {
  const app = itineraryView({ user: { uid: 'reader456' } });
  const plan = samplePlan();
  app.view.showResults(plan, { access: 'shared', id: 'public123' });

  assert.equal(app.control('save-itinerary-btn').textContent, 'saveSharedCopyBtn');
  await app.save();

  assert.deepEqual(app.calls.saves, [['reader456', plan, buildItineraryTitle(plan, 'ko')]]);
  assert.deepEqual(app.calls.navigations, ['/view/mycopy123']);
  assert.deepEqual(app.calls.shares, [], '공유 원본에 쓰지 않는다');
  assert.equal(app.control('save-itinerary-btn').disabled, false);
  assert.deepEqual(app.calls.errors, []);
});

test('로그인해도 공유본의 삽입·삭제·이동·시간 단축 핸들러는 일정을 변경하지 않는다', async () => {
  const app = itineraryView({ user: { uid: 'reader456' } });
  const plan = samplePlan();
  // 단축 동작도 실제로 가능한 종료 시각을 준다. 가드가 빠지면 변경이 감지된다.
  plan.request = { dailyData: [{ day: 1, endTime: '11:45' }] };
  app.view.state.open(plan, { kind: 'shared', id: 'public123' });
  const before = structuredClone(plan);
  const slot = fakeElement();
  slot.innerHTML = '원래 추가 버튼';

  app.view.openInsertForm(slot, 2);
  app.view.insertPlaceAt(2, { title: '새 장소', location: '새 장소', stayMinutes: 30 });
  await app.view.handleItemEdit('remove', 1);
  await app.view.handleItemEdit('down', 1);
  app.view.trimActiveDayToEndTime();

  assert.deepEqual(app.view.currentItinerary, before);
  assert.equal(slot.innerHTML, '원래 추가 버튼');
  assert.deepEqual(app.calls.confirms, []);
  assert.deepEqual(app.calls.renders, []);
  assert.equal(app.calls.events.some(event => event.type === 'render-map-route'), false);
});

test('공유본을 읽는 중 화면을 비우면 늦게 도착한 결과를 다시 표시하지 않는다', async () => {
  let resolveLoad;
  const app = itineraryView({ load: () => new Promise(resolve => { resolveLoad = resolve; }) });
  const pending = app.view.loadItineraryById('public123', { sharedOnly: true });

  app.view.clear();
  resolveLoad({ itineraryPlan: samplePlan(), access: 'shared' });

  assert.equal(await pending, false);
  assert.equal(app.view.currentItinerary, null);
  assert.equal(app.view.sharedId, null);
  assert.equal(app.control('actions-primary').hidden, true);
  assert.equal(app.calls.events.some(event => event.type === 'render-map-route'), false);
  assert.deepEqual(app.calls.renders, []);
  assert.deepEqual(app.calls.errors, []);
});

test('편집한 개인 일정에 돌아오면 다시 조회하거나 보정하지 않고 선택 날짜까지 복원한다', async () => {
  const plan = samplePlan();
  plan.days.push({ ...structuredClone(plan.days[0]), day: 2 });
  const app = itineraryView({ user: { uid: 'owner' }, load: async () => ({ access: 'private', itineraryPlan: plan }) });
  await app.view.loadItineraryById('trip');
  app.view.selectDay(1);
  app.view.insertPlaceAt(2, { title: '편집한 장소', location: '새 장소', stayMinutes: 20 });
  const expected = structuredClone(app.view.currentItinerary);
  app.view.showResults(samplePlan(), { access: 'shared', id: 'public123' });
  app.view.cancelPendingLoad();
  app.view.reconcileWithConstraints = () => { throw new Error('복원에 보정을 재실행하면 안 됨'); };
  assert.equal(await app.view.loadItineraryById('trip'), true);
  assert.equal(app.calls.loads.length, 1);
  assert.deepEqual(app.view.currentItinerary, expected);
  assert.equal(app.view.activeDayIndex, 1);
  assert.deepEqual(app.calls.errors, []);
});

test('초안 새로고침은 이동시간 보정과 선택 날짜를 그대로 복원한다', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const first = itineraryView({ user: { uid: 'owner' }, storage, mapEvents: true });
  const plan = samplePlan();
  plan.days.push({ ...structuredClone(plan.days[0]), day: 2 });
  first.view.showResults(plan);
  first.view.selectDay(1);
  first.emit('transit-info-ready', { context: latestMapRequest(first).context, routes: transit });
  const expected = structuredClone(first.view.currentItinerary);
  const fresh = itineraryView({ user: { uid: 'owner' }, storage });
  fresh.view.setSessionUser('owner');
  fresh.view.reconcileWithConstraints = () => { throw new Error('복원 보정 금지'); };
  assert.equal(fresh.view.restoreDraft(), true);
  assert.equal(fresh.view.activeDayIndex, 1);
  assert.deepEqual(fresh.view.currentItinerary, expected);
  assert.deepEqual(fresh.calls.errors, []);
});

test('인증 상태 재평가가 같은 문서를 동시에 두 번 조회하지 않는다', async () => {
  let finish;
  const app = itineraryView({ load: () => new Promise(resolve => { finish = resolve; }) });
  const first = app.view.loadItineraryById('public123', { sharedOnly: true });
  const second = app.view.loadItineraryById('public123', { sharedOnly: true });
  assert.equal(app.calls.loads.length, 1);
  finish({ access: 'shared', itineraryPlan: samplePlan() });
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
});

test('저장 중 추가 편집이 발생하면 요청 시점 사본만 저장하고 최신 화면을 덮지 않는다', async () => {
  let finish;
  const app = itineraryView({ user: { uid: 'owner' }, save: () => new Promise(resolve => { finish = resolve; }) });
  app.view.showResults(samplePlan());
  const saving = app.save();
  app.view.insertPlaceAt(2, { title: '저장 중 추가', location: '새 장소', stayMinutes: 20 });
  finish('saved123');
  await saving;
  assert.equal(app.calls.saves[0][1].days[0].scheduleItems.length, 4);
  assert.equal(app.view.currentItinerary.days[0].scheduleItems.length, 5);
  assert.deepEqual(app.calls.navigations, []);
});

test('개인 일정 조회 도중 계정이 바뀌면 이전 계정의 결과나 캐시가 남지 않는다', async () => {
  let finish;
  const app = itineraryView({ user: { uid: 'owner' }, load: () => new Promise(resolve => { finish = resolve; }) });
  const pending = app.view.loadItineraryById('trip');
  app.state.user = { uid: 'other' };
  app.view.setSessionUser('other');
  finish({ access: 'private', itineraryPlan: samplePlan() });
  assert.equal(await pending, false);
  assert.equal(app.view.currentItinerary, null);
  assert.equal(app.view.state.activateDocument('trip', { userId: 'owner' }), null);
});

test('다른 계정의 삭제 알림은 무시하고 본인 일정 삭제는 현재 화면과 캐시를 비운다', () => {
  const app = itineraryView({ user: { uid: 'owner' }, mapEvents: true });
  app.view.showResults(samplePlan(), { id: 'trip' });
  app.emit('itinerary-deleted', { id: 'trip', userId: 'other' });
  assert.notEqual(app.view.currentItinerary, null);
  app.emit('itinerary-deleted', { id: 'trip', userId: 'owner' });
  assert.equal(app.view.currentItinerary, null);
  assert.equal(app.view.state.activateDocument('trip', { userId: 'owner' }), null);
});

test('이미지 내보내기에는 선택 날짜의 사본을 전달하고 대기 중 버튼을 잠근다', async () => {
  let finish;
  const app = itineraryView({ user: { uid: 'owner' }, exportImage: () => new Promise(resolve => { finish = resolve; }) });
  const plan = samplePlan();
  plan.days.push({ ...structuredClone(plan.days[0]), day: 2, date: '2026-09-07' });
  app.view.showResults(plan);
  app.view.selectDay(1);
  const button = app.control('download-image-btn');
  button.textContent = '이미지로 저장';
  const exporting = app.view.downloadAsImage();
  const input = app.calls.exports[0];
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'generatingImage');
  assert.equal(input.dayIndex, 1);
  assert.equal(input.language, 'ko');
  assert.deepEqual(input.labels, { fixedLabel: 'anchorBadge', transitLabel: 'transitTotalLabel', costLabel: 'costLabel' });
  assert.deepEqual(input.plan, app.view.currentItinerary);
  assert.notEqual(input.plan, app.view.currentItinerary);
  app.view.state.replaceDayItems(1, []);
  assert.equal(input.plan.days[1].scheduleItems.length, 4, '내보내기 중 편집해도 전달한 사본은 변하지 않는다');
  finish('downloaded');
  await exporting;
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'downloadTicketBtn');
  assert.deepEqual(app.calls.toasts, [['saveImageDone']]);
});

test('공유 성공·취소·빈 일정의 내보내기 결과에 맞게 알리고 버튼을 복구한다', async () => {
  for (const [result, expected] of [
    ['shared', [['shareImageDone']]],
    ['cancelled', []],
    ['empty', [['nothingToShare', true]]],
  ]) {
    const app = itineraryView({ exportImage: async () => result });
    app.view.showResults(samplePlan(), { access: 'shared', id: 'public123' });
    const button = app.control('download-image-btn');
    button.textContent = '이미지로 저장';
    await app.view.downloadAsImage();
    assert.deepEqual(app.calls.toasts, expected, result);
    assert.equal(button.disabled, false, result);
    assert.equal(button.textContent, 'downloadTicketBtn', result);
  }
});

test('이미지 내보내기가 실패하면 오류를 알리고 다시 시도할 수 있다', async () => {
  const app = itineraryView({ exportImage: async () => { throw new Error('capture failed'); } });
  app.view.showResults(samplePlan(), { access: 'shared', id: 'public123' });
  const button = app.control('download-image-btn');
  button.textContent = '이미지로 저장';
  await app.view.downloadAsImage();
  assert.deepEqual(app.calls.toasts, [['captureUnsupported', true]]);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'downloadTicketBtn');
  assert.equal(app.calls.errors.length, 1);
});

const exportCopy = {
  ko: {
    generating: '이미지 만드는 중...', idle: '티켓 이미지로 저장·공유',
    labels: { fixedLabel: '확정', transitLabel: '이동', costLabel: '1인 비용' },
    shared: '티켓을 공유했습니다.', downloaded: '티켓 이미지를 저장했습니다.',
    empty: '아직 공유할 일정이 없습니다.',
    failed: '티켓 이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.',
  },
  en: {
    generating: 'Creating image...', idle: 'Save or share as a ticket image',
    labels: { fixedLabel: 'FIXED', transitLabel: 'Travel time', costLabel: 'Cost per person' },
    shared: 'Ticket image shared.', downloaded: 'Ticket image saved.',
    empty: 'There is no itinerary to share yet.',
    failed: 'Could not create the ticket image. Please try again.',
  },
};

for (const [lang, copy] of Object.entries(exportCopy)) {
  test(`${lang}: 실제 사전으로 생성 버튼·티켓·모든 결과 문구를 번역한다`, async () => {
    const previousLang = getLang();
    try {
      setLang(lang);
      for (const result of ['downloaded', 'shared', 'cancelled', 'empty', 'failed']) {
        let finish;
        const app = itineraryView({ realTranslations: true, exportImage: () => new Promise((resolve, reject) => {
          finish = () => result === 'failed' ? reject(new Error('capture failed')) : resolve(result);
        }) });
        app.view.showResults(samplePlan());
        const button = app.control('download-image-btn');
        button.dataset.i18n = 'downloadTicketBtn';
        button.textContent = copy.idle;
        const pending = app.view.downloadAsImage();
        assert.equal(button.textContent, copy.generating, result);
        assert.equal(button.dataset.i18n, 'generatingImage');
        assert.equal(button.disabled, true);
        assert.equal(app.calls.exports[0].language, lang);
        assert.deepEqual(app.calls.exports[0].labels, copy.labels);
        finish();
        await pending;
        assert.deepEqual(app.calls.toasts, result === 'cancelled' ? []
          : [[copy[result], ...(['empty', 'failed'].includes(result) ? [true] : [])]]);
        assert.equal(button.textContent, copy.idle);
        assert.equal(button.dataset.i18n, 'downloadTicketBtn');
        assert.equal(button.disabled, false);
      }
    } finally { setLang(previousLang); }
  });

  test(`${lang}: 생성 중 언어 전환은 진행 문구와 완료 버튼에 반영하고 티켓 사본은 유지한다`, async () => {
    const previousLang = getLang();
    try {
      setLang(lang);
      let finish;
      const app = itineraryView({ realTranslations: true, exportImage: () => new Promise(resolve => { finish = resolve; }) });
      app.view.showResults(samplePlan());
      const button = app.control('download-image-btn');
      button.dataset.i18n = 'downloadTicketBtn';
      button.textContent = copy.idle;
      // DOM 의 동적 안내 영역만 대체하고 실제 updateTexts/applyTranslations 경로를 실행한다.
      app.view.refreshEndTimeWarning = app.view.refreshTransitNotice = app.view.refreshCostSummary = () => {};
      const pending = app.view.downloadAsImage();
      const nextLang = lang === 'ko' ? 'en' : 'ko';
      setLang(nextLang);
      app.view.updateTexts();
      assert.equal(button.textContent, exportCopy[nextLang].generating);
      assert.equal(button.disabled, true);
      assert.deepEqual(app.calls.exports[0].labels, copy.labels);
      assert.equal(app.calls.exports[0].language, lang);
      finish('shared');
      await pending;
      assert.deepEqual(app.calls.toasts, [[exportCopy[nextLang].shared]]);
      assert.equal(button.textContent, exportCopy[nextLang].idle);
      assert.equal(button.disabled, false);
    } finally { setLang(previousLang); }
  });
}

test('공유 버튼은 같은 공개 확인을 거쳐 각 전달기로 URL을 넘기고 버튼을 복구한다', async () => {
  for (const [action, buttonId, deliveries] of [
    ['copyShare', 'share-itinerary-btn', 'copies'],
    ['kakaoShare', 'kakao-share-btn', 'kakao'],
  ]) {
    let finish;
    const waiting = new Promise(resolve => { finish = resolve; });
    const app = itineraryView({ user: { uid: 'owner' }, copyLink: () => waiting, shareToKakao: () => waiting });
    app.view.showResults(samplePlan(), { id: 'mine123' });
    const button = app.control(buttonId);
    button.textContent = '공유하기';
    const pending = app[action]();
    assert.equal(button.disabled, true);
    assert.equal(button.textContent, 'creatingLink');
    finish();
    await pending;
    assert.equal(app.calls.confirms.length, 1);
    assert.equal(app.calls.confirms[0].message, 'sharePublicNotice');
    assert.equal(app.calls.confirms[0].destructive, false);
    assert.equal(app.calls.shares.length, 1);
    assert.deepEqual(app.calls[deliveries], ['https://app.example/share/published123']);
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, '공유하기');
  }
});

test('공개 확인 취소는 두 공유 방식 모두 쓰기·전달 없이 끝나고 버튼을 복구한다', async () => {
  for (const [action, buttonId] of [['copyShare', 'share-itinerary-btn'], ['kakaoShare', 'kakao-share-btn']]) {
    const app = itineraryView({ user: { uid: 'owner' }, confirm: false });
    app.view.showResults(samplePlan(), { id: 'mine123' });
    const button = app.control(buttonId);
    button.textContent = '공유하기';
    await app[action]();
    assert.deepEqual(app.calls.shares, []);
    assert.deepEqual(app.calls.copies, []);
    assert.deepEqual(app.calls.kakao, []);
    assert.deepEqual(app.calls.toasts, []);
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, '공유하기');
  }
});

test('저장·공유 전달 실패는 화면에서 알리고 버튼을 다시 사용할 수 있게 한다', async () => {
  const fail = async () => { throw new Error('unavailable'); };
  for (const [action, buttonId] of [
    ['save', 'save-itinerary-btn'], ['copyShare', 'share-itinerary-btn'], ['kakaoShare', 'kakao-share-btn'],
  ]) {
    const app = itineraryView({ user: { uid: 'owner' }, save: fail, copyLink: fail, shareToKakao: fail });
    app.view.showResults(samplePlan(), { id: 'mine123' });
    await app[action]();
    assert.equal(app.control(buttonId).disabled, false);
    assert.equal(app.calls.errors.length, 1);
    assert.equal(app.calls.toasts.length, 1);
    assert.equal(app.calls.toasts[0][1], true);
    assert.deepEqual(app.calls.navigations, []);
  }
});
