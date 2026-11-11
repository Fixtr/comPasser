// One-off: save a stopId on every stop of every saved itinerary, and move notes still under an old
// place key to their stop's id, so the app never has to derive ids from stop order again.
//
// Dry run (reads only):  node scripts/backfill-stop-ids.mjs --project <project-id>
// Save the changes:      node scripts/backfill-stop-ids.mjs --project <project-id> --write
// Credentials: Application Default Credentials (gcloud auth application-default login), or the
// emulator when FIRESTORE_EMULATOR_HOST is set. Running it twice changes nothing the second time.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { backfillStopIds } from '../src/domains/itinerary/services/stop-notes.mjs';

/** Returns counts; writes only with write: true, each trip in its own transaction. */
export async function runBackfill(db, { write = false } = {}) {
  const counts = { trips: 0, changed: 0, notesMoved: 0 };
  // shortcut: reads the whole collection at once; page it if itineraries grow past tens of thousands.
  const snapshot = await db.collection('itineraries').get();
  for (const doc of snapshot.docs) {
    counts.trips++;
    if (!write) {
      const { update, moved } = backfillStopIds(doc.data());
      if (Object.keys(update).length) { counts.changed++; counts.notesMoved += moved; }
      continue;
    }
    // Re-read inside the transaction so a save made since the scan is not overwritten.
    await db.runTransaction(async transaction => {
      const { update, moved } = backfillStopIds((await transaction.get(doc.ref)).data());
      if (!Object.keys(update).length) return;
      transaction.update(doc.ref, update);
      counts.changed++;
      counts.notesMoved += moved;
    });
  }
  return counts;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const projectId = process.argv[process.argv.indexOf('--project') + 1];
  if (!process.argv.includes('--project') || !projectId || projectId.startsWith('--')) {
    console.error('Usage: node scripts/backfill-stop-ids.mjs --project <project-id> [--write]');
    process.exit(1);
  }
  const write = process.argv.includes('--write');
  // firebase-admin is installed for Functions only.
  const admin = createRequire(new URL('../functions/package.json', import.meta.url))('firebase-admin');
  admin.initializeApp({ projectId });
  const counts = await runBackfill(admin.firestore(), { write });
  console.log(`${write ? 'Saved' : 'Dry run'}: ${counts.trips} trips read, ${counts.changed} ${write ? 'updated' : 'to update'}, ${counts.notesMoved} notes ${write ? 'moved' : 'to move'}.`);
}
