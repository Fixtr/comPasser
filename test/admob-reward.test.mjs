import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';

const { createAdMobRewardVerifier } = createRequire(import.meta.url)('../functions/admob-reward.js');

test('only a signed, configured one-credit AdMob callback is accepted', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const time = 1_800_000_000_000;
    let downloads = 0;
    const verifier = createAdMobRewardVerifier({
        axios: { get: async () => { downloads++; return { data: { keys: [{ keyId: 7, base64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64') }] } }; } },
        allowedAdUnits: new Set(['rewarded-unit']), now: () => time,
    });
    const callback = fields => {
        const query = new URLSearchParams({ ad_network: '1', ad_unit: 'rewarded-unit', reward_amount: '1',
            reward_item: 'generation_credit', timestamp: String(time), transaction_id: 'a'.repeat(32), user_id: 'owner', ...fields }).toString();
        const signature = sign('sha256', Buffer.from(query), privateKey).toString('base64url');
        return `/callback?${query}&signature=${signature}&key_id=7`;
    };
    assert.deepEqual(await verifier.verifyCallback(callback()), { uid: 'owner', transactionId: 'a'.repeat(32) });
    assert.equal(await verifier.verifyCallback(callback({ reward_amount: '10' })), null);
    assert.equal(await verifier.verifyCallback(callback({ ad_unit: 'attacker' })), null);
    assert.equal(await verifier.verifyCallback(callback({ timestamp: String(time - 86_400_001) })), null);
    assert.equal(await verifier.verifyCallback(callback().replace('user_id=owner', 'user_id=attacker')), null);
    assert.equal(await verifier.verifyCallback(callback() + '&user_id=attacker'), null);
    assert.equal(downloads, 1);
});
