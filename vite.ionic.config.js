import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { mergeConfig } from 'vite';
import legacyConfig from './vite.config.js';

// 3단계 시연 서버: 같은 공유 URL을 Ionic 셸에서 직접 열고 새로고침할 수 있게 한다.
export default mergeConfig(legacyConfig, {
  plugins: [{
    name: 'ionic-shell-entry',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const path = request.url?.split('?')[0] || '/';
        if (request.method === 'GET' && !path.includes('.') && !path.startsWith('/@') && !path.startsWith('/src/') && !path.startsWith('/node_modules/')) {
          request.url = '/ionic-shell.html';
        }
        next();
      });
    },
    writeBundle(output, bundle) {
      const directory = resolve(output.dir || 'dist-ionic-shell');
      const html = readFileSync(resolve(directory, 'ionic-shell.html'));
      const assets = Object.keys(bundle)
        .filter(file => /^assets\/.*\.(?:js|css)$/.test(file))
        .sort()
        .map(file => `/${file}`);
      const version = createHash('sha256').update(html).update(JSON.stringify(assets)).digest('hex').slice(0, 12);
      const worker = resolve(directory, 'sw.js');
      writeFileSync(worker, `self.__BUILD_ID__=${JSON.stringify(version)};self.__PRECACHE_ASSETS__=${JSON.stringify(assets)};\n${readFileSync(worker, 'utf8')}`);
      renameSync(resolve(directory, 'ionic-shell.html'), resolve(directory, 'index.html'));
    },
  }],
  build: {
    outDir: 'dist-ionic-shell',
    rollupOptions: { input: resolve('ionic-shell.html') },
  },
});
