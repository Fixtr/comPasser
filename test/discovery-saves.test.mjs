import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createDiscoverySaves } = createRequire(import.meta.url)('../functions/discovery-saves.js');

function fixture() {
  const docs = new Map();
  let queue = Promise.resolve();
  const db = { collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }), runTransaction(fn) {
    const work = queue.then(async () => {
      const writes = [];
      const result = await fn({
        get: async ref => {
          assert.equal(writes.length, 0);
          return { exists: docs.has(ref.path), data: () => docs.get(ref.path) };
        },
        set: (ref, value) => writes.push([ref.path, structuredClone(value)]),
      });
      for (const [path, value] of writes) docs.set(path, value);
      return result;
    });
    queue = work.catch(() => {});
    return work;
  } };
  return { docs, service: createDiscoverySaves({ db, now: () => 2000000 }) };
}

test('saving is idempotent per account and removing a save cannot make counts negative', async () => {
  const { service, docs } = fixture();
  const save = (uid, saved) => service.setSaved(uid, 'identity', 2000, 'forest', saved);
  await Promise.all([save('one', true), save('one', true), save('two', true)]);
  assert.equal(docs.get('discovery_popularity/forest').count, 2);
  await Promise.all([save('one', false), save('one', false), save('two', false)]);
  assert.equal(docs.get('discovery_popularity/forest').count, 0);
  assert.deepEqual(docs.get('discovery_saves/one').placeIds, []);
});

test('unknown places, invalid requests, active deletions and stale identities cannot alter counts', async () => {
  const { service, docs } = fixture();
  await assert.rejects(service.setSaved(null, 'identity', 2000, 'forest', true), { code: 'unauthenticated' });
  await assert.rejects(service.setSaved('one', 'identity', 2000, 'private-address', true), { code: 'invalid-argument' });
  await assert.rejects(service.setSaved('one', 'identity', 2000, 'forest', 'yes'), { code: 'invalid-argument' });
  docs.set('account_deletions/one', { state: 'pending' });
  await assert.rejects(service.setSaved('one', 'identity', 2000, 'forest', true), { code: 'failed-precondition' });
  docs.set('account_deletions/one', { state: 'completed', completedAt: 2000000 });
  await assert.rejects(service.setSaved('one', 'identity', 2000, 'forest', true), { code: 'failed-precondition' });
  await service.setSaved('one', 'identity', 2001, 'forest', true);
  await assert.rejects(service.setSaved('one', 'new-identity', 2001, 'forest', false), { code: 'failed-precondition' });
  assert.equal(docs.get('discovery_popularity/forest').count, 1);
});
