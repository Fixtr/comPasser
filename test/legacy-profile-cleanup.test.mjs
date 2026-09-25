import test from 'node:test';
import assert from 'node:assert/strict';
import cleanupModule from '../functions/scripts/cleanup-legacy-profile-data.js';

const { cleanupLegacyProfileData, parseArgs } = cleanupModule;

function fakeDb(documents) {
  const updates = [];
  return {
    updates,
    collection() {
      return {
        select() {
          return {
            async *stream() {
              for (const [id, data] of Object.entries(documents)) {
                yield { data: () => data, ref: { id } };
              }
            },
          };
        },
      };
    },
    batch() {
      const queued = [];
      return {
        update(ref, data) { queued.push({ ref, data }); },
        async commit() { updates.push(...queued); },
      };
    },
  };
}

test('legacy profile cleanup is dry-run by default and deletes only matching documents when applied', async () => {
  const documents = {
    phone: { phoneNumber: 'private', birthday: '2000-01-01' },
    verified: { isVerified: false },
    current: { birthday: '2001-01-01' },
  };
  const dryDb = fakeDb(documents);
  assert.deepEqual(await cleanupLegacyProfileData(dryDb), { matched: 2, updated: 0 });
  assert.equal(dryDb.updates.length, 0);

  const applyDb = fakeDb(documents);
  assert.deepEqual(await cleanupLegacyProfileData(applyDb, { apply: true }), { matched: 2, updated: 2 });
  assert.deepEqual(applyDb.updates.map(update => update.ref.id), ['phone', 'verified']);
  assert.deepEqual(applyDb.updates.map(update => Object.keys(update.data)), [
    ['phoneNumber', 'isVerified'],
    ['phoneNumber', 'isVerified'],
  ]);
});

test('production apply requires the project name twice', () => {
  assert.deepEqual(parseArgs(['--project=compasser-app']), { projectId: 'compasser-app', apply: false });
  assert.throws(() => parseArgs(['--project=compasser-app', '--apply']), /confirm-project/);
  assert.deepEqual(parseArgs([
    '--project=compasser-app', '--apply', '--confirm-project=compasser-app',
  ]), { projectId: 'compasser-app', apply: true });
});
