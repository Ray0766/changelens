// Check helper (not part of ChangeLens): render pages with PDF.js (default annotation mode) to PNG.
// Usage: node pdfjs-render.mjs file.pdf outprefix [scale]
import { readFileSync, writeFileSync } from 'node:fs';
const NM = '/home/user/changelens/node_modules';
const pdfjs = await import(`${NM}/pdfjs-dist/legacy/build/pdf.mjs`);
const { createCanvas } = await import(`${NM}/@napi-rs/canvas/index.js`);
const [file, prefix, s] = process.argv.slice(2);
const scale = Number(s || 1);
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0,
  standardFontDataUrl: `${NM}/pdfjs-dist/standard_fonts/`, cMapUrl: `${NM}/pdfjs-dist/cmaps/`, cMapPacked: true }).promise;
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  writeFileSync(`${prefix}-${p}.png`, canvas.toBuffer('image/png'));
}
