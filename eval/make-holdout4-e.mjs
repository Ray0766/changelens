// Regenerates the blind held-out round 4 cases of author "e":
// Office documents (Word, Excel, PowerPoint) built with python-docx / openpyxl /
// python-pptx and turned into PDF by LibreOffice 24.2 (not by Microsoft Office).
//
//   node eval/make-holdout4-e.mjs            build all six cases and verify the truth snippets
//   node eval/make-holdout4-e.mjs --verify   only verify the existing PDFs against truth.json
//
// Needs python3 with python-docx, openpyxl and python-pptx, LibreOffice (soffice),
// and pdfjs-dist from the repository's node_modules (read only).
// Every case is a synthetic sample; no real company, person or logo is used.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVAL = path.dirname(fileURLToPath(import.meta.url));
const HELPERS = path.join(EVAL, 'holdout4-e');
const CASES_DIR = path.join(EVAL, 'cases');
const PDFJS = path.join(EVAL, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs');

const LO_NOTE = 'The PDFs were rendered by LibreOffice 24.2 from the Office files (headless --convert-to pdf), not by Microsoft Office.';

const CASES = [
  {
    id: 'holdout4-e-docx-services-agreement',
    script: 'contract.py',
    ext: 'docx',
    description:
      'A master services agreement between two invented companies, written as a Word document with python-docx: Heading 1 and clause paragraphs linked to one automatic multi-level list (1., 1.1), three footnotes, a running header, a "Page X of Y" footer, bold defined terms, and a Schedule 1 rate table with a repeating header row that runs over two pages. Calibri and Cambria are substituted by the metric-compatible Carlito and Caladea. ' +
      LO_NOTE +
      ' Edits from the discussion draft to the signature draft: the subcontracting sub-clause moved from clause 7 to the end of clause 3; a cyber insurance sub-clause added to clause 4; the monthly charge raised; the index cap in footnote 2 lowered; the exclusion of indirect loss in clause 8.3 made bold; the sentence on deleting personal data removed from clause 9.2; the court seat changed; a row A17 added to Schedule 1; the first-hour call-out rate raised; and the running header changed from the discussion draft to the signature draft. Consequences that are not listed: the automatic clause numbers change (moved clause 7.2 becomes 3.4, clauses 4.3 and 4.4 become 4.4 and 4.5), the body re-flows across pages 1 to 3, and in Schedule 1 the rows from A17 on shift so that row B20 moves to page 5 under the repeated header row. The header change appears on every page.',
    truth: [
      { type: 'move', old: 'Subcontracting. The Supplier may subcontract the cleaning of external areas', new: 'Subcontracting. The Supplier may subcontract the cleaning of external areas', oldPage: 2, newPage: 1, note: 'Sub-clause moved unchanged from clause 7 (7.2) to clause 3 (3.4); only its automatic list number changes.' },
      { type: 'insert', new: 'The Supplier shall maintain cyber insurance with a limit of not less than EUR 2,000,000 per claim', newPage: 1, note: 'New sub-clause 4.3; the following sub-clauses renumber automatically.' },
      { type: 'number', old: '18,400', new: '19,750', oldPage: 2, newPage: 2, note: 'Monthly charge in clause 5.1.' },
      { type: 'number', old: '3.0%', new: '2.5%', oldPage: 2, newPage: 2, note: 'Inside footnote 2 at the foot of the page (8.5 pt).' },
      { type: 'format', old: 'Neither party is liable for loss of profit, loss of revenue, loss of goodwill', new: 'Neither party is liable for loss of profit, loss of revenue, loss of goodwill', oldPage: 2, newPage: 2, note: 'Clause 8.3 up to "consequential loss" made bold; the words are unchanged.' },
      { type: 'delete', old: 'The Supplier shall delete all personal data at the end of the Agreement unless the law requires it to be kept.', oldPage: 3, note: 'Second sentence of clause 9.2 removed.' },
      { type: 'replace', old: 'Rotterdam', new: 'Utrecht', oldPage: 3, newPage: 3 },
      { type: 'insert', new: 'A17 Solar panel cleaning, roof arrays', newPage: 4, note: 'New row in the Schedule 1 table (all cells of the row are new).' },
      { type: 'number', old: '145.00', new: '165.00', oldPage: 4, newPage: 4, note: 'Rate of row B16, out-of-hours call-out, first hour.' },
      { type: 'furniture', old: 'Draft for discussion · 2 October 2026', new: 'Draft for signature · 12 October 2026', oldPage: 1, newPage: 1, maxItems: 5, note: 'Running header, changed on all five pages.' },
    ],
  },
  {
    id: 'holdout4-e-docx-retention-redline',
    script: 'retention.py',
    ext: 'docx',
    description:
      'A records retention policy of an invented housing association, written as a Word document with python-docx: numbered headings and paragraphs (automatic multi-level list), a portrait section, a landscape section with the retention schedule table (Appendix A) and a portrait section for document control; Arial is substituted by Liberation Sans. ' +
      LO_NOTE +
      ' The new version is the draft as circulated with tracked changes shown: one sentence added as a tracked insertion (LibreOffice shows it underlined in the reviewer colour with a change bar in the left margin) and one paragraph removed as a tracked deletion (still shown, struck through in the reviewer colour, with a change bar). Several other edits were made with tracking switched off, so they are not marked in the new PDF: the backup deletion period, one retention period and one owner in the landscape table, and a new row in the version history; the footer also changed. Consequences that are not listed: the change bars themselves; LibreOffice shows the list number of the deleted paragraph as "[4.3]" and that of the next paragraph as "4.3[4.4]", both in the reviewer colour (automatic renumbering shown as part of the redline); page 1 re-flows, and the R09 row in the landscape table becomes two lines tall.',
    truth: [
      { type: 'insert', new: 'Staff must complete the records management e-learning module within 30 days of joining.', newPage: 1, maxItems: 2, note: 'Tracked insertion, shown underlined and coloured, with a change bar in the left margin; a separate graphic entry for that bar belongs to this item.' },
      { type: 'format', old: 'Paper records may be scanned and the paper copy destroyed after a quality check', new: 'Paper records may be scanned and the paper copy destroyed after a quality check', oldPage: 1, newPage: 1, maxItems: 3, note: 'Tracked deletion: the text is still there but struck through and in the reviewer colour, with a change bar; strikethrough, colour and bar may be reported separately. The README claims strikethrough detection; reporting this as a plain deletion would be wrong because the words are still printed.' },
      { type: 'number', old: 'within 90 days', new: 'within 180 days', oldPage: 2, newPage: 2, note: 'Untracked edit in clause 5.2, no redline marking.' },
      { type: 'number', old: '10 years', new: '15 years', oldPage: 3, newPage: 3, note: 'Untracked edit, row R15 of the landscape retention schedule.' },
      { type: 'replace', old: 'Neighbourhood Team', new: 'Community Safety Officer', oldPage: 3, newPage: 3, note: 'Untracked edit, owner of row R09 (CCTV footage) in the landscape table; the new text wraps onto two lines.' },
      { type: 'insert', new: '3.2 12 October 2026 Draft for the Audit and Risk Committee', newPage: 4, note: 'New row in the version history table.' },
      { type: 'furniture', old: 'Version 3.1 · Approved 14 May 2025', new: 'Version 3.2 · Draft with tracked changes · 12 October 2026', oldPage: 1, newPage: 1, maxItems: 4, note: 'Footer, changed on all four pages (portrait and landscape).' },
    ],
  },
  {
    id: 'holdout4-e-docx-zh-en-supply-annex',
    script: 'supply_annex.py',
    ext: 'docx',
    description:
      'A bilingual (Simplified Chinese / English) annex to an equipment supply contract between an invented medical centre and an invented supplier, written as a Word document with python-docx: numbered clauses with the Chinese text followed by the English text, and a 40-row price table with a repeating header row that runs over three pages; its No. column is a Word numbered list. The Chinese font SimSun is not installed and LibreOffice substitutes WenQuanYi Zen Hei; Arial becomes Liberation Sans. ' +
      LO_NOTE +
      ' Edits: the delivery period changed in both languages; the warranty retention changed in the Chinese text only (the English text still says 10%, an inconsistency a reviewer should catch); a mini centrifuge row inserted after row 5; the unit price of the real-time PCR system lowered, which also changes its amount; the ultrasonic cleaner row deleted; and as a result the table total and the total in Chinese capital numerals (大写) changed. Consequences that are not listed: the automatic row numbers from row 6 on, row 36 (cell counter) moving from page 2 to page 3, and the header row repeated at the top of pages 2 and 3.',
    truth: [
      { type: 'number', old: '合同生效后 45 天内', new: '合同生效后 60 天内', oldPage: 1, newPage: 1, note: 'Chinese text of clause 2.1.' },
      { type: 'number', old: 'within 45 days', new: 'within 60 days', oldPage: 1, newPage: 1, note: 'English text of clause 2.1.' },
      { type: 'number', old: '10% 作为质量保证金', new: '5% 作为质量保证金', oldPage: 1, newPage: 1, note: 'Chinese text of clause 3.3 only; the English sentence below still says 10%.' },
      { type: 'insert', new: '小型离心机 Mini centrifuge', newPage: 2, note: 'New table row (MC-7, 10 × 1,350.00 = 13,500.00); every cell of the row is new.' },
      { type: 'number', old: '189,000.00', new: '176,500.00', oldPage: 2, newPage: 2, note: 'Unit price of QP-480.' },
      { type: 'number', old: '378,000.00', new: '353,000.00', oldPage: 2, newPage: 2, note: 'Amount of QP-480 (2 × unit price), in the same row as the unit price; it changes because the price changed, but it is a printed figure a reviewer must check.' },
      { type: 'delete', old: '超声波清洗器 Ultrasonic cleaner, 10 L', oldPage: 3, note: 'Whole table row UC-10 removed.' },
      { type: 'number', old: '2,652,480.00', new: '2,634,780.00', oldPage: 3, newPage: 3, note: 'Table total.' },
      { type: 'replace', old: '贰佰陆拾伍万贰仟肆佰捌拾元整', new: '贰佰陆拾叁万肆仟柒佰捌拾元整', oldPage: 3, newPage: 3, note: 'Total in Chinese capital numerals; a character-level diff may show only the changed middle part.' },
    ],
  },
  {
    id: 'holdout4-e-xlsx-facilities-budget',
    script: 'budget.py',
    ext: 'xlsx',
    description:
      'An operating budget of an invented facilities department, built as an Excel workbook with openpyxl: 104 line items in 12 sections over three A4 portrait pages, the column header row set as print title row, amounts in the format #,##0;[Red](#,##0) (income in red brackets), a Change column computed by formula with red negative percentages, dates in d mmm yyyy, a header and a "Page X of Y" footer, fit to page width. Calibri is substituted by Carlito. LibreOffice Calc computed the formulas. ' +
      LO_NOTE +
      ' Edits: the energy price inflation assumption lowered; the electricity budget lowered, which turns its Change from 4.9% into a red negative percentage; a new line 6219 for a lift modernisation study inserted after lift maintenance; the note of the guarding contract changed; the one-off line 7010 for office moves deleted; as a result the FY2027 total and its Change percentage changed. Account codes are fixed per line, so nothing renumbers. Consequences that are not listed: one row moves from page 1 to page 2 and one from page 2 to page 3, under the repeated column header row; the FY2025 and FY2026 totals do not change.',
    truth: [
      { type: 'number', old: '8.0%', new: '6.5%', oldPage: 1, newPage: 1, note: 'Energy price inflation assumption.' },
      { type: 'number', old: '184,000', new: '171,500', oldPage: 1, newPage: 1, note: 'Electricity, FY2027 budget.' },
      { type: 'number', old: '4.9%', new: '-2.2%', oldPage: 1, newPage: 1, maxItems: 2, note: 'Electricity Change, computed by formula; the sign changes and the cell turns red (number format [Red]), so a separate colour entry is legitimate.' },
      { type: 'insert', new: '6219 Lift modernisation feasibility study', newPage: 1, note: 'New budget line (– – 22,000 new, with a note); every cell of the row is new.' },
      { type: 'replace', old: 'CPI-linked', new: 'fixed price', oldPage: 2, newPage: 2, note: 'Note of line 6501, manned guarding.' },
      { type: 'delete', old: '7010 Office moves and reconfigurations', oldPage: 3, note: 'Whole line removed (– – 26,000 new, with a note).' },
      { type: 'number', old: '2,329,800', new: '2,313,300', oldPage: 3, newPage: 3, note: 'Total FY2027 budget (formula).' },
      { type: 'number', old: '2.2%', new: '1.5%', oldPage: 3, newPage: 3, note: 'Change of the total (formula).' },
    ],
  },
  {
    id: 'holdout4-e-xlsx-spare-parts-prices',
    script: 'pricesheet.py',
    ext: 'xlsx',
    description:
      'A spare parts price list of an invented pump maker, built as an Excel workbook with openpyxl: 101 parts in 8 product groups over four A4 landscape pages, the column header row set as print title row, prices in euro and pound currency formats, dates in dd.mm.yyyy, core refunds as red negative euro amounts, a header and a "Page X of Y" footer, fit to page width. Arial is substituted by Liberation Sans. ' +
      LO_NOTE +
      ' Edits: the metal surcharge raised; a new impeller IMP-1065 inserted after IMP-1060; the euro price of SEA-1010 raised; the price date of MOT-1120 moved; control panel CTL-1080 deleted; the pound price of HSG-1040 raised; the core refund of REM-2070 increased. Consequences that are not listed: rows shift by one across the page breaks (SEA-1030 moves to page 2, the Motors group heading moves from the foot of page 2 to the top of page 3) under the repeated header row.',
    truth: [
      { type: 'number', old: '4.5%', new: '6.0%', oldPage: 1, newPage: 1, note: 'Metal surcharge in the header block.' },
      { type: 'insert', new: 'IMP-1065 Closed impeller, DN125', newPage: 1, note: 'New row (each, € 468.00, £402.50, B, 20); every cell of the row is new.' },
      { type: 'number', old: '€ 74.00', new: '€ 89.00', oldPage: 1, newPage: 1, note: 'SEA-1010 euro price.' },
      { type: 'number', old: '01.04.2027', new: '01.07.2027', oldPage: 3, newPage: 3, note: 'Price valid-from date of MOT-1120.' },
      { type: 'delete', old: 'CTL-1080 Control panel, ATEX', oldPage: 3, note: 'Whole row removed (each, € 491.00, £417.00, B, 10).' },
      { type: 'number', old: '£664.50', new: '£710.50', oldPage: 3, newPage: 3, note: 'HSG-1040 pound price; the euro price in the same row is unchanged.' },
      { type: 'number', old: '-€ 300.00', new: '-€ 335.00', oldPage: 4, newPage: 4, note: 'Core refund of REM-2070, a red negative amount in both versions.' },
    ],
  },
  {
    id: 'holdout4-e-pptx-board-deck',
    script: 'deck.py',
    ext: 'pptx',
    description:
      'A quarterly board deck of an invented freight company, built as a PowerPoint file with python-pptx: 16:9 slides with text boxes, bullet lists, two tables, a native clustered column chart, and a footer text box plus a slide number field on every slide. Calibri is substituted by Carlito. ' +
      LO_NOTE +
      ' The README lists slide decks (PPTX via PDF export) under the roadmap, so this case tests a producer and document type it does not claim. Edits: on the KPI slide the EBITDA margin lowered and free cash flow changed from negative to positive; in the chart the Q3 bar for Benelux raised from 11.2 to 12.6 (the axis is fixed at 0 to 20, so no other bar moves, and the chart has no data labels); a new slide "Cyber incident update" inserted after the cash slide; one risk bullet reworded; the treasury policy bullet moved from "Decisions requested" to "Items for noting"; and the meeting date in the footer changed on every slide. Consequences that are not listed: the slide numbers from slide 6 on (field), and all later slides shifting by one page.',
    truth: [
      { type: 'number', old: '14.2%', new: '13.6%', oldPage: 3, newPage: 3, note: 'EBITDA margin, Q3 2026, in a table.' },
      { type: 'number', old: '−1.8', new: '0.4', oldPage: 3, newPage: 3, note: 'Free cash flow, Q3 2026: sign changes from negative (U+2212 minus) to positive.' },
      { type: 'graphic', oldPage: 4, newPage: 4, oldRect: [316, 262, 31, 160], newRect: [316, 242, 31, 180], note: 'Chart: the Q3 2026 bar for Benelux is taller (11.2 → 12.6); no number is printed for it.' },
      { type: 'insert', new: 'Cyber incident update', newPage: 6, maxItems: 5, note: 'Whole new slide: kicker, title and three bullets; it may be reported as one added page or as several added passages.' },
      { type: 'replace', old: 'launched in September', new: 'extended to Q1 2027', oldPage: 6, newPage: 7, note: 'Risk bullet on driver shortage.' },
      { type: 'move', old: 'Treasury policy review and new counterparty limits (paper C)', new: 'Treasury policy review and new counterparty limits (paper C)', oldPage: 7, newPage: 9, note: 'Bullet moved unchanged from "Decisions requested" to the end of "Items for noting".' },
      { type: 'furniture', old: '14 October 2026', new: '21 October 2026', oldPage: 1, newPage: 1, maxItems: 10, note: 'Meeting date in the footer, changed on every slide.' },
    ],
  },
];

// ---------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
}

function buildCase(c, index) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `holdout4-e-${index}-`));
  try {
    run('python3', [path.join(HELPERS, c.script), work], { env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    const profile = `file:///tmp/lo-e-${index + 1}`;
    run('soffice', [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', work,
      path.join(work, `before.${c.ext}`), path.join(work, `after.${c.ext}`)], { timeout: 180000 });
    const out = path.join(CASES_DIR, c.id);
    fs.mkdirSync(out, { recursive: true });
    for (const v of ['before', 'after']) {
      const pdf = path.join(work, `${v}.pdf`);
      if (!fs.existsSync(pdf)) throw new Error(`${c.id}: LibreOffice did not write ${v}.pdf`);
      fs.copyFileSync(pdf, path.join(out, `${v}.pdf`));
    }
    const truth = { description: c.description, synthetic: true, set: 'held-out-4', blind: true, truth: c.truth };
    fs.writeFileSync(path.join(out, 'truth.json'), JSON.stringify(truth, null, 2) + '\n');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

const norm = (s) => s.normalize('NFKC').replace(/\s+/g, '');
const count = (hay, needle) => { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; } return n; };

async function pageTexts(pdfjs, file) {
  const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    pages.push(norm(tc.items.map((it) => it.str).join('')));
  }
  await task.destroy();
  return pages;
}

function popplerTexts(file) {
  const raw = run('pdftotext', ['-raw', file, '-']);
  return raw.split('\f').map(norm);
}

const TYPES = new Set(['number', 'replace', 'insert', 'delete', 'move', 'format', 'graphic', 'position', 'overflow', 'furniture']);

async function verifyCase(pdfjs, c) {
  const dir = path.join(CASES_DIR, c.id);
  const truth = JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8'));
  const problems = [];
  const warnings = [];
  if (truth.synthetic !== true || truth.set !== 'held-out-4' || truth.blind !== true || !truth.description) problems.push('header fields');
  const before = await pageTexts(pdfjs, path.join(dir, 'before.pdf'));
  const after = await pageTexts(pdfjs, path.join(dir, 'after.pdf'));
  const beforeP = popplerTexts(path.join(dir, 'before.pdf'));
  const afterP = popplerTexts(path.join(dir, 'after.pdf'));
  const synthetic = (pages) => pages.some((p) => /synthetic|合成样例/i.test(p));
  if (!synthetic(before) || !synthetic(after)) problems.push('no "synthetic sample" label');
  truth.truth.forEach((t, i) => {
    const tag = `#${i + 1} ${t.type}`;
    if (!TYPES.has(t.type)) problems.push(`${tag}: unknown type`);
    if (t.old === '' || t.new === '') problems.push(`${tag}: empty snippet`);
    const needOld = ['number', 'replace', 'delete', 'move', 'format', 'furniture', 'position'].includes(t.type);
    const needNew = ['number', 'replace', 'insert', 'move', 'format', 'furniture', 'position'].includes(t.type);
    if (!Number.isInteger(t.oldPage) && t.type !== 'insert') problems.push(`${tag}: oldPage missing`);
    if (!Number.isInteger(t.newPage) && t.type !== 'delete') problems.push(`${tag}: newPage missing`);
    if (t.type === 'graphic' && !(t.oldRect || t.newRect)) problems.push(`${tag}: graphic without rect`);
    for (const [side, pages, popp, page, other, otherPage] of [
      ['old', before, beforeP, t.oldPage, after, t.newPage],
      ['new', after, afterP, t.newPage, before, t.oldPage],
    ]) {
      const snip = t[side];
      if (snip === undefined) {
        if ((side === 'old' && needOld) || (side === 'new' && needNew)) problems.push(`${tag}: ${side} snippet missing`);
        continue;
      }
      const s = norm(snip);
      const text = pages[page - 1] ?? '';
      const n = count(text, s);
      if (n === 0) problems.push(`${tag}: ${side} "${snip}" not on page ${page} (PDF.js)`);
      else if (n > 1) warnings.push(`${tag}: ${side} "${snip}" occurs ${n}× on page ${page}`);
      if (!(popp[page - 1] ?? '').includes(s)) warnings.push(`${tag}: ${side} "${snip}" not found by pdftotext on page ${page}`);
      // the old snippet must not still be at that place in the new version, and vice versa
      if (['number', 'replace', 'insert', 'delete'].includes(t.type) && otherPage && (other[otherPage - 1] ?? '').includes(s)) {
        warnings.push(`${tag}: ${side} "${snip}" also present on the other version's page ${otherPage}`);
      }
      if (t.type === 'delete' && after.some((p) => p.includes(s))) problems.push(`${tag}: deleted text still in new version`);
      if (t.type === 'insert' && before.some((p) => p.includes(s))) problems.push(`${tag}: inserted text already in old version`);
    }
  });
  return { id: c.id, pages: `${before.length}→${after.length}`, items: truth.truth.length, problems, warnings };
}

async function main() {
  const verifyOnly = process.argv.includes('--verify');
  if (!verifyOnly) {
    CASES.forEach((c, i) => {
      process.stdout.write(`building ${c.id} … `);
      buildCase(c, i);
      process.stdout.write('done\n');
    });
  }
  const pdfjs = await import(PDFJS);
  let failed = false;
  for (const c of CASES) {
    const r = await verifyCase(pdfjs, c);
    console.log(`${r.id}: pages ${r.pages}, ${r.items} truth items${r.problems.length ? '' : ', snippets OK'}`);
    for (const w of r.warnings) console.log(`  warning: ${w}`);
    for (const p of r.problems) console.log(`  PROBLEM: ${p}`);
    if (r.problems.length) failed = true;
  }
  if (failed) process.exit(1);
}

await main();
