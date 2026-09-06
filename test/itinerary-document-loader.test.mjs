import test from 'node:test';
import assert from 'node:assert/strict';
import { createItineraryDocumentLoader } from '../src/domains/itinerary/services/itinerary-document-loader.mjs';

const privatePlan = { days: [{ date: '2026-09-06' }] };
const sharedPlan = { days: [{ date: '2026-09-07' }] };

function fixture({ privateDocument = null, sharedDocument = null, privateError, sharedError } = {}) {
    const reads = [];
    const load = createItineraryDocumentLoader({
        async readDocument(collectionName, documentId) {
            reads.push([collectionName, documentId]);
            if (collectionName === 'itineraries') {
                if (privateError) throw privateError;
                return privateDocument;
            }
            assert.equal(collectionName, 'shared_itineraries');
            if (sharedError) throw sharedError;
            return sharedDocument;
        }
    });
    return { load, reads };
}

test('a guest reads a shared itinerary without attempting to read a private document', async () => {
    const { load, reads } = fixture({
        privateDocument: { userId: 'owner', itineraryPlan: privatePlan },
        sharedDocument: { itineraryPlan: sharedPlan }
    });
    assert.deepEqual(await load('trip'), { itineraryPlan: sharedPlan, access: 'shared' });
    assert.deepEqual(reads, [['shared_itineraries', 'trip']]);
});

test('a guest cannot load an unshared private itinerary', async () => {
    const { load, reads } = fixture({ privateDocument: { userId: 'owner', itineraryPlan: privatePlan } });
    assert.equal(await load('trip'), null);
    assert.deepEqual(reads, [['shared_itineraries', 'trip']]);
});

test('an explicit shared route only reads the shared copy even for its logged-in owner', async () => {
    const { load, reads } = fixture({
        privateDocument: { userId: 'owner', itineraryPlan: privatePlan },
        sharedDocument: { itineraryPlan: sharedPlan }
    });
    assert.deepEqual(await load('trip', { sharedOnly: true, userId: 'owner' }), {
        itineraryPlan: sharedPlan, access: 'shared'
    });
    assert.deepEqual(reads, [['shared_itineraries', 'trip']]);
});

test('an explicit shared route never falls back to a private copy', async () => {
    const { load, reads } = fixture({ privateDocument: { userId: 'owner', itineraryPlan: privatePlan } });
    assert.equal(await load('trip', { sharedOnly: true, userId: 'owner' }), null);
    assert.deepEqual(reads, [['shared_itineraries', 'trip']]);
});

test('a logged-in legacy route loads its owner’s private itinerary first', async () => {
    const { load, reads } = fixture({
        privateDocument: { userId: 'owner', itineraryPlan: privatePlan },
        sharedDocument: { itineraryPlan: sharedPlan }
    });
    assert.deepEqual(await load('trip', { userId: 'owner' }), { itineraryPlan: privatePlan, access: 'private' });
    assert.deepEqual(reads, [['itineraries', 'trip']]);
});

test('a logged-in legacy route checks the shared copy when the private document is missing', async () => {
    const { load, reads } = fixture({ sharedDocument: { itineraryPlan: sharedPlan } });
    assert.deepEqual(await load('trip', { userId: 'owner' }), { itineraryPlan: sharedPlan, access: 'shared' });
    assert.deepEqual(reads, [['itineraries', 'trip'], ['shared_itineraries', 'trip']]);
});

for (const code of ['permission-denied', 'firestore/permission-denied']) {
    test(`a denied private read (${code}) can still resolve a shared legacy link`, async () => {
        const { load } = fixture({
            privateError: Object.assign(new Error('Denied'), { code }),
            sharedDocument: { itineraryPlan: sharedPlan }
        });
        assert.deepEqual(await load('trip', { userId: 'visitor' }), { itineraryPlan: sharedPlan, access: 'shared' });
    });
}

test('another owner’s private document is not returned, even if a cache supplies it', async () => {
    const { load } = fixture({ privateDocument: { userId: 'someone-else', itineraryPlan: privatePlan } });
    assert.equal(await load('trip', { userId: 'visitor' }), null);
});

test('an owner mismatch still permits reading a separately shared copy', async () => {
    const { load } = fixture({
        privateDocument: { userId: 'someone-else', itineraryPlan: privatePlan },
        sharedDocument: { itineraryPlan: sharedPlan }
    });
    assert.deepEqual(await load('trip', { userId: 'visitor' }), { itineraryPlan: sharedPlan, access: 'shared' });
});

test('a denied private read and missing shared copy returns not found', async () => {
    const { load } = fixture({ privateError: Object.assign(new Error('Denied'), { code: 'permission-denied' }) });
    assert.equal(await load('trip', { userId: 'visitor' }), null);
});

test('a private network failure is not mistaken for a missing or shared itinerary', async () => {
    const error = Object.assign(new Error('Network unavailable'), { code: 'unavailable' });
    const { load, reads } = fixture({ privateError: error, sharedDocument: { itineraryPlan: sharedPlan } });
    await assert.rejects(load('trip', { userId: 'owner' }), thrown => thrown === error);
    assert.deepEqual(reads, [['itineraries', 'trip']]);
});

test('a shared network failure is propagated both for guests and after a denied private read', async () => {
    const error = Object.assign(new Error('Network unavailable'), { code: 'unavailable' });
    const guest = fixture({ sharedError: error });
    await assert.rejects(guest.load('trip'), thrown => thrown === error);

    const legacy = fixture({
        privateError: Object.assign(new Error('Denied'), { code: 'permission-denied' }), sharedError: error
    });
    await assert.rejects(legacy.load('trip', { userId: 'visitor' }), thrown => thrown === error);
});
