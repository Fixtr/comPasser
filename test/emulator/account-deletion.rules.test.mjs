// Run only against the explicitly selected demo Firestore emulator, never production.
import test from 'node:test';
import assert from 'node:assert/strict';
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Local Firestore emulator required');
const project = 'demo-hackerton-deletion';
const root = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(uid, authTime = 2000) {
    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid, aud: project, iss: `https://securetoken.google.com/${project}`, iat: 2000, exp: 9999999999, auth_time: authTime, firebase: { sign_in_provider: 'password' } })}.`;
}
function fields(data) {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value }]));
}
async function request(path, { method = 'GET', user, authTime, data, admin = false } = {}) {
    return fetch(`${root}/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : user ? { Authorization: `Bearer ${token(user, authTime)}` } : {}) }, ...(data ? { body: JSON.stringify({ fields: fields(data) }) } : {}) });
}
async function seed(path, data) { const response = await request(path, { method: 'PATCH', admin: true, data }); assert.equal(response.status, 200, await response.text()); }

test('normal owner writes are allowed; active job blocks profile, private and shared creation', async () => {
    for (const state of ['pending', 'blocked']) {
        const uid = `owner-${state}`;
        assert.equal((await request(`users/${uid}`, { method: 'PATCH', user: uid, data: { birthday: '2000' } })).status, 200);
        await seed(`itineraries/${uid}`, { userId: uid, title: 'old' });
        await seed(`account_deletions/${uid}`, { state });
        for (const [path, data] of [[`users/${uid}`, { birthday: '2001' }], [`itineraries/${uid}-new`, { userId: uid, title: 'new' }], [`itineraries/${uid}`, { userId: uid, title: 'rename' }], [`shared_itineraries/${uid}`, { title: 'new' }]]) {
            assert.equal((await request(path, { method: 'PATCH', user: uid, data })).status, 403, path);
        }
        assert.equal((await request(`users/${uid}`, { user: uid })).status, 200);
    }
});
test('job is owner-readable but never client-writable; receipt is never client-readable', async () => {
    await seed('account_deletions/owner', { state: 'pending' });
    await seed('account_deletion_receipts/receipt', { state: 'pending' });
    assert.equal((await request('account_deletions/owner', { user: 'owner' })).status, 200);
    for (const user of ['other', undefined]) assert.equal((await request('account_deletions/owner', { user })).status, 403);
    assert.equal((await request('account_deletions/owner', { user: 'owner', method: 'PATCH', data: { state: 'completed' } })).status, 403);
    assert.equal((await request('account_deletion_receipts/receipt', { user: 'owner' })).status, 403);
    assert.equal((await request('account_deletions/owner', { user: 'owner', method: 'DELETE' })).status, 403);
});
test('completed job fences old tokens but permits a fresh identity sign-in after completion', async () => {
    await seed('account_deletions/reenrolled', { state: 'completed', completedAt: 2_000_000 });
    for (const [authTime, expected] of [[1999, 403], [2000, 403], [2001, 200]]) {
        const response = await request('users/reenrolled', { method: 'PATCH', user: 'reenrolled', authTime, data: { birthday: '2000' } });
        assert.equal(response.status, expected);
    }
});
test('other owners retain access and existing public shares remain guest-readable and immutable', async () => {
    assert.equal((await request('users/unaffected', { method: 'PATCH', user: 'unaffected', data: { birthday: '2000' } })).status, 200);
    await seed('shared_itineraries/public', { title: 'public' });
    assert.equal((await request('shared_itineraries/public')).status, 200);
    assert.equal((await request('shared_itineraries/public', { method: 'PATCH', user: 'unaffected', data: { title: 'changed' } })).status, 403);
    assert.equal((await request('users/unaffected', { user: 'other' })).status, 403);
});
