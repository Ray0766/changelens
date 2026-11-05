// Bounds and page-level cases of the visual stage: memory, very large pages,
// pages that cannot be rendered, page size changes, tall crops, and the
// overflow check after a template change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import { openPdfData, openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { cropRegion, drawCrop, type CanvasLike } from '../src/core/crops.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import { MAX_RENDER_PIXELS, renderScale, type Raster } from '../src/core/visual.ts';
import type { Change, DocText, TextRun } from '../src/core/types.ts';
import { makeDoc, model } from './helpers.ts';

const noCanvas = !(await canRender()) && 'no canvas';

/** A white page (pt) rendered at `scale`, with filled boxes (pt, RGB). */
function raster(w: number, h: number, scale: number, boxes: { x: number; y: number; w: number; h: number; rgb: [number, number, number] }[] = []): Raster {
  const W = Math.ceil(w * scale);
  const H = Math.ceil(h * scale);
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  for (const b of boxes) {
    for (let y = Math.round(b.y * scale); y < Math.round((b.y + b.h) * scale); y++) {
      for (let x = Math.round(b.x * scale); x < Math.round((b.x + b.w) * scale); x++) {
        const j = (y * W + x) * 4;
        data[j] = b.rgb[0];
        data[j + 1] = b.rgb[1];
        data[j + 2] = b.rgb[2];
      }
    }
  }
  return { width: W, height: H, data, scale };
}

test('report crops do not keep every rendered page in memory', { skip: noCanvas }, async () => {
  v8.setFlagsFromString('--expose-gc');
  const gc = vm.runInNewContext('gc') as () => void;
  const pdf = await openPdf(new URL('../public/samples/proposal-after.pdf', import.meta.url).pathname);
  await renderPage(pdf, 0, 1);
  gc();
  const start = process.memoryUsage().rss;
  // The CLI's pattern: every page for the visual comparison, then again at
  // scale 2 for the report crops. Before page resources were released this
  // kept about 25 MB per page (253 MB for these 9 pages).
  for (let i = 0; i < pdf.numPages; i++) assert.ok((await renderPage(pdf, i, 1.5)).data.length > 0);
  for (let i = 0; i < pdf.numPages; i++) assert.ok((await renderPage(pdf, i, 2)).canvas.width > 0);
  gc();
  const grown = (process.memoryUsage().rss - start) / 1e6;
  assert.ok(grown < 150, `retained ${Math.round(grown)} MB`);
});

/** A one-page PDF of the given size (pt) with a black square at (x, y) from the top left. */
function bigPdf(size: number, x: number, y: number, side: number): Uint8Array {
  const content = `0 g ${x} ${size - y - side} ${side} ${side} re f`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size} ${size}] /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

test('a very large page is rendered within the pixel budget, and its crops still line up', { skip: noCanvas }, async () => {
  assert.ok(renderScale(14400, 14400, 1.5) ** 2 * 14400 * 14400 <= MAX_RENDER_PIXELS * 1.0001);
  assert.equal(renderScale(595, 842, 1.5), 1.5);
  const pdf = await openPdfData(bigPdf(3000, 1000, 1000, 1000));
  const r = await renderPage(pdf, 0, 2);
  assert.ok(r.scale < 2, `scale ${r.scale}`);
  assert.ok(r.width * r.height <= MAX_RENDER_PIXELS * 1.01, `${r.width}×${r.height}`);
  // drawCrop is given the requested scale, as the CLI does; the square must
  // still be where the region says.
  const { createCanvas } = await import('@napi-rs/canvas');
  let out: { width: number; height: number; getContext(t: '2d'): { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number } } } | null = null;
  const make = (w: number, h: number) => (out = createCanvas(w, h) as unknown as NonNullable<typeof out>) as unknown as CanvasLike;
  const change = { kind: 'graphic', category: 'visual', old: { pages: [], rects: [], text: '' }, new: { pages: [0], rects: [], text: '' } } as unknown as Change;
  drawCrop(make, r.canvas as unknown as CanvasLike, 2, { page: 0, rect: { x: 900, y: 900, w: 1200, h: 1200 } }, change, 'new');
  const img = out!.getContext('2d').getImageData(0, 0, out!.width, out!.height);
  const at = (fx: number, fy: number) => img.data[(Math.floor(fy * img.height) * img.width + Math.floor(fx * img.width)) * 4];
  assert.ok(at(0.5, 0.5) < 50, 'square in the middle of the crop');
  assert.ok(at(0.03, 0.03) > 200, 'paper around it');
});

const doc2 = (word: string, size?: [number, number]): DocText => {
  const d = makeDoc('d', [[['Routine inspections take place every quarter.'], [`The fee is ${word} per visit.`]], [['Emergency call-outs are answered around the clock.']]]);
  if (size) [d.pages[1].width, d.pages[1].height] = size;
  return d;
};

test('a page too large to compare and a page that fails to render are listed; the text result stays', async () => {
  const a = model(doc2('100'));
  const b = model(doc2('120', [14400, 14400]));
  const r = compareDocs(a, b);
  const asked: string[] = [];
  await addVisualChanges(
    r,
    async (p) => (asked.push('old' + p), raster(595, 842, 1.5)),
    async (p) => {
      asked.push('new' + p);
      if (p === 1) throw new Error('should not be rendered');
      return raster(595, 842, 1.5);
    },
  );
  assert.ok(!asked.includes('new1'), asked.join());
  assert.deepEqual(r.coverage.new.visualSkipped, [1]);
  assert.ok(r.changes.some((c) => c.numeric?.from === '100'));
  assert.ok(notices('en', r).some((n) => n.level === 'warn' && n.text === 'New version p. 2: graphics and images were not compared (the page is too large to render, could not be rendered, or was turned and could not be turned back).'));

  const r2 = compareDocs(model(doc2('100')), model(doc2('120')));
  await addVisualChanges(
    r2,
    async () => raster(595, 842, 1.5),
    async (p) => {
      if (p === 0) throw new Error('render failed');
      return raster(595, 842, 1.5);
    },
  );
  assert.deepEqual(r2.coverage.new.visualSkipped, [0]);
  assert.ok(r2.changes.some((c) => c.numeric?.from === '100'));
});

test('a change to landscape is reported, and a box beyond the old page width is found', async () => {
  const a = makeDoc('a', [[['Routine inspections take place every quarter.'], ['Emergency call-outs are answered around the clock.']]]);
  const b = makeDoc('b', [[['Routine inspections take place every quarter.'], ['Emergency call-outs are answered around the clock.']]]);
  [b.pages[0].width, b.pages[0].height] = [842, 595];
  const r = compareDocs(model(a), model(b));
  await addVisualChanges(
    r,
    async () => raster(595, 842, 1.5),
    async () => raster(842, 595, 1.5, [{ x: 650, y: 100, w: 80, h: 50, rgb: [204, 34, 34] }]),
  );
  const d = r.changes.map((c) => describeChange('en', c));
  assert.ok(d.includes('Page size changed: 595 × 842 pt → 842 × 595 pt'), d.join(' | '));
  const box = r.changes.find((c) => c.kind === 'graphic' && !c.pageChange);
  assert.ok(box, d.join(' | '));
  assert.ok(box.new.rects.some((q) => q.rect.x >= 640 && q.rect.x + q.rect.w <= 740));
});

test('a tall change is shown whole in its crop', () => {
  const m = model(makeDoc('m', [[['A chart page.']]]));
  const c = { kind: 'graphic', category: 'visual', old: { pages: [0], rects: [{ page: 0, rect: { x: 60, y: 120, w: 470, h: 600 } }], text: '' }, new: { pages: [], rects: [], text: '' } } as unknown as Change;
  const region = cropRegion(c, 'old', m)!;
  assert.ok(region.rect.y <= 120 && region.rect.y + region.rect.h >= 720, JSON.stringify(region.rect));
});

/** One page of justified text: every line spans [left, right]. */
function justified(left: number, right: number, extra?: TextRun): DocText {
  const words = 'the contractor keeps a written log of every visit and shares it with the facilities manager'.split(' ');
  const runs: TextRun[] = [];
  for (let k = 0; k < 12; k++) {
    const y = 90 + k * 16;
    const n = words.length;
    const step = (right - left) / n;
    words.forEach((w, i) => {
      const x = left + i * step;
      const width = Math.min(step - 3, w.length * 5.5);
      // The last word ends exactly at the right margin.
      const rx = i === n - 1 ? right - width : x;
      runs.push({ str: w, x: rx, y: y - 10, w: width, h: 12, baseline: y, fontSize: 11, font: 'Body-Regular', family: 'sans-serif', eol: i === n - 1, angle: 0 });
    });
  }
  if (extra) runs.push(extra);
  return { name: 'j', pages: [{ index: 0, width: 595, height: 842, runs }] };
}

test('narrower margins in a new template are not overflow; text sticking out of the block still is', () => {
  const r = compareDocs(model(justified(96, 499)), model(justified(57, 539)));
  assert.ok(!r.changes.some((c) => c.kind === 'overflow'), r.changes.map((c) => describeChange('en', c)).join(' | '));
  const run = (x: number): TextRun => ({ str: 'USD 12,500 total', x, y: 300, w: 80, h: 12, baseline: 310, fontSize: 11, font: 'Body-Regular', family: 'sans-serif', eol: true, angle: 0 });
  const a = justified(57, 539, run(400));
  const b = justified(57, 539, run(500));
  b.pages[0].runs[b.pages[0].runs.length - 1].str = 'USD 12,500 total';
  const o = compareDocs(model(a), model(b)).changes.find((c) => c.kind === 'overflow');
  assert.ok(o && o.overflow?.edge === 'margin');
});
