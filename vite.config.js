import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { build as buildWorker } from 'esbuild';
import publicRoutesWorker from './src/server/public-routes-worker.mjs';

let firebaseProject = '';

export default defineConfig({
  base: '/',
  envPrefix: ['VITE_'],

  plugins: [{
    name: 'ionic-shell-entry',
    configResolved(config) {
      firebaseProject = config.env.VITE_FIREBASE_PROJECT_ID || '';
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0] || '/';
        if (!/^\/en(?:\/|$)/.test(path) && path !== '/sitemap.xml' && path !== '/robots.txt') return next();
        try {
          const result = await publicRoutesWorker.fetch(
            new Request(`http://127.0.0.1${request.url}`, { method: request.method }),
            { FIREBASE_PROJECT_ID: firebaseProject }
          );
          response.statusCode = result.status;
          result.headers.forEach((value, key) => response.setHeader(key, value));
          response.end(await result.text());
        } catch (error) {
          next(error);
        }
      });
      server.middlewares.use((request, _response, next) => {
        const path = request.url?.split('?')[0] || '/';
        if (
          request.method === 'GET' &&
          (path === '/index.html' || (!path.includes('.') && !path.startsWith('/@') && !path.startsWith('/src/') && !path.startsWith('/node_modules/')))
        ) {
          request.url = '/ionic-shell.html';
        }
        next();
      });
    },
    async writeBundle(output, bundle) {
      const directory = resolve(output.dir || 'dist');
      const html = readFileSync(resolve(directory, 'ionic-shell.html'));
      const assets = Object.keys(bundle)
        .filter(file => /^assets\/.*\.(?:js|css)$/.test(file))
        .sort()
        .map(file => `/${file}`);
      const version = createHash('sha256').update(html).update(JSON.stringify(assets)).digest('hex').slice(0, 12);
      const worker = resolve(directory, 'sw.js');
      writeFileSync(worker, `self.__BUILD_ID__=${JSON.stringify(version)};self.__PRECACHE_ASSETS__=${JSON.stringify(assets)};\n${readFileSync(worker, 'utf8')}`);
      renameSync(resolve(directory, 'ionic-shell.html'), resolve(directory, 'index.html'));
      await buildWorker({
        entryPoints: ['src/server/public-routes-worker.mjs'],
        outfile: resolve(directory, '_worker.js'),
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        define: { __FIREBASE_PROJECT__: JSON.stringify(firebaseProject) }
      });
      writeFileSync(resolve(directory, '_routes.json'), JSON.stringify({
        version: 1,
        include: ['/en', '/en/*', '/sitemap.xml', '/robots.txt'],
        exclude: []
      }));
    },
  }],

  build: {
    outDir: 'dist',
    rollupOptions: {
      input: resolve('ionic-shell.html'),
      // @ionic/react imports every component; these modules only define elements on use, so unused ones can go.
      treeshake: { moduleSideEffects: id => !/node_modules\/(?:@ionic\/core|ionicons)\//.test(id) },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('html2canvas')) return undefined;
          if (id.includes('@capacitor-firebase')) return undefined;
          // Only the home globe uses these; unnamed, they ride in its lazy chunk instead of the first-load vendor.
          if (/node_modules\/(?:d3-|internmap|topojson-client)/.test(id)) return undefined;
          // A named chunk reaching Ionic keeps every component (Rollup follows its static imports), so it stays unnamed.
          if (/node_modules\/(?:@ionic\/|ionicons|@stencil\/|@lit\/)/.test(id)) return undefined;
          if (id.includes('@firebase/firestore') || id.includes('firebase/firestore') || id.includes('re2js')) return 'vendor-firestore';
          if (id.includes('@firebase/functions') || id.includes('firebase/functions')) return 'vendor-functions';
          if (id.includes('@firebase/auth') || id.includes('firebase/auth')) return 'vendor-auth';
          if (id.includes('@firebase') || id.includes('firebase')) return 'vendor-firebase-core';
          if (id.includes('@googlemaps')) return 'vendor-maps';
          return 'vendor';
        }
      }
    }
  }
});
