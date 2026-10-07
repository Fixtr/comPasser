import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  envPrefix: ['VITE_'],

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('html2canvas')) return undefined;
          if (id.includes('@capacitor-firebase')) return undefined;
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
