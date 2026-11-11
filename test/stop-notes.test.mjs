import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStopNote, legacyStopNoteKeys } from '../src/domains/itinerary/services/stop-notes.mjs';

test('notes accept text and absolute web links within their limits', () => {
  assert.deepEqual(normalizeStopNote(' <b>entrance</b> ', 'https://example.com/ticket'), {
    text: '<b>entrance</b>', url: 'https://example.com/ticket',
  });
  for (const url of ['javascript:alert(1)', '//example.com/ticket', 'https://example.com/' + 'x'.repeat(1000)]) {
    assert.equal(normalizeStopNote('note', url), null);
  }
  assert.equal(normalizeStopNote('x'.repeat(501), ''), null);
  assert.deepEqual(normalizeStopNote(' ', ' '), { text: '', url: '' });
});

test('old note keys followed identified places and gave repeated visits none', () => {
  const cafe = { title: 'Cafe', type: 'cafe', time: '09:00', verifiedPlace: { placeId: 'cafe' } };
  const anchor = { ...cafe, type: 'AnchorSchedule' };
  const keys = (...scheduleItems) => legacyStopNoteKeys({ date: '2026-11-10', scheduleItems });
  const [cafeKey] = keys(cafe);
  assert.ok(cafeKey);
  assert.deepEqual(keys({ ...cafe, title: 'Cafe renamed by map', time: '10:00' }), [cafeKey]);
  assert.notEqual(keys({ ...cafe, verifiedPlace: { placeId: 'different' } })[0], cafeKey);
  assert.deepEqual(keys(cafe, cafe), [null, null]);
  const reservations = keys(anchor, { ...anchor, time: '12:00' });
  assert.ok(reservations.every(Boolean));
  assert.notEqual(...reservations);
  assert.deepEqual(keys({ ...cafe, type: 'arrival' }, { ...cafe, verifiedPlace: null, placeIntent: {} }), [null, null]);
});
