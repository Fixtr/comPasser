import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { createGenerationCredits, LEASE_MS } = createRequire(import.meta.url)('../functions/generation-credits.js');

function fixture() {
    const docs = new Map();
    let time = 1_800_000_000_000;
    let queue = Promise.resolve();
    const db = {
        collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }),
        runTransaction(fn) {
            const work = queue.then(async () => {
                const writes = [];
                const result = await fn({
                    async get(ref) {
                        assert.equal(writes.length, 0, 'Firestore reads must precede writes');
                        return { exists: docs.has(ref.path), data: () => structuredClone(docs.get(ref.path)) };
                    },
                    set(ref, value) { writes.push([ref.path, structuredClone(value)]); },
                });
                for (const [path, value] of writes) docs.set(path, value);
                return result;
            });
            queue = work.catch(() => {});
            return work;
        },
    };
    return { credits: createGenerationCredits({ db, now: () => time }), docs, advance: ms => { time += ms; } };
}

test('first account gets one credit; success spends it and cannot spend twice', async () => {
    const { credits } = fixture();
    assert.deepEqual(await credits.balance('owner', 'first'), { balance: 1, generating: false });
    assert.equal(await credits.reserve('owner', 'first', 'a'), 0);
    await assert.rejects(credits.reserve('owner', 'first', 'b'), { code: 'failed-precondition' });
    assert.equal(await credits.settle('owner', 'first', 'a', true), true);
    assert.deepEqual(await credits.balance('owner', 'first'), { balance: 0, generating: false });
    await assert.rejects(credits.reserve('owner', 'first', 'b'), { code: 'resource-exhausted', details: { reason: 'credits-empty' } });
});

test('failed AI, stale lease, and replaced Auth identity do not lose or inherit credits', async () => {
    const app = fixture();
    const { credits } = app;
    await credits.reserve('owner', 'first', 'a');
    assert.equal(await credits.settle('owner', 'first', 'a', false), true);
    assert.deepEqual(await credits.balance('owner', 'first'), { balance: 1, generating: false });
    await credits.reserve('owner', 'first', 'b');
    app.advance(LEASE_MS + 1);
    assert.deepEqual(await credits.balance('owner', 'first'), { balance: 1, generating: false });
    assert.equal(await credits.settle('owner', 'first', 'b', true), false);
    await credits.reserve('owner', 'first', 'c');
    await credits.settle('owner', 'first', 'c', true);
    assert.deepEqual(await credits.balance('owner', 'second'), { balance: 1, generating: false });
});

test('one AdMob transaction grants one credit even if its signed callback is retried', async () => {
    const { credits } = fixture();
    assert.equal(await credits.grantAdReward('owner', 'first', 'a'.repeat(32)), true);
    assert.equal(await credits.grantAdReward('owner', 'first', 'a'.repeat(32)), false);
    assert.deepEqual(await credits.balance('owner', 'first'), { balance: 2, generating: false });
});

test('a spent credit comes back once at midnight Korea time and does not stack', async () => {
    const app = fixture(); // 17:00 KST
    const { credits } = app;
    await credits.reserve('owner', 'first', 'a');
    await credits.settle('owner', 'first', 'a', true);
    app.advance(7 * 60 * 60 * 1000 - 60_000); // 23:59 KST, same day
    assert.deepEqual(await credits.balance('owner', 'first'), { balance: 0, generating: false });
    app.advance(60_000); // 00:00 KST, next day
    assert.deepEqual(await credits.balance('owner', 'first'), { balance: 1, generating: false });
    await credits.reserve('owner', 'first', 'b');
    await credits.settle('owner', 'first', 'b', true);
    assert.deepEqual(await credits.balance('owner', 'first'), { balance: 0, generating: false });
    await assert.rejects(credits.reserve('owner', 'first', 'c'), { code: 'resource-exhausted' });
    app.advance(3 * 24 * 60 * 60 * 1000);
    assert.deepEqual(await credits.balance('owner', 'first'), { balance: 1, generating: false });
});

test('a refill tops up to one: unused and ad-rewarded credits are not raised', async () => {
    const app = fixture();
    const { credits } = app;
    app.advance(24 * 60 * 60 * 1000);
    assert.deepEqual(await credits.balance('owner', 'first'), { balance: 1, generating: false });
    await credits.grantAdReward('owner', 'first', 'b'.repeat(32));
    app.advance(24 * 60 * 60 * 1000);
    assert.deepEqual(await credits.balance('owner', 'first'), { balance: 2, generating: false });
});

test('an account spent before refills existed gets its credit back on the next read', async () => {
    const app = fixture();
    app.docs.set('generation_credits/owner', { identityCreatedAt: 'first', balance: 0, pending: null });
    assert.deepEqual(await app.credits.balance('owner', 'first'), { balance: 1, generating: false });
    assert.equal(app.docs.get('generation_credits/owner').refilledOn, '2027-01-15');
    await app.credits.reserve('owner', 'first', 'a');
    await app.credits.settle('owner', 'first', 'a', true);
    assert.equal(app.docs.get('generation_credits/owner').refilledOn, '2027-01-15', 'settle keeps the refill day');
    await assert.rejects(app.credits.reserve('owner', 'first', 'b'), { code: 'resource-exhausted' });
});

test('unlimited account can generate repeatedly at zero credits without changing its balance', async () => {
    const app = fixture();
    const { credits } = app;
    await credits.reserve('admin', 'first', 'starter');
    await credits.settle('admin', 'first', 'starter', true);
    await credits.reserve('admin', 'first', 'a', true);
    await assert.rejects(credits.reserve('admin', 'first', 'overlap', true), { code: 'failed-precondition' });
    await credits.settle('admin', 'first', 'a', true, true);
    await credits.reserve('admin', 'first', 'b', true);
    await credits.settle('admin', 'first', 'b', false, true);
    assert.deepEqual(await credits.balance('admin', 'first', true), { balance: 0, generating: false, unlimited: true });
    await credits.reserve('admin', 'first', 'c', true);
    await credits.settle('admin', 'first', 'c', true, true);
    await credits.reserve('admin', 'first', 'timed-out', true);
    app.advance(LEASE_MS + 1);
    assert.deepEqual(await credits.balance('admin', 'first', true), { balance: 0, generating: false, unlimited: true });
    assert.deepEqual(await credits.balance('admin', 'first'), { balance: 0, generating: false });
});
