import test from 'node:test';
import assert from 'node:assert/strict';

const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), data };
};

test('blocked authors persist across loads and ignore empty ids', async t => {
  const store = storage();
  globalThis.localStorage = store; t.after(() => { delete globalThis.localStorage; });
  const { blockAuthor, blockedAuthors } = await import(`../src/domains/itinerary/services/blocked-authors.mjs?${Date.now()}`);
  blockAuthor('spammer'); blockAuthor('spammer'); blockAuthor('');
  assert.deepEqual([...blockedAuthors()], ['spammer']);
  const fresh = await import(`../src/domains/itinerary/services/blocked-authors.mjs?again${Date.now()}`);
  assert.deepEqual([...fresh.blockedAuthors()], ['spammer']);
});

test('a block still holds for the session when storage is unavailable or corrupt', async t => {
  globalThis.localStorage = { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } }; t.after(() => { delete globalThis.localStorage; });
  const { blockAuthor, blockedAuthors } = await import(`../src/domains/itinerary/services/blocked-authors.mjs?broken${Date.now()}`);
  assert.deepEqual([...blockedAuthors()], []);
  blockAuthor('troll');
  assert.ok(blockedAuthors().has('troll'));
});

test('unblock all clears memory and storage and reports how many were blocked', async t => {
  const store = storage();
  globalThis.localStorage = store; t.after(() => { delete globalThis.localStorage; });
  const { blockAuthor, blockedAuthors, unblockAllAuthors } = await import(`../src/domains/itinerary/services/blocked-authors.mjs?unblock${Date.now()}`);
  assert.equal(unblockAllAuthors(), 0);
  blockAuthor('a'); blockAuthor('b');
  assert.equal(unblockAllAuthors(), 2);
  assert.deepEqual([...blockedAuthors()], []);
  assert.equal(store.getItem('cp.blockedAuthors'), null);
});
