#!/usr/bin/env node
// Fix round 9, area T1 (reading order), fifth pass: SYNTHETIC probe PDFs
// printed with Chromium (Playwright), A4, 20 mm margins. The same pages as
// the independent check of the fourth pass (its K7 and K2 probes).
//
// Usage:  node test/fixtures/gen9/probe9-T1e.mjs OUT_DIR   (OUT_DIR: test/fixtures)
//
// Every document is synthetic: a fictitious water board or supplier, marked
// SYNTHETIC on the page. Each page has a position: fixed footer declared
// first in the DOM, so that positioned content (a side note styled
// position: relative, footnote markers styled as in normalize.css and
// Tailwind) is drawn after the footer. Nothing was re-typed.
//
//   probe9-T1-rnote-before / -body / -note
//       a side note floated left, text-align: right, 2 pt from a paragraph:
//       each line of the note ends a word space from where the paragraph
//       line beside it starts; -body inserts "and eastern" in the
//       paragraph (re-wrapping it), -note edits "calibration" -> "new" in
//       the note
//   probe9-T1-cnote-before / -body
//       the same note centred (text-align: center), with -body as above
//   probe9-T1-fnlist-one / -two
//       a paragraph with footnote markers and a footnote list in 9 pt whose
//       markers are <sup>; -two adds a second footnote (its marker in the
//       text and its line in the list) and inserts a paragraph at the top
//   probe9-T1-sumline-before / -short
//       a line of words styled position: relative right above a line that
//       ends with a footnote marker, so the marker, drawn next, stands under
//       the positioned line; -short shortens the positioned line, which then
//       ends before the marker's x
//   probe9-T1-wnote-before / -body / -note
//       a narrow side note (6.5em) floated left, text-align: right, 0 pt
//       from a paragraph, one word per line in the paragraph's size; -body
//       and -note as for rnote
//   probe9-T1-znote-before / -body
//       a Chinese side note 6em wide, the same way, its lines of at most six
//       characters; -body inserts 和东部 in the paragraph
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const out = process.argv[2];
if (!out) {
  console.error('usage: node probe9-T1e.mjs OUT_DIR');
  process.exit(2);
}

const flow = (ed) =>
  `The SYNTHETIC water board inspected the northern ${ed ? 'and eastern ' : ''}stations in spring and logged the flow at station 4 as 1,250 litres per minute on each visit. Crews replaced two worn seals on the dosing line and recorded the torque on each flange bolt, as the plan requires for the outlet manifold. No leaks were found at the outlet manifold, and the gauges were calibrated in March. The readings are kept by the district office for ten years.`;
const note = ({ align, body = false, edit = false }) => `<!doctype html><html><head><meta charset="utf-8"><style>
 body { font: 11pt/1.4 'Liberation Sans', sans-serif; margin: 0; }
 footer { position: fixed; bottom: 0; left: 0; font-size: 8pt; }
 .note { float: left; position: relative; width: 30%; margin-right: 2pt; text-align: ${align}; }
 p { margin: 0 0 10pt 0; }
 </style></head><body><footer>SYNTHETIC sample, fictitious board</footer><h1 style="font-size:14pt">SYNTHETIC station report</h1>
 <div class="note">Note: the SYNTHETIC readings for station 4 are provisional until the district office confirms the ${edit ? 'new' : 'calibration'} certificate.</div>
 <p>${flow(body)}</p><p>${flow(false)}</p></body></html>`;

const zflow = (ed) =>
  `合成样例（SYNTHETIC）：水务局于春季检查了北部${ed ? '和东部' : ''}各站点，并记录四号站的流量为每分钟一千二百五十升。维修人员更换了加药管线上的两个磨损密封件，并按计划记录了每个法兰螺栓的扭矩。出口总管未发现泄漏，仪表已于三月完成校准。读数由区办公室保存十年。`;
const narrow = ({ zh = false, body = false, edit = false }) => `<!doctype html><html><head><meta charset="utf-8"><style>
 body { font: 11pt/1.4 'Liberation Sans', 'WenQuanYi Zen Hei', sans-serif; margin: 0; }
 footer { position: fixed; bottom: 0; left: 0; font-size: 8pt; }
 .note { float: left; position: relative; width: ${zh ? '6em' : '6.5em'}; margin-right: 0pt; text-align: right; }
 p { margin: 0 0 10pt 0; }
 </style></head><body><footer>SYNTHETIC sample, fictitious board</footer><h1 style="font-size:14pt">SYNTHETIC station report</h1>
 <div class="note">${zh ? `注：四号站读数为暂定值，待区办公室确认${edit ? '新的' : '校准'}证书后生效。` : `Note: SYNTHETIC readings provisional pending ${edit ? 'new' : 'calibration'} certificate.`}</div>
 <p>${(zh ? zflow : flow)(body)}</p><p>${(zh ? zflow : flow)(false)}</p></body></html>`;

const intro = 'This SYNTHETIC price sheet lists the spare parts for the pump station, valid from 1 March.';
const ins = 'Inserted paragraph: prices for the western district follow in a separate SYNTHETIC sheet.';
const fnlist = (two) => `<!doctype html><html><head><meta charset="utf-8"><style>
 body { font: 11pt/1.4 'Liberation Sans', sans-serif; margin: 0; }
 sup { font-size: 75%; line-height: 0; position: relative; vertical-align: baseline; top: -0.5em; }
 footer { position: fixed; bottom: 0; left: 0; font-size: 8pt; }
 p { margin: 0 0 10pt 0; }
 </style></head><body><footer>SYNTHETIC sample, fictitious supplier</footer><h1 style="font-size:14pt">SYNTHETIC price sheet</h1>
 ${two ? `<p>${ins}</p>` : ''}<p>${intro} The gauges are checked twice a year.<sup>1</sup> The hose sets are replaced every spring${two ? '.<sup>2</sup>' : '.'} Orders placed before noon ship the same day.</p>
 <p style="font-size:9pt"><sup>1</sup> Calibration certificates are kept by the SYNTHETIC district office.${two ? '<br><sup>2</sup> Hose sets are sold in pairs only.' : ''}</p></body></html>`;

const sumline = (badge) => `<!doctype html><html><head><meta charset="utf-8"><style>
 body { font: 11pt/1.4 'Liberation Sans', sans-serif; margin: 0; }
 sup { font-size: 75%; line-height: 0; position: relative; vertical-align: baseline; top: -0.5em; }
 footer { position: fixed; bottom: 0; left: 0; font-size: 8pt; }
 div { margin: 0; } .rel { position: relative; }
 </style></head><body><footer>SYNTHETIC sample, fictitious board</footer><h1 style="font-size:14pt">SYNTHETIC station report</h1><div class="rel">${badge}</div>
<div>The flow at station 4 was 1,250 litres per minute.<sup>1</sup><br>The gauges were calibrated in March and the crews replaced two worn seals on the dosing line.<sup>2</sup><br>No leaks were found.</div>
<div style="font-size:9pt; margin-top: 8pt"><sup>1</sup> Measured at the outlet.<br><sup>2</sup> Seals from the SYNTHETIC store.</div></body></html>`;

const docs = {
  'probe9-T1-rnote-before': note({ align: 'right' }),
  'probe9-T1-rnote-body': note({ align: 'right', body: true }),
  'probe9-T1-rnote-note': note({ align: 'right', edit: true }),
  'probe9-T1-cnote-before': note({ align: 'center' }),
  'probe9-T1-cnote-body': note({ align: 'center', body: true }),
  'probe9-T1-fnlist-one': fnlist(false),
  'probe9-T1-fnlist-two': fnlist(true),
  'probe9-T1-sumline-before': sumline('Positioned summary: the SYNTHETIC board inspected all stations.'),
  'probe9-T1-sumline-short': sumline('Positioned summary: the SYNTHETIC board.'),
  'probe9-T1-wnote-before': narrow({}),
  'probe9-T1-wnote-body': narrow({ body: true }),
  'probe9-T1-wnote-note': narrow({ edit: true }),
  'probe9-T1-znote-before': narrow({ zh: true }),
  'probe9-T1-znote-body': narrow({ zh: true, body: true }),
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
