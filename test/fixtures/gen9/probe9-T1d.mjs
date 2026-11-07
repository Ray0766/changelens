#!/usr/bin/env node
// Fix round 9, area T1 (reading order), fourth pass: SYNTHETIC probe PDFs
// printed with Chromium (Playwright), A4, 20 mm margins.
//
// Usage:  node test/fixtures/gen9/probe9-T1d.mjs OUT_DIR   (OUT_DIR: test/fixtures)
//
// Every document is synthetic: a fictitious water board, marked SYNTHETIC on
// the page. As in probe9-T1c.mjs, each page has a position: fixed footer
// declared first in the DOM, so that footnote markers styled as in
// normalize.css and Tailwind (`sup { position: relative; top: -0.5em;
// font-size: 75% }`), and words styled position: relative, are drawn after
// the footer. Nothing was re-typed.
//
//   probe9-T1-rewrap-before / -april / -all
//       four paragraphs with footnote markers in Liberation Sans; -april
//       edits "March" -> "April", which brings "The readings" up a line, so
//       markers 4 and 5 stand on one baseline and 5 at the end of the line;
//       -all edits "The readings" -> "All readings"
//   probe9-T1-rewrapend-before / -april
//       control: the same with the footer declared last, markers in order
//   probe9-T1-raise7-before / -after, probe9-T1-raise8-before / -after
//       markers at 85 % raised 0.7 em and 0.8 em (Liberation Serif); -after
//       inserts a paragraph at the top and edits "March" -> "April"
//   probe9-T1-word-before / -outlet / -new
//       words styled position: relative (a badge or a tooltip anchor, at
//       full size) inside paragraphs; -outlet deletes "outlet", -new adds
//       "new", either of which moves "readings" from the end of its line
//       into the line or back
//   probe9-T1-punct-before / -late
//       markers set right before a full stop ("out of service⁸."), where the
//       text on either side of the marker is one text run, so the marker is
//       not placed; -late edits "autumn" -> "late autumn", which moves
//       marker 8 sideways with its word
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const out = process.argv[2];
if (!out) {
  console.error('usage: node probe9-T1d.mjs OUT_DIR');
  process.exit(2);
}

function page({ font, size = 75, top = 0.5, insert = false, footerLast = false, paras }) {
  if (insert) paras = ['Inserted paragraph: this SYNTHETIC report replaces the interim note sent in May and covers all stations of the district.', ...paras];
  const notes = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => `<li>Footnote ${k}: SYNTHETIC source document ${k}.</li>`).join('');
  const footer = '<footer>SYNTHETIC sample, fictitious board</footer>';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 11pt/1.4 ${font}; margin: 0; }
    sup { font-size: ${size}%; line-height: 0; position: relative; vertical-align: baseline; top: -${top}em; }
    footer { position: fixed; bottom: 0; left: 0; font-size: 8pt; }
    p { margin: 0 0 10pt 0; }
    </style></head><body>${footerLast ? '' : footer}<h1 style="font-size:14pt">SYNTHETIC station report</h1>
    ${paras.map((p) => `<p>${p}</p>`).join('')}<ol style="font-size:9pt">${notes}</ol>${footerLast ? footer : ''}</body></html>`;
}

const station = (month = 'March', readings = 'The readings') => [
  'The SYNTHETIC water board inspected the northern stations in spring.<sup>1</sup> The flow at station 4 was 1,250 litres per minute.<sup>2</sup>',
  'Crews replaced two worn seals<sup>3</sup> and recorded the torque on each flange bolt, as the maintenance plan requires for the outlet manifold.',
  `No leaks were found at the outlet manifold, and the gauges were calibrated in ${month}.<sup>4</sup> ${readings}<sup>5</sup> are kept by the district office for ten years.`,
  'The next inspection is planned for the autumn, when the reservoir level is lowest and the pumps can be taken out of service.<sup>6</sup>',
];
const punct = (season = 'autumn') => [
  'The SYNTHETIC water board inspected the northern stations in spring<sup>1</sup> and logged the flow at station 4 as 1,250 litres per minute<sup>2</sup> on each visit.',
  'Crews replaced two worn seals<sup>3</sup> and recorded the torque on each flange bolt, as the plan<sup>4</sup> requires for the outlet manifold.',
  `No leaks were found at the outlet manifold, and the gauges were calibrated in March<sup>5</sup>. The readings<sup>6</sup> are kept by the district office for ten years<sup>7</sup>.`,
  `The next inspection is planned for the ${season}, when the reservoir level is lowest and the pumps can be taken out of service<sup>8</sup>.`,
];
const span = (s) => `<span style="position: relative">${s}</span>`;
const words = (ed) => [
  `The SYNTHETIC water board inspected the northern stations in ${span('spring')} and logged the flow at station 4 as 1,250 litres per minute on each ${span('visit')}.`,
  `Crews replaced two worn ${span('seals')} on the dosing line and recorded the torque on each flange bolt, as the ${span('plan')} requires for the outlet manifold.`,
  `No leaks were found at the ${ed === 'outlet' ? '' : 'outlet '}manifold, and the ${ed === 'new' ? 'new ' : ''}gauges were calibrated in March. The ${span('readings')} are kept by the district office for ten ${span('years')}.`,
  `The next inspection is planned for the autumn, when the reservoir level is lowest and the pumps can be taken out of ${span('service')}.`,
];
const sans = "'Liberation Sans', sans-serif";
const serif = "'Liberation Serif', serif";
const docs = {
  'probe9-T1-rewrap-before': page({ font: sans, paras: station() }),
  'probe9-T1-rewrap-april': page({ font: sans, paras: station('April') }),
  'probe9-T1-rewrap-all': page({ font: sans, paras: station('March', 'All readings') }),
  'probe9-T1-rewrapend-before': page({ font: sans, footerLast: true, paras: station() }),
  'probe9-T1-rewrapend-april': page({ font: sans, footerLast: true, paras: station('April') }),
  'probe9-T1-raise7-before': page({ font: serif, size: 85, top: 0.7, paras: station() }),
  'probe9-T1-raise7-after': page({ font: serif, size: 85, top: 0.7, insert: true, paras: station('April') }),
  'probe9-T1-raise8-before': page({ font: serif, size: 85, top: 0.8, paras: station() }),
  'probe9-T1-raise8-after': page({ font: serif, size: 85, top: 0.8, insert: true, paras: station('April') }),
  'probe9-T1-word-before': page({ font: sans, paras: words() }),
  'probe9-T1-word-outlet': page({ font: sans, paras: words('outlet') }),
  'probe9-T1-word-new': page({ font: sans, paras: words('new') }),
  'probe9-T1-punct-before': page({ font: sans, paras: punct() }),
  'probe9-T1-punct-late': page({ font: sans, paras: punct('late autumn') }),
};
const browser = await chromium.launch();
const tab = await browser.newPage();
for (const [name, html] of Object.entries(docs)) {
  await tab.setContent(html);
  const margin = { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' };
  writeFileSync(join(out, `${name}.pdf`), await tab.pdf({ format: 'A4', margin }));
  console.log('wrote', `${name}.pdf`);
}
await browser.close();
