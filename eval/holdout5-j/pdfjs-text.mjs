// Check helper (not part of ChangeLens): dump PDF.js getTextContent per page as JSON.
// Usage: node pdfjs-text.mjs file.pdf  -> [{page, text, items:[{str,x,y,w,h,font}]}]
import { readFileSync } from 'node:fs';
const pdfjs = await import('/home/user/changelens/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const data = new Uint8Array(readFileSync(process.argv[2]));
const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
const out = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  let text = '';
  const items = [];
  for (const it of tc.items) {
    if (it.str === undefined) continue;
    text += it.str + (it.hasEOL ? '\n' : '');
    const [a, b, c, d, e, f] = it.transform;
    const [x, y] = vp.convertToViewportPoint(e, f);
    items.push({ str: it.str, x: +x.toFixed(1), y: +y.toFixed(1), w: +it.width.toFixed(1), h: +it.height.toFixed(1), font: tc.styles[it.fontName]?.fontFamily, fn: it.fontName });
  }
  out.push({ page: p, rotate: page.rotate, view: [vp.width, vp.height], text, items });
}
console.log(JSON.stringify(out));
