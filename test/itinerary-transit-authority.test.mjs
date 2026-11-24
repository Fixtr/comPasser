import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTransitInfo, renderTransitStep } from '../src/domains/itinerary/ui/itinerary-render-helpers.js';

test('a measured route hides both AI transit prose and AI transport fare', () => {
  const hiddenNodes = [{ style: {} }, { style: {} }, { style: {} }];
  let cardSelector = '';
  const transitElement = {
    innerHTML: '',
    classList: { add() {}, remove() {} },
    querySelector() { return null; },
  };
  const shadowRoot = {
    querySelectorAll(selector) {
      return selector === '.transit-info' ? [transitElement] : [];
    },
    getElementById(id) {
      return id === 'transit-info-0' ? transitElement : null;
    },
    querySelector(selector) {
      assert.equal(selector, '.schedule-card[data-index="2"]');
      return {
        querySelectorAll(selectorWithinCard) {
          cardSelector = selectorWithinCard;
          return hiddenNodes;
        },
      };
    },
  };

  renderTransitInfo(shadowRoot, [{
    fromIndex: 0, toIndex: 1, duration: '78분', durationMinutes: 78,
    mode: 'TRANSIT', vehicleType: 'COMMUTER_TRAIN', lineName: '공항철도',
  }]);

  assert.match(cardSelector, /\.gemini-transit/);
  assert.match(cardSelector, /\.gemini-transport-cost/);
  assert.ok(hiddenNodes.every(node => node.style.display === 'none'));
  assert.match(transitElement.innerHTML, /공항철도/);
  assert.doesNotMatch(transitElement.innerHTML, /KTX/);
});

test('external transit text remains text in route markup', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const transitElement = {
    innerHTML: '',
    classList: { add() {}, remove() {} },
  };
  const shadowRoot = {
    querySelectorAll: () => [transitElement],
    getElementById: () => transitElement,
    querySelector: () => null,
  };

  renderTransitInfo(shadowRoot, [{
    fromIndex: 0,
    toIndex: 1,
    duration: payload,
    distance: payload,
    steps: [{
      mode: 'TRANSIT',
      vehicleType: 'BUS',
      lineName: payload,
      departureStop: payload,
      arrivalStop: payload,
      duration: payload,
      numStops: payload,
    }],
  }]);

  assert.doesNotMatch(transitElement.innerHTML, /<img/);
  assert.match(transitElement.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(renderTransitStep({ mode: 'WALKING', duration: payload, distance: payload }), /<img/);
});

test('measured travel times follow the language toggle, not the language the Maps API loaded with', async () => {
  const { setLang } = await import('../src/utils/i18n.js');
  const { transitDurationText } = await import('../src/domains/itinerary/ui/itinerary-render-helpers.js');
  try {
    setLang('en');
    assert.equal(transitDurationText({ duration: '41분', durationMinutes: 42, displayMinutes: 41 }), '41 min');
    assert.equal(transitDurationText({ duration: '1시간 5분', displayMinutes: 65 }), '1 hr 5 min');
    assert.match(renderTransitStep({ mode: 'WALKING', duration: '10분', displayMinutes: 10, distance: '0.6 km' }), /10 min \(0\.6 km\)/);
    assert.match(transitDurationText({ duration: '약 12분 (직선거리 추정)', durationMinutes: 12, estimated: true, mode: 'WALKING' }), /^~12 min/);
    assert.equal(transitDurationText({ duration: '7분' }), '7분', 'a route without minutes keeps the stored text');
    const card = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; } };
    renderTransitInfo({ querySelectorAll: () => [], getElementById: () => card, querySelector: () => null },
      [{ fromIndex: 0, toIndex: 1, estimated: true, mode: 'WALKING', durationMinutes: 12, duration: '약 12분 (직선거리 추정)', warnings: ['직선거리로 추정'] }]);
    assert.doesNotMatch(card.innerHTML, /[가-힣]/, 'an estimated leg note follows the toggle too');
    setLang('ko');
    assert.equal(transitDurationText({ duration: '41 mins', durationMinutes: 42, displayMinutes: 41 }), '41분');
  } finally {
    setLang('ko');
  }
});

test('the departure text names the mode the map measured, worded as the transit rows word it', async () => {
  const { setLang } = await import('../src/utils/i18n.js');
  const { legModeText, getTransitModeText } = await import('../src/domains/itinerary/ui/itinerary-render-helpers.js');
  try {
    setLang('ko');
    assert.equal(legModeText({ mode: 'WALKING', durationMinutes: 18 }), '도보');
    assert.equal(legModeText({ mode: 'TRANSIT', vehicleType: 'BUS', lineName: '142' }), '142번 버스');
    assert.equal(legModeText({ mode: 'TRANSIT', vehicleType: 'BUS', lineName: '142' }), getTransitModeText('BUS', '142'));
    assert.equal(legModeText({ mode: 'TRANSIT', vehicleType: 'SUBWAY', lineName: '2호선' }), '2호선');
    assert.equal(legModeText({ mode: 'TRANSIT', vehicleType: 'BUS', lineName: null }), '대중교통', 'no line name: never "번 버스"');
    assert.equal(legModeText({ mode: 'TRANSIT', estimated: true, steps: [] }), '대중교통');
    for (const unknown of [undefined, null, {}, { durationMinutes: 18 }, { mode: 'SAME_PLACE' }, { mode: 'DRIVING' }]) {
      assert.equal(legModeText(unknown), '', 'an unknown mode names nothing');
    }
    setLang('en');
    assert.equal(legModeText({ mode: 'WALKING' }), 'Walk');
    assert.equal(legModeText({ mode: 'TRANSIT', vehicleType: 'BUS', lineName: '142' }), 'Bus 142');
  } finally {
    setLang('ko');
  }
});
