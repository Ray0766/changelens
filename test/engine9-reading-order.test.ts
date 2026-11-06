// Fix round 9, area T1 (reading order): text that a PDF editor re-types
// after redacting it (PyMuPDF insert_text, insert_htmlbox, redaction
// replacement text) is appended to the page's content after the footer.
// It is put back where it stands on the page, so that each re-typed value
// is listed once, in place, as the change it is (round 5, cause 1). The
// probes are SYNTHETIC PyMuPDF 2.1 files made by
// test/fixtures/gen9/probe9-T1.py; the round-5 cases are the committed
// eval/cases/holdout5-j-* pairs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import { buildJson } from '../src/core/report.ts';
import type { CompareResult, DocModel, DocText, TextRun } from '../src/core/types.ts';
import { makeDoc, model } from './helpers.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const cases = new URL('../eval/cases/', import.meta.url).pathname;
const load = async (path: string) => buildDocModel(await extractText(await openPdf(path), path));
async function probe(name: string): Promise<CompareResult> {
  return compareDocs(await load(`${fixtures}probe9-T1-${name}-before.pdf`), await load(`${fixtures}probe9-T1-${name}-after.pdf`));
}
async function round5(id: string): Promise<CompareResult> {
  return compareDocs(await load(`${cases}holdout5-j-${id}/before.pdf`), await load(`${cases}holdout5-j-${id}/after.pdf`));
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const lineTexts = (d: DocModel, page: number) => d.lines.filter((l) => l.page === page).map((l) => l.text);

test('T1: re-typed values appended after the footer are listed once, in place, as the change they are', async () => {
  const r = await probe('lease');
  assert.deepEqual(listed(r), [
    'Number changed: 1 → 15 (+1400%)',
    'Number changed: 1,850.00 → 1,975.00 (+6.8%)',
    'Number changed: 2045 1189 03 → 9932 0457 18',
    'Changed “Consumer” → “Retail”',
    // Control: a word only deleted, next to the re-typed word, stays listed.
    'Deleted “onwards”',
    // The clause added in the white space under 4.1, between 4.1 and section 5.
    'Added a paragraph',
    // Control: a note added below the last line stays at the end of the page.
    'Added a paragraph',
    // The heading re-typed in Times-Bold, matched in place.
    '“6 Electrical connection” font Helvetica-Bold → Times-Bold',
  ]);
  // Each change has its own place and the context of that place.
  const [date, rent, account, word] = r.changes;
  assert.equal(date.contextAfter.startsWith('March 2027 Term'), true, date.contextAfter);
  assert.equal(rent.contextBefore.endsWith('Monthly fee (EUR)'), true, rent.contextBefore);
  assert.equal(account.contextBefore.endsWith('Account ZZ41 7700'), true, account.contextBefore);
  assert.equal(word.contextAfter.startsWith('Prices Index'), true, word.contextAfter);
  for (const c of [date, rent, account, word]) {
    const o = c.old.rects[0].rect;
    const n = c.new.rects[0].rect;
    assert.ok(Math.abs(o.x - n.x) < 1 && Math.abs(o.y - n.y) < 3, JSON.stringify([o, n]));
  }
  // The added clause is in its place in the reading order: after 4.1, before section 5.
  const clause = r.changes[5];
  assert.match(clause.new.text, /^4\.2 Notices may also be sent/);
  assert.match(clause.contextBefore, /given in the particulars\.$/);
  assert.match(clause.contextAfter, /^5 Signatures/);
  // The note below the last line stays after it.
  assert.match(r.changes[6].contextBefore, /Signed for the Tenant$/);
  // The notice says what was done, with the pages.
  const note = notices('en', r).find((n) => n.text.includes('after the page footer'));
  assert.equal(
    note?.text,
    'New version p. 1–2: 6 lines of text are stored after the page footer, out of reading order, as PDF editors store re-typed text; ChangeLens placed them by their position on the page and compared them there.',
  );
  assert.equal(note?.level, 'info');
  assert.deepEqual(r.coverage.new.outOfOrder, [
    { page: 0, count: 5 },
    { page: 1, count: 1 },
  ]);
  assert.equal(r.coverage.old.outOfOrder, undefined);
  // The JSON export gives the pages 1-based.
  const j = buildJson({ result: r, lang: 'en', oldName: 'a.pdf', newName: 'b.pdf' }) as { coverage: { new: { outOfOrder?: unknown } } };
  assert.deepEqual(j.coverage.new.outOfOrder, [
    { page: 1, count: 5 },
    { page: 2, count: 1 },
  ]);
  // In Chinese too.
  assert.ok(notices('zh', r).some((n) => n.text.startsWith('新版第 1–2 页有 6 行文字存放在页脚之后')));
});

test('T1: a value re-typed on a page with a turned margin note is put back; the turned note is left in its place', async () => {
  const r = await probe('turned');
  assert.deepEqual(listed(r), ['Number changed: 18.50 → 19.75 (+6.8%)']);
  const b = r.newDoc;
  assert.deepEqual(lineTexts(b, 0).slice(4), ['Meter reading service 19.75 per month', 'Out-of-hours call-out 95.00 per visit', 'Fees are reviewed every year in March.', 'SYNTHETIC margin note', 'SYNTHETIC probe, fictitious parties and figures · Page 1 of 1']);
});

test('T1 controls: a right column drawn after the footer, and a note added below the last line, keep their stream order', async () => {
  // Two columns under a full-width paragraph; the right column is written
  // after the footer, its lines on the baselines of the left column's.
  const r = await probe('columns');
  assert.deepEqual(listed(r), []);
  assert.equal(r.newDoc.pages[0].outOfOrder, undefined);
  const lines = lineTexts(r.newDoc, 0);
  assert.equal(lines.indexOf('The hydrant flushing season'), lines.indexOf('SYNTHETIC probe, fictitious parties and figures · Page 1 of 1') + 1);
  // A note added below the last line of p. 1 (not between two lines) and
  // the first heading of p. 2 deleted: two edits, not one rewrite.
  const b = await probe('break');
  assert.deepEqual(listed(b), ['Added “Contractors follow the same rules as employees.”', 'Deleted “2 Protective equipment”']);
  assert.equal(b.newDoc.pages[0].outOfOrder, undefined);
});

// ------------------------------------------------------- narrowness -------

/** A page of runs given as [text, x, baseline] in stream order (11 pt, 0.5 em per character; lines by geometry). */
function page(runs: [string, number, number][], size = 11): DocText {
  return {
    name: 'p',
    pages: [
      {
        index: 0,
        width: 595,
        height: 842,
        runs: runs.map(([str, x, y]): TextRun => ({ str, x, y: y - size * 0.9, w: str.length * size * 0.5, h: size * 1.1, baseline: y, fontSize: size, font: 'Body-Regular', family: 'serif', eol: false, angle: 0 })),
      },
    ],
  };
}
const order = (d: DocText) => buildDocModel(d).lines.map((l) => l.text);

test('T1 narrowness: only lines drawn after a footer drawn after the body, onto a line or between two lines, are moved', () => {
  const footer: [string, number, number] = ['Synthetic sample · Page 1 of 1', 56, 810];
  // A footer drawn first (as office suites do), then the body: unchanged.
  const first = page([footer, ['Fees are charged per visit as shown below.', 56, 100], ['Annual inspection', 56, 120], ['240.00', 300, 120], ['Meter reading', 56, 136]]);
  assert.deepEqual(order(first), ['Synthetic sample · Page 1 of 1', 'Fees are charged per visit as shown below.', 'Annual inspection 240.00', 'Meter reading']);
  assert.equal(buildDocModel(first).pages[0].outOfOrder, undefined);
  // A page number drawn after the footer, in the bottom margin: unchanged.
  const num = page([['Fees are charged per visit as shown below.', 56, 100], ['Synthetic sample', 56, 810], ['Page 1', 480, 810]]);
  assert.deepEqual(order(num), ['Fees are charged per visit as shown below.', 'Synthetic sample Page 1']);
  // A line drawn after the footer beside a short line whose neighbours do
  // not reach across it (a second column, a margin note): unchanged.
  const side = page([
    ['Left column line one', 56, 100],
    ['Left column line two', 56, 114],
    ['Left column line three', 56, 128],
    footer,
    ['Right column line two', 320, 114],
  ]);
  assert.deepEqual(order(side).at(-1), 'Right column line two');
  // The same value in a table row whose neighbours reach across it: put back.
  const row = page([
    ['Annual inspection, per visit, plus VAT 240.00', 56, 100],
    ['Meter reading service, monthly', 56, 114],
    ['Out-of-hours call-out, per visit 95.00', 56, 128],
    footer,
    ['18.50', 240, 114],
  ]);
  assert.deepEqual(order(row), ['Annual inspection, per visit, plus VAT 240.00', 'Meter reading service, monthly 18.50', 'Out-of-hours call-out, per visit 95.00', 'Synthetic sample · Page 1 of 1']);
  assert.equal(buildDocModel(row).pages[0].outOfOrder, 1);
  // A line that overprints the glyphs of the line on its baseline (a stamp or watermark set as text): unchanged.
  const over = page([['Meter reading service, monthly, plus VAT', 56, 114], ['Annual inspection', 56, 128], footer, ['COPY', 100, 114]]);
  assert.equal(order(over).at(-1), 'COPY');
});

// ------------------------------------------------------ account numbers ---

test('T1: an account number re-typed in its digit groups is one change without a percentage; separate figures stay apart', () => {
  const doc = (line: string) => model(makeDoc('d', [[['Please pay by bank transfer to the account below.', line, 'Quote the invoice number as the reference.']]]));
  let r = compareDocs(doc('Account ZZ41 7700 2045 1189 03'), doc('Account ZZ41 7700 9932 0457 18'));
  assert.deepEqual(listed(r), ['Number changed: 2045 1189 03 → 9932 0457 18']);
  assert.equal(r.changes[0].numeric?.fromValue, null);
  // An IBAN-like code: the groups after the letters and digits heading it.
  r = compareDocs(doc('IBAN DE89 3704 0044 0532 0130 00'), doc('IBAN DE89 3704 0044 0532 0177 15'));
  assert.deepEqual(listed(r), ['Number changed: 0130 00 → 0177 15']);
  // Control: three readings of 1–3 digits in a row are three figures, each with its percentage.
  r = compareDocs(doc('Readings 120 135 150 at noon'), doc('Readings 125 140 155 at noon'));
  assert.deepEqual(listed(r), ['Number changed: 120 → 125 (+4.2%)', 'Number changed: 135 → 140 (+3.7%)', 'Number changed: 150 → 155 (+3.3%)']);
});

// --------------------------------------------------------- round 5 -------

test('T1 round 5: the redacted lease lists each re-typed value in place', async () => {
  const r = await round5('lease-redact');
  assert.deepEqual(listed(r), [
    'Number changed: 1 → 15 (+1400%)',
    'Number changed: 1,850.00 → 1,975.00 (+6.8%)',
    'Changed “Consumer” → “Retail”',
    'Deleted 22 words',
    'Added 18 words',
    'Changed “March to May” → “April to June”',
    // "2027" was re-typed with the months, in Helvetica 7.5 pt.
    '“2027” size 10.5 → 7.5 pt, font LiberationSerif → Helvetica',
    'Number changed: −250.00 → 250.00 (sign changed)',
  ]);
  // The new clause 11.2 between 11.1 and the schedule.
  assert.match(r.changes[4].contextBefore, /given in the Particulars\.$/);
  assert.match(r.changes[4].contextAfter, /^Schedule: rent-free period/);
  assert.ok(notices('en', r).some((n) => n.text.startsWith('New version p. 1, 3: 5 lines of text are stored after the page footer')));
});

test('T1 round 5: the incremental invoice lists the amount and the account number in place', async () => {
  const r = await round5('invoice-incremental');
  assert.deepEqual(listed(r).filter((d) => !d.startsWith('Graphic')), [
    'Number changed: 30 → 18 (-40%)',
    'Number changed: 1,240.00 → 1,420.00 (+15%)',
    'Number changed: 2045 1189 03 → 9932 0457 18',
    'Deleted 11 words',
    'Added a paragraph',
  ]);
  // The due date's context is the header block, where it stands, not the payment lines.
  assert.match(r.changes[0].contextBefore, /Due date$/);
});

test('T1 round 5: the audit report lists 87 → 82 and October → April in place', async () => {
  const r = await round5('audit-annotations');
  assert.deepEqual(listed(r).filter((d) => !/^(Graphic|Text colour)/.test(d)), ['Number changed: 87 → 82 (-5.7%)', 'Changed “October” → “April”']);
  assert.match(r.changes.find((c) => c.numeric)!.contextAfter, /^\/ 100/);
});

test('T1 round 5: the datasheet lists the moved line, the number, the font change, the deleted footnote and the added note', async () => {
  const r = await round5('datasheet-overlay');
  assert.deepEqual(listed(r).filter((d) => !d.startsWith('Graphic')), [
    '“Document no. DS-UFM80-004” moved 117 mm to the right',
    'Number changed: −20 → -10 (-50%)',
    '“3 Electrical connection” font Inter-Bold → Times-Bold',
    'Added a paragraph',
    'Deleted a paragraph',
  ]);
  // The header "Rev. B" → "Rev. C" on both pages: two header differences, not four.
  assert.equal(r.ignored.furniture, 2);
  assert.ok(!r.changes.some((c) => c.kind === 'replace' && c.old.pages[0] !== c.new.pages[0]));
});

test('T1 round 5: the handbook lists the deleted page as deleted and the re-typed rates as number changes', async () => {
  const r = await round5('handbook-pages');
  assert.deepEqual(listed(r).filter((d) => !d.startsWith('Graphic') && !d.startsWith('Page size')), [
    'Moved 4 paragraphs',
    'Number changed: 48.00 → 52.00 (+8.3%)',
    'Number changed: 0.32 → 0.35 (+9.4%)',
    'Deleted 2 paragraphs',
    'Added 7 paragraphs',
  ]);
  const del = r.changes.find((c) => c.kind === 'delete')!;
  assert.match(del.old.text, /^4 Legacy paper forms Until the tablet roll-out is complete/);
  assert.deepEqual(del.old.pages, [3]);
});

test('T1 round 5: the Chinese quote, whose stream is in reading order, is unchanged', async () => {
  const r = await round5('zh-quote-htmlbox');
  assert.equal(r.newDoc.pages.some((p) => p.outOfOrder), false);
  assert.deepEqual(listed(r).filter((d) => !/^(Graphic|Underlined)/.test(d)), [
    'Changed “11月30” → “12月31”',
    'Changed “季度” → “月”',
    'Moved a paragraph',
    'Number changed: 4 → 6 (+50%)',
    'Added “and Chinese”',
    'Deleted “3. 报价含上门差旅费用。”',
    'Added “4. 更换的零配件享有 12 个月质保。”',
  ]);
});
