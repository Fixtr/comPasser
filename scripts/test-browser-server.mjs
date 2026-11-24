import { build, createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Never use developer/production .env settings in the isolated browser suite.
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
process.env.VITE_KAKAO_APP_KEY = 'browser-fixture-only';
if (process.argv.includes('--build')) {
  Object.assign(process.env, {
    VITE_FIREBASE_API_KEY: 'browser-fixture-api-key', VITE_FIREBASE_AUTH_DOMAIN: 'demo-hackerton-deletion.localhost',
    VITE_FIREBASE_PROJECT_ID: 'demo-hackerton-deletion', VITE_FIREBASE_APP_ID: 'browser-fixture-app',
  });
  // Vite 5 reads a false env directory as "use the project root", so .env was still loaded; envFile: false is what skips it.
  await build({ root: fileURLToPath(new URL('../', import.meta.url)), envFile: false, build: { outDir: 'test-results/pwa-build' } });
  process.exit(0);
}
const portFlag = process.argv.indexOf('--port');
const port = portFlag > 0 ? Number(process.argv[portFlag + 1]) : process.argv.includes('--ionic') ? 4184 : 4183;
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  envFile: false,
  server: { host: '127.0.0.1', port, strictPort: true },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
await server.listen();
