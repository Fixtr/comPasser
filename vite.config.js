import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  envPrefix: ['VITE_', 'GEMINI_'],
});
