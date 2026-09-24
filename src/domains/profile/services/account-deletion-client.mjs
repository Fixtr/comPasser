// The receipt is persisted BEFORE submission: a lost response must not lose the
// ability to check completion after the Auth account has already been deleted.
export function createAccountDeletionClient({ getCurrentUser, storage, randomReceipt, submit, getStatus }) {
    const key = uid => `accountDeletionReceipt:${uid}`;
    const validReceipt = value => /^[a-f0-9]{64}$/.test(value);
    const identity = user => user.metadata?.creationTime || '';
    function read(user) {
        const raw = storage.getItem(key(user.uid));
        if (!raw) return null;
        try {
            const record = JSON.parse(raw);
            return record.identity === identity(user) && validReceipt(record.receipt) ? record : null;
        } catch { return null; }
    }
    function storedReceipts() {
        const receipts = new Set();
        try {
            for (let index = 0; index < storage.length; index++) {
                const name = storage.key(index);
                if (!name?.startsWith('accountDeletionReceipt:')) continue;
                try {
                    const record = JSON.parse(storage.getItem(name));
                    if (typeof record.identity === 'string' && validReceipt(record.receipt)) receipts.add(record.receipt);
                } catch { /* Ignore malformed local records. */ }
            }
        } catch { /* Storage can be unavailable in private browsing. */ }
        return [...receipts];
    }
    function remember(user, receipt) {
        storage.setItem(key(user.uid), JSON.stringify({ identity: identity(user), receipt }));
    }
    return {
        hasReceipt(user) { try { return !!read(user); } catch { return false; } },
        async request(userId) {
            const user = getCurrentUser();
            if (user?.uid !== userId) throw Object.assign(new Error('Account changed'), { code: 'profile/account-changed' });
            const previous = read(user);
            const receipt = previous?.receipt || randomReceipt();
            remember(user, receipt); // Storage failure aborts BEFORE a destructive request.
            try {
                const result = await submit({ confirm: true, receipt, expectedUid: userId, expectedCreatedAt: identity(user) });
                if (result.receipt) remember(user, result.receipt);
                return result;
            } catch (error) {
                const recentLogin = error.details?.reason === 'requires-recent-login';
                if (recentLogin || error.details?.reason === 'account-changed' || ['functions/unauthenticated', 'functions/invalid-argument'].includes(error.code)) {
                    if (!previous) storage.removeItem(key(userId));
                    if (recentLogin) error.code = 'auth/requires-recent-login';
                    if (error.details?.reason === 'account-changed') error.code = 'profile/account-changed';
                } else {
                    error.deletionStatusUnknown = true;
                }
                throw error;
            }
        },
        async status(user) {
            const record = read(user);
            // Without a receipt, a signed-in lookup discovers an existing job from
            // another device. This endpoint only reads; it never submits deletion.
            const result = await getStatus(record ? { receipt: record.receipt } : {});
            if (result.receipt) remember(user, result.receipt);
            return result;
        },
        async localStatuses() {
            return Promise.all(storedReceipts().map(async receipt => {
                try {
                    const result = await getStatus({ receipt });
                    return ['pending', 'blocked', 'completed'].includes(result.state) ? result.state : 'unknown';
                } catch { return 'unknown'; }
            }));
        },
    };
}
