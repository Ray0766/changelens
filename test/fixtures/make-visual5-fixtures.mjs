#!/usr/bin/env node
// SYNTHETIC test fixtures for test/visual5-*.test.ts (Chromium):
//
//   table5-before.pdf / table5-after.pdf — a report (A5) with six tables whose
//     header rows (light fill, darker bottom rule, pale row rules) repeat at
//     the top of every page a table runs onto; the new version adds a
//     paragraph at the start, so every page break moves by a non-whole
//     number of pixels and header copies come and go at page tops
//   table5-colour-after.pdf — the same, with the header fill changed from
//     blue-grey to green throughout
//   table5-rule-after.pdf — the same as table5-after.pdf, with a 1 pt rule
//     added under the paragraph before the third table
//   thead5-before.pdf / thead5-after.pdf — the same kind of report on A4,
//     with five tables that share one header row: it repeats at the top of
//     most pages (so it is a running header); the new version adds a
//     paragraph at the start, and the rows at the foot of page 1 go to the
//     top of page 2, under the repeated header
//   row5-before.pdf / row5-after.pdf — a price list whose rows are ruled and
//     whose group heading rows are shaded across the table; the new version
//     adds a group ("Valves") with its shaded heading row and one item row
//     at the end of the table, above a closing paragraph
//   cjk5-before.pdf / cjk5-after.pdf — Chinese and Japanese paragraphs and a
//     small table, pushed down by a line added at the top; one Chinese word
//     struck through (<s>), nothing else changes
//   mark5-before.pdf / mark5-after.pdf — a letter with a light diagonal
//     DRAFT watermark over its paragraphs; the new version drops the
//     watermark and turns the first word (far from the watermark) red
//   bar5-before.pdf / bar5-after.pdf — a policy where the new version adds
//     a sentence and marks its lines with a change bar in the left margin,
//     highlights a passage over two lines, and shows a deleted sentence
//     struck through in blue over two lines
//
// Run with Playwright available: node test/fixtures/make-visual5-fixtures.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const out = dirname(fileURLToPath(import.meta.url));

const html = (body, css = '') =>
  `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:20mm} body{font-family:'Liberation Serif';font-size:11pt;line-height:1.4;margin:0} p{margin:0 0 8pt} h2{font-family:'Liberation Sans';font-size:13pt;margin:10pt 0 6pt}${css}</style></head><body>${body}</body></html>`;

// ------------------------------------------------------------------ tables
// A5 pages and six tables with headers of their own, so that no header row
// repeats on most pages (it would then be a running header).
const tableCss = (fill) =>
  `@page{size:A5;margin:14mm} body{font-size:10pt} table{width:100%;border-collapse:collapse;margin:0 0 8pt;font-size:9pt} th{background:${fill};font-family:'Liberation Sans';font-size:8pt;text-align:left;padding:3.5pt 4pt;border-bottom:1px solid #6b8bab} td{padding:2.5pt 4pt;border-bottom:1px solid #d0d7de} td.n{text-align:right} hr{border:0;border-top:1pt solid #333;margin:0 0 8pt}`;
const heads = [
  ['Zone', 'Mains (km)', 'Grade'],
  ['Works', 'Output (Ml/d)', 'Built'],
  ['Reservoir', 'Storage (Ml)', 'Cells'],
  ['Station', 'Pumps', 'Duty (l/s)'],
  ['District', 'Properties', 'Leakage'],
  ['Scheme', 'Length (km)', 'Year'],
];
const names = ['North', 'East', 'South', 'West', 'Central', 'Harbour', 'Hill', 'Lake', 'Mill', 'Park', 'Quay', 'Ridge', 'Vale', 'Wharf', 'Abbey', 'Bridge', 'Castle', 'Dale'];
const table = (k) =>
  `<table><thead><tr>${heads[k].map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
  names.map((z, i) => `<tr><td>${z} ${k + 1}</td><td class="n">${(i + 3) * (k + 7)}</td><td class="n">${1 + ((i * 7 + k) % 40)}</td></tr>`).join('') +
  '</tbody></table>';
const intro = 'This plan sets out how the utility will maintain and renew its assets over the next ten years.';
const added = 'In response to consultation feedback, this version also sets out how progress against the plan will be reported to customers each year.';
const para = (k) => `Group ${k + 1} is inspected every year; the figures below are from the last survey.`;
const tables = (after, rule = false) =>
  `<h2>1 Introduction</h2><p>${intro}</p>${after ? `<p>${added}</p>` : ''}` +
  heads.map((_, k) => `<h2>${k + 2} Group ${k + 1}</h2><p>${para(k)}</p>${rule && k === 2 ? '<hr>' : ''}${table(k)}`).join('');

// Five tables with the same five-column header on A4 (three pages).
const theadCss = `table{width:100%;border-collapse:collapse;margin:0 0 10pt;font-size:9.5pt} th{background:#dde7f0;font-family:'Liberation Sans';font-size:8.5pt;text-align:left;padding:4pt;border-bottom:1px solid #6b8bab} td{padding:3.5pt 4pt;border-bottom:1px solid #d0d7de} td.n{text-align:right}`;
const theadTable = (k) =>
  `<table><thead><tr><th>Zone</th><th>Asset class</th><th>Quantity</th><th>Median age (years)</th><th>Condition grade</th></tr></thead><tbody>` +
  names.slice(0, 14).map((z, i) => `<tr><td>${z} ${k + 1}</td><td>${['Trunk mains', 'Service reservoirs', 'Pumping stations', 'Hydrants'][i % 4]}</td><td class="n">${(i + 3) * (k + 7)}</td><td class="n">${12 + ((i * 7 + k) % 40)}</td><td class="n">${1 + ((i + k) % 5)}</td></tr>`).join('') +
  '</tbody></table>';
const thead = (after) =>
  `<h2>1 Introduction</h2><p>${intro} Each zone profile lists the assets, their age and their condition grade.</p>${after ? `<p>${added.slice(0, -1)}, with a short summary of the schemes completed.</p>` : ''}` +
  [0, 1, 2, 3, 4].map((k) => `<h2>${k + 2} Zone group ${k + 1}</h2><p>Zone group ${k + 1} is supplied from two treatment works. The assets below are inspected every year and their condition is graded from 1 (very good) to 5 (very poor).</p>${theadTable(k)}`).join('');

// A price list with shaded group heading rows.
const rowCss = `table{width:100%;border-collapse:collapse;font-size:9.5pt} td{padding:3pt 4pt;border-bottom:1px solid #d0d7de} td.n{text-align:right} tr.g td{background:#e3ecf6;font-family:'Liberation Sans';font-weight:bold;font-size:9pt}`;
const groups = [
  ['Pumps', [['PMP-1010', 'Pump body, cast iron', '312.00'], ['PMP-1020', 'Impeller, DN100', '148.50'], ['PMP-1030', 'Shaft seal kit', '42.80']]],
  ['Motors', [['MOT-3010', 'Motor, 7.5 kW', '890.00'], ['MOT-3020', 'Motor, 11 kW', '1,140.00'], ['MOT-3030', 'Terminal box', '36.40']]],
  ['Valves', [['VLV-2010', 'Gate valve, DN150', '265.00']]],
];
const rows = (after) =>
  `<p>Spare parts price list. Prices are in EUR and exclude VAT.</p><table>` +
  groups
    .filter(([g]) => after || g !== 'Valves')
    .map(([g, items]) => `<tr class="g"><td colspan="3">${g}</td></tr>` + items.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td class="n">${c}</td></tr>`).join(''))
    .join('') +
  '</table><p>Prices are valid until the end of June. Orders above EUR 5,000 are delivered free of charge to any site in the region.</p>';

// --------------------------------------------------------------------- CJK
const cjkCss = `body{font-family:'WenQuanYi Zen Hei','IPAGothic';font-size:10.5pt;line-height:1.6} table{border-collapse:collapse;font-size:8.5pt;margin:0 0 8pt} td{border-top:0.75pt solid #555;border-bottom:0.75pt solid #555;padding:1.5pt 4pt} .ja{font-family:'IPAGothic'}`;
const cjk = (after) =>
  // The added line moves the rest by 25 pt, 37.5 px at the visual stage's
  // 1.5 px/pt: every glyph lands half a pixel off its old phase.
  (after ? '<p style="margin-bottom:8.2pt">本版本于第一条之前增加说明一行。</p>' : '') +
  `<p>第一条　甲方应于每年一月一日前提交年度主要设备维护计划，计划须列明重要设备的检查周期。</p>` +
  `<p>第二条　乙方发现${after ? '<s>重大故障</s>' : '重大故障'}时，应立即书面通知甲方，并在一个工作日内提交处置方案。</p>` +
  `<p class="ja">（４）その他本契約を継続し難い重大な事由が生じたとき、甲は直ちに契約を解除できる。</p>` +
  `<table class="ja"><tr><td>冷却ファン</td><td>オーバートラベル</td><td>サーボレディ</td></tr><tr><td>エンコーダ</td><td>アナログ入力</td><td>ウォッチドッグ</td></tr></table>` +
  `<p>第三条　本合同一式两份，双方各执一份，自签字之日起生效。年度费用按单价乘以数量计算。</p>`;

// --------------------------------------------------------------- watermark
const L = [
  'Thank you for asking us to quote for digitising your tenancy files. This letter sets out the scope of the work, our fees and the terms that apply.',
  'You hold about 1,150 property files on paper at your head office. They must be kept for six years after a tenancy ends, and the archive room is full.',
  'We propose to prepare a specification for the scanning service and the electronic records system, including a pilot with 300 files and a migration plan.',
  'Our scope does not include the scanning itself or the configuration of the records system. We can quote for these separately once the pilot is complete.',
  'The fixed fee for the specification is EUR 18,500, invoiced in two equal parts. Travel is charged at cost up to a cap of EUR 1,200.',
];
// The watermark: Helvetica-like bold 140 pt, 18 % grey, at 45°, drawn over the text.
const mark = (after) =>
  `<div style="position:relative">${[...L, ...L].map((p, k) => `<p>${after && k === 0 ? p.replace('Thank you', '<span style="color:#c00000">Thank</span> you') : p}</p>`).join('')}` +
  (after ? '' : `<div style="position:absolute;left:30pt;top:470pt;font-family:'Liberation Sans';font-weight:bold;font-size:140pt;line-height:1;color:rgb(209,209,209);transform:rotate(-45deg);transform-origin:left top">DRAFT</div>`) +
  '</div>';

// ----------------------------------------------------- change bar, highlight
const R = [
  '3.3 All staff must file records in the agreed systems. They must ask the information governance team when they are unsure where a record belongs.',
  '3.4 Contractors who hold records on our behalf must follow this policy as agreed in their contract.',
  '4.2 Records are kept for the period in the retention schedule. Where the schedule gives no period, the record is kept for six years after the last action on it, and then reviewed by the owner of the record.',
  '4.3 Paper records may be scanned and the paper copy destroyed after a quality check of a sample of the scanned batch, if the scan is complete and legible.',
];
const inserted = 'Staff must complete the records management e-learning module within one month of joining, and again every two years.';
const bar = (after) =>
  `<div style="position:relative"><p>${R[0]}${after ? ` ${inserted}` : ''}</p>${after ? '<div style="position:absolute;left:-20pt;top:15.4pt;width:1.5pt;height:30.8pt;background:#444"></div>' : ''}</div>` +
  `<p>${R[1]}</p>` +
  `<p>4.2 Records are kept for the period in the retention schedule. ${after ? '<span style="background:#fff200">' : ''}Where the schedule gives no period, the record is kept for six years after the last action on it, and then reviewed by the owner of the record${after ? '</span>' : ''}.</p>` +
  `<p>${after ? `<span style="color:#0646a2;text-decoration:line-through">${R[3]}</span>` : R[3]}</p>`;

const docs = {
  'table5-before.pdf': html(tables(false), tableCss('#dde7f0')),
  'table5-after.pdf': html(tables(true), tableCss('#dde7f0')),
  'table5-colour-after.pdf': html(tables(true), tableCss('#cdebc4')),
  'table5-rule-after.pdf': html(tables(true, true), tableCss('#dde7f0')),
  'thead5-before.pdf': html(thead(false), theadCss),
  'thead5-after.pdf': html(thead(true), theadCss),
  'row5-before.pdf': html(rows(false), rowCss),
  'row5-after.pdf': html(rows(true), rowCss),
  'cjk5-before.pdf': html(cjk(false), cjkCss),
  'cjk5-after.pdf': html(cjk(true), cjkCss),
  'mark5-before.pdf': html(mark(false)),
  'mark5-after.pdf': html(mark(true)),
  // No page margin (Chromium clips what is drawn in it): the body is padded instead.
  'bar5-before.pdf': html(bar(false), '@page{margin:0} body{padding:20mm}'),
  'bar5-after.pdf': html(bar(true), '@page{margin:0} body{padding:20mm}'),
};

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, content] of Object.entries(docs)) {
  await page.setContent(content, { waitUntil: 'load' });
  writeFileSync(join(out, name), await page.pdf({ printBackground: true, preferCSSPageSize: true }));
  console.log('wrote', name);
}
await browser.close();
