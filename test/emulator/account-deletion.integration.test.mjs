import './assert-local.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../functions/index.js', import.meta.url));
const admin = require('firebase-admin');
const { createAccountDeletion } = require('./account-deletion');
const app = admin.initializeApp({ projectId: 'demo-hackerton-deletion' }, 'deletion-integration');
const db = app.firestore(); const auth = app.auth();
test.after(() => app.delete());

test('real Admin SDK transactions and Auth emulator: failure checkpoint, retry, receipt after Auth deletion', async () => {
    const uid = 'integration-owner';
    let now; let authOffline = true;
    const user = await auth.createUser({ uid });
    now = Math.max(Date.now(), Date.parse(user.metadata.creationTime));
    await db.collection('users').doc(uid).set({ phoneNumber: 'fixture-only' });
    await db.collection('itineraries').doc('integration-trip').set({ userId: uid });
    await db.collection('itineraries').doc('integration-other').set({ userId: 'other' });
    const service = createAccountDeletion({ db, now: () => now, log: () => {}, auth: {
        getUser: id => auth.getUser(id),
        deleteUser(id) { if (authOffline) throw new Error('simulated outage'); return auth.deleteUser(id); },
    } });
    const receipt = 'd'.repeat(64);
    const result = await service.requestDeletion({ auth: { uid, token: { auth_time: Math.floor(now / 1000) } }, data: { expectedUid: uid, expectedCreatedAt: user.metadata.creationTime, confirm: true, receipt } });
    assert.equal(result.state, 'pending'); assert.equal(result.stage, 'auth');
    assert.equal((await auth.getUser(uid)).metadata.creationTime, user.metadata.creationTime);
    assert.equal((await db.collection('users').doc(uid).get()).exists, false);
    assert.equal((await db.collection('itineraries').doc('integration-other').get()).exists, true);
    now += 60_001; authOffline = false;
    await service.retryDue();
    await assert.rejects(auth.getUser(uid), { code: 'auth/user-not-found' });
    assert.equal((await service.status({ data: { receipt } })).state, 'completed');
    assert.equal((await db.collection('account_deletions').doc(uid).get()).data().state, 'completed');
});
