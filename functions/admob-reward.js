const { createPublicKey, verify } = require('node:crypto');

const KEY_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

function createAdMobRewardVerifier({ axios, allowedAdUnits, now = Date.now }) {
    let cached = null;
    let expiresAt = 0;

    async function keys() {
        if (cached && now() < expiresAt) return cached;
        const response = await axios.get(KEY_URL, { timeout: 5000 });
        const entries = response.data?.keys;
        if (!Array.isArray(entries) || !entries.length) throw new Error('AdMob keys unavailable');
        const next = new Map(entries.map(key => [String(key.keyId), createPublicKey({
            key: Buffer.from(key.base64, 'base64'), format: 'der', type: 'spki'
        })]));
        cached = next;
        expiresAt = now() + 60 * 60 * 1000; // Google permits at most 24h.
        return next;
    }

    async function verifyCallback(originalUrl) {
        if (!allowedAdUnits?.size) throw new Error('AdMob reward units are not configured');
        const query = originalUrl.split('?')[1];
        if (!query || query.length > 4096) return null;
        const match = query.match(/^(.*)&signature=([A-Za-z0-9_-]+)&key_id=(\d+)$/);
        if (!match) return null;
        const params = new URLSearchParams(query);
        for (const name of ['ad_unit', 'reward_amount', 'reward_item', 'timestamp', 'transaction_id', 'user_id', 'signature', 'key_id']) {
            if (params.getAll(name).length !== 1) return null;
        }
        if (!allowedAdUnits.has(params.get('ad_unit')) || params.get('reward_amount') !== '1'
            || params.get('reward_item') !== 'generation_credit') return null;
        const rawTimestamp = params.get('timestamp');
        const timestamp = /^\d{16}$/.test(rawTimestamp) ? Math.floor(Number(rawTimestamp) / 1000) : Number(rawTimestamp);
        if (!Number.isSafeInteger(timestamp) || Math.abs(now() - timestamp) > 24 * 60 * 60 * 1000) return null;
        const transactionId = params.get('transaction_id');
        const uid = params.get('user_id');
        if (!/^[a-fA-F0-9]{16,128}$/.test(transactionId) || !uid || uid.length > 128) return null;
        const key = (await keys()).get(match[3]);
        if (!key || !verify('sha256', Buffer.from(match[1], 'utf8'), key, Buffer.from(match[2], 'base64url'))) return null;
        return { uid, transactionId };
    }

    return { verifyCallback };
}

module.exports = { createAdMobRewardVerifier };
