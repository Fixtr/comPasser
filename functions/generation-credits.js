const { createHash } = require('node:crypto');

const LEASE_MS = 6 * 60 * 1000; // Longer than generateItinerary's 300s timeout.
const RECOVERY_MS = 60 * 60 * 1000;
const CLIENT_CLOCK_SKEW_MS = 5 * 60 * 1000;

function generationRecovery(id, input, now = Date.now()) {
    if (id === undefined) return null; // Older clients do not send a recovery ID.
    const match = typeof id === 'string' && /^(\d{13})\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.exec(id);
    if (!match || Number(match[1]) > now + CLIENT_CLOCK_SKEW_MS) throw failure('invalid-argument', 'invalid-generation-request-id');
    const expiresAt = new Date(Number(match[1]) + RECOVERY_MS);
    if (expiresAt.getTime() <= now) throw failure('failed-precondition', 'generation-request-expired');
    return { id, expiresAt, fingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex') };
}

function failure(code, reason) {
    return Object.assign(new Error(reason), { code, details: { reason } });
}

function createGenerationCredits({ db, now = Date.now }) {
    const creditRef = uid => db.collection('generation_credits').doc(uid);
    const rewardRef = transactionId => db.collection('ad_reward_events')
        .doc(createHash('sha256').update(transactionId).digest('hex'));
    const resultRef = (uid, id) => db.collection('generation_results')
        .doc(createHash('sha256').update(JSON.stringify([uid, id])).digest('hex'));
    async function deleting(tx, uid, identityCreatedAt) {
        const job = await tx.get(db.collection('account_deletions').doc(uid));
        return job.exists && (job.data().state !== 'completed' || job.data().identityCreatedAt === identityCreatedAt);
    }

    // Credits refill to one at midnight Korea time, once per day, so an empty balance is never permanent.
    const today = () => new Date(now()).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

    function state(snapshot, identityCreatedAt) {
        const day = today();
        const saved = snapshot.exists && snapshot.data().identityCreatedAt === identityCreatedAt
            ? snapshot.data() : { identityCreatedAt, balance: 1, pending: null, refilledOn: day };
        let balance = Number.isSafeInteger(saved.balance) && saved.balance >= 0 ? saved.balance : 0;
        let refilledOn = saved.refilledOn ?? null;
        if (balance === 0 && refilledOn !== day) { balance = 1; refilledOn = day; }
        if (saved.pending && saved.pending.startedAt + LEASE_MS <= now()) {
            // ponytail: a timed-out request can get one free result if it succeeded just before a crash.
            return { identityCreatedAt, balance: balance + (saved.pending.unlimited ? 0 : 1), pending: null, refilledOn };
        }
        return { identityCreatedAt, balance, pending: saved.pending || null, refilledOn };
    }

    async function balance(uid, identityCreatedAt, unlimited = false) {
        return db.runTransaction(async tx => {
            if (await deleting(tx, uid, identityCreatedAt)) throw failure('failed-precondition', 'account-deletion-pending');
            const ref = creditRef(uid);
            const snapshot = await tx.get(ref);
            const next = state(snapshot, identityCreatedAt);
            if (!snapshot.exists || snapshot.data().identityCreatedAt !== identityCreatedAt || snapshot.data().pending !== next.pending
                || (snapshot.data().refilledOn ?? null) !== next.refilledOn) {
                tx.set(ref, next);
            }
            return { balance: next.balance, generating: !!next.pending, ...(unlimited ? { unlimited: true } : {}) };
        });
    }

    async function reserve(uid, identityCreatedAt, leaseId, unlimited = false, recovery = null) {
        return db.runTransaction(async tx => {
            if (await deleting(tx, uid, identityCreatedAt)) throw failure('failed-precondition', 'account-deletion-pending');
            const ref = creditRef(uid);
            const next = state(await tx.get(ref), identityCreatedAt);
            const result = recovery && resultRef(uid, recovery.id);
            const stored = result && (await tx.get(result)).data();
            const sameIdentity = stored?.identityCreatedAt === identityCreatedAt;
            if (recovery && recovery.expiresAt.getTime() <= now()) throw failure('failed-precondition', 'generation-request-expired');
            if (sameIdentity) {
                if (stored.fingerprint !== recovery.fingerprint) throw failure('invalid-argument', 'generation-request-mismatch');
                if (stored.resultJson) return JSON.parse(stored.resultJson);
            }
            if (next.pending) throw failure('failed-precondition', recovery && next.pending.recoveryId === recovery.id
                ? 'generation-request-pending' : 'generation-in-progress');
            if (recovery && recovery.expiresAt.getTime() <= now() + LEASE_MS) throw failure('failed-precondition', 'generation-request-expired');
            if (next.balance === 0 && !unlimited) throw failure('resource-exhausted', 'credits-empty');
            tx.set(ref, { ...next, balance: next.balance - (unlimited ? 0 : 1), pending: {
                id: leaseId, startedAt: now(), ...(unlimited ? { unlimited: true } : {}),
                ...(recovery ? { recoveryId: recovery.id } : {}),
            } });
            if (result && !sameIdentity) tx.set(result, {
                userId: uid, identityCreatedAt, expiresAt: recovery.expiresAt, fingerprint: recovery.fingerprint,
            });
            return null;
        });
    }

    async function settle(uid, identityCreatedAt, leaseId, succeeded, recovery = null, resultJson = null) {
        return db.runTransaction(async tx => {
            if (await deleting(tx, uid, identityCreatedAt)) return false;
            const ref = creditRef(uid);
            const snapshot = await tx.get(ref);
            if (!snapshot.exists || snapshot.data().identityCreatedAt !== identityCreatedAt
                || snapshot.data().pending?.id !== leaseId) return false;
            const current = snapshot.data();
            tx.set(ref, { identityCreatedAt, balance: current.balance + (succeeded || current.pending.unlimited ? 0 : 1), pending: null, refilledOn: current.refilledOn ?? null });
            if (succeeded && recovery && recovery.expiresAt.getTime() > now()) {
                tx.set(resultRef(uid, recovery.id), {
                    userId: uid, identityCreatedAt, expiresAt: recovery.expiresAt, fingerprint: recovery.fingerprint, resultJson,
                });
            }
            return true;
        });
    }

    async function grantAdReward(uid, identityCreatedAt, transactionId) {
        return db.runTransaction(async tx => {
            const receipt = rewardRef(transactionId);
            if ((await tx.get(receipt)).exists) return false;
            const ref = creditRef(uid);
            const next = state(await tx.get(ref), identityCreatedAt);
            tx.set(ref, { ...next, balance: next.balance + 1 });
            tx.set(receipt, { grantedAt: now() });
            return true;
        });
    }

    return { balance, reserve, settle, grantAdReward };
}

module.exports = { createGenerationCredits, generationRecovery, LEASE_MS, RECOVERY_MS };
