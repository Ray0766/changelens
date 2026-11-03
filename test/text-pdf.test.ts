// Extraction from real (tiny, hand-written) PDFs: rotated pages and text,
// and control characters mapped by a crafted ToUnicode CMap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdfData } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';

/**
 * A minimal PDF: Helvetica as /F1 and Times as /F2 (a font switch makes
 * PDF.js start a new text item), optionally with a ToUnicode CMap (bfchar
 * pairs) on /F1.
 */
function rawPdf(pages: { content: string; rotate?: number }[], toUnicode?: [string, string][]): Uint8Array {
  const widths = toUnicode ? ` /FirstChar 1 /LastChar 126 /Widths [${Array(126).fill(500).join(' ')}]` : '';
  const objs: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica${widths}${toUnicode ? ' /ToUnicode 4 0 R' : ''} >>`,
  ];
  const cmap = toUnicode
    ? `/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /X def /CMapType 2 def\n1 begincodespacerange <00> <FF> endcodespacerange\n${toUnicode.length} beginbfchar\n${toUnicode.map(([c, u]) => `<${c}> <${u}>`).join('\n')}\nendbfchar\n1 beginbfrange <20> <7E> <0020> endbfrange\nendcmap CMapName currentdict /CMap defineresource pop end end\n`
    : '';
  objs.push(`<< /Length ${cmap.length} >>\nstream\n${cmap}endstream`);
  pages.forEach((p, i) => {
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]${p.rotate ? ` /Rotate ${p.rotate}` : ''} /Resources << /Font << /F1 3 0 R /F2 << /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >> >> >> /Contents ${6 + 2 * i} 0 R >>`,
      `<< /Length ${p.content.length} >>\nstream\n${p.content}endstream`,
    );
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

const model = async (data: Uint8Array) => buildDocModel(await extractText(await openPdfData(data), 'x'));

/** Two paragraphs; "information" is split over two text items, as Chromium does at a soft hyphen. */
const letter = (amount: string) =>
  'BT /F1 12 Tf 72 760 Td (Synthetic sample: we provide infor) Tj /F2 12 Tf (mation about all deliveries.) Tj ET\n' +
  `BT /F1 12 Tf 72 730 Td (Second paragraph with the amount ${amount} and a closing sentence.) Tj ET\n`;

test('rotated pages: words, lines and boxes follow the text direction', async () => {
  const a = await model(rawPdf([{ content: letter('12,500'), rotate: 90 }]));
  const b = await model(rawPdf([{ content: letter('13,500'), rotate: 90 }]));
  assert.ok(a.tokens.some((t) => t.text === 'information'));
  assert.equal(new Set(a.tokens.map((t) => t.line)).size, 2);
  assert.ok(Math.abs(a.pages[0].textAngle ?? 0) === 90);
  const r = compareDocs(a, b);
  assert.deepEqual(r.changes.map((c) => describeChange('en', c)), ['Number changed: 12,500 → 13,500 (+8%)']);
  // The box covers the word along the (vertical) text direction, not the whole line.
  const box = r.changes[0].new.rects[0].rect;
  assert.ok(box.h > 25 && box.h < 50 && box.w > 8 && box.w < 20, JSON.stringify(box));
  // The same page unrotated: no text or position differences (only the page orientation differs).
  const flat = await model(rawPdf([{ content: letter('12,500') }]));
  assert.equal(flat.pages[0].textAngle, undefined);
  assert.deepEqual(compareDocs(flat, a).changes.map((c) => describeChange('en', c)), []);
});

test('rotated text on an upright page is grouped along its direction', async () => {
  const label = (word: string) => `BT /F1 12 Tf 0 1 -1 0 40 300 Tm (Rotated infor) Tj /F2 12 Tf (mation ${word}) Tj ET\n` + 'BT /F1 12 Tf 72 760 Td (Body text stays.) Tj ET\n';
  const a = await model(rawPdf([{ content: label('label') }]));
  const word = a.tokens.find((t) => t.text === 'information');
  assert.ok(word, a.tokens.map((t) => t.text).join('|'));
  // One word's box: about one line thick and as long as the word, not the whole label.
  const box = word.rects[0];
  assert.ok(box.w > 8 && box.w < 20 && box.h > 40 && box.h < 80, JSON.stringify(box));
  const r = compareDocs(a, await model(rawPdf([{ content: label('note') }])));
  assert.deepEqual(r.changes.map((c) => `${c.old.text}→${c.new.text}`), ['label→note']);
});

test('page numbers on rotated pages are recognised in the reading frame', async () => {
  const body = ['Alpha paragraph text.', 'Beta paragraph text.'];
  const page = (n: number) => ({ content: `BT /F1 12 Tf 72 600 Td (${body[n - 1]}) Tj ET\nBT /F1 9 Tf 280 30 Td (Page ${n} of 2) Tj ET\n`, rotate: 90 });
  const m = await model(rawPdf([page(1), page(2)]));
  const footers = m.lines.filter((l) => l.text.startsWith('Page '));
  assert.equal(footers.length, 2);
  assert.ok(footers.every((l) => l.furniture && l.zone === 'bottom'));
  assert.ok(m.lines.filter((l) => l.text.endsWith('paragraph text.')).every((l) => !l.furniture && !l.zone));
});

test('control characters from a crafted ToUnicode map are dropped at extraction', async () => {
  // Glyph 01 → ESC, 02 → U+202E (right-to-left override), 03 → "[".
  const cmap: [string, string][] = [['01', '001B'], ['02', '202E'], ['03', '005B']];
  const doc = (fee: string, extra: string) => rawPdf([{ content: `BT /F1 12 Tf 72 720 Td 14 TL (The fee is ${fee} dollars per month.) Tj T* (${extra}) Tj ET\n` }], cmap);
  const a = await model(doc('100', 'See annex'));
  const b = await model(doc('900', 'See annex\x01\x032J\x01\x03H\x02 more'));
  const control = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
  for (const d of [a, b]) {
    for (const runs of d.runs) for (const r of runs) assert.ok(!control.test(r.str), JSON.stringify(r.str));
    for (const t of d.tokens) assert.ok(!control.test(t.text), JSON.stringify(t.text));
  }
  const descriptions = compareDocs(a, b).changes.map((c) => describeChange('en', c));
  assert.ok(descriptions.includes('Number changed: 100 → 900 (+800%)'), descriptions.join(' | '));
  assert.ok(descriptions.every((d) => !control.test(d)));
});
