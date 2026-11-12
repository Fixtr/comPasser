import './assert-local.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runBackfill } from '../../scripts/backfill-stop-ids.mjs';
import { legacyStopKeys } from '../../src/domains/itinerary/services/visited-stops.mjs';
import { legacyStopNoteKeys } from '../../src/domains/itinerary/services/stop-notes.mjs';

const require = createRequire(new URL('../../functions/index.js', import.meta.url));
const admin = require('firebase-admin');
const app = admin.initializeApp({ projectId: 'demo-hackerton-deletion' }, 'backfill-stop-ids');
const db = app.firestore();
test.after(() => app.delete());

const day = () => ({ date: '2026-11-10', scheduleItems: [
  { type: 'departure', title: 'Hotel', time: '09:00' },
  { type: 'cafe', title: 'Cafe', time: '10:00', verifiedPlace: { placeId: 'cafe-a' } },
  { type: 'cafe', title: 'Cafe', time: '13:00', verifiedPlace: { placeId: 'cafe-b' } },
  { type: 'arrival', title: 'Station', time: '18:00' },
] });

test('dry run writes nothing; the real run saves ids and moves notes once, leaving other fields alone', async () => {
  // The script reads the whole collection, so start from only this test's trips.
  await db.recursiveDelete(db.collection('itineraries'));
  const placeB = legacyStopNoteKeys(day())[2];
  const ref = db.collection('itineraries').doc('backfillTrip');
  await ref.set({ userId: 'owner', title: 'Trip', itineraryPlan: { days: [day()] }, stopNotes: { [placeB]: { text: 'B', url: '' } } });
  const done = db.collection('itineraries').doc('backfillDone');
  const saved = { days: [{ ...day(), scheduleItems: day().scheduleItems.map((item, i) => i % 3 ? { ...item, stopId: `s${i}` } : item) }] };
  await done.set({ userId: 'owner', itineraryPlan: saved });

  const dry = await runBackfill(db);
  assert.deepEqual(dry, { trips: 2, changed: 1, notesMoved: 1 });
  assert.equal((await ref.get()).data().itineraryPlan.days[0].scheduleItems[1].stopId, undefined, 'a dry run writes nothing');

  assert.deepEqual(await runBackfill(db, { write: true }), { trips: 2, changed: 1, notesMoved: 1 });
  const trip = (await ref.get()).data();
  const [, a, b] = trip.itineraryPlan.days[0].scheduleItems.map(item => item.stopId);
  assert.deepEqual([a, b], legacyStopKeys(day()).slice(1, 3), 'old mark keys, so device marks still match');
  assert.deepEqual(trip.stopNotes, { [b]: { text: 'B', url: '' } });
  assert.equal(trip.title, 'Trip');
  assert.deepEqual((await done.get()).data().itineraryPlan, saved, 'a trip that already has ids is untouched');

  assert.deepEqual(await runBackfill(db, { write: true }), { trips: 2, changed: 0, notesMoved: 0 });
});
