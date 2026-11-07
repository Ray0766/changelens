#!/usr/bin/env node
// Bundles the CLI (src/cli/cli.ts) into dist-cli/cli.js with Vite.
// pdfjs-dist and @napi-rs/canvas stay external (installed as dependencies).
import { build } from 'vite';
import { readFileSync, chmodSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

await build({
  configFile: false,
  logLevel: 'warn',
  publicDir: false,
  define: { __VERSION__: JSON.stringify(pkg.version) },
  build: {
    ssr: 'src/cli/cli.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rollupOptions: {
      external: [/^node:/, 'pdfjs-dist', /^pdfjs-dist\//, '@napi-rs/canvas'],
      output: { entryFileNames: 'cli.js', format: 'es' },
    },
  },
  ssr: { noExternal: true, external: ['pdfjs-dist', '@napi-rs/canvas'] },
});
chmodSync('dist-cli/cli.js', 0o755);
console.log('built dist-cli/cli.js');
