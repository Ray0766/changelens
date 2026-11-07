#!/usr/bin/env node
// SYNTHETIC test fixtures for the visual stage (test/visual-*.test.ts):
//
//   visual-before.pdf / visual-after.pdf — one scenario per page, same text
//   on both sides unless stated:
//     p1  "four" struck through, "thirty days" underlined, a price struck
//         through, a 0.75 pt rule added 1 pt above a paragraph
//     p2  a line re-aligned from left to right; a full-width band 16 pt
//         below it stays in place but turns from green to red
//     p3  red text inside a red frame → black text, frame removed
//     p4  "Emergency call-outs" turns red, "hours of" on the next line blue
//     p5  a chart bar grows by 3.75 pt; a single rule becomes a double rule
//     p6  a table row gets #f2f2f2 shading; a 0.5 pt #c8c8c8 hairline is added
//     p7  the first sentence of four paragraphs is made bold
//   figpages-before.pdf / figpages-after.pdf — a text page, a chart page
//     without text, a text page; the new version inserts a second chart page
//     (no text) before the first one.
//
// Run with Playwright available: node test/fixtures/make-visual-fixtures.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const out = dirname(fileURLToPath(import.meta.url));

const css = `@page{size:A4;margin:20mm} body{font-family:'Liberation Serif';font-size:12pt;line-height:1.4;margin:0} p{margin:0 0 8pt} .pb{break-before:page;position:relative}`;
const html = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;

const P = {
  maint: 'Maintenance schedule for the north building. Routine inspections take place every quarter and cover heating, ventilation and the fire alarm system.',
  arrive: (four) => `The contractor must arrive on site within ${four} hours of the call. The fee is USD ${'12,000'} per year.`,
  invoices: (days) => `Invoices are paid within ${days} of receipt. Disputed amounts are held until the facilities manager confirms the work.`,
  term: 'The contract runs for two years and renews automatically unless either party gives notice at least ninety days before the end of the term.',
  spare: 'Spare parts that are not on the stock list are ordered after written approval. Delivery normally takes ten working days.',
  keys: 'Keys to the plant rooms are kept at the security desk and signed out for each visit. Lost keys are replaced at the cost of the contractor.',
  waste: 'Waste oil and used filters are taken away by a licensed carrier. The carrier issues a transfer note that is kept with the visit log.',
  emerg: 'Emergency call-outs are answered around the clock. The engineer must arrive within four hours of the call and report to the desk.',
  chart: 'Energy use per month of the main plant. The chart below shows the consumption in megawatt hours for the first quarter.',
  table: 'Visit schedule for the plant rooms of the east wing, as agreed at the start of the contract.',
};

function page1(after) {
  const s = (t) => (after ? `<s>${t}</s>` : t);
  const u = (t) => (after ? `<u>${t}</u>` : t);
  const rule = after ? '<div style="position:absolute;left:0;top:118pt;width:480pt;height:0.75pt;background:#000"></div>' : '';
  return `<div>${rule}<p>${P.maint}</p><p>The contractor must arrive on site within ${s('four')} hours of the call. The fee is USD ${s('12,000')} per year.</p><p>Invoices are paid within ${u('thirty days')} of receipt. Disputed amounts are held until the facilities manager confirms the work.</p><p style="margin-top:20pt">${P.term}</p></div>`;
}

function page2(after) {
  const band = `<div style="height:24pt;background:${after ? '#cc2222' : '#118822'};margin-top:16pt"></div>`;
  return `<div class="pb"><p>${P.spare}</p><p style="text-align:${after ? 'right' : 'left'}">Approved by the facilities manager</p>${band}<p style="margin-top:30pt">${P.keys}</p></div>`;
}

function page3(after) {
  const c = after ? '#000' : '#cc2222';
  const frame = after ? 'border:2pt solid transparent' : 'border:2pt solid #cc2222';
  return `<div class="pb"><p>${P.waste}</p><div style="display:inline-block;padding:10pt;${frame};color:${c}">Payment is overdue since 3 March</div><p style="margin-top:20pt">${P.term}</p></div>`;
}

function page4(after) {
  const a = after ? '<span style="color:#cc0000">Emergency call-outs</span>' : 'Emergency call-outs';
  const b = after ? '<span style="color:#0033cc">hours of</span>' : 'hours of';
  const tight = 'line-height:1.15;margin:0';
  return `<div class="pb"><p>${P.keys}</p><p style="${tight}">${a} are answered around the clock by the duty engineer.</p><p style="${tight}">${b} work are logged at the desk.</p><p style="margin-top:8pt">${P.waste}</p></div>`;
}

function page5(after) {
  const h = after ? 105 : 100;
  const chart = `<svg width="300" height="220" style="display:block;margin:10pt 0"><line x1="20" y1="200" x2="290" y2="200" stroke="#000" stroke-width="1"/><rect x="40" y="80" width="30" height="120" fill="#3366aa"/><rect x="100" y="50" width="30" height="150" fill="#3366aa"/><rect x="160" y="${200 - h}" width="30" height="${h}" fill="#3366aa"/></svg>`;
  const rules = `<div style="height:30pt"></div><div style="width:300pt;height:1pt;background:#000"></div>${after ? '<div style="width:300pt;height:1pt;background:#000;margin-top:2pt"></div>' : '<div style="height:3pt"></div>'}<div style="height:30pt"></div>`;
  return `<div class="pb"><p>${P.chart}</p>${chart}${rules}<p>${P.spare}</p></div>`;
}

function page6(after) {
  const shade = after ? '#f2f2f2' : 'transparent';
  const rule = after ? '<div style="width:480pt;height:0.5pt;background:#c8c8c8"></div>' : '<div style="height:0.5pt"></div>';
  const tbl = `<table style="border-collapse:collapse;width:480pt;margin:20pt 0"><tr style="background:${shade}"><td style="padding:6pt">Boiler room</td><td>Monthly</td><td>USD 300</td></tr><tr><td style="padding:6pt">Lift motor room</td><td>Quarterly</td><td>USD 650</td></tr><tr><td style="padding:6pt">Roof plant</td><td>Yearly</td><td>USD 1,100</td></tr></table>`;
  return `<div class="pb"><p>${P.table}</p>${tbl}${rule}<div style="height:30pt"></div><p>${P.emerg}</p></div>`;
}

function page7(after) {
  const b = (t) => (after ? `<b>${t}</b>` : t);
  return `<div class="pb">${[
    ['Cleaning of the filters is done monthly.', 'The technician signs the log.'],
    ['Drains are checked every quarter.', 'Blocked drains are cleared the same day.'],
    ['Belts are replaced every year.', 'Worn pulleys are replaced with them.'],
    ['Meter readings are sent weekly.', 'They feed the energy report.'],
  ]
    .map(([first, rest]) => `<p>${b(first)} ${rest}</p>`)
    .join('')}</div>`;
}

const chartPage = (bars, color) =>
  `<div class="pb"><svg width="480" height="400"><line x1="40" y1="360" x2="460" y2="360" stroke="#333" stroke-width="2"/>${bars
    .map((h, i) => `<rect x="${70 + i * 100}" y="${360 - h}" width="60" height="${h}" fill="${color}"/>`)
    .join('')}</svg></div>`;
const text = (k) => `<div${k ? ' class="pb"' : ''}><p>${k ? P.keys : P.maint}</p><p>${k ? P.waste : P.term}</p></div>`;

const docs = {
  'visual-before.pdf': html([page1, page2, page3, page4, page5, page6, page7].map((f) => f(false)).join('')),
  'visual-after.pdf': html([page1, page2, page3, page4, page5, page6, page7].map((f) => f(true)).join('')),
  'figpages-before.pdf': html(text(0) + chartPage([120, 200, 160, 240], '#4f86b7') + text(1)),
  'figpages-after.pdf': html(text(0) + chartPage([300, 80, 260], '#c0504d') + chartPage([120, 200, 160, 240], '#4f86b7') + text(1)),
};

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, content] of Object.entries(docs)) {
  await page.setContent(content, { waitUntil: 'load' });
  writeFileSync(join(out, name), await page.pdf({ printBackground: true, preferCSSPageSize: true }));
  console.log('wrote', name);
}
await browser.close();
