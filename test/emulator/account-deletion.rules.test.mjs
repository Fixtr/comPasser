// Run only against the explicitly selected demo Firestore emulator, never production.
import './assert-local.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const host = process.env.FIRESTORE_EMULATOR_HOST;
const project = 'demo-hackerton-deletion';
const root = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(uid, authTime = 2000) {
    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid, aud: project, iss: `https://securetoken.google.com/${project}`, iat: 2000, exp: 9999999999, auth_time: authTime, firebase: { sign_in_provider: 'password' } })}.`;
}
const value = v => v === null ? { nullValue: null } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'object' ? { mapValue: { fields: fields(v) } } : { stringValue: v };
function fields(data) {
    return Object.fromEntries(Object.entries(data).map(([key, entry]) => [key, value(entry)]));
}
async function request(path, { method = 'GET', user, authTime, data, admin = false } = {}) {
    return fetch(`${root}/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : user ? { Authorization: `Bearer ${token(user, authTime)}` } : {}) }, ...(data ? { body: JSON.stringify({ fields: fields(data) }) } : {}) });
}
async function seed(path, data) { const response = await request(path, { method: 'PATCH', admin: true, data }); assert.equal(response.status, 200, await response.text()); }

test('profile writes allow only birthday and cannot restore retired identity fields', async () => {
    assert.equal((await request('users/new-profile', { method: 'PATCH', user: 'new-profile', data: { birthday: '2000-01-01' } })).status, 200);
    for (const data of [
        { phoneNumber: '01000000000' },
        { isVerified: 'true' },
        { birthday: '2000-01-01', phoneNumber: '01000000000' },
    ]) assert.equal((await request('users/rejected-profile', { method: 'PATCH', user: 'rejected-profile', data })).status, 403);

    await seed('users/legacy-profile', { birthday: '1990-01-01', phoneNumber: 'legacy', isVerified: 'true' });
    const birthdayUpdate = await request('users/legacy-profile?updateMask.fieldPaths=birthday', {
        method: 'PATCH', user: 'legacy-profile', data: { birthday: '1991-01-01' },
    });
    assert.equal(birthdayUpdate.status, 200, await birthdayUpdate.text());
    assert.equal((await request('users/legacy-profile', { method: 'PATCH', user: 'legacy-profile', data: { phoneNumber: 'restored' } })).status, 403);
    assert.equal((await request('users/legacy-profile', { method: 'DELETE', user: 'legacy-profile' })).status, 403);
});

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

const base=`projects/${project}/databases/(default)/documents`;
// Mirrors the SDK: serverTimestamp() is sent as a REQUEST_TIME transform on the same write.
const serverCreatedAt=[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}];
function commit(user, writes) {
    return fetch(`${root}:commit`, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token(user)}`},body:JSON.stringify({writes})});
}
async function publishLinked(id, sourceId, ownerId, user=ownerId, {snapshot={itineraryPlan:{days:'test snapshot'}}, transforms=serverCreatedAt}={}) {
    return commit(user, [
        {update:{name:`${base}/shared_itineraries/${id}`,fields:fields({sourceId,ownerId,...snapshot})},updateTransforms:transforms},
        {update:{name:`${base}/shared_itinerary_status/${id}`,fields:fields({sourceId,ownerId})}}
    ]);
}
function createTrip(id, user, data, transforms=serverCreatedAt) {
    return commit(user, [{update:{name:`${base}/itineraries/${id}`,fields:fields(data)},updateTransforms:transforms,currentDocument:{exists:false}}]);
}

test('private trip creation accepts only the saveItinerary shape', async()=>{
    const plan={days:'plan'};
    for(const [id,title] of [['untitledTrip',null],['titledTrip','서울 · 8월 20일'],['maxTitleTrip','a'.repeat(100)]]) {
        const created=await createTrip(id,'creator',{userId:'creator',itineraryPlan:plan,title});
        assert.equal(created.status,200,`${id}: ${await created.text()}`);
    }
    for(const [id,data,transforms] of [
        ['hugeTitle',{userId:'creator',itineraryPlan:plan,title:'a'.repeat(101)}],
        ['emptyTitle',{userId:'creator',itineraryPlan:plan,title:''}],
        ['stringPlan',{userId:'creator',itineraryPlan:'plan',title:null}],
        ['extraKey',{userId:'creator',itineraryPlan:plan,title:null,isAdmin:'true'}],
        ['clientCreatedAt',{userId:'creator',itineraryPlan:plan,title:null,createdAt:1},[]],
        ['noCreatedAt',{userId:'creator',itineraryPlan:plan,title:null},[]],
        ['otherOwner',{userId:'victim',itineraryPlan:plan,title:null}],
    ]) assert.equal((await createTrip(id,'creator',data,transforms)).status,403,id);
});

test('share snapshots need a map plan and a server createdAt', async()=>{
    await seed('itineraries/shapeTrip',{userId:'shapeOwner'});
    assert.equal((await publishLinked('stringPlanShare','shapeTrip','shapeOwner','shapeOwner',{snapshot:{itineraryPlan:'text'}})).status,403);
    assert.equal((await publishLinked('clientTimeShare','shapeTrip','shapeOwner','shapeOwner',{snapshot:{itineraryPlan:{days:'x'},createdAt:1},transforms:[]})).status,403);
    const created=await publishLinked('shapeShare','shapeTrip','shapeOwner');
    assert.equal(created.status,200,await created.text());
});

test('open-share access recheck detects source deletion despite cached Firestore content',async()=>{
    const {initializeApp,deleteApp}=await import('firebase/app');
    const {getFirestore,connectFirestoreEmulator,doc,getDocFromServer,terminate}=await import('firebase/firestore');
    const {watchSharedAccess}=await import('../../src/domains/itinerary/services/shared-access-watch.mjs');
    await seed('itineraries/liveSource',{userId:'liveOwner'});
    assert.equal((await publishLinked('liveShare','liveSource','liveOwner')).status,200);
    const app=initializeApp({projectId:project},'share-revocation-test');
    const db=getFirestore(app);
    const [hostname,port]=host.split(':');
    connectFirestoreEmulator(db,hostname,Number(port));
    let stop,timer;
    try {
        const reference=doc(db,'shared_itineraries','liveShare');
        assert.equal((await getDocFromServer(reference)).exists(),true);
        let revokedResolve;
        const revoked=new Promise(resolve=>revokedResolve=resolve);
        stop=watchSharedAccess(async()=>(await getDocFromServer(reference)).exists(),revokedResolve,{intervalMs:30,timeoutMs:3000});
        const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('recheck timeout')),10000);});
        assert.equal((await request('itineraries/liveSource',{method:'DELETE',user:'liveOwner'})).status,200);
        await Promise.race([revoked,deadline]);
        await assert.rejects(getDocFromServer(reference),error=>error.code==='permission-denied');
    } finally {clearTimeout(timer);stop?.();await terminate(db);await deleteApp(app);}
});

test('linked share content is revoked on source deletion, receipt is public, independent copy survives', async()=>{
    await seed('itineraries/sourceTrip',{userId:'shareOwner'});
    await seed('itineraries/recipientCopy',{userId:'recipient',title:'independent copy'});
    const created=await publishLinked('linkedShare','sourceTrip','shareOwner');
    assert.equal(created.status,200,await created.text());
    assert.equal((await request('shared_itineraries/linkedShare')).status,200);
    assert.equal((await request('shared_itinerary_status/linkedShare')).status,403);
    assert.equal((await request('itineraries/sourceTrip')).status,403);
    assert.equal((await request('itineraries/sourceTrip',{method:'DELETE',user:'recipient'})).status,403);
    assert.equal((await request('itineraries/sourceTrip',{method:'DELETE',user:'shareOwner'})).status,200);
    for(const user of [undefined,'shareOwner','recipient']) {
        assert.equal((await request('shared_itineraries/linkedShare',{user})).status,403);
        const receipt=await request('shared_itinerary_status/linkedShare',{user});
        assert.equal(receipt.status,200);
        assert.deepEqual(Object.keys((await receipt.json()).fields).sort(),['ownerId','sourceId']);
    }
    assert.equal((await request('itineraries/recipientCopy',{user:'recipient'})).status,200);
    // Reusing the private ID under another owner must not revive the old snapshot.
    await seed('itineraries/sourceTrip',{userId:'someoneElse'});
    assert.equal((await request('shared_itineraries/linkedShare')).status,403);
});

test('unlinked/forged/missing-source shares and mutable receipts are rejected',async()=>{
    await seed('itineraries/ownedTrip',{userId:'legitimate'});
    assert.equal((await publishLinked('forged','ownedTrip','attacker')).status,403);
    assert.equal((await publishLinked('missing','absentTrip','legitimate')).status,403);
    assert.equal((await publishLinked('wrongOwner','ownedTrip','legitimate','attacker')).status,403);
    assert.equal((await request('shared_itineraries/unlinked',{method:'PATCH',user:'legitimate',data:{itineraryPlan:'unlinked'}})).status,403);
    assert.equal((await request('shared_itineraries/noReceipt',{method:'PATCH',user:'legitimate',data:{sourceId:'ownedTrip',ownerId:'legitimate'}})).status,403);
    assert.equal((await request('shared_itinerary_status/forgedReceipt',{method:'PATCH',user:'legitimate',data:{sourceId:'ownedTrip',ownerId:'legitimate'}})).status,403);
    const created=await publishLinked('immutable','ownedTrip','legitimate');
    assert.equal(created.status,200,await created.text());
    for(const path of ['shared_itineraries/immutable','shared_itinerary_status/immutable']) {
        assert.equal((await request(path,{method:'DELETE',user:'legitimate'})).status,403);
        assert.equal((await request(path,{method:'PATCH',user:'legitimate',data:{sourceId:'other',ownerId:'legitimate'}})).status,403);
    }
    assert.equal((await request('shared_itineraries/neverCreated')).status,404);
});
