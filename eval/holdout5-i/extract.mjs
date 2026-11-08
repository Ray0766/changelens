// PDF.js getTextContent dump: node extract.mjs file.pdf [--items]
import * as pdfjs from '/home/user/changelens/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';
const file = process.argv[2];
const items = process.argv.includes('--items');
const data = new Uint8Array(fs.readFileSync(file));
const doc = await pdfjs.getDocument({ data, verbosity: 0, standardFontDataUrl: '/home/user/changelens/node_modules/pdfjs-dist/standard_fonts/' }).promise;
const out = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  let s = '';
  const its = [];
  for (const it of tc.items) {
    if (!('str' in it)) continue;
    s += it.str + (it.hasEOL ? '\n' : ' ');
    its.push({ s: it.str, x: +it.transform[4].toFixed(1), y: +(vp.height - it.transform[5]).toFixed(1), w: +it.width.toFixed(1), h: +it.height.toFixed(1), f: it.fontName });
  }
  out.push({ page: p, width: vp.width, height: vp.height, text: s, items: items ? its : undefined });
}
console.log(JSON.stringify(out));
