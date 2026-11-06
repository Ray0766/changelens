// Check helper (not used to build the PDFs): extract per-page text with PDF.js getTextContent.
// Usage: node pdfjs-extract.mjs file.pdf > out.json
import { readFileSync } from "node:fs";
const pdfjs = await import("/home/user/changelens/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const data = new Uint8Array(readFileSync(process.argv[2]));
const doc = await pdfjs.getDocument({ data, verbosity: 0, isEvalSupported: false }).promise;
const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = [];
  let text = "";
  for (const it of tc.items) {
    if (!("str" in it)) continue;
    const [a, b, c, d, e, f] = it.transform;
    items.push({ str: it.str, x: e, y: vp.height - f, w: it.width, h: it.height, font: tc.styles[it.fontName]?.fontFamily, fn: it.fontName, eol: it.hasEOL });
    text += it.str + (it.hasEOL ? "\n" : "");
  }
  pages.push({ n: i, width: vp.width, height: vp.height, text, items });
}
process.stdout.write(JSON.stringify({ numPages: doc.numPages, pages }));
