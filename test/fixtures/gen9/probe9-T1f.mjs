#!/usr/bin/env node
// Fix round 9, area T1 (reading order), sixth pass: SYNTHETIC probe PDFs
// printed with Chromium (Playwright), A4, 20 mm margins. The same pages as
// the independent check of the fifth pass (its Z probes).
//
// Usage:  node test/fixtures/gen9/probe9-T1f.mjs OUT_DIR   (OUT_DIR: test/fixtures)
//
// Every document is synthetic: a fictitious water board, marked SYNTHETIC
// on the page. Each page has a position: fixed footer declared first in the
// DOM, so that the note (position: relative) is drawn after the footer.
// Nothing was re-typed.
//
//   probe9-T1-snote-before / -body / -note
//       a narrow note (3.2em) in 9 pt floated right, 0 pt from a justified
//       11 pt paragraph, one word per line; -body inserts "and eastern" in
//       the paragraph (re-wrapping it), -note edits "held" -> "final"
//   probe9-T1-sznote-before / -body
//       a Chinese note 4.5em wide in 8 pt, the same way, about four
//       characters per line; -body inserts 和东区 in the paragraph
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const out = process.argv[2];
if (!out) {
  console.error('usage: node probe9-T1f.mjs OUT_DIR');
  process.exit(2);
}

const words = (ed) =>
  `The SYNTHETIC water board inspected the northern ${ed ? 'and eastern ' : ''}stations in spring and logged the flow at station 4 as 1,250 litres per minute on each visit. Crews replaced two worn seals on the dosing line and recorded the torque on each flange bolt, as the plan requires for the outlet manifold. No leaks were found at the outlet manifold, and the gauges were calibrated in March.`;
const zh = (ed) =>
  `本报告为合成样例（SYNTHETIC），记录北区${ed ? '和东区' : ''}各泵站春季巡检的结果。巡检人员在每次到访时记录四号站的流量，并更换了加药管线上两处磨损的密封件。所有法兰螺栓的扭矩均按计划记录在案，出水总管未发现泄漏，各压力表已于三月完成校准。`;
const page = ({ cjk = false, body = false, edit = false }) => `<!doctype html><html><head><meta charset="utf-8"><style>
 body { font: 11pt/1.5 ${cjk ? "'WenQuanYi Zen Hei'" : "'Liberation Sans'"}, sans-serif; margin: 0; }
 footer { position: fixed; bottom: 0; left: 0; font-size: 8pt; }
 p { margin: 0 0 10pt 0; } p.t { text-align: justify; }
 .note { float: right; position: relative; width: ${cjk ? '4.5em' : '3.2em'}; font-size: ${cjk ? 8 : 9}pt; line-height: 1.3; margin-left: 0; }
 </style></head><body><footer>SYNTHETIC sample, fictitious board</footer><h1 style="font-size:14pt">SYNTHETIC station report</h1>
 <div class="note">${cjk ? '注：本站数据暂时保存，待审计后发布。' : `Note: data ${edit ? 'final' : 'held'} until audit.`}</div>
 <p class="t">${(cjk ? zh : words)(body)}</p><p>${(cjk ? zh : words)(false)}</p></body></html>`;

const docs = {
  'probe9-T1-snote-before': page({}),
  'probe9-T1-snote-body': page({ body: true }),
  'probe9-T1-snote-note': page({ edit: true }),
  'probe9-T1-sznote-before': page({ cjk: true }),
  'probe9-T1-sznote-body': page({ cjk: true, body: true }),
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
