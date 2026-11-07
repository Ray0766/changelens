#!/usr/bin/env node
// Test fixture for manual page pairing (test/fixtures/textless-*.pdf).
// Old: text page, a chart-only page (no text at all), text page.
// New: a text page is inserted before the chart, and one chart bar changed.
// Without manual pairing the chart pages cannot be paired automatically.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const chart = (tall) => `<svg width="600" height="420" xmlns="http://www.w3.org/2000/svg">
  <line x1="40" y1="380" x2="580" y2="380" stroke="#333" stroke-width="2"/>
  <line x1="40" y1="20" x2="40" y2="380" stroke="#333" stroke-width="2"/>
  ${[120, 200, tall ? 330 : 160, 240].map((h, i) => `<rect x="${80 + i * 120}" y="${380 - h}" width="70" height="${h}" fill="#4f86b7"/>`).join('')}
</svg>`;
const text = (t) => `<p style="font-size:12pt;line-height:1.5">${t}</p>`;
const page = (body) => `<div style="break-before:page">${body}</div>`;
const P1 = text('Quarterly maintenance summary. This report lists the work done in the third quarter and the energy use of the main plant. The chart on the next page shows the monthly consumption.');
const P3 = text('Notes. Consumption rose in the second month because of a chiller fault that was repaired within two days. All other values are within the expected range.');
const extra = text('Addendum. A new section on spare parts was added at the request of the facilities manager. It lists the parts that were replaced during the quarter.');
const doc = (v) => `<!doctype html><html><body style="font-family:'Liberation Serif';margin:0;padding:0 20mm">${P1}${page(chart(v === 'after'))}${page(P3)}</body></html>`
  .replace(v === 'after' ? page(chart(true)) : '\u0000', v === 'after' ? page(extra) + page(chart(true)) : '');

const browser = await chromium.launch();
const p = await browser.newPage();
for (const v of ['before', 'after']) {
  await p.setContent(doc(v));
  const pdf = await p.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm' } });
  writeFileSync(join(root, 'test/fixtures', `textless-${v}.pdf`), pdf);
  console.log('wrote', `textless-${v}.pdf`);
}
await browser.close();
