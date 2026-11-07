// Report crops of pages too large for the pixel budget (fix round 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdfData } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { drawCrop, type CanvasLike } from '../src/core/crops.ts';
import type { Change } from '../src/core/types.ts';

const skip = !(await canRender()) && 'no canvas';

/** A one-page PDF of the given size (pt) with a black square of `side` pt at (x, y) from the top left. */
function squarePdf(size: number, x: number, y: number, side: number): Uint8Array {
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

test('a crop of a page too large for the pixel budget keeps the requested scale', { skip }, async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const pdf = await openPdfData(squarePdf(14400, 7000, 7000, 24));
  // The whole page only fits the budget at about 0.2 px/pt.
  assert.ok((await renderPage(pdf, 0, 2)).scale < 0.25);
  const region = { page: 0, rect: { x: 6960, y: 6980, w: 104, h: 64 } };
  const part = await renderPage(pdf, 0, 2, region.rect);
  assert.equal(part.scale, 2);
  assert.deepEqual([part.width, part.height], [208, 128]);
  type Img = { width: number; height: number; getContext(t: '2d'): { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } } };
  let out: Img | null = null;
  const make = (w: number, h: number) => (out = createCanvas(w, h) as unknown as Img) as unknown as CanvasLike;
  const change = { kind: 'graphic', category: 'visual', old: { pages: [], rects: [], text: '' }, new: { pages: [0], rects: [], text: '' } } as unknown as Change;
  drawCrop(make, part.canvas as unknown as CanvasLike, 2, region, change, 'new');
  const img = out!;
  assert.deepEqual([img.width, img.height], [208, 128]);
  const data = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
  const at = (x: number, y: number) => data[(y * img.width + x) * 4];
  // The 24 pt square spans 48 pixels, from x = (7000 − 6960) · 2 = 80, y = 40.
  assert.ok(at(81, 41) < 50 && at(126, 86) < 50, 'square, sharp at both corners');
  assert.ok(at(77, 41) > 200 && at(131, 86) > 200, 'paper next to it');
});
