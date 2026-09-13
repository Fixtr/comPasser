import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Never use developer/production .env settings in the isolated browser suite.
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
process.env.VITE_KAKAO_APP_KEY = 'browser-fixture-only';
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  configFile: false,
  envDir: false,
  server: { host: '127.0.0.1', port: 4183, strictPort: true },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
await server.listen();
