import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Relative base so the static build works on GitHub Pages (or any sub-path)
// and even when opened from a local folder via a static server.
export default defineConfig({
  base: './',
  define: { __VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'es2020',
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
  worker: { format: 'es' },
});
