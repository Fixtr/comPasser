import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createAccountDeletion, LEASE_MS } = createRequire(import.meta.url)('../functions/account-deletion.js');

function fixture({ trips = 3, batchSize = 2, maxBatches = 10 } = {}) {
    const state = { time: 1_800_000_000_000, user: { uid: 'owner', metadata: { creationTime: '2026-01-01' } }, fail: null, deletes: [], logs: [], beforeAuth: null };
    const docs = new Map([['users/owner', { phoneNumber: 'private' }], ['users/other', { keep: true }], ['itineraries/other', { userId: 'other' }], ['shared_itineraries/public', { keep: true }]]);
    for (let i = 0; i < trips; i++) docs.set(`itineraries/trip${i}`, { userId: 'owner' });
    const snapshot = ref => ({ ref, id: ref.id, exists: docs.has(ref.path), data: () => structuredClone(docs.get(ref.path)) });
    function collection(name, filters = [], limit = Infinity, order) {
        return {
            doc(id) { return { id, path: `${name}/${id}`, get: async function () { return snapshot(this); } }; },
            where(field, op, value) { return collection(name, [...filters, [field, op, value]], limit, order); },
            limit(n) { return collection(name, filters, n, order); },
            orderBy(field) { return collection(name, filters, limit, field); },
            async get() {
                let entries = [...docs].filter(([path, data]) => path.split('/')[0] === name && filters.every(([field, op, value]) => op === '==' ? data[field] === value : data[field] <= value));
                if (order) entries.sort((a, b) => a[1][order] - b[1][order]);
                const matches = entries.slice(0, limit).map(([path]) => snapshot({ path, id: path.split('/')[1] }));
                return { docs: matches, empty: !matches.length };
            },
        };
    }
    let queue = Promise.resolve();
    const db = { collection, runTransaction(fn) {
        const work = queue.then(async () => {
            const writes = [];
            const result = await fn({
                async get(ref) { assert.equal(writes.length, 0, 'all reads precede writes'); return ref.path ? snapshot(ref) : ref.get(); },
                set: (ref, value) => writes.push(['set', ref.path, structuredClone(value)]),
                delete: ref => writes.push(['delete', ref.path]),
            });
            if (state.fail?.(writes)) throw new Error('simulated transaction outage');
            for (const [op, path, value] of writes) {
                if (op === 'set') docs.set(path, value);
                else { docs.delete(path); state.deletes.push(path); }
            }
            return result;
        });
        queue = work.catch(() => {});
        return work;
    } };
    const auth = {
        async getUser(uid) { assert.equal(uid, 'owner'); if (!state.user) throw Object.assign(new Error('gone'), { code: 'auth/user-not-found' }); return structuredClone(state.user); },
        async deleteUser(uid) {
            assert.equal(uid, 'owner');
            await state.beforeAuth?.();
            if (!state.user) throw Object.assign(new Error('gone'), { code: 'auth/user-not-found' });
            state.deletes.push('auth/owner'); state.user = null;
        },
    };
    let leases = 0;
    const service = createAccountDeletion({ db, auth, now: () => state.time, newLease: () => `lease${++leases}`, log: (...args) => state.logs.push(args), batchSize, maxBatches });
    const request = { auth: { uid: 'owner', token: { auth_time: state.time / 1000 } }, data: { expectedUid: 'owner', expectedCreatedAt: state.user.metadata.creationTime, confirm: true, receipt: 'a'.repeat(64) } };
    return { service, state, docs, request, job: () => docs.get('account_deletions/owner') };
}

test('server requires authentication, explicit confirmation, recent auth_time and matching session before writes', async () => {
    for (const mutate of [r => { r.auth = null; }, r => { r.data.confirm = false; }, r => { r.data.uid = 'other'; }, r => { r.data.expectedUid = 'other'; }, r => { r.data.receipt = 'guess'; }, r => { r.auth.token.auth_time -= 61; }, r => { r.auth.token.auth_time += 1; }, r => { delete r.auth.token.auth_time; }]) {
        const app = fixture(); mutate(app.request);
        await assert.rejects(app.service.requestDeletion(app.request));
        assert.equal(app.job(), undefined); assert.deepEqual(app.state.deletes, []);
    }
});

test('durable job deletes ONLY owned private itineraries, profile, then Auth; receipt has no personal data', async () => {
    const app = fixture();
    const result = await app.service.requestDeletion(app.request);
    assert.equal(result.state, 'completed');
    assert.deepEqual(app.state.deletes, ['itineraries/trip0', 'itineraries/trip1', 'itineraries/trip2', 'users/owner', 'auth/owner']);
    for (const path of ['users/other', 'itineraries/other', 'shared_itineraries/public']) assert.equal(app.docs.has(path), true);
    assert.deepEqual(Object.keys(result).sort(), ['attempts', 'nextAttemptAt', 'receipt', 'stage', 'state']);
    assert.equal(app.job().stage, 'done');
    assert.equal((await app.service.status({ data: { receipt: app.request.data.receipt } })).state, 'completed');
});

test('failure to persist the initial job cannot delete anything', async () => {
    const app = fixture(); app.state.fail = () => true;
    await assert.rejects(app.service.requestDeletion(app.request));
    assert.deepEqual(app.state.deletes, []); assert.equal(app.job(), undefined);
});

test('failed itinerary batch rolls back both data and checkpoint, then scheduler retries', async () => {
    const app = fixture();
    app.state.fail = writes => writes.some(([op, path]) => op === 'delete' && path.startsWith('itineraries/'));
    const result = await app.service.requestDeletion(app.request);
    assert.equal(result.state, 'pending'); assert.equal(result.stage, 'itineraries');
    assert.deepEqual(app.state.deletes, []);
    await app.service.retryDue(); assert.equal(app.job().attempts, 1);
    app.state.fail = null; app.state.time += 60_001;
    await app.service.retryDue(); assert.equal(app.job().state, 'completed');
});

test('profile failure retains profile checkpoint; Auth is not attempted until next retry', async () => {
    const app = fixture();
    app.state.fail = writes => writes.some(([op, path]) => op === 'delete' && path === 'users/owner');
    const result = await app.service.requestDeletion(app.request);
    assert.equal(result.stage, 'profile'); assert.equal(app.state.user.uid, 'owner');
    assert.equal(app.docs.has('users/owner'), true);
    app.state.fail = null; app.state.time += 60_001;
    await app.service.retryDue(); assert.equal(app.job().state, 'completed');
    assert.equal(app.state.deletes.filter(path => path === 'itineraries/trip0').length, 1);
});

test('Auth outage stays pending; repeat request returns same receipt and respects backoff', async () => {
    const app = fixture(); app.state.beforeAuth = () => { throw new Error('Auth offline'); };
    const first = await app.service.requestDeletion(app.request);
    assert.equal(first.state, 'pending'); assert.equal(first.stage, 'auth');
    const repeat = await app.service.requestDeletion({ ...app.request, data: { ...app.request.data, receipt: 'b'.repeat(64) } });
    assert.equal(repeat.receipt, first.receipt); assert.equal(app.job().attempts, 1);
    app.state.beforeAuth = null; app.state.time += 60_001;
    await app.service.retryDue(); assert.equal(app.job().state, 'completed');
});

test('Auth succeeds but response/checkpoint is lost: not-found safely finishes on retry', async () => {
    const app = fixture();
    app.state.fail = writes => writes.some(([op, path, job]) => path === 'account_deletions/owner' && job?.state === 'completed');
    assert.equal((await app.service.requestDeletion(app.request)).state, 'pending');
    assert.equal(app.state.user, null); assert.equal(app.job().stage, 'auth');
    app.state.fail = null; app.state.time += 60_001;
    await app.service.retryDue(); assert.equal(app.job().state, 'completed');
    assert.equal(app.state.deletes.filter(path => path === 'auth/owner').length, 1);
});

test('bounded batches release their lease and resume without loading every itinerary at once', async () => {
    const app = fixture({ trips: 5, maxBatches: 1 });
    await app.service.requestDeletion(app.request);
    assert.equal(app.job().state, 'pending'); assert.equal(app.job().leaseOwner, null);
    for (let i = 0; i < 4; i++) await app.service.retryDue();
    assert.equal(app.job().state, 'completed'); assert.equal(app.job().attempts, 4);
});

test('concurrent calls have one lease and cannot run Auth deletion twice', async () => {
    const app = fixture();
    const results = await Promise.all([app.service.requestDeletion(app.request), app.service.requestDeletion(app.request)]);
    assert.equal(app.job().state, 'completed');
    assert.equal(app.state.deletes.filter(path => path === 'auth/owner').length, 1);
    assert.equal(results[0].receipt, results[1].receipt);
});

test('crash lease delays retries but expiry permits recovery; old lease cannot checkpoint', async () => {
    const app = fixture({ maxBatches: 1 });
    await app.service.requestDeletion(app.request);
    Object.assign(app.job(), { leaseOwner: 'crashed', leaseUntil: app.state.time + LEASE_MS, nextAttemptAt: app.state.time + LEASE_MS });
    await app.service.retryDue(); assert.equal(app.job().attempts, 1);
    app.state.time += LEASE_MS + 1;
    await app.service.retryDue(); assert.equal(app.job().attempts, 2);
});

test('a different Auth generation with reused UID is blocked without deleting its data', async () => {
    const app = fixture({ maxBatches: 1 });
    await app.service.requestDeletion(app.request);
    app.state.user.metadata.creationTime = 'new-identity';
    app.docs.set('itineraries/new', { userId: 'owner' });
    const count = app.state.deletes.length;
    await app.service.retryDue();
    assert.equal(app.job().state, 'blocked'); assert.equal(app.state.deletes.length, count);
    assert.equal(app.docs.has('itineraries/new'), true);
    await assert.rejects(app.service.assertNotDeleting('owner'), { code: 'failed-precondition' });
});

test('completed old job does not block an explicitly confirmed fresh account generation', async () => {
    const app = fixture(); await app.service.requestDeletion(app.request);
    app.state.time += 2000;
    app.state.user = { uid: 'owner', metadata: { creationTime: new Date(app.state.time).toISOString() } };
    app.request.auth.token.auth_time = app.state.time / 1000;
    app.request.data.expectedCreatedAt = app.state.user.metadata.creationTime;
    app.request.data.receipt = 'b'.repeat(64);
    const next = await app.service.requestDeletion(app.request);
    assert.equal(next.state, 'completed'); assert.equal(next.receipt, 'b'.repeat(64));
    assert.equal(app.docs.get(`account_deletion_receipts/${'a'.repeat(64)}`).state, 'completed');
});

test('receipts require 256-bit format and disclose only status; signed lookup cannot target someone else', async () => {
    const app = fixture({ maxBatches: 1 }); await app.service.requestDeletion(app.request);
    await assert.rejects(app.service.status({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(app.service.status({ data: { receipt: 'x' } }), { code: 'invalid-argument' });
    assert.deepEqual(await app.service.status({ data: { receipt: 'c'.repeat(64) } }), { state: 'not-found' });
    assert.equal((await app.service.status({ auth: app.request.auth, data: {} })).receipt, app.request.data.receipt);
    await assert.rejects(app.service.assertNotDeleting('owner'));
});

test('stale token or stale expected identity cannot delete a re-created account with the same UID', async () => {
    for (const stale of ['token', 'identity']) {
        const app = fixture(); await app.service.requestDeletion(app.request);
        app.state.time += 2000;
        app.state.user = { uid: 'owner', metadata: { creationTime: new Date(app.state.time).toISOString() } };
        app.request.data.receipt = 'b'.repeat(64);
        if (stale === 'token') app.request.data.expectedCreatedAt = app.state.user.metadata.creationTime;
        else app.request.auth.token.auth_time = app.state.time / 1000;
        const count = app.state.deletes.length;
        await assert.rejects(app.service.requestDeletion(app.request));
        assert.equal(app.state.deletes.length, count);
        assert.equal(app.job().receipt, 'a'.repeat(64));
    }
});

test('a worker whose lease expires during Auth deletion cannot record completion under the old lease', async () => {
    const app = fixture();
    app.state.beforeAuth = () => { app.state.time += LEASE_MS + 1; };
    assert.equal((await app.service.requestDeletion(app.request)).state, 'pending');
    assert.equal(app.state.user, null);
    app.state.beforeAuth = null;
    await app.service.retryDue();
    assert.equal(app.job().state, 'completed'); assert.equal(app.job().attempts, 2);
});
