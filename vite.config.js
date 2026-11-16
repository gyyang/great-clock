import { defineConfig } from 'vite';

export default defineConfig({
  base: './',          // the built page finds its files beside itself, so it can be served from any folder (GitHub Pages serves it from /great-clock/)
  build: { target: 'esnext', chunkSizeWarningLimit: 4000 },
});
