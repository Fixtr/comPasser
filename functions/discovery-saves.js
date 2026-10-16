const PLACE_IDS = new Set(['palace', 'forest', 'island', 'seochon', 'haeundae', 'dongbaek', 'gwangalli',
    'yongduam', 'dongmun', 'iho', 'chinatown', 'jayu', 'songdo', 'seomun', 'gyesan', 'dongseongro', 'hanbat', 'expo', 'yuseong',
    'namsan', 'bukchon', 'gamcheon', 'jagalchi', 'taejongdae', 'seongsan', 'hamdeok', 'hallim', 'wolmido', 'songwol', 'sinpo', 'kimroad', 'apsan', 'suseong', 'science', 'ppuri', 'daecheong']);
const failure = (code, message) => Object.assign(new Error(message), { code });

function createDiscoverySaves({ db, now = Date.now }) {
    async function setSaved(uid, identityCreatedAt, authTime, placeId, saved) {
        if (!uid) throw failure('unauthenticated', 'Sign in first.');
        if (!PLACE_IDS.has(placeId) || typeof saved !== 'boolean') throw failure('invalid-argument', 'Invalid discovery place.');
        return db.runTransaction(async tx => {
            const saveRef = db.collection('discovery_saves').doc(uid);
            const statRef = db.collection('discovery_popularity').doc(placeId);
            const [job, snapshot, statistic] = await Promise.all([
                tx.get(db.collection('account_deletions').doc(uid)), tx.get(saveRef), tx.get(statRef),
            ]);
            if (job.exists && (job.data().state !== 'completed' || authTime * 1000 <= job.data().completedAt)) {
                throw failure('failed-precondition', 'Account deletion is in progress.');
            }
            if (snapshot.exists && snapshot.data().identityCreatedAt !== identityCreatedAt) {
                throw failure('failed-precondition', 'Account identity changed.');
            }
            const ids = new Set(snapshot.exists ? snapshot.data().placeIds : []);
            const count = Math.max(0, Number(statistic.data()?.count) || 0);
            if (ids.has(placeId) === saved) return { saved, count, updatedAt: statistic.data()?.updatedAt || null };
            if (saved) ids.add(placeId); else ids.delete(placeId);
            const next = { count: Math.max(0, count + (saved ? 1 : -1)), updatedAt: now() };
            tx.set(saveRef, { placeIds: [...ids], identityCreatedAt });
            tx.set(statRef, next);
            return { saved, ...next };
        });
    }
    return { setSaved };
}

module.exports = { createDiscoverySaves, PLACE_IDS };
