import { defineConfig } from 'vite';

// Relative base so the static build works on GitHub Pages (or any sub-path)
// and even when opened from a local folder via a static server.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
  worker: { format: 'es' },
});
