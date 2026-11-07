#!/usr/bin/env node
// Fix round 9, area T1 (reading order), third pass: SYNTHETIC probe PDFs
// printed with Chromium (Playwright), A4, 20 mm margins.
//
// Usage:  node test/fixtures/gen9/probe9-T1c.mjs OUT_DIR   (OUT_DIR: test/fixtures)
//
// Every document is synthetic: fictitious parties, stations and figures,
// marked SYNTHETIC on the page. Each page has a position: fixed footer
// declared first in the DOM (a print template with the header and footer
// first). Chromium paints positioned elements after the text in the flow, in
// tree order, so everything positioned (a floated side note with
// position: relative; footnote markers styled as in normalize.css and
// Tailwind, `sup { position: relative; top: -0.5em }`) is drawn after the
// footer, as PDF editors store re-typed text. Nothing was re-typed.
//
//   probe9-T1-sidenote-before / -after / -edit
//       a price table, then a key/value list with a side note floated right
//       beside its rows; -after inserts a paragraph between the table and
//       the list, -edit also edits the note ("seal" -> "spare")
//   probe9-T1-sup-before / -after
//       four paragraphs with footnote markers; -after inserts a paragraph at
//       the top (the text below moves down) and edits a word ("March" ->
//       "April")
//   probe9-T1-supend-before / -after
//       control: the same with the footer declared last in the DOM, so the
//       markers are drawn in reading order
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const out = process.argv[2];
if (!out) {
  console.error('usage: node probe9-T1c.mjs OUT_DIR');
  process.exit(2);
}

function sidenote(insert, noteEdit) {
  const rows = [
    ['Filter cartridge', '2', '45.00', '90.00'],
    ['Pressure gauge', '1', '60.00', '60.00'],
    ['Hose set', '3', '75.00', '225.00'],
  ]
    .map(([a, b, c, d]) => `<tr><td>${a}</td><td class=n>${b}</td><td class=n>${c}</td><td class=n>${d}</td></tr>`)
    .join('');
  const kv = [
    ['Customer', 'Harbourside Clinics Ltd'],
    ['Order no.', 'SO-2026-0417'],
    ['Delivery', 'within ten working days'],
    ['Payment', '30 days net'],
    ['Contact', 'M. Lindqvist'],
  ]
    .map(([a, b]) => `<div class=row><span class=l>${a}</span>${b}</div>`)
    .join('');
  const note = ['Note: the technician', noteEdit ? 'brings the spare kit' : 'brings the seal kit', 'and the gauge tester', 'on the first visit.'].join('<br>');
  const ins = insert ? '<p>Inserted paragraph: SYNTHETIC parts are reserved for this order for fourteen days after it is confirmed.</p>' : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 10pt/16pt 'Liberation Serif', serif; margin: 0; }
    h1 { font: bold 13pt/18pt 'Liberation Sans', sans-serif; margin: 0 0 8pt 0; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 6pt 0; }
    td { padding: 0; height: 16pt; } td.n { text-align: right; width: 22%; }
    p { margin: 0 0 8pt 0; }
    .l { display: inline-block; width: 90pt; }
    footer { position: fixed; bottom: 0; left: 0; font-size: 8pt; }
    .note { float: right; position: relative; width: 38%; }
    </style></head><body><footer>SYNTHETIC sample, fictitious parties</footer><h1>SYNTHETIC probe P2b - Service order</h1>
    <table><tr><td>Item</td><td class=n>Qty</td><td class=n>Unit price</td><td class=n>Total</td></tr>${rows}</table>${ins}
    <div class=kv><div class=note>${note}</div>${kv}</div>
    <p style="clear: both">The SYNTHETIC service order covers the parts listed above and one visit by a technician.</p>
    <p>Parts are delivered to the site named in the order. Invoices are sent by e-mail.</p>
    </body></html>`;
}

function sup(insert, edit, footerLast) {
  const paras = [
    'The SYNTHETIC water board inspected the northern stations in spring.<sup>1</sup> The flow at station 4 was 1,250 litres per minute.<sup>2</sup>',
    'Crews replaced two worn seals<sup>3</sup> and recorded the torque on each flange bolt, as the maintenance plan requires for the outlet manifold.',
    `No leaks were found at the outlet manifold, and the gauges were calibrated in ${edit ? 'April' : 'March'}.<sup>4</sup>`,
    'The next inspection is planned for the autumn, when the reservoir level is lowest and the pumps can be taken out of service.<sup>5</sup>',
  ];
  if (insert) paras.unshift('Inserted paragraph: this SYNTHETIC report replaces the interim note sent in May and covers all stations of the district.');
  const notes = [1, 2, 3, 4, 5].map((k) => `<li>Footnote ${k}: SYNTHETIC source document ${k}.</li>`).join('');
  const footer = '<footer>SYNTHETIC sample, fictitious board</footer>';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 11pt/1.4 'Liberation Serif', serif; margin: 0; }
    sub, sup { font-size: 75%; line-height: 0; position: relative; vertical-align: baseline; }
    sup { top: -0.5em; }
    footer { position: fixed; bottom: 0; left: 0; font-size: 8pt; }
    p { margin: 0 0 10pt 0; }
    </style></head><body>${footerLast ? '' : footer}<h1 style="font-size:14pt">SYNTHETIC station report</h1>
    ${paras.map((p) => `<p>${p}</p>`).join('')}<ol style="font-size:9pt">${notes}</ol>${footerLast ? footer : ''}</body></html>`;
}

const docs = {
  'probe9-T1-sidenote-before': sidenote(false, false),
  'probe9-T1-sidenote-after': sidenote(true, false),
  'probe9-T1-sidenote-edit': sidenote(true, true),
  'probe9-T1-sup-before': sup(false, false, false),
  'probe9-T1-sup-after': sup(true, true, false),
  'probe9-T1-supend-before': sup(false, false, true),
  'probe9-T1-supend-after': sup(true, true, true),
};
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, html] of Object.entries(docs)) {
  await page.setContent(html);
  const margin = { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' };
  writeFileSync(join(out, `${name}.pdf`), await page.pdf({ format: 'A4', margin }));
  console.log('wrote', `${name}.pdf`);
}
await browser.close();
