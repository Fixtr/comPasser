import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountDeletionClient } from '../src/domains/profile/services/account-deletion-client.mjs';

function fixture() {
    const values = new Map();
    const state = { user: { uid: 'owner', metadata: { creationTime: 'first' } }, failure: null, result: { state: 'pending', receipt: 'a'.repeat(64) }, failStorage: false, submitted: [], reads: [] };
    const storage = {
        getItem: key => values.get(key) || null,
        setItem(key, value) { if (state.failStorage) throw new Error('storage disabled'); values.set(key, value); },
        removeItem: key => values.delete(key),
    };
    const create = () => createAccountDeletionClient({
        storage, getCurrentUser: () => state.user, randomReceipt: () => 'a'.repeat(64),
        async submit(data) {
            assert.equal(JSON.parse(values.get('accountDeletionReceipt:owner')).receipt, data.receipt, 'receipt persisted before request');
            state.submitted.push(data);
            if (state.failure) throw state.failure;
            return state.result;
        },
        async getStatus(data) { state.reads.push(data); return state.result; },
    });
    return { state, values, create, client: create() };
}
test('receipt is persisted before submission; server UID assertion is bound to initiating user', async () => {
    const app = fixture(); assert.equal((await app.client.request('owner')).state, 'pending');
    assert.deepEqual(app.state.submitted, [{ confirm: true, receipt: 'a'.repeat(64), expectedUid: 'owner', expectedCreatedAt: 'first' }]);
});
test('storage failure aborts before submission', async () => {
    const app = fixture(); app.state.failStorage = true;
    await assert.rejects(app.client.request('owner')); assert.deepEqual(app.state.submitted, []);
});
test('lost response retains receipt across reload and reads status without an Auth identity', async () => {
    const app = fixture(); app.state.failure = new Error('lost response');
    await assert.rejects(app.client.request('owner'), error => error.deletionStatusUnknown === true);
    const user = app.state.user; app.state.user = null; app.state.result.state = 'completed';
    const reloaded = app.create();
    assert.equal((await reloaded.status(user)).state, 'completed');
    assert.deepEqual(app.state.reads, [{ receipt: 'a'.repeat(64) }]);
});
test('explicit server recent-login rejection clears receipt and maps to existing re-login flow', async () => {
    const app = fixture(); app.state.failure = Object.assign(new Error('old'), { code: 'functions/failed-precondition', details: { reason: 'requires-recent-login' } });
    await assert.rejects(app.client.request('owner'), { code: 'auth/requires-recent-login' });
    assert.equal(app.client.hasReceipt(app.state.user), false);
});
test('changed account cannot submit, and server race rejection does not report success', async () => {
    const app = fixture(); await assert.rejects(app.client.request('other'), { code: 'profile/account-changed' });
    assert.deepEqual(app.state.submitted, []);
    app.state.failure = Object.assign(new Error('changed'), { details: { reason: 'account-changed' } });
    await assert.rejects(app.client.request('owner'), { code: 'profile/account-changed' });
    assert.equal(app.client.hasReceipt(app.state.user), false);
});
test('repeat request reconciles to existing server receipt without creating a second job', async () => {
    const app = fixture(); app.state.result.receipt = 'b'.repeat(64);
    await app.client.request('owner'); await app.client.request('owner');
    assert.equal(app.state.submitted[1].receipt, 'b'.repeat(64));
});
test('new identity with the same UID does not reuse the previous account receipt', async () => {
    const app = fixture(); await app.client.request('owner');
    app.state.user.metadata.creationTime = 'second';
    assert.equal(app.client.hasReceipt(app.state.user), false);
    await app.client.status(app.state.user); assert.deepEqual(app.state.reads, [{}]);
});
test('missing or malformed stored receipt uses read-only signed lookup', async () => {
    for (const raw of ['invalid json', JSON.stringify({ identity: 'first', receipt: 'short' })]) {
        const app = fixture(); app.values.set('accountDeletionReceipt:owner', raw);
        await app.client.status(app.state.user); assert.deepEqual(app.state.reads, [{}]); assert.deepEqual(app.state.submitted, []);
    }
});

test('a failed duplicate attempt does not discard a previously accepted receipt', async () => {
    const app = fixture(); await app.client.request('owner');
    app.state.failure = Object.assign(new Error('Auth already gone'), { code: 'functions/unauthenticated' });
    await assert.rejects(app.client.request('owner'));
    assert.equal(app.client.hasReceipt(app.state.user), true);
});
