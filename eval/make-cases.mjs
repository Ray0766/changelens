#!/usr/bin/env node
// Generates the evaluation corpus in eval/cases/<id>/: before.pdf, after.pdf
// and truth.json (the edits that were made on purpose). All documents are
// synthetic. Requires Playwright's Chromium:  npx playwright install chromium
//
//   node eval/make-cases.mjs                      all cases
//   node eval/make-cases.mjs --only a,b           only these cases (other PDFs stay as they are;
//                                                 Chromium stamps a creation date, so a rewrite
//                                                 changes the bytes even when the content does not)
//   node eval/make-cases.mjs --out <dir>          write into <dir> instead of eval/cases
//   node eval/make-cases.mjs --perf-pair <dir>    the 24-page pair for eval/perf.ts
//
// truth.json items (checked by eval/run.ts):
//   { type: 'number'|'replace'|'insert'|'delete'|'move'|'format'|'graphic'|'position'|'overflow'|'furniture',
//     old?: string, new?: string,          // text that must appear in the reported change (never '')
//     oldPage?: number|number[], newPage?: number|number[],   // 1-based; derived from the text if omitted
//                                          // (only when the text is on exactly one page)
//     oldRect?: [x, y, w, h], newRect?: [x, y, w, h],         // region in PDF points (top-left origin);
//                                          // required for items without text
//     maxItems?: number,                   // reported items this truth may explain (default 1)
//     note?: string }
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { only: { type: 'string' }, out: { type: 'string' }, 'perf-pair': { type: 'string' } } });
const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const root = args.out ?? join(dirname(fileURLToPath(import.meta.url)), 'cases');

const EN = [
  'This agreement covers the maintenance of heating, ventilation and air-conditioning equipment in the three buildings listed in Schedule A. The contractor will keep a written log of every visit and share it with the facilities manager within two working days.',
  'Routine inspections take place every quarter. During each inspection the technician checks filters, belts, thermostats and condensate drains, replaces worn parts from the agreed stock list and records meter readings for the energy report.',
  'Emergency call-outs are answered around the clock. A qualified engineer must arrive on site within four hours of the call for critical faults, and within one business day for everything else. Response times are measured from the moment the ticket is logged.',
  'Spare parts that are not on the stock list are ordered only after written approval. The contractor will provide two quotations for any single part costing more than the approval threshold and will keep removed parts for inspection for thirty days.',
  'Safety comes first. Technicians wear the protective equipment required by the site rules, follow lock-out procedures before opening any electrical panel and report near misses to the site safety officer on the same day.',
  'Each month the contractor sends a short report that lists completed jobs, open tickets, parts used and the energy consumption of the main plant. Charts in the report compare the current month with the same month of the previous year.',
  'Access to the buildings is arranged through the reception desk. Visitors sign in, receive a temporary badge and are accompanied in plant rooms. Keys to the roof must be returned before the end of the working day.',
  'Waste refrigerant, used oil and old filters are collected separately and handed to a licensed disposal company. Transfer notes are kept for three years and copies are attached to the quarterly report.',
  'The facilities manager may request additional work, such as the installation of new units or the relocation of existing equipment. Such work is quoted separately and starts only after a purchase order has been issued.',
  'Either party can raise a concern about service quality at the monthly review meeting. Agreed actions are written down with an owner and a due date, and progress is reviewed at the following meeting.',
  'Insurance cover must remain in place for the whole term, including public liability and employer liability. Certificates are renewed every year and a copy is sent to the facilities manager without being asked.',
  'This agreement starts on the date of signature and runs for three years. It can be extended by mutual agreement for one further year on the same terms, provided notice is given at least ninety days before expiry.',
];

const ZH = [
  '本合同约定由乙方负责甲方三栋办公楼的暖通空调设备维护工作。乙方应对每次上门服务做书面记录，并在两个工作日内提交给甲方物业经理。',
  '例行巡检每季度进行一次。技术人员需检查过滤网、皮带、温控器和冷凝水管，按约定的备件清单更换磨损部件，并记录用于能耗报告的仪表读数。',
  '紧急报修全天候受理。重大故障须在报修后四小时内由合格工程师到场处理，其他故障在一个工作日内响应，响应时间自工单登记时起算。',
  '备件清单以外的配件须经书面批准后方可采购。单件金额超过审批限额的，乙方应提供两份报价，并将拆下的旧件保留三十天以备查验。',
  '安全第一。技术人员须按现场规定佩戴防护用品，打开任何配电柜前执行上锁挂牌程序，并于当天向现场安全员报告未遂事件。',
  '乙方每月提交一份简要报告，列明已完成工单、未关闭工单、备件使用情况及主机能耗，并以图表对比本月与去年同期的数据。',
];

const css = ({ font = "'Liberation Serif', serif", size = '11.5pt', margin = '20mm' } = {}) => `
  @page { size: A4; }
  body { font-family: ${font}; font-size: ${size}; line-height: 1.5; color: #1d232b; margin: 0; padding: 0 ${margin}; }
  h1 { font-size: 22pt; margin: 0 0 10pt; } h2 { font-size: 15pt; margin: 14pt 0 8pt; }
  p { margin: 0 0 9pt; text-align: justify; }
  .page { break-before: page; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0 12pt; }
  th, td { border: 0.75pt solid #9aa7b3; padding: 4pt 7pt; text-align: left; }
  td.n { text-align: right; white-space: nowrap; }
  small { font-size: 6.5pt; color: #555; }
`;

const html = (body, opts) => `<!doctype html><html><head><meta charset="utf-8"><style>${css(opts)}</style></head><body>${body}</body></html>`;
const P = (t) => `<p>${t}</p>`;

const cases = [];
const add = (id, description, before, after, truth, pdfOpts = {}) => cases.push({ id, description, before, after, truth, pdfOpts });

// 1. No change at all.
{
  const body = `<h1>Maintenance Agreement</h1>${EN.slice(0, 9).map(P).join('')}`;
  add('identical', 'Identical documents (no change).', html(body), html(body), []);
}

// 2. Layout only: wider margins re-wrap every line and move page breaks.
{
  const body = `<h1>Maintenance Agreement</h1>${EN.map(P).join('')}`;
  add('reflow-only', 'Same text, wider page margins: every line break and page break moves, nothing else changes.', html(body), html(body, { margin: '34mm' }), []);
}

// 3. Numbers, signs, dates and units.
{
  const rows = (v) => `<table><tr><th>Item</th><th>Amount (USD)</th></tr>
    <tr><td>Quarterly inspections</td><td class="n">${v.a}</td></tr>
    <tr><td>Adjustment for unused visits</td><td class="n">${v.b}</td></tr>
    <tr><td>Balance carried forward</td><td class="n">${v.c}</td></tr>
    <tr><td>Late fee rate per month</td><td class="n">${v.d}</td></tr></table>`;
  const doc = (v) => html(`<h1>Payment Schedule</h1>${P(EN[0])}${rows(v)}
    <p>The first invoice is due on ${v.date}. Payment terms are ${v.term} from the invoice date. All amounts are in ${v.cur}.</p>
    ${P(EN[3])}<p><small>Ref. ${v.ref} — internal cost code for the facilities budget.</small></p>`);
  add('numbers', 'Amounts, a minus sign added and one removed, a percentage, a date, a unit, a currency and a single digit in 6.5 pt text.',
    doc({ a: '8,000', b: '500', c: '-1,200', d: '1.50%', date: '2 November 2026', term: '30 days', cur: 'US dollars', ref: '3' }),
    doc({ a: '9,500', b: '−500', c: '1,200', d: '1.05%', date: '2 December 2026', term: '30 weeks', cur: 'euros', ref: '8' }),
    [
      { type: 'number', old: '8,000', new: '9,500' },
      { type: 'number', old: '500', new: '−500' },
      { type: 'number', old: '-1,200', new: '1,200' },
      { type: 'number', old: '1.50', new: '1.05' },
      { type: 'replace', old: 'November', new: 'December' },
      { type: 'replace', old: 'days', new: 'weeks' },
      { type: 'replace', old: 'US dollars', new: 'euros' },
      { type: 'number', old: '3', new: '8' },
    ]);
}

// 4. A whole page inserted in the middle.
{
  const pages = (extra) => [
    `<h1>Maintenance Agreement</h1>${EN.slice(0, 3).map(P).join('')}`,
    `<div class="page"><h2>Schedule A</h2>${EN.slice(3, 6).map(P).join('')}</div>`,
    extra ? `<div class="page"><h2>Annex: Revised call-out procedure</h2><p>From the second year, call-outs are logged through the new service portal. Telephone requests remain possible outside office hours and are entered into the portal by the duty engineer within one hour.</p></div>` : '',
    `<div class="page"><h2>Schedule B</h2>${EN.slice(6, 9).map(P).join('')}</div>`,
    `<div class="page"><h2>Schedule C</h2>${EN.slice(9, 12).map(P).join('')}</div>`,
  ].join('');
  add('inserted-page', 'A new page is inserted after page 2; every later page moves down by one.', html(pages(false)), html(pages(true)),
    [{ type: 'insert', new: 'service portal', newPage: 3 }]);
}

// 5. A page duplicated by mistake.
{
  const p = [
    `<h1>Maintenance Agreement</h1>${EN.slice(0, 3).map(P).join('')}`,
    `<div class="page"><h2>Schedule A</h2>${EN.slice(3, 6).map(P).join('')}</div>`,
    `<div class="page"><h2>Schedule B</h2>${EN.slice(6, 9).map(P).join('')}</div>`,
  ];
  add('duplicate-page', 'Page 2 appears twice in the new version.', html(p.join('')), html([p[0], p[1], p[1], p[2]].join('')),
    [{ type: 'insert', new: 'Spare parts', newPage: [2, 3] }]);
}

// 6. A paragraph moved across pages, plus small edits elsewhere.
const movedAfter = (at) => {
  // Edit by original position first, then move paragraph 2 to position `at`.
  const after = [...EN];
  after[4] = after[4].replace('on the same day', 'within one hour');
  after[10] = after[10].replace(' Certificates are renewed every year and a copy is sent to the facilities manager without being asked.', '');
  const moved = after.splice(1, 1)[0];
  after.splice(at, 0, moved);
  return html(`<h1>Maintenance Agreement</h1>${after.map(P).join('')}`, { size: '13.5pt' });
};
const moveTruth = [
  { type: 'move', old: 'Routine inspections', new: 'Routine inspections', oldPage: 1, newPage: 2 },
  { type: 'replace', old: 'on the same day', new: 'within one hour' },
  { type: 'delete', old: 'Certificates are renewed every year' },
];
{
  // To the end of the document: wholly on page 2, while page 1 still pairs with page 1.
  add('move-and-edits', 'Paragraph 2 moved from page 1 to the end of page 2 (wholly onto the other page), one phrase changed, one sentence deleted.',
    html(`<h1>Maintenance Agreement</h1>${EN.map(P).join('')}`, { size: '13.5pt' }), movedAfter(11), moveTruth);
  // Right after the paragraph that lost its last sentence: the deletion and the
  // moved paragraph are adjacent.
  add('move-beside-deletion', 'As move-and-edits, but the paragraph lands directly after the sentence that was deleted (top of page 2).',
    html(`<h1>Maintenance Agreement</h1>${EN.map(P).join('')}`, { size: '13.5pt' }), movedAfter(10), moveTruth);
}

// 7. Font substitution: same text, different typeface (re-flows everything).
{
  const body = `<h1>Maintenance Agreement</h1>${EN.slice(0, 8).map(P).join('')}`;
  const bodyArea = [56, 55, 490, 520];
  add('font-swap', 'Same text, body font changed from a serif to a sans-serif face (causing re-flow).',
    html(body), html(body, { font: "'Liberation Sans', sans-serif" }),
    [{ type: 'format', oldPage: 1, newPage: 1, oldRect: bodyArea, newRect: bodyArea, maxItems: 1, note: 'The same font change on every line: expected as one aggregated item.' }]);
}

// 8. A graphic moved on the page; text unchanged.
{
  const stamp = (x) => `<svg width="560" height="70" style="display:block;margin:10pt 0"><rect x="${x}" y="5" width="150" height="56" rx="6" fill="none" stroke="#b3261e" stroke-width="3"/><text x="${x + 75}" y="40" text-anchor="middle" font-size="16" fill="#b3261e" font-family="sans-serif">APPROVED</text></svg>`;
  const doc = (x) => html(`<h1>Maintenance Agreement</h1>${EN.slice(0, 3).map(P).join('')}${stamp(x)}${EN.slice(3, 5).map(P).join('')}`);
  add('graphic-moved', 'An approval stamp (frame plus the word APPROVED) moves from the left to the right; nothing else changes.', doc(0), doc(400),
    [{ type: 'position', new: 'APPROVED', newPage: 1, oldPage: 1 }]);
}

// 8b. Small graphics: a checkbox gets ticked and a thin rule is added — the
// noise tolerance must not hide changes this small.
const box = (ticked) => `<svg width="14" height="14" style="vertical-align:-2px"><rect x="1" y="1" width="12" height="12" fill="none" stroke="#333" stroke-width="1"/>${ticked ? '<path d="M3 7 l3 3 l5 -6" fill="none" stroke="#333" stroke-width="1.5"/>' : ''}</svg>`;
const checklist = (v) => html(`<h1>Inspection checklist</h1>${P(EN[1])}<p>${box(v.filters)} Filters replaced</p><p>${box(v.belts)} Belts adjusted</p>${v.rule ? '<div style="border-top:0.75pt solid #333;margin:6pt 0 10pt"></div>' : '<div style="margin:6pt 0 10pt;height:0.75pt"></div>'}${P(EN[4])}`);
{
  add('small-graphics', 'A 9 pt checkbox gets a tick, and a thin 0.75 pt rule is added — both must be found despite the noise tolerance.',
    checklist({}), checklist({ filters: true, rule: true }),
    [
      { type: 'graphic', oldPage: 1, newPage: 1, newRect: [54, 160, 16, 16], note: 'Tick in the "Filters replaced" checkbox.' },
      { type: 'graphic', oldPage: 1, newPage: 1, newRect: [56, 205, 484, 8], note: 'The added 0.75 pt rule.' },
    ]);
}

// 8c. Only the second checkbox gets a tick (one line below the first).
{
  add('small-graphics-second-box', 'Only the second of two 9 pt checkboxes ("Belts adjusted") gets a tick; nothing else changes.',
    checklist({}), checklist({ belts: true }),
    [{ type: 'graphic', oldPage: 1, newPage: 1, newRect: [54, 184, 16, 18], note: 'Tick in the "Belts adjusted" checkbox.' }]);
}

// 9. Chinese with English terms and numbers.
{
  const doc = (v) => html(`<h1>维护服务合同</h1>${P(ZH[0])}<p>系统需符合 WCAG ${v.wcag} AA 标准，前端使用 ${v.fw} 开发，交付周期 ${v.weeks} 周。</p>${P(ZH[1])}${P(ZH[2])}${v.keep ? P(ZH[3]) : ''}${P(ZH[4])}${P(ZH[5])}`, { font: "'WenQuanYi Zen Hei', sans-serif" });
  add('mixed-zh-en', '中英文混排：版本号、框架名、周数修改，删除一段。',
    doc({ wcag: '2.2', fw: 'React', weeks: '10', keep: true }),
    doc({ wcag: '2.1', fw: 'Vue', weeks: '12', keep: false }),
    [
      { type: 'number', old: '2.2', new: '2.1' },
      { type: 'replace', old: 'React', new: 'Vue' },
      { type: 'number', old: '10', new: '12' },
      { type: 'delete', old: '备件清单以外的配件' },
    ]);
}

// ---------------------------------------------------------------- held-out
// Written after the engine was tuned on the cases above and evaluated once
// without further tuning (see docs/EVALUATION.md); used for fixes since.
// Marked "set": "held-out-1" in truth.json.
const holdout = new Set();

// H1. A long table across pages: a row inserted near the top pushes rows onto
// the next page; one value on the last page changes; accounting negatives.
{
  const rows = Array.from({ length: 44 }, (_, i) => [`Asset FM-${String(i + 1).padStart(3, '0')}`, `Air handling unit, level ${(i % 9) + 1}`, `${(1200 + i * 35).toLocaleString('en-US')}`]);
  const table = (rs) => `<table><tr><th>Asset</th><th>Description</th><th>Annual cost (USD)</th></tr>${rs.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="n">${r[2]}</td></tr>`).join('')}</table>`;
  const a = rows.map((r) => [...r]);
  const b = rows.map((r) => [...r]);
  b.splice(3, 0, ['Asset FM-900', 'Chiller replacement (new)', '18,400']);
  b[41][2] = '2,999';
  const summary = (v) => `<p>Credit from the previous year: <b>${v}</b> USD.</p>`;
  add('holdout-long-table', 'Held-out. Asset register spanning pages: row inserted near the top, one amount changed further down, accounting negative "(1,200)" becomes positive.',
    html(`<h1>Asset register</h1>${summary('(1,200)')}${table(a)}`), html(`<h1>Asset register</h1>${summary('1,200')}${table(b)}`),
    [
      { type: 'insert', new: 'Chiller replacement' },
      { type: 'number', old: rows[40][2], new: '2,999' },
      { type: 'number', old: '(1,200)', new: '1,200' },
    ]);
  holdout.add('holdout-long-table');
}

// H2. Two-column layout: an edit in the second column.
{
  const doc = (x) => html(`<h1>Site rules</h1><div style="columns:2;column-gap:12mm">${EN.slice(0, 8).map((t, i) => P(i === 6 ? t.replace('temporary badge', x) : t)).join('')}</div>`);
  add('holdout-two-columns', 'Held-out. Two-column page; a phrase in the second column changes.', doc('temporary badge'), doc('visitor badge with photo'),
    [{ type: 'replace', old: 'temporary', new: 'visitor badge with photo' }]);
  holdout.add('holdout-two-columns');
}

// H3. Chinese letter: date and phone number without spaces, one sentence added.
{
  const doc = (v) => html(`<h1>服务变更通知</h1><p>致北风烘焙有限公司：</p><p>根据双方于${v.date}签署的补充协议，自下月起巡检频率由每季度一次调整为${v.freq}。</p>${v.extra ? '<p>如需加急服务，请提前一天预约。</p>' : ''}<p>如有疑问，请致电${v.tel}联系项目经理。</p>${P(ZH[4])}`, { font: "'WenQuanYi Zen Hei', sans-serif" });
  add('holdout-zh-letter', 'Held-out. 中文通知：无空格的日期、电话号码修改，新增一句。',
    doc({ date: '2026年11月3日', freq: '每两个月一次', tel: '010-6655-1234', extra: false }),
    doc({ date: '2026年11月30日', freq: '每月一次', tel: '010-6655-4321', extra: true }),
    [
      { type: 'replace', old: '3', new: '30', oldPage: 1, newPage: 1 },
      { type: 'delete', old: '两个', oldPage: 1, note: '每两个月一次 → 每月一次 removes 两个 (labelled replace with an empty new side before).' },
      { type: 'replace', old: '6655-1234', new: '6655-4321', oldPage: 1, newPage: 1 },
      { type: 'insert', new: '如需加急服务', newPage: 1 },
    ]);
  holdout.add('holdout-zh-letter');
}

// H4. The running header itself changes (DRAFT → FINAL). With headers ignored
// by default the change must at least be disclosed as "ignored".
{
  const body = `<h1>Maintenance Agreement</h1>${EN.slice(0, 10).map(P).join('')}`;
  add('holdout-header-change', 'Held-out. Only the running header changes from DRAFT to FINAL on every page.', html(body), html(body),
    [{ type: 'furniture', old: 'DRAFT', new: 'FINAL' }],
    { headerTemplate: '<div style="font-size:7.5pt;width:100%;padding:0 18mm;color:#777;font-family:sans-serif">Maintenance Agreement — FINAL</div>' });
  // The "before" file gets the DRAFT header (see the loop below).
  holdout.add('holdout-header-change');
}

// --------------------------------------------------- performance pair (24 pages)
// For eval/perf.ts: 24 A4 pages of running text with a table on every fourth
// page; the new version changes the fee on every second page, adds a sentence
// in sections 5 and 17 and deletes one in section 11.
function perfPair() {
  const page = (p, v) => {
    const paras = Array.from({ length: 5 }, (_, k) => EN[(p * 5 + k) % EN.length]);
    if (v === 'after' && (p === 4 || p === 16)) paras[2] += ' This sentence was added in the revised version and moves the following lines down.';
    if (v === 'after' && p === 10) paras[1] = paras[1].replace(/^[^.]*\. /, '');
    const amount = (1200 + p * 35).toLocaleString('en-US');
    const changed = v === 'after' ? (1250 + p * 35).toLocaleString('en-US') : amount;
    const table = p % 4 === 0 ? `<table><tr><th>Item</th><th>Amount (USD)</th></tr>${['Inspections', 'Parts', 'Call-outs', 'Reports'].map((x, i) => `<tr><td>${x} ${p + 1}.${i + 1}</td><td class="n">${(800 + p * 10 + i).toLocaleString('en-US')}</td></tr>`).join('')}</table>` : '';
    return `<div class="${p ? 'page' : ''}"><h2>Section ${p + 1}</h2>${paras.slice(0, 3).map(P).join('')}<p>The fee for this section is USD ${p % 2 ? changed : amount} per year.</p>${table}${paras.slice(3).map(P).join('')}</div>`;
  };
  const doc = (v) => html(Array.from({ length: 24 }, (_, p) => page(p, v)).join(''));
  return { before: doc('before'), after: doc('after') };
}

const browser = await chromium.launch();
const page = await browser.newPage();
if (args['perf-pair']) {
  mkdirSync(args['perf-pair'], { recursive: true });
  const pair = perfPair();
  for (const v of ['before', 'after']) {
    await page.setContent(pair[v], { waitUntil: 'load' });
    writeFileSync(join(args['perf-pair'], `${v}.pdf`), await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '0', right: '0' } }));
  }
  console.log('wrote', join(args['perf-pair'], 'before.pdf'), 'and after.pdf');
  await browser.close();
  process.exit(0);
}
const only = args.only?.split(',').map((s) => s.trim());
const unknown = only?.filter((id) => !cases.some((c) => c.id === id)) ?? [];
if (unknown.length) throw new Error(`unknown case(s): ${unknown.join(', ')}`);
// Short numeric arrays (pages, regions) on one line.
const compact = (s) => s.replace(/\[\s*(-?[\d.]+(?:,\s*-?[\d.]+)*)\s*\]/g, (_, body) => `[${body.split(/,\s*/).join(', ')}]`);
for (const c of cases) {
  if (only && !only.includes(c.id)) continue;
  const dir = join(root, c.id);
  mkdirSync(dir, { recursive: true });
  for (const v of ['before', 'after']) {
    await page.setContent(c[v], { waitUntil: 'load' });
    const opts = { ...c.pdfOpts };
    if (c.id === 'holdout-header-change' && v === 'before') opts.headerTemplate = opts.headerTemplate.replace('FINAL', 'DRAFT');
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div style="font-size:7.5pt;width:100%;padding:0 18mm;color:#777;font-family:sans-serif">Facilities Maintenance — Contract FM-2026-07</div>',
      footerTemplate: '<div style="font-size:7.5pt;width:100%;padding:0 18mm;color:#777;text-align:right;font-family:sans-serif">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      margin: { top: '20mm', bottom: '20mm', left: '0', right: '0' },
      ...opts,
    });
    writeFileSync(join(dir, `${v}.pdf`), pdf);
  }
  writeFileSync(join(dir, 'truth.json'), compact(JSON.stringify({ description: c.description, synthetic: true, set: holdout.has(c.id) ? 'held-out-1' : 'tuning', truth: c.truth }, null, 2)) + '\n');
  console.log('wrote', c.id);
}
await browser.close();
