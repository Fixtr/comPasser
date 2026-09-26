const { createHash } = require('node:crypto');

const LEASE_MS = 6 * 60 * 1000; // Longer than generateItinerary's 300s timeout.

function failure(code, reason) {
    return Object.assign(new Error(reason), { code, details: { reason } });
}

function createGenerationCredits({ db, now = Date.now }) {
    const creditRef = uid => db.collection('generation_credits').doc(uid);
    const rewardRef = transactionId => db.collection('ad_reward_events')
        .doc(createHash('sha256').update(transactionId).digest('hex'));

    function state(snapshot, identityCreatedAt) {
        const saved = snapshot.exists && snapshot.data().identityCreatedAt === identityCreatedAt
            ? snapshot.data() : { identityCreatedAt, balance: 1, pending: null };
        const balance = Number.isSafeInteger(saved.balance) && saved.balance >= 0 ? saved.balance : 0;
        if (saved.pending && saved.pending.startedAt + LEASE_MS <= now()) {
            // ponytail: a timed-out request can get one free result if it succeeded just before a crash.
            return { identityCreatedAt, balance: balance + 1, pending: null };
        }
        return { identityCreatedAt, balance, pending: saved.pending || null };
    }

    async function balance(uid, identityCreatedAt) {
        return db.runTransaction(async tx => {
            const ref = creditRef(uid);
            const snapshot = await tx.get(ref);
            const next = state(snapshot, identityCreatedAt);
            if (!snapshot.exists || snapshot.data().identityCreatedAt !== identityCreatedAt || snapshot.data().pending !== next.pending) {
                tx.set(ref, next);
            }
            return { balance: next.balance, generating: !!next.pending };
        });
    }

    async function reserve(uid, identityCreatedAt, requestId) {
        return db.runTransaction(async tx => {
            const ref = creditRef(uid);
            const next = state(await tx.get(ref), identityCreatedAt);
            if (next.pending) throw failure('failed-precondition', 'generation-in-progress');
            if (next.balance === 0) throw failure('resource-exhausted', 'credits-empty');
            tx.set(ref, { ...next, balance: next.balance - 1, pending: { id: requestId, startedAt: now() } });
            return next.balance - 1;
        });
    }

    async function settle(uid, identityCreatedAt, requestId, succeeded) {
        return db.runTransaction(async tx => {
            const ref = creditRef(uid);
            const snapshot = await tx.get(ref);
            if (!snapshot.exists || snapshot.data().identityCreatedAt !== identityCreatedAt
                || snapshot.data().pending?.id !== requestId) return false;
            const current = snapshot.data();
            tx.set(ref, { identityCreatedAt, balance: current.balance + (succeeded ? 0 : 1), pending: null });
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

module.exports = { createGenerationCredits, LEASE_MS };
