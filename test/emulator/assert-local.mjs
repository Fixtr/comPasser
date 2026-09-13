// Every emulator test imports this BEFORE any SDK initialization or data writes.
if (process.env.GCLOUD_PROJECT !== 'demo-hackerton-deletion') throw new Error('Explicit demo-hackerton-deletion project required');
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[key] || '')) throw new Error(`Local ${key} required`);
}
