#!/usr/bin/env node
// Copies the PDF.js runtime assets (character maps, standard fonts, wasm
// decoders) into public/pdfjs so the web app can load them locally.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = dirname(require.resolve('pdfjs-dist/package.json'));
const dest = join(root, 'public', 'pdfjs');
mkdirSync(dest, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  if (existsSync(join(src, dir))) cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
console.log('PDF.js assets copied to public/pdfjs');
