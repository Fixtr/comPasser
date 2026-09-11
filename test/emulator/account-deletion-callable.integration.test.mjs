import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
const require = createRequire(new URL('../../functions/index.js', import.meta.url));
for (const variable of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[variable] || '')) throw new Error(`Local ${variable} required`);
}
if (process.env.GCLOUD_PROJECT !== 'demo-hackerton-deletion') throw new Error('Demo project required');
const express = require('express');
const endpoints = require('./index');
const admin = require('firebase-admin');

test('actual callable HTTP protocol: verified Auth token, durable delete, unauthenticated receipt lookup', async () => {
    const serverApp = express();
    serverApp.use(express.json());
    serverApp.post('/requestAccountDeletion', endpoints.requestAccountDeletion);
    serverApp.post('/getAccountDeletionStatus', endpoints.getAccountDeletionStatus);
    const server = serverApp.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
        const uid = 'callable-owner'; const email = 'callable@example.invalid'; const password = 'fixture-password';
        const user = await admin.auth().createUser({ uid, email, password });
        const authResponse = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
        });
        assert.equal(authResponse.status, 200);
        const { idToken } = await authResponse.json();
        const receipt = 'e'.repeat(64);
        const root = `http://127.0.0.1:${server.address().port}`;
        const call = (endpoint, data, token) => fetch(`${root}/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }) });
        assert.equal((await call('requestAccountDeletion', { confirm: true, receipt })).status, 401);
        const accepted = await call('requestAccountDeletion', { confirm: true, receipt, expectedUid: uid, expectedCreatedAt: user.metadata.creationTime }, idToken);
        assert.equal(accepted.status, 200);
        assert.equal((await accepted.json()).result.state, 'completed');
        const status = await call('getAccountDeletionStatus', { receipt });
        assert.equal(status.status, 200);
        assert.equal((await status.json()).result.state, 'completed');
        await assert.rejects(admin.auth().getUser(uid), { code: 'auth/user-not-found' });
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await admin.app().delete();
    }
});
