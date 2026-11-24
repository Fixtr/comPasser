import test from 'node:test';
import assert from 'node:assert/strict';

import { googleDirectionsUrl } from '../src/domains/itinerary/services/directions-target.mjs';

const tokyo = { destination: { id: 'tokyo', country: 'JPN' } };
const seoul = { destination: { id: 'seoul', country: 'KOR' } };
const saved = 'https://www.google.com/maps/search/?api=1&query=Senso-ji&query_place_id=abc';

test('a Korean trip opens the popup (no Google address)', () => {
  assert.equal(googleDirectionsUrl(seoul, '경복궁', saved), '');
});

test('a trip without request data keeps the popup', () => {
  assert.equal(googleDirectionsUrl(undefined, '경복궁', saved), '');
  assert.equal(googleDirectionsUrl(null, '경복궁', ''), '');
  assert.equal(googleDirectionsUrl({}, '경복궁', ''), '');
});

test('a trip outside Korea uses the saved Google Maps address', () => {
  assert.equal(googleDirectionsUrl(tokyo, 'Senso-ji', saved), saved);
});

test('a trip outside Korea without a saved address builds one from the place name', () => {
  assert.equal(googleDirectionsUrl(tokyo, '浅草寺 & 仲見世', ''),
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('浅草寺 & 仲見世')}`);
});

test('an unsafe saved address is never returned', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'not a url', null, 42]) {
    assert.equal(googleDirectionsUrl(tokyo, 'Senso-ji', bad), 'https://www.google.com/maps/dir/?api=1&destination=Senso-ji');
  }
});

test('a saved address on a non-Google host is ignored', () => {
  const built = 'https://www.google.com/maps/dir/?api=1&destination=Senso-ji';
  for (const bad of ['https://evil.example/x', 'https://www.google.com.evil.io/maps', 'https://notgoogle.com/maps', 'https://evilgoo.gl/x']) {
    assert.equal(googleDirectionsUrl(tokyo, 'Senso-ji', bad), built);
  }
  for (const good of ['https://maps.google.com/?cid=123', 'https://google.com/maps/place/x', 'https://maps.app.goo.gl/abc', 'https://goo.gl/maps/abc']) {
    assert.equal(googleDirectionsUrl(tokyo, 'Senso-ji', good), good);
  }
});

test('an unrecognised country value falls back to Korea and keeps the popup', () => {
  for (const country of ['jpn', 'JP', 'ZZZ', undefined]) {
    assert.equal(googleDirectionsUrl({ destination: { id: 'tokyo', country } }, 'Senso-ji', saved), '');
  }
});
