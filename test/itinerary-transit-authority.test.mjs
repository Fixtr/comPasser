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
