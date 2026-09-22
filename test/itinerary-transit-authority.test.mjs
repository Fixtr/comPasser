import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTransitInfo } from '../src/domains/itinerary/ui/itinerary-render-helpers.js';

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
