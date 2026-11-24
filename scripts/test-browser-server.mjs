import { build, createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Never use developer/production .env settings in the isolated browser suite.
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
process.env.VITE_KAKAO_APP_KEY = 'browser-fixture-only';
// Vite 5 reads `envDir: false` as "use the project root" and so loaded the developer's .env, while `envFile: false`
// also drops the fixture values set on process.env here. A folder that holds no .env file gives exactly the fixtures.
const ENV_DIR = fileURLToPath(new URL('../test/browser/', import.meta.url));
if (process.argv.includes('--build')) {
  Object.assign(process.env, {
    VITE_FIREBASE_API_KEY: 'browser-fixture-api-key', VITE_FIREBASE_AUTH_DOMAIN: 'demo-hackerton-deletion.localhost',
    VITE_FIREBASE_PROJECT_ID: 'demo-hackerton-deletion', VITE_FIREBASE_APP_ID: 'browser-fixture-app',
  });
  await build({ root: fileURLToPath(new URL('../', import.meta.url)), envDir: ENV_DIR, build: { outDir: 'test-results/pwa-build' } });
  process.exit(0);
}
const portFlag = process.argv.indexOf('--port');
const port = portFlag > 0 ? Number(process.argv[portFlag + 1]) : process.argv.includes('--ionic') ? 4184 : 4183;
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  envDir: ENV_DIR,
  // Worktrees share node_modules through a symlink, and every server start rewrites Vite's dependency cache there.
  // A second checkout starting its server would delete the chunks this one is still serving, so keep the cache here.
  cacheDir: fileURLToPath(new URL(`../test-results/vite-cache-${port}`, import.meta.url)),
  server: { host: '127.0.0.1', port, strictPort: true },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
await server.listen();
