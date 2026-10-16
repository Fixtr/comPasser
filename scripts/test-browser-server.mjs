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
  await build({ root: fileURLToPath(new URL('../', import.meta.url)), envDir: false });
  process.exit(0);
}
const ionic = process.argv.includes('--ionic');
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  configFile: ionic ? fileURLToPath(new URL('../vite.config.js', import.meta.url)) : false,
  envDir: false,
  server: { host: '127.0.0.1', port: ionic ? 4184 : 4183, strictPort: true },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
await server.listen();
