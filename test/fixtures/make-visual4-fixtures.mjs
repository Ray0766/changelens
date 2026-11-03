#!/usr/bin/env node
// SYNTHETIC test fixtures for test/visual4-*.test.ts (Chromium):
//
//   reflow4-before.pdf / reflow4-after.pdf — one scenario per page:
//     p1  a logo (a square and two bars) moved 2 pt to the right
//     p2  a light bar with a thin dark outline on a grey grid (a reportlab-
//         style chart) grows by 4 pt; the other bars are unchanged
//     p3  a sentence struck through over a line break
//     p4  a 0.75 pt rule added 1 pt above a paragraph
//     p5  a chart between two paragraphs is deleted while a sentence is
//         added above it, so the text below moves up into its place
//   shot4-*.pdf  — a screenshot of a table (bitmap text and grey rules) below
//                  a paragraph that gains a sentence: it moves down a line
//   push4-*.pdf  — text added on p. 1 pushes a chart from the foot of p. 1
//                  to the top of p. 2, unchanged (push4-same-after.pdf) or
//                  with one bar 4 pt taller (push4-grew-after.pdf)
//   letter4-*.pdf — the same report printed on A4 and on US Letter: the
//                  charts move to other pages and places
//   blank4-*.pdf — the new version has a blank page between two text pages
//
// Run with Playwright available: node test/fixtures/make-visual4-fixtures.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const { createCanvas } = await import('@napi-rs/canvas');
const out = dirname(fileURLToPath(import.meta.url));

const css = (size = 'A4') =>
  `@page{size:${size};margin:20mm} body{font-family:'Liberation Serif';font-size:12pt;line-height:1.4;margin:0} p{margin:0 0 8pt} .pb{break-before:page;position:relative}`;
const html = (body, size) => `<!doctype html><html><head><meta charset="utf-8"><style>${css(size)}</style></head><body>${body}</body></html>`;

const P = [
  'Maintenance schedule for the north building. Routine inspections take place every quarter and cover heating, ventilation and the fire alarm system.',
  'Emergency call-outs are answered around the clock. The contractor must arrive on site within four hours of the call and report to the facilities desk.',
  'Spare parts that are not on the stock list are ordered after written approval. Delivery normally takes ten working days from the order date.',
  'Invoices are paid within thirty days of receipt. Disputed amounts are held until the facilities manager confirms the work was completed.',
  'The contract runs for two years and renews automatically unless either party gives notice at least ninety days before the end of the term.',
];
const extra = ' Each inspection is recorded in the site log and signed by the duty engineer on the same day.';

// A screenshot of a table: grey bitmap text and thin rules, at 2 px/pt.
function screenshot() {
  const c = createCanvas(400, 120);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 400, 120);
  g.font = '16px sans-serif';
  for (let k = 0; k < 4; k++) {
    g.fillStyle = '#282828';
    g.fillText(`Row ${k + 1}: invoice 2025-${k + 101}   amount ${(123.45 * (k + 1)).toFixed(2)}   status paid`, 20, 26 + k * 30);
    g.fillStyle = '#c8c8c8';
    g.fillRect(10, 34 + k * 30, 380, 1);
  }
  g.strokeStyle = '#969696';
  g.strokeRect(0.5, 0.5, 399, 119);
  return c.toDataURL('image/png');
}
const shot = (extra) => `<p>${P[0]}${extra}</p><img src="${screenshot()}" style="width:200pt;display:block;margin:6pt 0"><p>${P[1]}</p>`;

const logo = '<svg width="160" height="60"><rect x="0" y="0" width="60" height="60" fill="#1a4d8f"/><rect x="70" y="10" width="90" height="12" fill="#1a4d8f"/><rect x="70" y="32" width="70" height="12" fill="#e08a00"/></svg>';
const abs = (x, y, inner) => `<div style="position:absolute;left:${x}pt;top:${y}pt">${inner}</div>`;
// A reportlab-style chart: light bars with a thin dark outline on a grey grid.
const lightBars = (h) =>
  `<svg width="400pt" height="200pt" viewBox="0 0 400 200" style="display:block;margin:0 0 8pt"><rect x="0" y="0" width="400" height="200" fill="#f4f4f4"/>` +
  Array.from({ length: 11 }, (_, k) => `<line x1="0" y1="${k * 20}" x2="400" y2="${k * 20}" stroke="#e0e0e0" stroke-width="0.3"/>`).join('') +
  [120, 150, 90, 170, h, 100].map((v, i) => `<rect x="${20 + i * 60}" y="${200 - v}" width="36" height="${v}" fill="#dbe7f5" stroke="#4a78b5" stroke-width="0.4"/>`).join('') +
  '</svg>';
const chart = (h, color = '#2a5caa') =>
  `<svg width="300" height="120" style="display:block;margin:0 0 8pt"><rect x="20" y="30" width="30" height="80" fill="${color}"/><rect x="70" y="${110 - h}" width="30" height="${h}" fill="${color}"/><rect x="120" y="50" width="30" height="60" fill="${color}"/><line x1="10" y1="110" x2="290" y2="110" stroke="#000" stroke-width="1"/></svg>`;

const reflow = (after) =>
  [
    `<div><p>${P[0]}</p><p>${P[1]}</p>${abs(after ? 62 : 60, 140, logo)}</div>`,
    `<div class="pb"><p>${P[2]}</p>${lightBars(after ? 64 : 60)}<p>${P[3]}</p></div>`,
    `<div class="pb"><p>${P[1]} ${after ? '<s>The duty engineer signs the visit log before leaving the site.</s>' : 'The duty engineer signs the visit log before leaving the site.'} ${P[4]}</p></div>`,
    `<div class="pb"><p>${P[3]}</p><p style="${after ? 'border-top:0.75pt solid #000;padding-top:1pt' : ''}">${P[4]}</p><p>${P[0]}</p></div>`,
    `<div class="pb"><p>${P[0]}${after ? extra : ''}</p><p>${P[1]}</p>${after ? '' : chart(60)}<p>${P[2]}</p><p>${P[3]}</p><p>${P[4]}</p></div>`,
  ].join('');

const paras = (n, off = 0) => Array.from({ length: n }, (_, k) => `<p>${k + 1 + off}. ${P[(k + off) % 5]}</p>`).join('');
const push = (added, h) => (added ? paras(3, 40) : '') + paras(12) + '<p>Figure 1. Call-outs per quarter.</p>' + chart(h) + paras(14, 12);

const report = Array.from({ length: 24 }, (_, k) => `<p>${k + 1}. ${P[k % 5]}</p>` + (k % 8 === 4 ? '<svg width="200" height="60" style="display:block;margin:0 0 8pt"><rect width="200" height="60" fill="#2a5caa"/></svg>' : '')).join('');

const docs = {
  'reflow4-before.pdf': html(reflow(false)),
  'reflow4-after.pdf': html(reflow(true)),
  'shot4-before.pdf': html(shot('')),
  'shot4-after.pdf': html(shot(extra)),
  'push4-before.pdf': html(push(false, 60)),
  'push4-same-after.pdf': html(push(true, 60)),
  'push4-grew-after.pdf': html(push(true, 66)),
  'letter4-a4.pdf': html(report, 'A4'),
  'letter4-letter.pdf': html(report, 'letter'),
  'blank4-before.pdf': html(`<div><p>${P[0]}</p><p>${P[1]}</p></div><div class="pb"><p>${P[2]}</p><p>${P[3]}</p></div>`),
  'blank4-after.pdf': html(`<div><p>${P[0]}</p><p>${P[1]}</p></div><div class="pb" style="height:1pt"></div><div class="pb"><p>${P[2]}</p><p>${P[3]}</p></div>`),
};

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, content] of Object.entries(docs)) {
  await page.setContent(content, { waitUntil: 'load' });
  writeFileSync(join(out, name), await page.pdf({ printBackground: true, preferCSSPageSize: true }));
  console.log('wrote', name);
}
await browser.close();
