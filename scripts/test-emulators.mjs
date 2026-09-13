import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const java = spawnSync('java', ['-version'], { encoding: 'utf8' });
const version = Number(((java.stderr || '') + (java.stdout || '')).match(/version "(\d+)/)?.[1]);
if (java.error || java.status !== 0 || !Number.isInteger(version) || version < 21) {
  console.error('Emulator checks require Java 21 or newer. Install a JDK and check java -version.');
  process.exit(1);
}
const env = { ...process.env };
for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'FIREBASE_CONFIG',
  'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'GOOGLE_CLOUD_PROJECT']) delete env[key];
env.GCLOUD_PROJECT = 'demo-hackerton-deletion';
env.FIREBASE_CLI_DISABLE_UPDATE_CHECK = 'true';
env.CI = 'true';
const child = spawn(process.execPath, [
  fileURLToPath(new URL('../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url)),
  'emulators:exec', '--only', 'auth,firestore', '--config', 'firebase.test.json',
  '--project', 'demo-hackerton-deletion', '--non-interactive',
  'node --test --test-concurrency=1 --test-timeout=90000 test/emulator/*.test.mjs',
], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
