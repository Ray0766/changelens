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
    { page: 0, placed: 5 },
    { page: 1, placed: 1 },
  ]);
  assert.equal(r.coverage.old.outOfOrder, undefined);
  // The JSON export gives the pages 1-based.
  const j = buildJson({ result: r, lang: 'en', oldName: 'a.pdf', newName: 'b.pdf' }) as { coverage: { new: { outOfOrder?: unknown } } };
  assert.deepEqual(j.coverage.new.outOfOrder, [
    { page: 1, placed: 5 },
    { page: 2, placed: 1 },
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
  // Nothing tells such a column from text a PDF editor appended: it is
  // neither marked nor announced, and is compared as before this rule.
  assert.deepEqual(notices('en', r), []);
  assert.ok(!r.newDoc.tokens.some((t) => t.late));
  // A note added below the last line of p. 1 (not between two lines) and
  // the first heading of p. 2 deleted: two edits, not one rewrite.
  const b = await probe('break');
  assert.deepEqual(listed(b), ['Added “Contractors follow the same rules as employees.”', 'Deleted “2 Protective equipment”']);
  assert.equal(b.newDoc.pages[0].outOfOrder, undefined);
});

test('T1 controls: pages set in columns, in reading order, give the same items as before the rule (no footer taken from column 1)', async () => {
  // Typst, two columns: the last paragraph of column 1 starts in the bottom
  // margin after a paragraph gap, then come column 2 and the footer.
  // Column 2: a figure changed, a paragraph added, a sentence deleted.
  const expected = ['Number changed: 1,250 → 1,320 (+5.6%)', 'Added a paragraph', 'Deleted “The gauges were calibrated in March.”'];
  for (const name of ['cols', 'colsbare']) {
    // colsbare: the same without a footer, so column 1's last paragraph is the last bottom-margin line before column 2.
    const r = await probe(name);
    assert.deepEqual(listed(r), expected, name);
    assert.deepEqual(notices('en', r), [], name);
    for (const d of [r.oldDoc, r.newDoc]) {
      assert.equal(d.pages[0].outOfOrder, undefined, name);
      assert.ok(!d.tokens.some((t) => t.late), name);
    }
  }
  // A two-column table written column by column, its rows down into the
  // bottom margin, footer last: the cells of column 2 are not moved,
  // marked or announced.
  const t = await probe('coltable');
  assert.deepEqual(listed(t), ['Number changed: 6 → 9 (+50%)', 'Deleted “, checked 13 times”', 'Added “, seal replaced”', 'Content sticks out into the page margin']);
  assert.deepEqual(notices('en', t), []);
  assert.ok(!t.newDoc.tokens.some((k) => k.late) && t.newDoc.pages[0].outOfOrder === undefined);
});

test('T1: a line drawn after the footer that finds no place is not paired with the next page’s deleted heading', async () => {
  // p. 1: "Document no. DS-004" added below the last line, appended after
  // the footer; p. 2: its first heading, set larger than the body, deleted.
  const r = await probe('stranded');
  assert.deepEqual(listed(r), ['Deleted “3 Electrical connection”', 'Added “Document no. DS-004”']);
  assert.deepEqual([r.changes[0].old.pages, r.changes[1].new.pages], [[1], [0]]);
  assert.ok(r.newDoc.tokens.some((t) => t.late && t.text === 'Document'));
  // Control: the same new version written in reading order (the line
  // before the footer) is compared as before this rule: the two edits at
  // the page break still read as one rewrite (a known limit).
  const c = compareDocs(await load(`${fixtures}probe9-T1-stranded-before.pdf`), await load(`${fixtures}probe9-T1-stranded-inorder.pdf`));
  assert.deepEqual(listed(c), ['Changed “3 Electrical connection” → “Document no. DS-004”']);
  assert.ok(!c.newDoc.tokens.some((t) => t.late));
});

test('T1: a value re-typed after the footer in a table row is put in its row, by the cell of another row under it', async () => {
  // The amount of a table's first row, under a short heading (no line above
  // it reaches across it), re-typed in Helvetica 9 pt; the second row's
  // amount only deleted (control). The third row has a cell under it.
  const r = await probe('firstrow');
  assert.deepEqual(listed(r), ['Number changed: 240.00 → 260.00 (+8.3%)', 'Deleted “18.50”']);
  const [c] = r.changes;
  assert.deepEqual([c.old.rects[0].page, c.new.rects[0].page], [0, 0]);
  assert.ok(Math.abs(c.old.rects[0].rect.x - c.new.rects[0].rect.x) < 1);
  assert.equal(c.contextBefore, 'Annual inspection');
  assert.deepEqual(r.newDoc.pages[0].outOfOrder, { placed: 1 });
  assert.deepEqual(lineTexts(r.newDoc, 0)[2], 'Annual inspection 260.00');
  // The first row of a table deleted, so that the rows below move up, and
  // the amount of the next row re-typed (fpdf2, edited with PyMuPDF): the
  // re-typed amount stands beside its own label, not in the deleted row's
  // place, and reads as in the same edit written in reading order.
  const d = await probe('rowdel');
  assert.deepEqual(listed(d).sort(), ['Deleted “Filter cartridge 45.00”', 'Number changed: 60.00 → 65.00 (+8.3%)']);
  const inOrder = compareDocs(await load(`${fixtures}probe9-T1-rowdel-before.pdf`), await load(`${fixtures}probe9-T1-rowdel-inorder.pdf`));
  assert.deepEqual(listed(d).sort(), listed(inOrder).sort());
  assert.equal(inOrder.newDoc.pages[0].outOfOrder, undefined);
});

test('T1: a value re-typed in a wider font, running into the next word, is a word of its own', async () => {
  // fpdf2 in Times; PyMuPDF re-types "2,480.00" as "2,840.00" in Helvetica
  // at the same size (its digits are wider: the new run ends past the start
  // of "payable"), and "120.00" unchanged beside the deleted word "early".
  const r = await probe('glue');
  assert.deepEqual(listed(r), ['Number changed: 2,480.00 → 2,840.00 (+15%)', '“120.00” font Times-Roman → Helvetica', 'Deleted “early”']);
  assert.ok(lineTexts(r.newDoc, 0).includes('Price (EUR) 2,840.00 payable within 30 days'));
  // Control: the same new version written in reading order.
  const c = compareDocs(await load(`${fixtures}probe9-T1-glue-before.pdf`), await load(`${fixtures}probe9-T1-glue-inorder.pdf`));
  assert.deepEqual(listed(c), ['Number changed: 2,480.00 → 2,840.00 (+15%)', 'Deleted “early”']);
});

test('T1: a note written on the running header’s baseline of one page keeps its own line; the header stays a header', async () => {
  // fpdf2, three pages with the header "title … Revision 4" on one
  // baseline; PyMuPDF writes "RECEIVED 3 Nov 2026" between its two parts on
  // p. 1 only (after the footer), and p. 2 has a real edit.
  const r = await probe('stamp');
  assert.deepEqual(listed(r), ['Added “RECEIVED 3 Nov 2026”', 'Changed “six” → “ten”']);
  assert.equal(r.ignored.furniture, 0);
  const headers = r.newDoc.lines.filter((l) => l.zone === 'top' && l.text.startsWith('SYNTHETIC probe T1 - Supply agreement'));
  assert.deepEqual(
    headers.map((l) => [l.page, l.furniture]),
    [
      [0, true],
      [1, true],
      [2, true],
    ],
  );
  // Control: the datasheet's revision re-typed on the header of every page
  // stays merged there (see the round-5 datasheet test): its header reads
  // "Rev. C" on both pages, two header differences, not four.
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
  assert.equal(buildDocModel(side).pages[0].outOfOrder, undefined);
  // The same value in a table row whose neighbours reach across it: put back.
  const row = page([
    ['Annual inspection, per visit, plus VAT 240.00', 56, 100],
    ['Meter reading service, monthly', 56, 114],
    ['Out-of-hours call-out, per visit 95.00', 56, 128],
    footer,
    ['18.50', 240, 114],
  ]);
  assert.deepEqual(order(row), ['Annual inspection, per visit, plus VAT 240.00', 'Meter reading service, monthly 18.50', 'Out-of-hours call-out, per visit 95.00', 'Synthetic sample · Page 1 of 1']);
  assert.deepEqual(buildDocModel(row).pages[0].outOfOrder, { placed: 1 });
  // A line that overprints the glyphs of the line on its baseline (a stamp or watermark set as text): unchanged.
  const over = page([['Meter reading service, monthly, plus VAT', 56, 114], ['Annual inspection', 56, 128], footer, ['COPY', 100, 114]]);
  assert.equal(order(over).at(-1), 'COPY');
});

test('T1 narrowness: a value in a table row is put in its row only where another row has a cell under or over it', () => {
  const footer: [string, number, number] = ['Synthetic sample · Page 1 of 1', 56, 810];
  const rows: [string, number, number][] = [
    ['Fees', 56, 100],
    ['Annual inspection', 56, 120],
    ['Meter reading service', 56, 136],
    ['Out-of-hours call-out', 56, 152],
    ['95.00', 300, 152],
  ];
  // The first row's amount drawn after the footer: the third row's amount is under it.
  const cell = page([...rows, footer, ['240.00', 300, 120]]);
  assert.deepEqual(order(cell).slice(0, 2), ['Fees', 'Annual inspection 240.00']);
  // Control: a column of running text beside the rows, its first line
  // drawn after the footer (no row has a cell under it): left where the
  // stream has it, and not marked.
  const column = page([...rows.slice(0, 4), ['Spare parts are held', 300, 136], ['at the central depot.', 300, 152], footer, ['Crews carry the seals;', 300, 120]]);
  assert.equal(order(column).at(-1), 'Crews carry the seals;');
  assert.equal(buildDocModel(column).pages[0].outOfOrder, undefined);
  assert.ok(!buildDocModel(column).tokens.some((t) => t.late));
});

test('T1: a late value below the text drawn before the footer is joined only with the old value of its own row', () => {
  // Old, in reading order: two rows; new, as a PDF editor writes it: the
  // first row deleted, the second row moved up into its place and re-typed
  // after the footer, its amount 60.00 → 65.00 as a line of its own.
  const intro = 'The SYNTHETIC service order covers the parts listed below and one visit by a technician.';
  const footer: [string, number, number] = ['Synthetic sample · Page 1 of 1', 56, 810];
  const old = page([
    ['Order summary', 56, 100],
    [intro, 56, 116],
    ['Filter cartridge', 56, 140],
    ['45.00', 300, 140],
    ['Pressure gauge, stainless steel', 56, 156],
    ['60.00', 300, 156],
    ['All prices exclude VAT at the standard rate.', 56, 190],
    footer,
  ]);
  const neu = page([
    ['Order summary', 56, 100],
    [intro, 56, 116],
    footer,
    ['Pressure gauge, stainless steel', 56, 140],
    ['All prices exclude VAT at the standard rate.', 56, 174],
    ['65.00', 300, 140],
  ]);
  const r = compareDocs(buildDocModel(old), buildDocModel(neu));
  assert.ok(r.newDoc.tokens.some((t) => t.late && t.text === '65.00'));
  // Not "45.00 → 65.00" in the deleted row's place: the label beside the
  // new amount, "Pressure gauge", stood beside 60.00.
  assert.deepEqual(listed(r).sort(), ['Deleted “Filter cartridge 45.00”', 'Number changed: 60.00 → 65.00 (+8.3%)']);
});

// ------------------------------------------------------ account numbers ---

test('T1: an account number re-typed in its digit groups is one change without a percentage; in reading order, as before', async () => {
  // Re-typed after the footer by a PDF editor (the lease probe and the
  // round-5 invoice): one change, without a percentage.
  const r = await probe('lease');
  assert.ok(listed(r).includes('Number changed: 2045 1189 03 → 9932 0457 18'));
  assert.equal(r.changes.find((c) => c.new.text === '9932 0457 18')?.numeric?.fromValue, null);
  // Controls, in reading order: each group is its own figure, as before
  // this rule (an account number, an IBAN, readings in a row, zero-padded
  // hourly readings).
  const doc = (line: string) => model(makeDoc('d', [[['Please pay by bank transfer to the account below.', line, 'Quote the invoice number as the reference.']]]));
  const cases: [string, string, string[]][] = [
    ['Account ZZ41 7700 2045 1189 03', 'Account ZZ41 7700 9932 0457 18', ['Number changed: 2045 → 9932 (+386%)', 'Number changed: 1189 → 0457', 'Number changed: 03 → 18']],
    ['IBAN DE89 3704 0044 0532 0130 00', 'IBAN DE89 3704 0044 0532 0177 15', ['Number changed: 0130 → 0177', 'Number changed: 00 → 15']],
    ['Readings 120 135 150 at noon', 'Readings 125 140 155 at noon', ['Number changed: 120 → 125 (+4.2%)', 'Number changed: 135 → 140 (+3.7%)', 'Number changed: 150 → 155 (+3.3%)']],
    ['Pressure readings in bar, hourly: 07 09 12 15 18 21.', 'Pressure readings in bar, hourly: 07 09 14 19 18 21.', ['Number changed: 12 → 14 (+17%)', 'Number changed: 15 → 19 (+27%)']],
  ];
  for (const [a, b, want] of cases) assert.deepEqual(listed(compareDocs(doc(a), doc(b))), want, a);
  assert.ok(!doc('Account ZZ41 7700 2045 1189 03').tokens.some((t) => t.retyped));
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
