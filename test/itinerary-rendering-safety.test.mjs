import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escapeHtml, safeHttpUrl } from '../src/utils/html-safety.mjs';
import { normalizeData } from '../src/domains/itinerary/services/itinerary-normalize.mjs';
import { createItineraryState } from '../src/domains/itinerary/services/itinerary-state.mjs';
import { createItineraryActions } from '../src/domains/itinerary/services/itinerary-actions.mjs';
import { isEditableItem } from '../src/domains/itinerary/services/itinerary-edit.mjs';
import { isTransportEstimatedCost } from '../src/domains/itinerary/services/itinerary-cost.mjs';

const payload = '<img src=x onerror="alert(1)">';
const attributePayload = '" autofocus onfocus="alert(1)';

function element() {
  return {
    style: {}, dataset: {}, children: [], innerHTML: '', textContent: '',
    classList: { toggle() {} },
    appendChild(child) { this.children.push(child); },
    querySelectorAll() { return []; }, querySelector() { return null; },
    addEventListener() {}, setAttribute() {},
  };
}

// 실제 타임라인 렌더러를 실행한다. 외부 SDK와 브라우저의 DOM 저장 부분만 대체한다.
function viewHarness({ user = null } = {}) {
  const controls = new Map();
  const control = id => {
    if (!controls.has(id)) controls.set(id, element());
    return controls.get(id);
  };
  const source = readFileSync(new URL('../src/domains/itinerary/ui/itinerary-view.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export default class', 'class');
  const dependencies = {
    HTMLElement: class {
      attachShadow() { this.shadowRoot = { getElementById: control }; }
      setAttribute() {}
      hasAttribute() { return false; }
    },
    customElements: { define() {} },
    document: { createElement: element, getElementById: () => null },
    window: { dispatchEvent() {} }, CustomEvent: class {},
    getCurrentUser: () => user, escapeHtml, safeHttpUrl, normalizeData, isEditableItem, isTransportEstimatedCost, createItineraryState,
    createItineraryActions, saveItinerary() {}, createSharedItinerary() {}, getSharedItineraryUrl() {},
    getLang: () => 'ko', t: key => `${key} {0}`,
    icons: new Proxy({}, { get: () => '' }),
    setTimeout: callback => callback(), requestAnimationFrame: callback => callback(), refreshHours() {},
    console,
  };
  const View = new Function(...Object.keys(dependencies), `${source}\nreturn ItineraryView;`)(...Object.values(dependencies));
  const view = new View();
  view.reconcileWithConstraints = plan => plan;
  view.refreshEndTimeWarning = () => {};
  view.refreshTransitNotice = () => {};
  view.refreshCostSummary = () => {};
  view.refreshFallbackWarning = () => false;
  view.renderAds = () => {};
  view.applyResolvedPlaces = () => {};
  view.renderTransitInfo = () => {};
  view.buildInsertSlot = () => element();
  return { view, control };
}

function planWith(item) {
  return { days: [{ day: 1, date: '2026-09-06', scheduleItems: [item] }] };
}

test('빈 날짜의 안내 카드가 투명한 상태에 남지 않는다', () => {
  const { view, control } = viewHarness();
  view.renderActiveDay({ days: [{ scheduleItems: [] }] });
  const timeline = control('timeline-container');
  assert.match(timeline.children[0].innerHTML, /viewNoItemsTitle/);
  assert.equal(timeline.style.opacity, '1');
});

test('HTML 텍스트·속성 문자를 이스케이프하고 기존 문자 자체는 저장된 값대로 유지한다', () => {
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escapeHtml('&lt;img&gt;'), '&amp;lt;img&amp;gt;');
  assert.equal(escapeHtml(null), '');
});

test('일정 링크는 절대 HTTP(S)만 허용하고 스크립트·데이터·상대 주소는 거절한다', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,<img>', '//example.com', '/path', 'java\nscript:alert(1)', {}, null]) {
    assert.equal(safeHttpUrl(value), '', String(value));
  }
  assert.equal(safeHttpUrl('https://example.com/?a=1&b=2'), 'https://example.com/?a=1&b=2');
  assert.equal(safeHttpUrl('http://example.com/path'), 'http://example.com/path');
});

test('공유 제목·시각·장소·팁·추천 이름은 실행 가능한 마크업이 되지 않는다', () => {
  const { view, control } = viewHarness();
  const item = {
    type: attributePayload, title: payload, time: payload, endTime: payload,
    location: payload + attributePayload, duration: payload, transitInfo: payload,
    officialWebsiteUrl: 'javascript:alert(1)', googleMapsUrl: 'data:text/html,test',
    practicalInfo: {
      estimatedCost: payload, operatingHours: payload, localTip: payload,
      top3Recommendations: [{ name: payload, rating: payload, reviewUrl: 'javascript:alert(1)', directionUrl: 'data:text/html,test' }],
    },
  };
  const before = structuredClone(item);
  view.showResults(planWith(item), { access: 'shared', id: 'public123' });
  const html = control('timeline-container').children[0].innerHTML;
  assert.doesNotMatch(html, /<img|href="(?:javascript:|data:)|" autofocus/);
  assert.ok(html.includes(escapeHtml(payload)));
  assert.ok(html.includes(`data-type="${escapeHtml(attributePayload)}"`));
  assert.ok(html.includes('href="https://www.google.com/maps/search/?api=1&amp;query='));
  assert.deepEqual(item, before, '표시할 때만 escape하고 저장된 일정 내용을 바꾸지 않는다');
});

test('정상 웹 링크는 유지하고 속성 밖으로 빠져나올 수 없게 인코딩한다', () => {
  const { view, control } = viewHarness();
  view.showResults(planWith({
    type: 'attraction', title: 'A & B', time: '09:00',
    officialWebsiteUrl: 'https://example.com/?a=1&b=2',
    googleMapsUrl: 'https://example.com/" onclick="alert(1)',
    practicalInfo: payload,
  }), { access: 'shared', id: 'public123' });
  const html = control('timeline-container').children[0].innerHTML;
  assert.ok(html.includes('href="https://example.com/?a=1&amp;b=2"'));
  assert.ok(html.includes('A &amp; B'));
  assert.ok(html.includes(escapeHtml(payload)));
  assert.doesNotMatch(html, /<img|href="[^"\n]*" onclick=/);
});

test('공유본을 복사해 편집하는 화면에서도 제목이 접근성 속성을 벗어나지 않는다', () => {
  const { view, control } = viewHarness({ user: { uid: 'reader' } });
  view.showResults(planWith({ type: 'attraction', title: attributePayload, time: '09:00' }));
  const html = control('timeline-container').children[0].innerHTML;
  assert.ok(html.includes(`aria-label="moveUpAria ${escapeHtml(attributePayload)}"`));
  assert.doesNotMatch(html, /" autofocus/);
});

test('여러 날짜의 탭과 구버전 추천 문자열도 텍스트로만 표시한다', () => {
  const { view, control } = viewHarness();
  const plan = planWith({ type: 'attraction', title: '장소', time: '09:00', practicalInfo: { top3Recommendations: payload } });
  plan.days[0].day = payload;
  plan.days[0].date = payload;
  plan.days.push({ day: 2, date: '2026-09-07', scheduleItems: [] });
  view.showResults(plan, { access: 'shared', id: 'public123' });
  const tabHtml = control('day-tabs-container').children[0].innerHTML;
  const cardHtml = control('timeline-container').children[0].innerHTML;
  assert.doesNotMatch(tabHtml + cardHtml, /<img/);
  assert.ok(tabHtml.includes(escapeHtml(payload)));
  assert.ok(cardHtml.includes(escapeHtml(payload)));
});

test('길찾기 팝업에서 장소 이름으로 HTML과 속성을 주입할 수 없다', () => {
  const source = readFileSync(new URL('../src/domains/itinerary/ui/nav-popup.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function', 'function');
  const popup = element();
  popup.querySelector = () => ({ addEventListener() {}, focus() {} });
  const document = {
    createElement: () => popup, getElementById: () => null,
    body: { appendChild() {} }, addEventListener() {},
  };
  const window = { innerWidth: 800, innerHeight: 600, addEventListener() {} };
  const open = new Function('escapeHtml', 'document', 'window', 'requestAnimationFrame', `${source}\nreturn openNavPopup;`)(
    escapeHtml, document, window, callback => callback(),
  );
  open(payload + attributePayload, 'javascript:alert(1)', null, { getElementById: () => null });
  assert.doesNotMatch(popup.innerHTML, /<img|" autofocus|href="javascript:/);
  assert.ok(popup.innerHTML.includes(`title="${escapeHtml(payload + attributePayload)}"`));
});
