// Admin SDK boundaries are injected so failure/retry tests never touch real accounts.
const { randomUUID } = require('node:crypto');
const RECEIPT = /^[a-f0-9]{64}$/;
const JOBS = 'account_deletions';
const RECEIPTS = 'account_deletion_receipts';
const LEASE_MS = 10 * 60 * 1000; // Longer than either deployed function's 60s lifetime.
const ATTENTION_AGE_MS = 60 * 60 * 1000;
const ATTENTION_ATTEMPTS = 3;

function failure(code, message, details) {
    return Object.assign(new Error(message), { code, details });
}

function createAccountDeletion({ db, auth, now = Date.now, newLease = randomUUID, log = console.error, batchSize = 100, maxBatches = 10 }) {
    const jobRef = uid => db.collection(JOBS).doc(uid);
    const receiptRef = receipt => db.collection(RECEIPTS).doc(receipt);
    const publicStatus = job => ({ receipt: job.receipt, state: job.state, stage: job.stage, attempts: job.attempts, nextAttemptAt: job.nextAttemptAt });
    const persist = (tx, ref, job) => {
        tx.set(ref, job);
        // No UID, profile, itinerary, or raw error in the bearer receipt document.
        tx.set(receiptRef(job.receipt), publicStatus(job));
    };
    async function userOrNull(uid) {
        try { return await auth.getUser(uid); }
        catch (error) { if (error.code === 'auth/user-not-found') return null; throw error; }
    }
    async function assertNotDeleting(uid) {
        const snapshot = await jobRef(uid).get();
        if (snapshot.exists && snapshot.data().state !== 'completed') {
            throw failure('failed-precondition', 'Account deletion is in progress.');
        }
    }
    async function status(request) {
        const receipt = request.data?.receipt;
        if (receipt !== undefined) {
            if (!RECEIPT.test(receipt)) throw failure('invalid-argument', 'Invalid receipt.');
            const snapshot = await receiptRef(receipt).get();
            return snapshot.exists ? snapshot.data() : { state: 'not-found' };
        }
        if (!request.auth) throw failure('unauthenticated', 'Sign in first.');
        const [snapshot, user] = await Promise.all([jobRef(request.auth.uid).get(), userOrNull(request.auth.uid)]);
        if (!snapshot.exists || !user || snapshot.data().identityCreatedAt !== user.metadata.creationTime
            || Number(request.auth.token?.auth_time) < Math.floor(Date.parse(user.metadata.creationTime) / 1000)) return { state: 'not-found' };
        return publicStatus(snapshot.data());
    }
    async function requestDeletion(request) {
        if (!request.auth) throw failure('unauthenticated', 'Sign in first.');
        const uid = request.auth.uid;
        if (request.data?.expectedUid !== uid) throw failure('failed-precondition', 'Login account changed.', { reason: 'account-changed' });
        if (request.data?.confirm !== true || !RECEIPT.test(request.data?.receipt || '') || Object.hasOwn(request.data, 'uid') || Object.hasOwn(request.data, 'userId')) {
            throw failure('invalid-argument', 'Explicit confirmation and a receipt are required.');
        }
        const user = await userOrNull(uid);
        if (!user) throw failure('unauthenticated', 'Account no longer exists.');
        if (request.data.expectedCreatedAt !== user.metadata.creationTime) {
            throw failure('failed-precondition', 'Login identity changed.', { reason: 'account-changed' });
        }
        const ref = jobRef(uid);
        const job = await db.runTransaction(async tx => {
            const snapshot = await tx.get(ref);
            const old = snapshot.exists ? snapshot.data() : null;
            // Looking up/resuming an already accepted request never initiates new deletion.
            if (old && old.identityCreatedAt === user.metadata.creationTime) return old;
            if (old && old.state !== 'completed') throw failure('failed-precondition', 'Previous deletion needs review.');
            const age = now() - Number(request.auth.token?.auth_time) * 1000;
            const identityTime = Date.parse(user.metadata.creationTime);
            const authTime = Number(request.auth.token?.auth_time) * 1000;
            if (!Number.isFinite(age) || age < 0 || age > 60_000 || !Number.isFinite(identityTime)
                || authTime < Math.floor(identityTime / 1000) * 1000
                || (old?.state === 'completed' && authTime <= old.completedAt)) {
                throw failure('failed-precondition', 'Sign in again before deletion.', { reason: 'requires-recent-login' });
            }
            const receiptSnapshot = await tx.get(receiptRef(request.data.receipt));
            if (receiptSnapshot.exists) throw failure('invalid-argument', 'Receipt already used.');
            const next = {
                receipt: request.data.receipt, identityCreatedAt: user.metadata.creationTime,
                state: 'pending', stage: 'reviews', attempts: 0,
                createdAt: now(), updatedAt: now(), nextAttemptAt: now(),
                leaseOwner: null, leaseUntil: 0,
            };
            persist(tx, ref, next);
            return next;
        });
        if (job.state === 'pending') await process(uid);
        return status({ data: { receipt: job.receipt } });
    }
    async function process(uid) {
        const ref = jobRef(uid);
        const owner = newLease();
        const claimed = await db.runTransaction(async tx => {
            const snapshot = await tx.get(ref);
            if (!snapshot.exists) return null;
            const job = snapshot.data();
            if (job.state !== 'pending' || job.nextAttemptAt > now() || job.leaseUntil > now()) return null;
            const next = { ...job, leaseOwner: owner, leaseUntil: now() + LEASE_MS, nextAttemptAt: now() + LEASE_MS, attempts: job.attempts + 1, updatedAt: now() };
            persist(tx, ref, next);
            return next;
        });
        if (!claimed) return;
        const owns = job => job?.state === 'pending' && job.receipt === claimed.receipt && job.leaseOwner === owner && job.leaseUntil > now();
        async function change(update, work) {
            return db.runTransaction(async tx => {
                const snapshot = await tx.get(ref);
                const job = snapshot.exists ? snapshot.data() : null;
                if (!owns(job)) return null;
                // Work must finish all reads before any writes (Firestore transaction rule).
                const extra = work ? await work(tx) : {};
                const next = { ...job, ...extra, ...update, updatedAt: now() };
                persist(tx, ref, next);
                return next;
            });
        }
        async function blockIdentity() {
            const blocked = await change({ state: 'blocked', lastErrorCode: 'identity-changed', leaseOwner: null, leaseUntil: 0 });
            if (blocked) log('Account deletion needs operator attention', { event: 'account_deletion_attention', reason: 'blocked', stage: blocked.stage });
        }
        try {
            const user = await userOrNull(uid);
            if (user && user.metadata.creationTime !== claimed.identityCreatedAt) {
                await blockIdentity();
                return;
            }
            let job = claimed;
            for (let batch = 0; job?.stage === 'reviews' && batch < maxBatches; batch++) {
                job = await change({}, async tx => {
                    const docs = await tx.get(db.collection('course_reviews').where('userId', '==', uid).limit(batchSize));
                    for (const doc of docs.docs) tx.delete(doc.ref);
                    return docs.empty ? { stage: 'courses' } : {};
                });
            }
            for (let batch = 0; job?.stage === 'courses' && batch < maxBatches; batch++) {
                job = await change({}, async tx => {
                    const docs = await tx.get(db.collection('public_courses').where('ownerId', '==', uid).limit(batchSize));
                    for (const doc of docs.docs) tx.delete(doc.ref);
                    return docs.empty ? { stage: 'itineraries' } : {};
                });
            }
            for (let batch = 0; job?.stage === 'itineraries' && batch < maxBatches; batch++) {
                job = await change({}, async tx => {
                    const docs = await tx.get(db.collection('itineraries').where('userId', '==', uid).limit(batchSize));
                    for (const doc of docs.docs) tx.delete(doc.ref);
                    return docs.empty ? { stage: 'profile' } : {};
                });
            }
            if (job?.stage === 'profile') {
                job = await change({ stage: 'auth' }, async tx => {
                    const saveRef = db.collection('discovery_saves').doc(uid);
                    const saved = await tx.get(saveRef);
                    const refs = (saved.exists ? saved.data().placeIds : []).map(id => db.collection('discovery_popularity').doc(id));
                    const statistics = await Promise.all(refs.map(stat => tx.get(stat)));
                    statistics.forEach((stat, index) => {
                        if (stat.exists) tx.set(refs[index], { count: Math.max(0, stat.data().count - 1), updatedAt: now() });
                    });
                    if (saved.exists) tx.delete(saveRef);
                    tx.delete(db.collection('users').doc(uid));
                    tx.delete(db.collection('generation_credits').doc(uid));
                });
            }
            if (job?.stage === 'auth') {
                // Recheck fencing and identity immediately before the non-transactional Auth call.
                const current = (await ref.get()).data();
                if (!owns(current)) return;
                const identity = await userOrNull(uid);
                if (identity && identity.metadata.creationTime !== claimed.identityCreatedAt) {
                    await blockIdentity();
                    return;
                }
                try { await auth.deleteUser(uid); }
                catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
                await change({ state: 'completed', stage: 'done', completedAt: now(), leaseOwner: null, leaseUntil: 0, lastErrorCode: null });
                return;
            }
            if (job) {
                const attention = now() - job.createdAt >= ATTENTION_AGE_MS && !job.attentionLoggedAt;
                const updated = await change({ nextAttemptAt: now(), leaseOwner: null, leaseUntil: 0, ...(attention ? { attentionLoggedAt: now() } : {}) });
                if (updated && attention) log('Account deletion needs operator attention', { event: 'account_deletion_attention', reason: 'overdue', stage: updated.stage });
            }
        } catch (error) {
            // A failed Auth call may already have succeeded remotely. Next run treats not-found as success.
            const delay = Math.min(3_600_000, 60_000 * 2 ** Math.min(claimed.attempts - 1, 6));
            const attention = !claimed.attentionLoggedAt && (claimed.attempts >= ATTENTION_ATTEMPTS || now() - claimed.createdAt >= ATTENTION_AGE_MS);
            const updated = await change({ nextAttemptAt: now() + delay, lastErrorCode: 'retry-required', leaseOwner: null, leaseUntil: 0, ...(attention ? { attentionLoggedAt: now() } : {}) });
            log('Account deletion will retry', { code: 'retry-required', attempt: claimed.attempts });
            if (updated && attention) log('Account deletion needs operator attention', { event: 'account_deletion_attention', reason: 'retries', stage: updated.stage });
        }
    }
    async function retryDue() {
        const due = await db.collection(JOBS).where('state', '==', 'pending').where('nextAttemptAt', '<=', now()).orderBy('nextAttemptAt').limit(5).get();
        await Promise.all(due.docs.map(doc => process(doc.id)));
    }
    return { requestDeletion, status, process, retryDue, assertNotDeleting };
}

module.exports = { createAccountDeletion, LEASE_MS };
