import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findIndoorAlternatives } from '../src/domains/itinerary/services/indoor-alternatives.mjs';

const place = (id, lng = 127) => ({ placeId: id, displayName: id, formattedAddress: 'Seoul', lat: 37.5, lng });
const items = [
  { type: 'departure', time: '09:30', selectedPlace: place('start') },
  { type: 'attraction', time: '10:00', endTime: '11:00', selectedPlace: place('park') },
  { type: 'arrival', time: '12:00', selectedPlace: place('end') },
];
const regularHours = { utcOffsetMinutes: 540, regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] } };
const setup = overrides => ({
  date: '2030-01-08', endTime: '11:20', language: 'en',
  routes: [{ fromIndex: 0, toIndex: 1, durationMinutes: 7 }, { fromIndex: 1, toIndex: 2, durationMinutes: 8 }],
  checks: {
    findRecommendation: async item => ({ placeStatus: 'verified', verifiedPlace: place(item.placeIntent.category) }),
    travelMinutes: async () => 10,
    getHours: async id => id === 'museum' ? regularHours : null,
    ...overrides,
  },
});

test('verified open alternatives preserve the current slot and show measured travel difference', async () => {
  const choices = await findIndoorAlternatives(items, 1, setup());
  assert.deepEqual(choices, [{ place: place('museum'), hours: 'regular', totalMinutes: 20, difference: 5 }]);
});

test('reject duplicates, excessive distance, missing travel and the requested end-time conflict', async () => {
  const config = setup({
    findRecommendation: async item => ({ placeStatus: 'verified', verifiedPlace:
      item.placeIntent.category === 'museum' ? place('park')
        : item.placeIntent.category === 'shopping_mall' ? place('remote', 128) : place('cafe') }),
    getHours: async () => regularHours,
    travelMinutes: async () => null,
  });
  assert.deepEqual(await findIndoorAlternatives(items, 1, config), []);
  config.checks.travelMinutes = async () => 21;
  assert.deepEqual(await findIndoorAlternatives(items, 1, config), []);
});

test('discard cancelled searches before the following provider requests', async () => {
  const config = setup({ getHours: async () => assert.fail('cancelled candidate requested hours') });
  config.isCurrent = () => false;
  assert.deepEqual(await findIndoorAlternatives(items, 1, config), []);
});

test('a later departure from a completed stop invalidates an otherwise reachable alternative', async () => {
  const resumed = [{ ...items[0], actualDepartureTime: '09:55' }, ...items.slice(1)];
  assert.deepEqual(await findIndoorAlternatives(resumed, 1, setup()), []);
});
