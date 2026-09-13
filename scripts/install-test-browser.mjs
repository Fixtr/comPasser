import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--with-deps')) throw new Error('Only --with-deps is supported');
const child = spawn(process.execPath, [
  fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url)),
  'install', 'chromium', ...args,
], { stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_GC: '1' } });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
